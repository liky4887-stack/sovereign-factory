import { Router, Request, Response } from 'express';
import * as fs from 'node:fs';
import { config } from '../../config';
import { log } from '../../shared/logger';

/**
 * Read-only debug surface for inspecting the credentials file the
 * backend auto-loads at boot. Localhost-only, masked by default.
 *
 *   GET /debug/auth-info           -> masked summary
 *   GET /debug/auth-info?full=1    -> full values (localhost only)
 */
function isLoopback(req: Request): boolean {
  const ip = req.ip || req.socket.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function mask(v: string): string {
  const len = v.length;
  if (len <= 24) return v;
  return v.slice(0, 10) + '……' + v.slice(-6) + ` (len=${len})`;
}

export function createAuthDebugRouter(): Router {
  const router = Router();

  router.get('/auth-info', (req: Request, res: Response) => {
    if (!isLoopback(req)) {
      res.status(403).json({ ok: false, error: 'localhost only' });
      return;
    }

    const path = config.DEEPSEEK.credentialsFile || '';
    if (!path || !fs.existsSync(path)) {
      res.status(404).json({
        ok: false,
        error: 'credentials file not configured or missing',
        path: path || null,
      });
      return;
    }

    let raw: any;
    try {
      raw = JSON.parse(fs.readFileSync(path, 'utf8'));
    } catch (e) {
      res.status(500).json({
        ok: false,
        error: 'failed to parse credentials file: ' + (e instanceof Error ? e.message : String(e)),
      });
      return;
    }

    const full = req.query.full === '1';
    const fields = ['bearerToken', 'cookies', 'hifLeim', 'hifDliq', 'deviceId'];

    const values: Record<string, string | null> = {};
    for (const f of fields) {
      const v = raw[f];
      if (typeof v !== 'string' || v.length === 0) {
        values[f] = null;
      } else {
        values[f] = full ? v : mask(v);
      }
    }

    log.info('debug.auth_info.read', {
      path,
      full,
      present: fields.filter((f) => values[f] !== null),
    });

    res.json({
      ok: true,
      path,
      mode: full ? 'full' : 'masked',
      values,
    });
  });

  return router;
}
