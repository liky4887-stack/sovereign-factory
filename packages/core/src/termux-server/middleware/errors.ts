import { Request, Response, NextFunction } from 'express';
import { isAppError } from '../../shared/types/errors';
import { log } from '../../shared/logger';

export interface ErrorEnvelope {
  ok: false;
  error: string;
  code: string;
  statusCode: number;
  details?: Record<string, unknown>;
  path: string;
  timestamp: string;
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (isAppError(err)) {
    const envelope: ErrorEnvelope = {
      ok: false,
      error: err.message,
      code: err.code,
      statusCode: err.statusCode,
      details: err.details,
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
    };
    log.warn('http.error', { path: req.originalUrl, code: err.code, status: err.statusCode });
    res.status(err.statusCode).json(envelope);
    return;
  }

  const message = err instanceof Error ? err.message : String(err);
  const envelope: ErrorEnvelope = {
    ok: false,
    error: message,
    code: 'INTERNAL_ERROR',
    statusCode: 500,
    path: req.originalUrl,
    timestamp: new Date().toISOString(),
  };
  log.error('http.unhandled', { path: req.originalUrl, error: message });
  res.status(500).json(envelope);
}
