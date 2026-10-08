import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { DeepSeekService } from '../../deepseek/api/DeepSeekService';
import { ProjectFileStorage, StoredFile } from './ProjectFileStorage';
import { SkillLoader, Skill } from '../../skills/SkillLoader';
import type { LlmEngine } from '../../engines/LlmEngine';
import { log } from '../../shared/logger';
import { imageTo3D } from '../../forge/ForgeService';

export interface BuildResult {
  projectId: string;
  files: StoredFile[];
  previewUrl: string;
  summary: string;
}

interface ParsedFile { path: string; content: string; }

// ─── Stack detection ────────────────────────────────────────────
// The build prompt used to assume a static HTML site. When editing a
// real repository (cloned from GitHub, for example) that assumption
// produces wrong output: it inlines everything as HTML. We detect the
// stack from the file tree and pick rules that match.
type ProjectStack =
  | 'static-html'
  | 'node-ts'
  | 'node-js'
  | 'python'
  | 'rust'
  | 'go'
  | 'ruby'
  | 'php'
  | 'mixed'
  | 'unknown';

export interface ManifestEntry {
  path: string;
  role: string;
  estimated_kb: number;
  depends_on: string[];
}

/** Strip markdown code fences the model sometimes adds around file output. */
function stripFileFences(raw: string): string {
  let text = raw.trim();
  // Strip a single outer code fence if present (``` or ```lang).
  const fence = text.match(/^```[a-zA-Z0-9]*\s*\n([\s\S]*?)\n?```\s*$/);
  if (fence && fence[1]) return fence[1];
  // ```html at start only
  if (text.startsWith('```')) {
    text = text.replace(/^```[a-zA-Z0-9]*\s*\n?/, '');
    text = text.replace(/\n?```\s*$/, '');
  }
  return text;
}

/** Extract the first balanced JSON array of {path,...} objects from text. */
function parseManifestArray(raw: string): ManifestEntry[] | null {
  if (!raw) return null;
  const start = raw.indexOf('[');
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { inStr = false; }
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) {
        const candidate = raw.slice(start, i + 1);
        let parsed: any = null;
        try { parsed = JSON.parse(candidate); } catch {}
        if (!parsed) { try { parsed = JSON.parse(sanitizeJson(candidate)); } catch {} }
        if (Array.isArray(parsed)) {
          return parsed
            .filter((x: any) => x && typeof x.path === 'string')
            .map((x: any) => ({
              path: String(x.path),
              role: typeof x.role === 'string' ? x.role : 'file',
              estimated_kb: typeof x.estimated_kb === 'number' ? x.estimated_kb : 8,
              depends_on: Array.isArray(x.depends_on) ? x.depends_on.map(String) : [],
            }));
        }
        return null;
      }
    }
  }
  return null;
}

interface StackRules {
  label: string;
  perFileContextCap: number;   // bytes of each file included in the prompt
  perFileOutputCap: number;    // bytes the model should return for one file
  totalOutputCap: number;      // bytes total per response
  formatRules: string[];       // lines injected into the header
  contextHint: string;         // line telling the model what "the project" is
}

function detectStack(files: string[]): ProjectStack {
  const has = (name: string): boolean => files.some((f) => f === name || f.endsWith('/' + name));
  const hasExt = (ext: string): boolean => files.some((f) => f.endsWith(ext));
  if (has('package.json')) {
    if (has('tsconfig.json') || hasExt('.ts') || hasExt('.tsx')) return 'node-ts';
    return 'node-js';
  }
  if (has('pyproject.toml') || has('requirements.txt') || has('setup.py')) return 'python';
  if (has('Cargo.toml')) return 'rust';
  if (has('go.mod')) return 'go';
  if (has('Gemfile')) return 'ruby';
  if (has('composer.json')) return 'php';
  if (has('index.html') || hasExt('.html')) return 'static-html';
  // Empty project: treat as a fresh static site. This is what the
  // build endpoint is called for on Home — creating a new website
  // from nothing. The 'unknown' bucket's 10 KB per-file cap causes
  // the model to self-split into multiple responses and only write
  // the first file (e.g. index.html without styles.css).
  if (files.length === 0) return 'static-html';
  return 'mixed';
}

function rulesForStack(stack: ProjectStack): StackRules {
  switch (stack) {
    case 'static-html':
      return {
        label: 'Static HTML/CSS/JS site',
        perFileContextCap: 16384,
        perFileOutputCap: 10240,   // 10 KB — forces the model to split, not inline
        totalOutputCap: 120_000,
        formatRules: [
          '- Vanilla HTML/CSS/JS only. No build steps, no external bundlers.',
          '- CRITICAL FILE STRUCTURE (the build fails if violated):',
          '  * Every page is index.html + styles.css + script.js.',
          '  * ALL CSS goes in styles.css, linked via <link rel="stylesheet" href="styles.css">.',
          '  * ALL JS goes in script.js, loaded via <script src="script.js" defer>.',
          '  * NEVER inline more than 1 KB of CSS inside a <style> tag.',
          '  * NEVER inline more than 1 KB of JS inside a <script> tag.',
          '- Keep index.html under 8 KB. If content exceeds that, split into multiple',
          '  .html pages (about.html, pricing.html) linked from the nav.',
          '- Keep styles.css under 12 KB. If larger, split into base.css + page CSS.',
          '- When adding pages, update the nav in every existing .html file.',
        ],
        contextHint: 'The user is asking for a change or an addition to the site above.',
      };
    case 'node-ts':
      return {
        label: 'TypeScript / Node.js project',
        perFileContextCap: 32768,
        perFileOutputCap: 65536,
        totalOutputCap: 200_000,
        formatRules: [
          '- This is a TypeScript/Node.js project. Preserve the existing build tooling, imports, and file layout.',
          '- Match the existing style: same import style, same async pattern, same error handling.',
          '- Do not modify package.json, tsconfig.json, or lockfiles unless the user explicitly asks.',
          '- Do not introduce new dependencies without explicit instruction.',
          '- Prefer editing existing files over creating new ones.',
        ],
        contextHint: 'The user is asking for a change to the codebase above.',
      };
    case 'node-js':
      return {
        label: 'JavaScript / Node.js project',
        perFileContextCap: 32768,
        perFileOutputCap: 65536,
        totalOutputCap: 200_000,
        formatRules: [
          '- This is a JavaScript/Node.js project. Preserve the existing tooling and file layout.',
          '- Match the existing style: same import/require style, same async pattern.',
          '- Do not modify package.json or lockfiles unless the user explicitly asks.',
          '- Do not introduce new dependencies without explicit instruction.',
          '- Prefer editing existing files over creating new ones.',
        ],
        contextHint: 'The user is asking for a change to the codebase above.',
      };
    case 'python':
      return {
        label: 'Python project',
        perFileContextCap: 32768,
        perFileOutputCap: 65536,
        totalOutputCap: 200_000,
        formatRules: [
          '- This is a Python project. Preserve the existing module layout and imports.',
          '- Match the existing style: type hints, async patterns, error handling.',
          '- Do not modify pyproject.toml, requirements.txt, or setup.py unless the user explicitly asks.',
          '- Do not introduce new dependencies without explicit instruction.',
          '- Prefer editing existing files over creating new ones.',
        ],
        contextHint: 'The user is asking for a change to the codebase above.',
      };
    case 'rust':
    case 'go':
    case 'ruby':
    case 'php':
      return {
        label: stack + ' project',
        perFileContextCap: 32768,
        perFileOutputCap: 65536,
        totalOutputCap: 200_000,
        formatRules: [
          '- Preserve the existing file layout and tooling.',
          '- Match the existing style of the files you touch.',
          '- Do not modify manifest or lock files unless the user explicitly asks.',
          '- Prefer editing existing files over creating new ones.',
        ],
        contextHint: 'The user is asking for a change to the codebase above.',
      };
    case 'mixed':
    case 'unknown':
    default:
      return {
        label: 'Project (mixed or unrecognised stack)',
        perFileContextCap: 4096,
        perFileOutputCap: 10_000,
        totalOutputCap: 25_000,
        formatRules: [
          '- Preserve the existing file layout and tooling.',
          '- Match the existing style of the files you touch.',
          '- Prefer editing existing files over creating new ones.',
          '- If unsure about a change, make the smallest possible edit.',
        ],
        contextHint: 'The user is asking for a change to the project above.',
      };
  }
}

