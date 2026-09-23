import { Router, Request, Response } from 'express';
import { processInspector } from '../services/ProcessInspector';

const router = Router();
const startedAt = Date.now();

router.get('/health', (_req: Request, res: Response) => {
  const snapshot = processInspector.snapshot();
  res.json({
    ok: true,
    service: 'termux-bridge',
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    snapshot,
  });
});

export default router;
