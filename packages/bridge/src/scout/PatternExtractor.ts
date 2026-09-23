/**
 * PatternExtractor — deterministic heuristics that turn raw repo signals
 * (README, package.json, folder tree, topics) into Pattern records.
 *
 * No LLM calls in Phase 1. Every extraction is explainable and testable.
 * Phase 2 (Fusion Engine) can layer LLM summarization on top of the
 * structured patterns this module emits.
 */

import { createHash } from 'crypto';
import type {
  Pattern,
  PatternDomain,
  PatternKind,
  RepoProfile,
} from './types';

function id(prefix: string, ...parts: string[]): string {
  const h = createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 12);
  return prefix + '_' + h;
}

function domainFromSignals(profile: RepoProfile): PatternDomain {
  const topics = profile.topics.map((t) => t.toLowerCase());
  const desc = (profile.description ?? '').toLowerCase();
  const lang = (profile.language ?? '').toLowerCase();
  const all = topics.join(' ') + ' ' + desc;

  if (/(agent|llm|rag|ai-agent|langchain|openai)/.test(all)) return 'agent_ai';
  if (/(mobile|android|ios|react-native|expo|flutter)/.test(all)) return 'mobile';
  if (/(cli|command-line|terminal)/.test(all)) return 'cli_tool';
  if (/(etl|pipeline|airflow|spark|dbt|stream)/.test(all)) return 'data_pipeline';
  if (/(infra|devops|kubernetes|terraform|docker|ansible)/.test(all)) return 'infra_devops';
  if (/(frontend|nextjs|react|vue|svelte|tailwind)/.test(all)) return 'web_frontend';
  if (/(backend|api|server|express|fastapi|nestjs)/.test(all)) return 'web_backend';
  if (lang === 'typescript' || lang === 'javascript') return 'library';
  if (lang === 'python') return 'library';
  return 'unknown';
}