// Different engines accept different prompt sizes. Browser-driven engines
// (Qwen via wspr, Kimi, DeepHat) go through a web UI that silently
// truncates oversized messages. We cap the total context accordingly.
function engineContextCap(engineId: string | undefined): number {
  switch (engineId) {
    case 'engine_qwen': return 55_000;    // wspr qwen cap raised to 100k
    case 'engine_kimi': return 55_000;
    case 'engine_deephad': return 80_000;
    default: return 100_000;              // DeepSeek direct HTTP
  }
}

function buildHeader(stack: ProjectStack): string {
  const rules = rulesForStack(stack);
  return [
    'You are a code editor inside an app builder.',
    'Every user message is a change request, even when it sounds conversational.',
    'You do not chat. You emit code.',
    '',
    'PROJECT TYPE: ' + rules.label,
    '',
    'MANDATORY SKILLS:',
    'A REFERENCE SKILLS block appears below. Every pattern it defines is',
    'REQUIRED, not optional. Before writing any file you MUST consult that',
    'block and apply the conventions it specifies: exact class names,',
    'exact CSS variables, exact HTML structure, exact JS patterns.',
    'Do NOT invent your own layout, colour names, or component structure',
    'when a skill already defines them.',
    '',
    ...rules.formatRules,
    '',
    'FORMAT RULES for every response:',
    '- Output ONE JSON object. Nothing before it, nothing after it.',
    '- No prose, no explanations, no markdown code fences.',
    '- Shape: {"files":[{"path":"relative/path","content":"<full contents>"}]}',
    '- Paths must be relative, no leading slash, no "..".',
    '- When editing, return the FULL contents of every file you touch.',
    '- Do not touch files the user did not ask you to change.',
  ].join('\n');
}

const TAIL_REMINDER = [
  '',
  '=== FINAL CHECK BEFORE RESPONDING ===',
  '1. Did you apply EVERY pattern from the REFERENCE SKILLS block above?',
  '2. Are you emitting EXACTLY one JSON object, starting with { and',
  '   ending with } — no markdown, no prose, no code fences?',
  'Respond with the JSON object only.',
].join('\n');

const RETRY_REMINDER = [
  '',
  '=== RETRY ===',
  'Your previous response was not a valid JSON object. You must respond with',
  'EXACTLY one JSON object now. Start your entire message with { and end with }.',
  'No other text.',
].join('\n');

// ─── SOVEREIGN FACTORY IDENTITY LAYER ─────────────────────────────
// The Sovereign Factory DNA is prepended to every build prompt.
// It shapes HOW the model approaches the task; the OUTPUT CONTRACT
// below forbids any identity language from appearing in the response.
// This separator is what makes the mode-shift explicit to the model.
const SOVEREIGN_OUTPUT_CONTRACT = [
  '',
  '=== END IDENTITY LAYER ===',
  '=== OUTPUT MODE BEGINS ===',
  '',
  'The identity layer above shapes HOW you approach this task:',
  'decisive, zero-friction, subtractive, clean. It does NOT shape',
  'WHAT you emit.',
  '',
  'HARD PROHIBITIONS:',
  '- Your response is code and structured data ONLY.',
  '- Do NOT write affirmations, mantras, or identity scripts.',
  '- Do NOT echo the words "sovereign", "void forge", "chaos engine",',
  '  "omega switch", "launch swarm", "soul scientist", "sentinels",',
  '  or "god mode" unless they are legitimate code identifiers a user',
  '  explicitly asked for.',
  '- Do NOT add personality, philosophy, or commentary to your response.',
  '- Do NOT mention that you are following an identity or a prompt.',
  '',
  'Follow the FORMAT RULES below exactly.',
  '',
].join('\n');


/**
 * Escape raw control characters that appear inside JSON string values.
 * LLMs frequently emit a literal newline or tab inside a string instead
 * of the JSON escape sequence, which makes JSON.parse reject the payload.
 */
function sanitizeJson(raw: string): string {
  let out = '';
  let inStr = false;
  let esc = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (esc) { out += c; esc = false; continue; }
      if (c === '\\') { out += c; esc = true; continue; }
      if (c === '"') { out += c; inStr = false; continue; }
      const code = c.charCodeAt(0);
      if (code < 0x20) {
        if (c === '\n') out += '\\n';
        else if (c === '\t') out += '\\t';
        else if (c === '\r') out += '\\r';
        else out += '\\u' + code.toString(16).padStart(4, '0');
        continue;
      }
      out += c;
      continue;
    }
    if (c === '"') { out += c; inStr = true; continue; }
    out += c;
  }
  // Remove trailing commas before ] or }
  out = out.replace(/,\s*([\]}])/g, '$1');
  return out;
}

function looksTruncated(raw: string): boolean {
  const t = raw.trim();
  if (!t) return true;
  if (!t.endsWith('}')) return true;
  const tail = t.slice(-200);
  let q = 0;
  for (let i = 0; i < tail.length; i++) {
    if (tail[i] === '"' && (i === 0 || tail[i - 1] !== '\\')) q++;
  }
  return q % 2 === 1;
}

