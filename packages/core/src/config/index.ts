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
  HOST: env('HOST', '127.0.0.1'),
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
  PROJECTS_DIR: env('PROJECTS_DIR', path.join(HOME, 'sovereign-projects')),
  SKILLS_REPOS: envList('SKILLS_REPOS', []),
  SKILLS_LOCAL_DIR: env('SKILLS_LOCAL_DIR', path.join(HOME, 'skills-local')),
  SKILLS_BRANCH: env('SKILLS_BRANCH', 'main'),
  SKILLS_TOKEN: env('SKILLS_TOKEN', ''),
  SKILLS_CACHE_FILE: env('SKILLS_CACHE_FILE', path.join(DATA_DIR, 'skills', 'cache.json')),
  SKILLS_CACHE_TTL_MS: envInt('SKILLS_CACHE_TTL_MS', 600000),
  SKILLS_MAX_BYTES: envInt('SKILLS_MAX_BYTES', 400000),
  PUBLIC_BASE_URL: env('PUBLIC_BASE_URL', 'http://127.0.0.1:' + envInt('BRIDGE_PORT', 8790)),
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
  GITHUB: {
    credentialsFile: env('GITHUB_CREDENTIALS_FILE', path.join(HOME, 'cookies', 'github-creds.json')),
    defaultVisibility: env('GITHUB_DEFAULT_VISIBILITY', 'public') as 'public' | 'private',
  },
  SOVEREIGN: {
    promptFile: env('SOVEREIGN_PROMPT_FILE', path.join(HOME, 'sovereign-factory', 'prompts', 'sovereign-factory.md')),
  },
  QWEN: {
    baseUrl: env('QWEN_BASE_URL', 'https://chat.qwen.ai').replace(/\/+$/, ''),
    defaultTargetPath: env('QWEN_DEFAULT_TARGET', '/api/v2/chat/completions'),
    defaultModel: env('QWEN_DEFAULT_MODEL', 'qwen3.7-plus'),
    requestTimeoutMs: envInt('QWEN_REQUEST_TIMEOUT_MS', 60000),
    credentialsFile: env('QWEN_CREDENTIALS_FILE', path.join(HOME, 'cookies', 'qwen-creds.json')),
    enginePolicy: env('ENGINE_POLICY', 'all') as 'all' | 'first-available' | 'fastest' | 'primary-with-fallback',
    primaryEngineId: env('PRIMARY_ENGINE_ID', 'engine_deepseek'),
  },
  KIMI: {
    baseUrl: env('KIMI_BASE_URL', 'https://www.kimi.ai').replace(/\/+$/, ''),
    defaultTargetPath: env('KIMI_DEFAULT_TARGET', '/apiv2/kimi.gateway.chat.v1.ChatService/Chat'),
    defaultModel: env('KIMI_DEFAULT_MODEL', 'k2d6-chat'),
    requestTimeoutMs: envInt('KIMI_REQUEST_TIMEOUT_MS', 120000),
    credentialsFile: env('KIMI_CREDENTIALS_FILE', path.join(HOME, 'cookies', 'kimi-creds.json')),
    minRequestGapSeconds: envInt('KIMI_MIN_REQUEST_GAP_SECONDS', 900),
    maxRequestsPerDay: envInt('KIMI_MAX_REQUESTS_PER_DAY', 30),
    concurrencyLimit: envInt('KIMI_CONCURRENCY_LIMIT', 1),
    defaultDeviceId: env('KIMI_DEVICE_ID', ''),
    defaultSessionId: env('KIMI_SESSION_ID', ''),
    defaultTrafficId: env('KIMI_TRAFFIC_ID', ''),
    defaultTimezone: env('KIMI_TIMEZONE', 'Africa/Tripoli'),
    defaultShieldData: env('KIMI_SHIELD_DATA', ''),
  },
  XAI: {
    baseUrl: env('GROK_BASE_URL', 'https://grok.com').replace(/\/+$/, ''),
    defaultModel: env('GROK_DEFAULT_MODEL', 'grok-3'),
    requestTimeoutMs: envInt('GROK_REQUEST_TIMEOUT_MS', 120000),
    credentialsFile: env('GROK_CREDENTIALS_FILE', path.join(HOME, 'cookies', 'grok-creds.json')),
  },
  GEMINI: {
    baseUrl: env('GEMINI_BASE_URL', 'https://gemini.google.com').replace(/\/+$/, ''),
    defaultModel: env('GEMINI_DEFAULT_MODEL', 'gemini-2.0-flash'),
    requestTimeoutMs: envInt('GEMINI_REQUEST_TIMEOUT_MS', 120000),
    credentialsFile: env('GEMINI_CREDENTIALS_FILE', path.join(HOME, 'cookies', 'gemini-creds.json')),
  },
});

export type Config = typeof config;
