import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { DeepSeekService } from '../../deepseek/api/DeepSeekService';
import { ProjectFileStorage, StoredFile } from './ProjectFileStorage';
import { SkillLoader, Skill } from '../../skills/SkillLoader';
import type { LlmEngine } from '../../engines/LlmEngine';
import { log } from '../../shared/logger';

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
  if (files.length > 0) return 'mixed';
  return 'unknown';
}

function rulesForStack(stack: ProjectStack): StackRules {
  switch (stack) {
    case 'static-html':
      return {
        label: 'Static HTML/CSS/JS site',
        perFileContextCap: 4096,
        perFileOutputCap: 6144,
        totalOutputCap: 25_000,
        formatRules: [
          '- Vanilla HTML/CSS/JS only. No build steps, no external bundlers.',
          '- Keep HTML in .html, CSS in .css, JS in .js.',
          '- Split into multiple files if a single file would exceed 6 KB.',
          '- When adding pages, update the nav in existing pages to link to them.',
        ],
        contextHint: 'The user is asking for a change or an addition to the site above.',
      };
    case 'node-ts':
      return {
        label: 'TypeScript / Node.js project',
        perFileContextCap: 6144,
        perFileOutputCap: 12_000,
        totalOutputCap: 25_000,
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
        perFileContextCap: 6144,
        perFileOutputCap: 12_000,
        totalOutputCap: 25_000,
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
        perFileContextCap: 6144,
        perFileOutputCap: 12_000,
        totalOutputCap: 25_000,
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
        perFileContextCap: 6144,
        perFileOutputCap: 12_000,
        totalOutputCap: 25_000,
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
    case 'engine_qwen': return 30_000;   // wspr caps qwen at 60 KB total
    case 'engine_kimi': return 30_000;
    case 'engine_deephad': return 30_000;
    default: return 40_000;              // DeepSeek direct HTTP — most headroom
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
  ): Promise<string> {
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
        return (resp && resp.data && resp.data.content) || '';
      }
      log.warn('project.build.engine_not_found', { engineId, fallingBack: 'engine_deepseek' });
    }

    const response = await this.deepseek.callDeepSeek(composed, opts);
    return (response && response.data && (response.data as any).content) || '';
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
      const MAX_TOTAL_CTX = engineContextCap(engineId);
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

    // Load reference skills and inject the most relevant ones.
    const skillsBlock = await this.buildSkillsBlock(prompt, attachments.forceSkillIds);
    const enrichedContext = contextBlock + skillsBlock + attachmentNote;

    // ---- First attempt ----
    let raw = await this.ask(header, enrichedContext, prompt, TAIL_REMINDER, undefined, engineId);
    let parsed = extractJson(raw);

    // ---- Browser-engine fallback ----
    // DeepSeek's API honours a strict "return only JSON" contract. Browser
    // chat UIs (Qwen via wspr, Kimi, DeepHat) frequently don't — they reply
    // in markdown, wrap the JSON in prose, or ignore the format entirely.
    // Rather than burn 3 retries on the same stubborn engine, rebind to
    // DeepSeek for the retries. The log records which engine actually
    // produced the final output.
    if (!parsed && engineId !== 'engine_deepseek') {
      log.warn('project.build.engine_fallback_deepseek', {
        fromEngine: engineId,
        reason: looksTruncated(raw) ? 'truncated' : 'unparseable',
        rawPreview: raw.slice(0, 120),
      });
      engineId = 'engine_deepseek';
    }

    // ---- One retry with an aggressive reminder ----
    // Detect truncation before treating as a parse failure.
    if (!parsed && looksTruncated(raw)) {
      log.warn('project.build.truncated_retrying', {
        projectId,
        raw_length: raw.length,
        tail: raw.trim().slice(-60),
      });
      const splitReminder = [
        '',
        '=== RETRY (previous response was cut off mid-file) ===',
        'Your last response exceeded the output limit and was truncated.',
        'Respond again with the SAME request, but:',
        '- Touch fewer files per response.',
        '- Keep the total response under ' + Math.round(rules.totalOutputCap / 1024) + ' KB.',
        '- If a file is too large to return in full, edit a different part of the codebase or break the request into multiple turns.',
      ].join('\n');
      raw = await this.ask(header, enrichedContext, prompt, TAIL_REMINDER + '\n' + splitReminder, 0.1, engineId);
      parsed = extractJson(raw);
    }

    if (!parsed) {
      log.warn('project.build.parse_failed_retrying', {
        projectId,
        raw_preview: raw.slice(0, 200),
      });
      raw = await this.ask(header, enrichedContext, prompt, TAIL_REMINDER + '\n' + RETRY_REMINDER, undefined, engineId);
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
