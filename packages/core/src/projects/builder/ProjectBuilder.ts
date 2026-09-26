import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { DeepSeekService } from '../../deepseek/api/DeepSeekService';
import { ProjectFileStorage, StoredFile } from './ProjectFileStorage';
import { SkillLoader, Skill } from '../../skills/SkillLoader';
import { log } from '../../shared/logger';

export interface BuildResult {
  projectId: string;
  files: StoredFile[];
  previewUrl: string;
  summary: string;
}

interface ParsedFile { path: string; content: string; }

const HEADER = [
  'You are a code generator inside an app builder.',
  'Every user message is a build request, even when it sounds conversational.',
  'You do not chat. You emit code.',
  '',
  'MANDATORY SKILLS:',
  'A REFERENCE SKILLS block appears below. Every pattern it defines is',
  'REQUIRED, not optional. Before writing any file you MUST consult that',
  'block and apply the conventions it specifies: exact class names,',
  'exact CSS variables, exact HTML structure, exact JS patterns.',
  'Do NOT invent your own layout, colour names, or component structure',
  'when a skill already defines them.',
  '',
  'FORMAT RULES for every response:',
  '- Output ONE JSON object. Nothing before it, nothing after it.',
  '- No prose, no explanations, no markdown code fences.',
  '- Shape: {"files":[{"path":"index.html","content":"<full contents>"}]}',
  '- Always include index.html at the project root.',
  '- Paths must be relative, no leading slash, no "..".',
  '- Vanilla HTML/CSS/JS only. No build steps, no external bundlers.',
  '- When editing, return the FULL contents of every file you touch.',
  '- When adding pages, update the nav in existing pages to link to them.',
].join('\n');

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

export class ProjectBuilder {
  private sovereignPrompt: string | null = null;

  constructor(
    private readonly deepseek: DeepSeekService,
    private readonly storage: ProjectFileStorage,
    private readonly skills?: SkillLoader,
  ) {
    this.loadSovereignPrompt();
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
    const response = await this.deepseek.callDeepSeek(composed, opts);
    return (response && response.data && (response.data as any).content) || '';
  }

  async build(
    projectId: string,
    prompt: string,
    publicBaseUrl: string,
    attachments: BuildAttachments = {},
  ): Promise<BuildResult> {
    log.info('project.build.start', { projectId, prompt_preview: prompt.slice(0, 80) });

    const existing = this.storage.listFiles(projectId);
    const isEdit = existing.length > 0;

    // Context block: on edits, include the current files. To keep the
    // input prompt small, truncate each file to its first 2 KB and mark
    // it. That is enough for the AI to understand structure and names
    // without blowing the input/output budget.
    let contextBlock = '';
    if (isEdit) {
      const MAX_CTX_PER_FILE = 2048;
      const readOne = (rel: string): string => {
        try { return this.storage.readFile(projectId, rel); } catch { return ''; }
      };
      const summary = existing.map((f) => {
        const raw = readOne(f.path);
        if (raw.length <= MAX_CTX_PER_FILE) {
          return '\n--- ' + f.path + ' (' + raw.length + ' bytes) ---\n' + raw;
        }
        return '\n--- ' + f.path + ' (' + raw.length + ' bytes, truncated to '
          + MAX_CTX_PER_FILE + ') ---\n'
          + raw.slice(0, MAX_CTX_PER_FILE)
          + '\n…(' + (raw.length - MAX_CTX_PER_FILE) + ' more bytes omitted)';
      });
      contextBlock = [
        '',
        '=== CURRENT PROJECT FILES (truncated view) ===',
        ...summary,
        '\n--- END OF CURRENT FILES ---',
        '',
        'The user is asking for a change or an addition to the site above.',
        'Return the FULL contents of every file you modify.',
        'New files are added; files you do not touch are preserved as-is.',
        'IMPORTANT: split the output into multiple files. Do not emit',
        'one giant file. HTML in index.html, CSS in style.css,',
        'JS in script.js. Each file must be under 6 KB.',
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
    let raw = await this.ask(HEADER, enrichedContext, prompt, TAIL_REMINDER);
    let parsed = extractJson(raw);

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
        'Respond again with the SAME request, but split into smaller files:',
        '- Put CSS in style.css, JS in script.js, HTML in index.html.',
        '- Keep each file under 8 KB.',
        '- Do not inline large images or base64 data.',
      ].join('\n');
      raw = await this.ask(HEADER, enrichedContext, prompt, TAIL_REMINDER + '\n' + splitReminder, 0.1);
      parsed = extractJson(raw);
    }

    if (!parsed) {
      log.warn('project.build.parse_failed_retrying', {
        projectId,
        raw_preview: raw.slice(0, 200),
      });
      raw = await this.ask(HEADER, enrichedContext, prompt, TAIL_REMINDER + '\n' + RETRY_REMINDER);
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
      throw new Error('DeepSeek returned JSON that failed to parse: ' + parseErr);
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

    const summary = isEdit
      ? 'Updated ' + written.length + ' file' + (written.length === 1 ? '' : 's') +
        ' · ' + allFiles.length + ' total.'
      : 'Built ' + written.length + ' file' + (written.length === 1 ? '' : 's') + '.';

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