const KNOWN_STACKS: Array<{ name: string; match: RegExp; kind: PatternKind; tags: string[] }> = [
  { name: 'Next.js + React', match: /"next"\s*:/, kind: 'library_stack', tags: ['nextjs', 'react', 'ssr'] },
  { name: 'React + Vite', match: /"vite"\s*:.*"react"|"react"\s*:.*"vite"/s, kind: 'library_stack', tags: ['react', 'vite', 'spa'] },
  { name: 'Express backend', match: /"express"\s*:/, kind: 'library_stack', tags: ['express', 'node', 'http'] },
  { name: 'Fastify backend', match: /"fastify"\s*:/, kind: 'library_stack', tags: ['fastify', 'node', 'http'] },
  { name: 'NestJS', match: /"@nestjs\/core"\s*:/, kind: 'library_stack', tags: ['nestjs', 'node', 'di'] },
  { name: 'Prisma ORM', match: /"@prisma\/client"\s*:/, kind: 'data_store', tags: ['prisma', 'orm', 'sql'] },
  { name: 'Drizzle ORM', match: /"drizzle-orm"\s*:/, kind: 'data_store', tags: ['drizzle', 'orm'] },
  { name: 'PostgreSQL driver', match: /"(pg|postgres)"\s*:/, kind: 'data_store', tags: ['postgres', 'sql'] },
  { name: 'MongoDB driver', match: /"mongodb"\s*:/, kind: 'data_store', tags: ['mongodb', 'nosql'] },
  { name: 'Redis client', match: /"redis"\s*:|"ioredis"\s*:/, kind: 'data_store', tags: ['redis', 'cache'] },
  { name: 'tRPC', match: /"@trpc\/server"\s*:/, kind: 'api_style', tags: ['trpc', 'typesafe', 'rpc'] },
  { name: 'GraphQL', match: /"(graphql|@apollo\/server|@graphql-yoga)"\s*:/, kind: 'api_style', tags: ['graphql', 'api'] },
  { name: 'Socket.IO realtime', match: /"socket\.io"\s*:/, kind: 'realtime', tags: ['websocket', 'realtime'] },
  { name: 'Zod validation', match: /"zod"\s*:/, kind: 'unknown', tags: ['zod', 'validation', 'typescript'] },
  { name: 'Jest testing', match: /"jest"\s*:/, kind: 'testing', tags: ['jest', 'testing'] },
  { name: 'Vitest testing', match: /"vitest"\s*:/, kind: 'testing', tags: ['vitest', 'testing'] },
  { name: 'Playwright E2E', match: /"@playwright\/test"\s*:/, kind: 'testing', tags: ['playwright', 'e2e'] },
  { name: 'Cypress E2E', match: /"cypress"\s*:/, kind: 'testing', tags: ['cypress', 'e2e'] },
  { name: 'Sentry observability', match: /"@sentry\//, kind: 'observability', tags: ['sentry', 'errors'] },
  { name: 'OpenTelemetry', match: /"@opentelemetry\//, kind: 'observability', tags: ['opentelemetry', 'tracing'] },
  { name: 'Pino logger', match: /"pino"\s*:/, kind: 'observability', tags: ['pino', 'logging'] },
  { name: 'Winston logger', match: /"winston"\s*:/, kind: 'observability', tags: ['winston', 'logging'] },
  { name: 'Tailwind CSS', match: /"tailwindcss"\s*:/, kind: 'library_stack', tags: ['tailwind', 'css'] },
  { name: 'NextAuth', match: /"next-auth"\s*:/, kind: 'auth', tags: ['nextauth', 'oauth'] },
  { name: 'Passport auth', match: /"passport"\s*:/, kind: 'auth', tags: ['passport', 'auth'] },
  { name: 'JWT library', match: /"jsonwebtoken"\s*:/, kind: 'auth', tags: ['jwt', 'auth'] },
  { name: 'LangChain', match: /"langchain"\s*:/, kind: 'architecture', tags: ['langchain', 'llm', 'agent'] },
  { name: 'OpenAI SDK', match: /"openai"\s*:/, kind: 'architecture', tags: ['openai', 'llm'] },
  { name: 'Anthropic SDK', match: /"@anthropic-ai\/sdk"\s*:/, kind: 'architecture', tags: ['anthropic', 'llm'] },
];

const LAYOUT_MARKERS: Array<{ path: RegExp; tag: string; label: string }> = [
  { path: /^src\/components\//,     tag: 'components',     label: 'Components layer (src/components/)' },
  { path: /^src\/screens\//,        tag: 'screens',        label: 'Screens layer (src/screens/)' },
  { path: /^src\/pages\//,          tag: 'pages',          label: 'Pages router (src/pages/)' },
  { path: /^app\//,                 tag: 'app-router',     label: 'App router (app/)' },
  { path: /^src\/routes\//,         tag: 'routes',         label: 'Routes layer (src/routes/)' },
  { path: /^src\/controllers\//,    tag: 'controllers',    label: 'Controllers layer' },
  { path: /^src\/services\//,       tag: 'services',       label: 'Services layer' },
  { path: /^src\/handlers\//,       tag: 'handlers',       label: 'Handlers layer' },
  { path: /^src\/models\//,         tag: 'models',         label: 'Models layer' },
  { path: /^src\/middleware\//,     tag: 'middleware',     label: 'Middleware layer' },
  { path: /^src\/core\//,           tag: 'core',           label: 'Core layer (src/core/)' },
  { path: /^src\/shared\//,         tag: 'shared',         label: 'Shared utilities layer' },
  { path: /^src\/types\//,          tag: 'types',          label: 'Shared type definitions' },
  { path: /^src\/clients\//,        tag: 'clients',        label: 'HTTP client adapters' },
  { path: /^src\/adapters\//,       tag: 'adapters',       label: 'Adapter layer' },
  { path: /^src\/lib\//,            tag: 'lib',            label: 'Library utilities' },
  { path: /^src\/utils\//,          tag: 'utils',          label: 'Utilities' },
  { path: /^src\/hooks\//,          tag: 'hooks',          label: 'React hooks' },
  { path: /^tests?\//,              tag: 'tests',          label: 'Tests directory' },
  { path: /\.github\/workflows\//,  tag: 'gh-workflows',   label: 'GitHub Actions workflows' },
  { path: /^infra\//,               tag: 'infra',          label: 'Infrastructure as code' },
  { path: /^terraform\//,           tag: 'terraform',      label: 'Terraform configs' },
  { path: /^k8s\/|^kubernetes\//,   tag: 'kubernetes',     label: 'Kubernetes manifests' },
  { path: /Dockerfile$/,            tag: 'docker',         label: 'Dockerfile present' },
  { path: /docker-compose\.ya?ml$/, tag: 'compose',        label: 'docker-compose present' },
  { path: /prisma\/schema\.prisma$/,tag: 'prisma-schema',  label: 'Prisma schema' },
  { path: /drizzle\.config\./,      tag: 'drizzle-config', label: 'Drizzle ORM config' },
  { path: /openapi\.ya?ml$/,        tag: 'openapi',        label: 'OpenAPI spec' },
  { path: /graphql\.schema|schema\.graphql$/, tag: 'graphql-schema', label: 'GraphQL schema' },
];

export class PatternExtractor {
  extract(profile: RepoProfile, readme: string | null, tree: string[]): Pattern[] {
    const patterns: Pattern[] = [];
    const domain = domainFromSignals(profile);
    const now = new Date().toISOString();
    const baseTags = [domain, (profile.language ?? 'unknown').toLowerCase()];

    // 1. README presence pattern
    if (readme && readme.length > 200) {
      const firstPara = readme
        .replace(/^#.*$/gm, '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .trim()
        .slice(0, 400);
      patterns.push({
        id: id('pat', profile.id, 'readme'),
        repoId: profile.id,
        repoFullName: profile.fullName,
        repoStars: profile.stars,
        repoLicense: profile.license,
        kind: 'architecture',
        domain,
        name: 'Documented README',
        summary: profile.description || 'Documented project',
        evidence: firstPara,
        tags: [...baseTags, 'readme', 'documented'],
        confidence: Math.min(0.5 + Math.log10(Math.max(profile.stars, 1)) * 0.15, 0.95),
        sourceUrl: profile.htmlUrl + '#readme',
        extractedAt: now,
      });
    }

    // 2. Library stack patterns
    const pkgText = this.extractPackageJsonFromTree(tree);
    if (pkgText) {
      for (const stack of KNOWN_STACKS) {
        if (stack.match.test(pkgText)) {
          patterns.push({
            id: id('pat', profile.id, 'stack', stack.name),
            repoId: profile.id,
            repoFullName: profile.fullName,
            repoStars: profile.stars,
            repoLicense: profile.license,
            kind: stack.kind,
            domain,
            name: stack.name,
            summary: stack.name + ' detected in package.json of ' + profile.fullName,
            evidence: 'matched package.json dependencies',
            tags: [...baseTags, ...stack.tags],
            confidence: Math.min(0.6 + Math.log10(Math.max(profile.stars, 1)) * 0.15, 0.98),
            sourceUrl: profile.htmlUrl + '/blob/' + profile.defaultBranch + '/package.json',
            extractedAt: now,
          });
        }
      }
    }

    // 3. Folder layout patterns
    const layoutHits = new Map<string, string>();
    for (const p of tree) {
      for (const marker of LAYOUT_MARKERS) {
        if (marker.path.test(p) && !layoutHits.has(marker.tag)) {
          layoutHits.set(marker.tag, marker.label);
        }
      }
    }
    if (layoutHits.size >= 3) {
      const labels = Array.from(layoutHits.values());
      patterns.push({
        id: id('pat', profile.id, 'layout'),
        repoId: profile.id,
        repoFullName: profile.fullName,
        repoStars: profile.stars,
        repoLicense: profile.license,
        kind: 'folder_layout',
        domain,
        name: 'Structured folder layout',
        summary: layoutHits.size + ' recognized layout markers in ' + profile.fullName,
        evidence: labels.join(' | '),
        tags: [...baseTags, 'structure', ...Array.from(layoutHits.keys())],
        confidence: Math.min(0.55 + layoutHits.size * 0.05, 0.95),
        sourceUrl: profile.htmlUrl,
        extractedAt: now,
      });
    }

    // 4. CI/CD pattern
    if (tree.some((p) => /\.github\/workflows\/.+\.ya?ml$/.test(p))) {
      patterns.push({
        id: id('pat', profile.id, 'ci'),
        repoId: profile.id,
        repoFullName: profile.fullName,
        repoStars: profile.stars,
        repoLicense: profile.license,
        kind: 'ci_cd',
        domain,
        name: 'GitHub Actions CI',
        summary: 'CI pipelines defined under .github/workflows/',
        evidence: tree.filter((p) => /\.github\/workflows\//.test(p)).slice(0, 5).join(' | '),
        tags: [...baseTags, 'ci', 'github-actions', 'automation'],
        confidence: 0.9,
        sourceUrl: profile.htmlUrl + '/tree/' + profile.defaultBranch + '/.github/workflows',
        extractedAt: now,
      });
    }

    // 5. Container pattern
    if (tree.some((p) => /Dockerfile$/.test(p) || /docker-compose\.ya?ml$/.test(p))) {
      patterns.push({
        id: id('pat', profile.id, 'docker'),
        repoId: profile.id,
        repoFullName: profile.fullName,
        repoStars: profile.stars,
        repoLicense: profile.license,
        kind: 'infra',
        domain,
        name: 'Containerized deployment',
        summary: 'Docker artifacts present in repository root',
        evidence: tree.filter((p) => /Dockerfile$|docker-compose/.test(p)).slice(0, 4).join(' | '),
        tags: [...baseTags, 'docker', 'container', 'deploy'],
        confidence: 0.85,
        sourceUrl: profile.htmlUrl,
        extractedAt: now,
      });
    }

    // 6. Topic-derived pattern (high-signal topics only)
    const highSignalTopics = profile.topics.filter((t) =>
      /^(production|production-ready|boilerplate|starter|template|enterprise|scalable|microservice|monorepo)$/i.test(t),
    );
    if (highSignalTopics.length > 0) {
      patterns.push({
        id: id('pat', profile.id, 'topics'),
        repoId: profile.id,
        repoFullName: profile.fullName,
        repoStars: profile.stars,
        repoLicense: profile.license,
        kind: 'architecture',
        domain,
        name: 'Curated high-signal topics',
        summary: 'Repository self-identifies with production-grade topic tags',
        evidence: highSignalTopics.join(', '),
        tags: [...baseTags, ...highSignalTopics.map((t) => t.toLowerCase())],
        confidence: 0.7,
        sourceUrl: profile.htmlUrl,
        extractedAt: now,
      });
    }

    return patterns;
  }

  private extractPackageJsonFromTree(tree: string[]): string | null {
    // We don't fetch package.json content here — the caller already passes
    // the tree. If a package.json exists at root, the scanner will have
    // fetched it separately and passed it via the pattern. For Phase 1,
    // we approximate by pattern matching the tree paths themselves.
    // This method exists so Phase 2 can inject real package.json content.
    const hasPackage = tree.some((p) => p === 'package.json');
    if (!hasPackage) return null;
    // Return a synthetic marker; the real package.json content is passed
    // to extract() via the `readme` argument in Phase 2.
    return '__package_present__';
  }
}

export const patternExtractor = new PatternExtractor();