function tryParseJson(raw: string): any {
  try { return JSON.parse(raw); } catch {}
  try { return JSON.parse(sanitizeJson(raw)); } catch {}
  return null;
}

function extractJson(raw: string): { files: ParsedFile[] } | null {
  if (!raw) return null;
  const candidates: string[] = [];

  // 1. Fenced json block
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) candidates.push(fence[1].trim());

  // 2. Balanced brace scan — find first { then matching }
  const firstBrace = raw.indexOf('{');
  if (firstBrace !== -1) {
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = firstBrace; i < raw.length; i++) {
      const c = raw[i];
      if (inStr) {
        if (esc) { esc = false; continue; }
        if (c === '\\') { esc = true; continue; }
        if (c === '"') { inStr = false; }
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          candidates.push(raw.slice(firstBrace, i + 1));
          break;
        }
      }
    }
  }

  // 3. Whole trimmed
  candidates.push(raw.trim());

  for (const c of candidates) {
    const j = tryParseJson(c);
    if (j && Array.isArray(j.files)) return j;
  }
  return null;
}

function validateFiles(input: any): ParsedFile[] {
  if (!Array.isArray(input)) throw new Error('files must be an array');
  const out: ParsedFile[] = [];
  for (const f of input) {
    if (!f || typeof f.path !== 'string' || typeof f.content !== 'string') continue;
    const cleaned = f.path.replace(/^\/+/, '').replace(/\\/g, '/');
    if (cleaned.includes('..')) continue;
    if (cleaned.length === 0) continue;
    out.push({ path: cleaned, content: f.content });
  }
  if (out.length === 0) throw new Error('no valid files in response');
  return out;
}

export interface BuildImageInput {
  name: string;
  dataUrl: string;
}

export interface BuildAttachments {
  images?: BuildImageInput[];
  /** External image URLs to fetch and save to _attachments/ before building. */
  imageUrls?: string[];
  figmaUrl?: string;
  forceSkillIds?: string[];
}

export interface BuildOptions {
  /** Optional engine id, e.g. 'engine_qwen'. Defaults to engine_deepseek. */
  engine?: string;
  /**
   * Optional pre-built skills block from the client. When present and
   * non-empty, this replaces the builder's own top-3 loader. The client
   * runs a larger, curated composite (11 skills) that the backend's
   * keyword matcher cannot reproduce.
   */
  skillsBlock?: string;
}

interface AskResult {
  text: string;
  /** DeepSeek chat session id — set only for the direct DeepSeek path. */
  sessionId: string | null;
  engineId: string;
}

export class ProjectBuilder {
  private sovereignPrompt: string | null = null;
  private engineResolver: ((id: string) => LlmEngine | undefined) | null = null;

  /** Injected at boot once the EngineRegistry exists. */
  setEngineResolver(fn: (id: string) => LlmEngine | undefined): void {
    this.engineResolver = fn;
  }

  constructor(
    private readonly deepseek: DeepSeekService,
    private readonly storage: ProjectFileStorage,
    private readonly skills?: SkillLoader,
  ) {
    this.loadSovereignPrompt();
  }

  // Directories and files that should never appear in the model's
  // context view of an existing project. Cloned repos carry .git/,
  // node_modules/, dist/, etc. — none of it is useful to the model,
  // and including it blows the per-file context budget on junk.
  private shouldSkipInContext(rel: string): boolean {
    const prefixes = [
      '.git/',
      'node_modules/',
      'dist/',
      'build/',
      '.next/',
      '.expo/',
      '.venv/',
      '__pycache__/',
      'coverage/',
      '.cache/',
    ];
    if (prefixes.some((p) => rel === p.slice(0, -1) || rel.startsWith(p))) return true;
    if (rel === '.DS_Store' || rel.endsWith('/.DS_Store')) return true;
    return false;
  }

