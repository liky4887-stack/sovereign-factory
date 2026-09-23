import { Request, Response, NextFunction } from 'express';
import { log } from '../../shared/logger';

export function loggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startedAt = Date.now();
  const requestId = req.get('x-request-id') ?? `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  res.setHeader('x-request-id', requestId);

  res.on('finish', () => {
    log.info('http.request', {
      requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
      ip: req.ip,
    });
  });

  next();
}
