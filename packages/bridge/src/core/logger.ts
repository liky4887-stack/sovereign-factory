/**
 * logger.ts - structured logging with level filtering.
 * Console output only; the Truth Ledger handles persistence.
 */

import { config } from '../config';

type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const THRESHOLD = ORDER[config.LOG_LEVEL] ?? ORDER.info;

function emit(level: Level, msg: string, meta?: Record<string, unknown>): void {
  if (ORDER[level] < THRESHOLD) return;
  const ts = new Date().toISOString();
  const line = '[' + ts + '] [' + level.toUpperCase() + '] ' + msg;
  const suffix = meta && Object.keys(meta).length > 0 ? '  ' + JSON.stringify(meta) : '';
  if (level === 'error' || level === 'warn') process.stderr.write(line + suffix + '\n');
  else process.stdout.write(line + suffix + '\n');
}

export const log = {
  debug: (m: string, meta?: Record<string, unknown>) => emit('debug', m, meta),
  info: (m: string, meta?: Record<string, unknown>) => emit('info', m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => emit('warn', m, meta),
  error: (m: string, meta?: Record<string, unknown>) => emit('error', m, meta),
};
