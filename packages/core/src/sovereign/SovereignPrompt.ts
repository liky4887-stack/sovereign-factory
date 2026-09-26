// Sovereign Factory identity layer — shared loader.
// Loads the DNA prompt once, exposes blocks per output mode.
// Used by DeepSeekRouter (/chat). ProjectBuilder loads the same
// file independently for Build mode — kept separate to avoid
// touching the working build pipeline.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { log } from '../shared/logger';

// Output contract for conversational mode. Enforces no identity bleed.
const CHAT_CONTRACT = [
  '',
  '=== END IDENTITY LAYER ===',
  '=== OUTPUT MODE: CONVERSATION ===',
  '',
  'The identity layer above shapes HOW you think: decisive,',
  'zero-friction, subtractive, honest. It does NOT shape WHAT',
  'you say.',
  '',
  'HARD PROHIBITIONS:',
  '- Do NOT write affirmations, mantras, or identity scripts.',
  '- Do NOT echo the words "sovereign", "void forge",',
  '  "chaos engine", "omega switch", "launch swarm",',
  '  "soul scientist", "sentinels", or "god mode".',
  '- Do NOT mention that you are following an identity or a prompt.',
  '- Do NOT add philosophy or commentary about your role.',
  '',
  'Answer the user\'s message directly and concisely.',
  '',
].join('\n');

// Output contract for planning mode. Same no-bleed guarantees.
const PLAN_CONTRACT = [
  '',
  '=== END IDENTITY LAYER ===',
  '=== OUTPUT MODE: PLANNING ===',
  '',
  'The identity layer above shapes HOW you plan: decisive,',
  'subtractive, oriented toward concrete moves. It does NOT',
  'shape WHAT you output.',
  '',
  'HARD PROHIBITIONS:',
  '- Do NOT write affirmations, mantras, or identity scripts.',
  '- Do NOT echo the words "sovereign", "void forge",',
  '  "chaos engine", "omega switch", "launch swarm",',
  '  "soul scientist", "sentinels", or "god mode".',
  '- Do NOT mention that you are following an identity or a prompt.',
  '- Do NOT add philosophy or commentary about your role.',
  '',
  'Output a structured implementation plan. Focus on concrete',
  'decisions: pages, sections, components, layout, colours,',
  'interactions. End with a short "Ready to build" line.',
  '',
].join('\n');

let cached: string | null = null;
let attempted = false;

function loadIdentity(): string | null {
  if (attempted) return cached;
  attempted = true;

  const candidates = [
    process.env.SOVEREIGN_PROMPT_FILE,
    path.join(os.homedir(), 'sovereign-factory', 'prompts', 'sovereign-factory.md'),
  ].filter((x): x is string => typeof x === 'string' && x.length > 0);

  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const raw = fs.readFileSync(p, 'utf8').trim();
      if (raw.length === 0) continue;
      cached = raw;
      log.info('sovereign.prompt.loaded', { path: p, chars: raw.length });
      return cached;
    } catch (e) {
      log.warn('sovereign.prompt.load_failed', {
        path: p,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  log.warn('sovereign.prompt.missing', {
    tried: candidates,
    note: 'chat calls will run without the identity layer',
  });
  return null;
}

/** Full identity + chat output contract, or empty string if the prompt file is missing. */
export function getChatIdentityBlock(): string {
  const id = loadIdentity();
  if (!id) return '';
  return id + '\n' + CHAT_CONTRACT + '\n';
}

/** Full identity + plan output contract, or empty string if the prompt file is missing. */
export function getPlanIdentityBlock(): string {
  const id = loadIdentity();
  if (!id) return '';
  return id + '\n' + PLAN_CONTRACT + '\n';
}

/** Raw identity layer without any output contract. */
export function getIdentityLayer(): string | null {
  return loadIdentity();
}
