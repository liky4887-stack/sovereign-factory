import { Router, Request, Response } from 'express';
import { processInspector } from '../services/ProcessInspector';

const router = Router();

router.get('/process/status', (_req: Request, res: Response) => {
  res.json({ ok: true, status: processInspector.snapshot() });
});

export default router;
