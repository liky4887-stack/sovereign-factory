// HTTP surface for DeepHat. Mirrors KimiRouter / QwenRouter so the
// debug panel and CLI treat all engines identically.
import { Router, Request, Response } from 'express';
import { DeepHatService } from '../api/DeepHatService';
import { ValidationError, NotFoundError } from '../../shared/types/errors';
import { log } from '../../shared/logger';

export function createDeepHatRouter(service: DeepHatService): Router {
  const router = Router();

  router.get('/health', async (_req: Request, res: Response) => {
    try {
      const status = await service.healthCheck();
      res.json({ ok: true, engineId: service.id, status });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  router.get('/credentials/status', (_req: Request, res: Response) => {
    const redacted = service.getCredentialsRedacted();
    res.json({ ok: true, status: redacted });
  });

  router.get('/credentials/raw', (_req: Request, res: Response) => {
    const raw = service.getRawCredentials();
    if (!raw) throw new NotFoundError('no credentials configured');
    res.json({ ok: true, values: raw });
  });

  router.post('/credentials', (req: Request, res: Response) => {
    const body = req.body ?? {};
    const cookies = typeof body.cookies === 'string' ? body.cookies : undefined;
    const authorization = typeof body.authorization === 'string' ? body.authorization : undefined;
    if (!cookies && !authorization) {
      throw new ValidationError('provide cookies and/or authorization');
    }
    try {
      const stored = service.writeCredentials({ cookies, authorization });
      log.info('deephad.credentials.set', stored);
      res.json({ ok: true, stored });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(422).json({ ok: false, error: msg });
    }
  });

  router.delete('/credentials', (_req: Request, res: Response) => {
    service.clearCredentials();
    log.info('deephad.credentials.cleared');
    res.json({ ok: true });
  });

  return router;
}