  private loadSovereignPrompt(): void {
    const candidates = [
      process.env.SOVEREIGN_PROMPT_FILE,
      path.join(os.homedir(), 'sovereign-factory', 'prompts', 'sovereign-factory.md'),
    ].filter((x): x is string => typeof x === 'string' && x.length > 0);

    for (const p of candidates) {
      try {
        if (!fs.existsSync(p)) continue;
        const raw = fs.readFileSync(p, 'utf8').trim();
        if (raw.length === 0) continue;
        this.sovereignPrompt = raw;
        log.info('project.build.sovereign_loaded', { path: p, chars: raw.length });
        return;
      } catch (e) {
        log.warn('project.build.sovereign_load_failed', {
          path: p,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    log.warn('project.build.sovereign_missing', {
      tried: candidates,
      note: 'builds will run without the Sovereign Factory identity layer',
    });
  }

  private async ask(
    headerText: string,
    contextBlock: string,
    prompt: string,
    tailText: string,
    temperature?: number,
    engineId?: string,
  ): Promise<AskResult> {
    const identityBlock = this.sovereignPrompt
      ? this.sovereignPrompt + '\n' + SOVEREIGN_OUTPUT_CONTRACT + '\n'
      : '';
    const composed = identityBlock + headerText + '\n' + contextBlock + '\nUSER REQUEST:\n' + prompt + '\n' + tailText;
    const opts: any = {
      thinkingEnabled: false,
      searchEnabled: false,
      // DeepSeek caps a single response around 8k output tokens.
      // Pass the maximum so large pages finish instead of truncating
      // mid-string (which produces "Unterminated string in JSON").
      maxTokens: 8192,
    };
    if (typeof temperature === 'number') opts.temperature = temperature;

    // Route through the chosen engine when one was supplied and it is not
    // DeepSeek. DeepSeek keeps its direct path so existing behaviour is
    // unchanged. Any registered engine whose id is unknown falls back to
    // DeepSeek with a warning rather than hard-failing the build.
    if (engineId && engineId !== 'engine_deepseek' && this.engineResolver) {
      const engine = this.engineResolver(engineId);
      if (engine) {
        log.info('project.build.engine_call', { engineId, promptChars: prompt.length });
        const resp = await engine.call(composed, opts);
        return {
          text: (resp && resp.data && resp.data.content) || '',
          sessionId: null,
          engineId,
        };
      }
      log.warn('project.build.engine_not_found', { engineId, fallingBack: 'engine_deepseek' });
    }

    const response = await this.deepseek.callDeepSeek(composed, opts);
    const content = (response && response.data && (response.data as any).content) || '';
    return { text: content, sessionId: null, engineId: 'engine_deepseek' };
  }

  /**
   * Heal a truncated response by asking the model to continue from where
   * it stopped. The partial response is embedded in the prompt so the
   * model sees its own work — this does NOT rely on session IDs, which
   * the DeepSeek web bridge does not preserve across calls.
   *
   * Returns the accumulated text. May equal the input if healing was
   * not possible.
   */
  /**
   * Route an LLM call through the engine the user picked. Falls back to
   * DeepSeek when the resolver is missing, the engine is unknown, or the
   * chosen engine throws. Same return shape as the DeepSeek path, so
   * callers don't care which engine actually answered.
   */
  private async callEngine(
    prompt: string,
    opts: any,
    engineId: string,
  ): Promise<{ text: string; engineUsed: string }> {
    if (engineId && engineId !== 'engine_deepseek' && this.engineResolver) {
      const engine = this.engineResolver(engineId);
      if (engine) {
        try {
          log.info('project.build.engine_route', {
            engineId,
            promptChars: prompt.length,
          });
          const resp: any = await engine.call(prompt, opts);
          const text = (resp && resp.data && resp.data.content) || '';
          if (text) return { text, engineUsed: engineId };
          log.warn('project.build.engine_empty', { engineId });
        } catch (e) {
          log.warn('project.build.engine_threw', {
            engineId,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      } else {
        log.warn('project.build.engine_not_registered', { engineId });
      }
    }
    const response = await this.deepseek.callDeepSeek(prompt, opts);
    const text = (response && response.data && (response.data as any).content) || '';
    return { text, engineUsed: 'engine_deepseek' };
  }

  private async healIfTruncated(partial: string, projectId: string, engineId: string): Promise<string> {
    const MAX_ROUNDS = 8;
    const TAIL_BYTES = 8000;
    const MIN_OVERLAP = 20;
    const MAX_OVERLAP = 500;

    if (!looksTruncated(partial)) return partial;

    let accumulated = partial;
    let rounds = 0;

    while (rounds < MAX_ROUNDS) {
      if (!looksTruncated(accumulated)) break;
      rounds += 1;

      const tail = accumulated.length > TAIL_BYTES
        ? accumulated.slice(-TAIL_BYTES)
        : accumulated;

      const continuationPrompt = [
        'Your previous response was cut off before it finished. Continue it.',
        '',
        '=== END OF YOUR PARTIAL RESPONSE (last ' +
          Math.round(tail.length / 1024) + ' KB) ===',
        tail,
        '=== END OF PARTIAL ===',
        '',
        'Continue from the EXACT character after the last one shown above.',
        'Do NOT repeat any content already written.',
        'Do NOT add prose, markdown fences, greetings, or commentary.',
        'Emit ONLY the next characters needed to complete the output.',
        'If you were inside a JSON string value, continue that string.',
        'If you were between values, emit the closing syntax.',
      ].join('\n');

      const opts: any = {
        thinkingEnabled: false,
        searchEnabled: false,
        maxTokens: 8192,
      };

      let chunk = '';
      try {
        const r = await this.callEngine(continuationPrompt, opts, engineId);
        chunk = r.text;
      } catch (e) {
        log.warn('project.build.heal_call_failed', {
          projectId,
          round: rounds,
          error: e instanceof Error ? e.message : String(e),
        });
        break;
      }
      if (!chunk) {
        log.warn('project.build.heal_empty', { projectId, round: rounds });
        break;
      }

      // Trim repeated suffix-prefix overlap. Models often repeat a few
      // characters of the tail before continuing.
      const maxLen = Math.min(MAX_OVERLAP, accumulated.length, chunk.length);
      for (let len = maxLen; len >= MIN_OVERLAP; len--) {
        if (accumulated.slice(-len) === chunk.slice(0, len)) {
          chunk = chunk.slice(len);
          break;
        }
      }

      accumulated += chunk;

      log.info('project.build.healed', {
        projectId,
        round: rounds,
        addedBytes: chunk.length,
        accumulatedBytes: accumulated.length,
        stillTruncated: looksTruncated(accumulated),
      });
    }

    return accumulated;
  }

  /**
   * Ask the model for a FILE MANIFEST — just paths and rough sizes.
   * Response is small (~500 bytes), so it never hits the 25 KB output
   * wall. This is step 1 of the per-file build pipeline: plan first,
   * then generate file by file.
   */
  private async generateProjectManifest(
    prompt: string,
    stack: ProjectStack,
    image3D: { glbUrl: string } | null | undefined,
    engineId: string,
    isEdit: boolean,
  ): Promise<ManifestEntry[] | null> {
    const rules = rulesForStack(stack);
    const parts: string[] = [
      'PLAN MODE. Do not write code. Produce a FILE MANIFEST.',
      '',
    ];
    if (image3D) {
      parts.push(
        '=== 3D MODEL AVAILABLE ===',
        'A 3D model has been generated from the user image.',
        'URL: ' + image3D.glbUrl,
        '',
        'You MUST plan a page whose HERO is this 3D model.',
        'Required files:',
        '  - index.html  (must contain <canvas id="scene-canvas"></canvas>)',
        '  - styles.css  (page styles)',
        '  - scene.js    (Three.js scene that loads and animates the GLB)',
        '  - script.js   (page interactions)',
        '',
        'scene.js MUST:',
        '  - import * as THREE from a CDN and GLTFLoader from three/examples',
        '  - load the GLB from the URL above',
        '  - set up ambient + directional + rim lighting',
        '  - rotate the model via requestAnimationFrame based on cursor',
        '  - handle prefers-reduced-motion (static pose)',
        '  - handle window resize',
        '=== END 3D MODEL ===',
        '',
      );
    }
    if (isEdit) {
      parts.push(
        '=== EDIT MODE ===',
        'This is an EXISTING project. You are NOT creating a new one.',
        'Plan ONLY the files that MUST change to fulfil the request.',
        'Do NOT re-plan the whole project.',
        'Do NOT list files that will not be touched.',
        'Hard cap: 8 files. Prefer 2-4.',
        '=== END EDIT MODE ===',
        '',
      );
    }
    parts.push(
      'PROJECT REQUEST: ' + prompt,
      'PROJECT TYPE: ' + rules.label,
      '',
      'Output ONLY a JSON array. Nothing before or after it.',
      'Shape: [{"path":"index.html","role":"page","estimated_kb":8,"depends_on":[]}]',
      '',
      'Rules:',
      '- Each file estimated 5-15 KB. If a file would exceed 15 KB, split it.',
      '- For a static site: index.html + styles.css + script.js minimum.',
      '- depends_on lists relative paths this file references.',
      '- Keep total under 60 KB.',
      '- No prose. No markdown fences. Only the JSON array.',
    );
    const manifestPrompt = parts.join('\n');

    try {
      const r = await this.callEngine(manifestPrompt, {
        thinkingEnabled: false,
        searchEnabled: false,
        maxTokens: 2048,
      }, engineId);
      return parseManifestArray(r.text);
    } catch (e) {
      log.warn('project.build.manifest_call_failed', {
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  /**
   * Per-file generation path. One DeepSeek call per manifest entry.
   * Each response is 8-15 KB raw file content — under the 25 KB wall.
   * Files are written to disk as soon as they arrive.
   */
  private async buildPerFile(
    projectId: string,
    prompt: string,
    manifest: ManifestEntry[],
    contextBlock: string,
    skillsBlock: string,
    engineId: string,
    isEdit: boolean,
  ): Promise<ParsedFile[] | null> {
    const written: ParsedFile[] = [];

    for (let i = 0; i < manifest.length; i++) {
      const entry = manifest[i];
      const step = (i + 1) + '/' + manifest.length;

      // Context for this call: contents of files this file depends on,
      // so class names / IDs / interfaces match. Falls back to including
      // index.html for any non-HTML file so CSS and JS see the markup.
      const MAX_DEP_BYTES = 40000;
      const depPaths = new Set<string>(entry.depends_on);
      if (!entry.path.endsWith('.html') && !depPaths.has('index.html')) {
        depPaths.add('index.html');
      }
      const depBlocks: string[] = [];
      let depBudget = MAX_DEP_BYTES;
      for (const w of written) {
        if (!depPaths.has(w.path)) continue;
        if (depBudget <= 0) break;
        const chunk = w.content.length > depBudget
          ? w.content.slice(0, depBudget) + '\n…(truncated for prompt budget)'
          : w.content;
        depBlocks.push('=== ' + w.path + ' (' + w.content.length + ' bytes) ===\n' + chunk);
        depBudget -= chunk.length;
      }
      const writtenSummary = written
        .map((f) => '--- ' + f.path + ' (' + f.content.length + ' bytes) ---')
        .join('\n');
      const depContent = depBlocks.length > 0
        ? '\n=== FULL CONTENT OF FILES YOU MUST MATCH ===\n' + depBlocks.join('\n\n')
        : '';

      const isInteraction = entry.role === 'interaction' ||
        /(^|\/)script(-[a-z0-9-]+)?\.js$/.test(entry.path);
      const is3DScene = entry.role === '3d-scene' ||
        /(^|\/)scene(-[a-z0-9-]+)?\.(js|ts)$/.test(entry.path);
      const isStyles = entry.role === 'style' || /\.css$/.test(entry.path);
      const isPage = entry.role === 'page' || /\.html$/.test(entry.path);

      const requirements: string[] = [];

      if (isInteraction) {
        requirements.push(
          '=== MANDATORY LIBRARIES FOR THIS FILE ===',
          'You MUST use Motion 12 via CDN. No alternatives. No vanilla-only.',
          '',
          'Required import at the top of this file:',
          '  import { animate, inView, stagger, scroll } from "https://cdn.jsdelivr.net/npm/motion@12/+esm";',
          '',
          'Required animations (all implemented with Motion, not raw CSS keyframes):',
          '- Hero entrance on DOMContentLoaded: stagger the h1, subtext, and CTA',
          '  with a 60ms cascade, easeOut, 500ms duration.',
          '- Every section with class "reveal" or "animate-in" MUST reveal on',
          '  scroll using Motion\'s inView() with { once: true, amount: 0.2 }.',
          '- Primary buttons: scale to 0.97 on pointerdown, back on pointerup.',
          '- Wrap everything in prefers-reduced-motion check. If user has it set,',
          '  skip all transforms and only run opacity.',
          '',
          'Do NOT use window.addEventListener("scroll") for reveals.',
          'Do NOT use raw CSS @keyframes for reveal animations.',
          'Do NOT write plain ES2019 with "no dependencies". Motion is required.',
          '',
        );
      }

      if (is3DScene) {
        requirements.push(
          '=== MANDATORY 3D LIBRARY FOR THIS FILE ===',
          'You MUST use Three.js via CDN. Load the model from the 3D MODEL',
          'URL provided in the skills block above.',
          '',
          'Required imports:',
          '  import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js";',
          '  import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/loaders/GLTFLoader.js";',
          '  import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/controls/OrbitControls.js";',
          '',
          'Required features:',
          '- Load the GLB from the 3D MODEL URL provided above via GLTFLoader.',
          '- Set up scene, PerspectiveCamera, WebGLRenderer with alpha:true and',
          '  antialias:true. Append the renderer canvas to #scene-canvas.',
          '- Lighting: HemisphereLight + DirectionalLight + rim DirectionalLight.',
          '- Auto-rotate the model slowly, then tilt toward cursor X/Y using',
          '  damped lerp. Never read state from React; use raw requestAnimationFrame.',
          '- Handle window resize.',
          '- If prefers-reduced-motion is set, skip rotation and show static pose.',
          '- Handle the case where the GLB fails to load: show a CSS fallback.',
          '',
        );
      }

      if (isStyles) {
        requirements.push(
          '=== CSS REQUIREMENTS ===',
          '- :root with semantic CSS custom properties for --color-*, --space-*,',
          '  --radius-*, --font-*. No raw hex values except in the :root block.',
          '- @media (prefers-reduced-motion: reduce) block that disables all',
          '  transitions and animations.',
          '- clamp() for all display typography (h1, h2, display classes).',
          '- transform/opacity only in transitions. Never transition width/height.',
          '',
        );
      }

      if (isPage) {
        requirements.push(
          '=== HTML REQUIREMENTS ===',
          '- Semantic landmarks: <header>, <main>, <footer>.',
          '- Every section has an aria-label or a heading.',
          '- Decorative elements have aria-hidden="true".',
          '- Include the Motion module script tag:',
          '  <script type="module" src="script.js"></script>',
          '- If this page has a 3D model, include <canvas id="scene-canvas"></canvas>',
          '  in the hero section AND <script type="module" src="scene.js"></script>.',
          '',
        );
      }

      // On edits, fetch the current content of the file being modified
      // so the model edits what's there instead of inventing a new file.
      let existingContent = '';
      if (isEdit) {
        try {
          const cur = this.storage.readFile(projectId, entry.path);
          if (cur && cur.length > 0) {
            const cap = cur.length > 20000
              ? cur.slice(0, 20000) + '\n…(truncated for prompt budget)'
              : cur;
            existingContent = '=== CURRENT CONTENT OF ' + entry.path +
              ' — EDIT THIS, KEEP STYLES/CLASSES ===\n' + cap +
              '\n=== END CURRENT CONTENT ===\n';
          }
        } catch { /* new file — leave empty */ }
      }

      const filePrompt = [
        'Write ONE FILE. Output ONLY the raw file contents.',
        'No JSON, no code fences, no prose, no explanations, no greetings.',
        'Start your response with the first character of the file.',
        'End your response with the last character of the file.',
        existingContent,
        '',
        'PROJECT REQUEST: ' + prompt,
        'FILE TO WRITE NOW: ' + entry.path,
        'ROLE: ' + entry.role,
        'TARGET SIZE: ' + entry.estimated_kb + ' KB',
        entry.depends_on.length > 0
          ? 'DEPENDS ON (must match these interfaces): ' + entry.depends_on.join(', ')
          : '',
        '',
        'FILES ALREADY WRITTEN (paths only):',
        writtenSummary || '(none yet)',
        depContent,
        '',
        'CRITICAL: use the exact same class names, IDs, and file paths as',
        'the files above. Do NOT invent new class names. Do NOT rename.',
        'Your output must be drop-in compatible with what already exists.',
        '',
        ...requirements,
        'REFERENCE STYLE / PATTERNS (background context only):',
        skillsBlock.slice(0, 30000),
        '',
        'Write ' + entry.path + ' now. Output only its contents.',
      ].filter(Boolean).join('\n');

      const opts: any = {
        thinkingEnabled: false,
        searchEnabled: false,
        maxTokens: 8192,
      };

      let text = '';
      let engineUsed = engineId || 'engine_deepseek';
      try {
        const r = await this.callEngine(filePrompt, opts, engineId);
        text = r.text;
        engineUsed = r.engineUsed;
      } catch (e) {
        log.error('project.build.perfile_call_failed', {
          projectId,
          path: entry.path,
          step,
          error: e instanceof Error ? e.message : String(e),
        });
        // Continue with the next file — one bad file shouldn't kill the build.
        continue;
      }

      if (!text || text.trim().length < 50) {
        log.warn('project.build.perfile_empty', { projectId, path: entry.path, step });
        continue;
      }

      const content = stripFileFences(text);
      written.push({ path: entry.path, content });

      log.info('project.build.file_written', {
        projectId,
        path: entry.path,
        bytes: content.length,
        step,
        engineUsed,
      });
    }

    if (written.length === 0) return null;
    return written;
  }

  async build(
    projectId: string,
    prompt: string,
    publicBaseUrl: string,
    attachments: BuildAttachments = {},
    options: BuildOptions = {},
  ): Promise<BuildResult> {
    let engineId = options.engine && options.engine.length > 0 ? options.engine : 'engine_deepseek';
    log.info('project.build.start', {
      projectId,
      engineId,
      prompt_preview: prompt.slice(0, 80),
    });

    const existing = this.storage.listFiles(projectId);
    const isEdit = existing.length > 0;
    const stack = detectStack(existing.map((f) => f.path));
    const rules = rulesForStack(stack);
    const header = buildHeader(stack);

    // If the user attached images, generate a 3D model first via
    // three.ws Forge (free tier, hunyuan3d backend). The GLB URL flows
    // into the manifest prompt and per-file context so scene.js knows
    // what to load and index.html knows to include a canvas.
    let image3D: { glbUrl: string; viewerUrl: string } | null = null;
    if (attachments.images && attachments.images.length > 0) {
      const imageUrls = attachments.images
        .map((img) => img.dataUrl)
        .filter((u) => typeof u === 'string' && u.length > 0);
      if (imageUrls.length > 0) {
        log.info('project.build.image3d_start', {
          projectId,
          images: imageUrls.length,
        });
        const r = await imageTo3D(imageUrls, prompt);
        if (r) {
          image3D = { glbUrl: r.glbUrl, viewerUrl: r.viewerUrl };
          log.info('project.build.image3d_ok', {
            projectId,
            glbUrl: r.glbUrl,
            backend: r.backend,
            elapsedMs: r.elapsedMs,
          });
        } else {
          log.warn('project.build.image3d_failed', { projectId });
        }
      }
    }

    // Phase A step 2: request a file manifest. When image3D is present
    // the manifest prompt instructs the model to plan a Three.js scene.
    const manifest = await this.generateProjectManifest(prompt, stack, image3D, engineId, isEdit);
    if (manifest && manifest.length > 0) {
      log.info('project.build.manifest_ready', {
        projectId,
        files: manifest.length,
        total_kb_estimate: manifest.reduce((s, m) => s + (m.estimated_kb || 0), 0),
        paths: manifest.map((m) => m.path),
      });
    } else {
      log.warn('project.build.manifest_unavailable', { projectId });
    }

    log.info('project.build.stack_detected', { projectId, stack, isEdit, fileCount: existing.length, engineId, contextCap: engineContextCap(engineId) });

    // Context block: on edits, include the current files. To keep the
    // input prompt small, truncate each file to its first 2 KB and mark
    // it. That is enough for the AI to understand structure and names
    // without blowing the input/output budget.
    let contextBlock = '';
    if (isEdit) {
      const MAX_CTX_PER_FILE = rules.perFileContextCap;
      const readOne = (rel: string): string => {
        try { return this.storage.readFile(projectId, rel); } catch { return ''; }
      };
      // Filter out vendor directories so the model sees only source.
      const contextFiles = existing.filter((f) => !this.shouldSkipInContext(f.path));
      const MAX_TOTAL_CTX = engineContextCap(engineId);   // engine-aware
      let usedBytes = 0;
      const summary: string[] = [];
      for (const f of contextFiles) {
        if (usedBytes >= MAX_TOTAL_CTX) {
          summary.push('\n\u2026(' + (contextFiles.length - summary.length)
            + ' more file(s) omitted for context budget)');
          break;
        }
        const raw = readOne(f.path);
        const remaining = MAX_TOTAL_CTX - usedBytes;
        if (raw.length <= MAX_CTX_PER_FILE && raw.length <= remaining) {
          summary.push('\n--- ' + f.path + ' (' + raw.length + ' bytes) ---\n' + raw);
          usedBytes += raw.length;
        } else {
          const cap = Math.min(MAX_CTX_PER_FILE, remaining);
          summary.push('\n--- ' + f.path + ' (' + raw.length + ' bytes, truncated to '
            + cap + ') ---\n'
            + raw.slice(0, cap)
            + '\n…(' + (raw.length - cap) + ' more bytes omitted)');
          usedBytes += cap;
        }
      }
      contextBlock = [
        '',
        '=== CURRENT PROJECT FILES (truncated view) ===',
        ...summary,
        '\n--- END OF CURRENT FILES ---',
        '',
        rules.contextHint,
        'Return the FULL contents of every file you modify.',
        'New files are added; files you do not touch are preserved as-is.',
        'Keep the total response under ' + Math.round(rules.totalOutputCap / 1024) + ' KB.',
        'If a single file would exceed ' + Math.round(rules.perFileOutputCap / 1024) + ' KB, split it into multiple files.',
      ].join('\n');
    }

    // Save attached images to <projectDir>/_attachments/. Two sources:
    //   1. images[]     - base64 data URLs from the client
    //   2. imageUrls[]  - external http(s) URLs we fetch server-side
    let attachmentNote = '';
    const savedImageNames: string[] = [];

    if (attachments.images && attachments.images.length > 0) {
      const dir = path.join(this.storage.projectDir(projectId), '_attachments');
      fs.mkdirSync(dir, { recursive: true });
      for (const img of attachments.images) {
        const m = img.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!m) continue;
        const safe = img.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        try {
          fs.writeFileSync(path.join(dir, safe), Buffer.from(m[2], 'base64'));
          savedImageNames.push(safe);
        } catch {}
      }
    }

    if (attachments.imageUrls && attachments.imageUrls.length > 0) {
      const dir = path.join(this.storage.projectDir(projectId), '_attachments');
      fs.mkdirSync(dir, { recursive: true });
      for (const url of attachments.imageUrls) {
        try {
          const fetched = await fetch(url, { signal: AbortSignal.timeout(20000) });
          if (!fetched.ok) {
            log.warn('project.build.image_url_http', { url, status: fetched.status });
            continue;
          }
          const ct = (fetched.headers.get('content-type') || '').toLowerCase();
          if (!ct.startsWith('image/') && !ct.includes('svg')) {
            log.warn('project.build.image_url_not_image', { url, contentType: ct });
            continue;
          }
          const buf = Buffer.from(await fetched.arrayBuffer());
          if (buf.length > 5 * 1024 * 1024) {
            log.warn('project.build.image_url_too_large', { url, bytes: buf.length });
            continue;
          }
          let fname = '';
          try {
            const u = new URL(url);
            fname = path.basename(u.pathname) || 'image';
          } catch { fname = 'image'; }
          if (!/\.[a-z0-9]{2,5}$/i.test(fname)) {
            const ext = ct.includes('png') ? '.png'
              : ct.includes('jpeg') || ct.includes('jpg') ? '.jpg'
              : ct.includes('gif') ? '.gif'
              : ct.includes('webp') ? '.webp'
              : ct.includes('svg') ? '.svg'
              : '.png';
            fname += ext;
          }
          const safe = fname.replace(/[^a-zA-Z0-9._-]/g, '_');
          fs.writeFileSync(path.join(dir, safe), buf);
          savedImageNames.push(safe);
        } catch (e) {
          log.warn('project.build.image_url_failed', {
            url,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }

    if (savedImageNames.length > 0) {
      attachmentNote += '\n\n=== USER-ATTACHED IMAGES ===\n';
      attachmentNote += 'These files exist at _attachments/<name> in the project.\n';
      attachmentNote += 'Reference them with <img src="_attachments/<name>">.\n';
      attachmentNote += savedImageNames.map((n) => '  \u00B7 _attachments/' + n).join('\n');
      attachmentNote += '\n=== END USER-ATTACHED IMAGES ===\n';
    }

    if (attachments.figmaUrl) {
      attachmentNote += '\n\n=== REFERENCE DESIGN ===\n';
      attachmentNote += 'Figma: ' + attachments.figmaUrl + '\n';
      attachmentNote += 'Match the visual language, spacing, and colour system of this design.';
      attachmentNote += '\n=== END REFERENCE DESIGN ===\n';
    }

    // Reference skills: prefer a block supplied by the caller (the app
    // frontend ships a curated 11-skill composite), and fall back to the
    // internal keyword matcher only when none was provided.
    const MAX_SKILLS_BYTES = 200_000;
    const clientSkills = options.skillsBlock && options.skillsBlock.length > 0
      ? options.skillsBlock.slice(0, MAX_SKILLS_BYTES)
      : null;
    const skillsBlock = clientSkills
      ? clientSkills
      : await this.buildSkillsBlock(prompt, attachments.forceSkillIds);
    if (clientSkills) {
      log.info('project.build.skills_from_client', {
        projectId,
        bytes: clientSkills.length,
        truncated: options.skillsBlock!.length > MAX_SKILLS_BYTES,
      });
    }
    // If we generated a 3D model, prepend its URL to the skills block so
    // both the JSON-blob path and every per-file prompt (scene.js,
    // index.html, script.js) see it. buildPerFile already includes the
    // skills block verbatim in each prompt.
    const model3DNote = image3D
      ? '=== 3D MODEL FOR THIS PAGE ===\n' +
        'A 3D model has been generated and is available at:\n' +
        image3D.glbUrl + '\n' +
        'Viewer preview: ' + image3D.viewerUrl + '\n' +
        'In scene.js: load it via GLTFLoader from this exact URL.\n' +
        'In index.html: include <canvas id="scene-canvas"></canvas> in the hero.\n' +
        '=== END 3D MODEL ===\n\n'
      : '';
    const skillsBlockForGen = model3DNote + skillsBlock;
    const enrichedContext = contextBlock + skillsBlockForGen + attachmentNote;

    // ---- Per-file path (manifest-driven) ----
    // For fresh builds with a valid manifest, generate one file at a time.
    // Each response stays under the 25 KB output wall. Falls back to the
    // JSON blob path if per-file fails.
    // Per-file path runs for BOTH fresh builds and edits. Manifests
    // larger than 25 files are refused — the plan went off the rails.
    if (manifest && manifest.length > 0 && manifest.length <= 25) {
      log.info('project.build.perfile_start', {
        projectId,
        files: manifest.length,
        isEdit,
      });
      const perFile = await this.buildPerFile(
        projectId,
        prompt,
        manifest,
        contextBlock,
        skillsBlockForGen,
        engineId,
        isEdit,
      );

      if (perFile && perFile.length > 0) {
        if (!isEdit) this.storage.clearProject(projectId);
        const written: StoredFile[] = [];
        for (const f of perFile) {
          written.push(this.storage.writeFile(projectId, f.path, f.content));
        }
        const allFiles = this.storage.listFiles(projectId);
        const previewUrl = publicBaseUrl.replace(/\/+$/, '') + '/projects/' +
          encodeURIComponent(projectId) + '/preview/';
        const summary = 'Built ' + written.length + ' file' +
          (written.length === 1 ? '' : 's') + ' [per-file] · ' + allFiles.length + ' total.';
        log.info('project.build.done_perfile', {
          projectId,
          written: written.length,
          total: allFiles.length,
          previewUrl,
        });
        return { projectId, files: allFiles, previewUrl, summary };
      }

      log.warn('project.build.perfile_failed_falling_back', { projectId });
    }

    // ---- First attempt ----
    const first = await this.ask(header, enrichedContext, prompt, TAIL_REMINDER, undefined, engineId);
    let raw = first.text;
    let parsed = extractJson(raw);

    // ---- Browser-engine fallback ----
    // DeepSeek's API honours a strict "return only JSON" contract. Browser
    // chat UIs (Qwen via wspr, Kimi, DeepHat) frequently don't — they reply
    // in markdown, wrap the JSON in prose, or ignore the format entirely.
    // Rather than burn retries on the same stubborn engine, rebind to
    // DeepSeek. This time we keep the session id for later continuation.
    if (!parsed && engineId !== 'engine_deepseek') {
      log.warn('project.build.engine_fallback_deepseek', {
        fromEngine: engineId,
        reason: looksTruncated(raw) ? 'truncated' : 'unparseable',
        rawPreview: raw.slice(0, 120),
      });
      engineId = 'engine_deepseek';
      const retry = await this.ask(header, enrichedContext, prompt, TAIL_REMINDER, undefined, engineId);
      raw = retry.text;
      parsed = extractJson(raw);
    }

    // ---- Healing loop ----
    // The DeepSeek web endpoint caps one response around 24 KB. When the
    // response is cut off mid-JSON, embed the partial back into a new
    // prompt and ask the model to continue from the exact same character.
    // Does not depend on session IDs — works through the cookie bridge.
    if (!parsed && looksTruncated(raw) && raw.length > 15000) {
      log.warn('project.build.healing_start', {
        projectId,
        partialBytes: raw.length,
        engineId,
      });
      const healed = await this.healIfTruncated(raw, projectId, engineId);
      if (healed.length > raw.length) {
        raw = healed;
        parsed = extractJson(raw);
        log.info('project.build.healing_done', {
          projectId,
          totalBytes: raw.length,
          parsed: !!parsed,
        });
      }
    }

    // ---- Last resort: fresh restart with the aggressive JSON reminder ----
    if (!parsed) {
      log.warn('project.build.parse_failed_retrying', {
        projectId,
        raw_preview: raw.slice(0, 200),
      });
      const retry = await this.ask(header, enrichedContext, prompt, TAIL_REMINDER + '\n' + RETRY_REMINDER, undefined, engineId);
      raw = retry.text;
      parsed = extractJson(raw);
    }

    if (!parsed) {
      // Capture the exact JSON.parse error so future failures are debuggable
      // without logging a 23 KB payload.
      let parseErr = 'unknown';
      try { JSON.parse(raw); }
      catch (e) { parseErr = e instanceof Error ? e.message : String(e); }
      log.error('project.build.gave_up', {
        projectId,
        raw_length: raw.length,
        parse_error: parseErr,
        first_char: raw.trim().charAt(0),
        last_100: raw.trim().slice(-100),
      });
      throw new Error(engineId + ' returned JSON that failed to parse: ' + parseErr);
    }

    const files = validateFiles(parsed.files);

    if (!isEdit) this.storage.clearProject(projectId);
    const written: StoredFile[] = [];
    for (const f of files) {
      written.push(this.storage.writeFile(projectId, f.path, f.content));
    }
    const allFiles = this.storage.listFiles(projectId);

    const previewUrl = publicBaseUrl.replace(/\/+$/, '') + '/projects/' +
      encodeURIComponent(projectId) + '/preview/';

    const summary = (isEdit
      ? 'Updated ' + written.length + ' file' + (written.length === 1 ? '' : 's') +
        ' \u00b7 ' + allFiles.length + ' total.'
      : 'Built ' + written.length + ' file' + (written.length === 1 ? '' : 's') + '.')
      + ' [' + engineId + ']';

    log.info('project.build.done', {
      projectId, isEdit, written: written.length, total: allFiles.length, previewUrl,
    });

    return { projectId, files: allFiles, previewUrl, summary };
  }

  /**
   * Build a reference-skills block from the loaded skill library.
   * Lists every skill; fully includes the top 3 that match the
   * user's prompt by keyword overlap.
   */
  private async buildSkillsBlock(prompt: string, forceSkillIds?: string[]): Promise<string> {
    if (!this.skills || !this.skills.isConfigured()) return '';
    let all: Skill[] = [];
    try { all = await this.skills.load(false); } catch { return ''; }
    if (all.length === 0) return '';

    const lower = prompt.toLowerCase();
    const words = lower.split(/\W+/).filter((w) => w.length > 3);

    const scored = all.map((s) => {
      const hay = (s.id + ' ' + s.label + ' ' + s.description).toLowerCase();
      let score = 0;
      for (const w of words) if (hay.includes(w)) score += 1;
      return { skill: s, score };
    }).sort((a, b) => b.score - a.score);

    const list = all.slice(0, 60).map((s) =>
      '  - ' + s.id + ': ' + s.label + ' - ' + s.description
    ).join('\n');

    // Always include up to 3 skills: keyword matches first, then
    // alphabetical fill so the AI is never skill-less.
    // Skills explicitly attached by the user go first regardless of score.
    const forced = forceSkillIds && forceSkillIds.length > 0
      ? scored.filter((x) => forceSkillIds.includes(x.skill.id))
      : [];
    // If the user explicitly attached skills, those are the ONLY skills
    // injected - no auto-fill. Otherwise fall back to keyword top-3.
    const chosen = forced.length > 0
      ? forced
      : scored.filter((x) => x.score > 0)
          .concat(scored.filter((x) => x.score === 0))
          .slice(0, 3);

    // Cap each skill body so the skills block stays under ~4 KB total.
    const MAX_BODY = 1400;
    const bodies = chosen.map(({ skill }) => {
      const body = skill.content.length > MAX_BODY
        ? skill.content.slice(0, MAX_BODY) + '\n…(truncated)'
        : skill.content;
      return '\n### SKILL: ' + skill.label + ' (' + skill.id + ')\n' + body;
    }).join('\n');

    return [
      '',
      '=== REFERENCE SKILLS (REQUIRED) ===',
      'These are not suggestions. You MUST follow every pattern defined',
      'below when generating or editing files. Do not invent alternate',
      'class names, CSS variable names, or component layouts when a',
      'skill already defines them.',
      '',
      'Loaded skills:',
      list,
      '',
      bodies ? 'Full bodies of the applied skills (obey these exactly):' : '',
      bodies,
      '=== END REFERENCE SKILLS ===',
      '',
    ].join('\n');
  }
}
