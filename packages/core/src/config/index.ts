import * as path from 'path';
import * as os from 'os';

function env(key: string, fallback: string): string {
  const v = process.env[key];
  return v && v.length > 0 ? v : fallback;
}
function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}
function envList(key: string, fallback: string[]): string[] {
  const raw = process.env[key];
  if (!raw) return fallback;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

const HOME = os.homedir();
const DATA_DIR = env('DATA_DIR', path.join(HOME, 'sovereign-core-data'));

export const config = Object.freeze({
  HOST: env('HOST', '0.0.0.0'),
  BRIDGE_PORT: envInt('BRIDGE_PORT', 8790),
  ORCHESTRATOR_PORT: envInt('ORCHESTRATOR_PORT', 8791),
  BRIDGE_TOKEN: env('BRIDGE_TOKEN', ''),
  REQUIRE_AUTH: env('REQUIRE_AUTH', 'false') === 'true',
  ALLOWED_PATHS: envList('ALLOWED_PATHS', [
    path.join(HOME, 'sovereign-core-data'),
    path.join(HOME, 'bridge-workspace'),
  ]),
  ALLOWED_COMMANDS: envList('ALLOWED_COMMANDS', [
    'ls', 'cat', 'echo', 'pwd', 'date', 'whoami', 'uname',
    'node', 'npm', 'git', 'curl', 'grep', 'find', 'wc',
    'head', 'tail', 'mkdir', 'touch', 'cp', 'mv', 'chmod',
  ]),
  COMMAND_TIMEOUT_MS: envInt('COMMAND_TIMEOUT_MS', 30000),
  COMMAND_MAX_OUTPUT_BYTES: envInt('COMMAND_MAX_OUTPUT_BYTES', 1000000),
  LEDGER_FILE: env('LEDGER_FILE', path.join(DATA_DIR, 'ledger', 'entries.jsonl')),
  PROJECTS_FILE: env('PROJECTS_FILE', path.join(DATA_DIR, 'projects', 'projects.json')),
  TASKS_FILE: env('TASKS_FILE', path.join(DATA_DIR, 'tasks', 'tasks.json')),
  AGENTS_FILE: env('AGENTS_FILE', path.join(DATA_DIR, 'agents', 'agents.json')),
  GOALS_FILE: env('GOALS_FILE', path.join(DATA_DIR, 'goals', 'goals.json')),
  OFFERS_FILE: env('OFFERS_FILE', path.join(DATA_DIR, 'offers', 'offers.json')),
  SYSTEM_POWER_FILE: env('SYSTEM_POWER_FILE', path.join(DATA_DIR, 'system-power', 'state.json')),
  SOUL_FILE: env('SOUL_FILE', path.join(DATA_DIR, 'mystic-realm', 'soul.json')),
  BLUEPRINTS_FILE: env('BLUEPRINTS_FILE', path.join(DATA_DIR, 'ide', 'blueprints.json')),
  CHAT_FILE: env('CHAT_FILE', path.join(DATA_DIR, 'chat', 'sessions.json')),
  LOG_LEVEL: env('LOG_LEVEL', 'info') as 'debug' | 'info' | 'warn' | 'error',
  BODY_LIMIT: env('BODY_LIMIT', '2mb'),
  DATA_DIR,
  DEEPSEEK: {
    baseUrl: env('DEEPSEEK_BASE_URL', 'https://chat.deepseek.com').replace(/\/+$/, ''),
    defaultTargetPath: env('DEEPSEEK_DEFAULT_TARGET', '/api/v0/chat/completion'),
    defaultModel: env('DEEPSEEK_DEFAULT_MODEL', 'deepseek-chat'),
    requestTimeoutMs: envInt('DEEPSEEK_REQUEST_TIMEOUT_MS', 60000),
    pathTokenTtlSafetyMs: envInt('DEEPSEEK_PATH_TOKEN_SAFETY_MS', 30000),
    wasmPath: env('DEEPSEEK_WASM_PATH', '/data/data/com.termux/files/home/sovereign-factory/packages/core/assets/deepseek_pow_module.wasm'),
    credentialsFile: env('DEEPSEEK_CREDENTIALS_FILE', ''),
    envBearerToken: env('DEEPSEEK_BEARER_TOKEN', ''),
    envCookies: env('DEEPSEEK_COOKIES', ''),
  },
});

export type Config = typeof config;
