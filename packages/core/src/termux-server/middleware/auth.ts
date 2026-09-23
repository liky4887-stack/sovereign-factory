import { Request, Response, NextFunction } from 'express';
import { config } from '../../config';
import { AuthError } from '../../shared/types/errors';
import { log } from '../../shared/logger';

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (!config.REQUIRE_AUTH) return next();

  if (!config.BRIDGE_TOKEN) {
    log.warn('auth.token_not_configured', { path: req.path });
    throw new AuthError('server requires auth but no BRIDGE_TOKEN configured');
  }

  const header = req.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
  const alt = req.get('x-bridge-token') ?? '';
  const token = provided || alt;

  if (token !== config.BRIDGE_TOKEN) {
    log.warn('auth.rejected', { path: req.path });
    throw new AuthError('invalid or missing token');
  }

  next();
}
