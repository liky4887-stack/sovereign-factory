/**
 * config.ts - central environment reader.
 * Every process.env access funnels through here so defaults live in one place.
 */

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
function envOpt(key: string): string | null {
  const v = process.env[key];
  return v && v.length > 0 ? v : null;
}

export const config = Object.freeze({
  ROOT: process.cwd(),
  PORT: envInt('PORT', 8787),
  HOST: env('HOST', '127.0.0.1'),
  SELF_HEAL_INTERVAL_MS: envInt('SELF_HEAL_INTERVAL_MS', 60000),
  LOG_LEVEL: env('LOG_LEVEL', 'info') as 'debug' | 'info' | 'warn' | 'error',
  AI: {
    apiKey: envOpt('AI_API_KEY'),
    baseUrl: envOpt('AI_BASE_URL'),
  },
  SIM: {
    apiUrl: envOpt('SIM_API_URL'),
  },
});
