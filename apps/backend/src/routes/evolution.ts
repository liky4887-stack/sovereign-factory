/**
 * routes/evolution.ts - inspect and apply config evolution proposals.
 *
 * GET  /evolution/current     - current config
 * GET  /evolution/proposals   - candidate update derived from recent ledger
 * POST /evolution/apply       - persist the proposed config
 * POST /evolution/rollback    - revert to previous version
 */

import { Router, Request, Response } from 'express';
import { evolution } from '../evolution/SelfEvolutionEngine';
import { ledger } from '../ledger/TruthLedger';

const router = Router();

router.get('/evolution/current', (_req: Request, res: Response) => {
  res.json({ ok: true, config: evolution.getCurrentConfig() });
});

router.get('/evolution/proposals', (_req: Request, res: Response) => {
  const recent = ledger.getSummary(50);
  const failures = recent.filter(
    (e) => e.eventType === 'ERROR' || e.eventType === 'TASK_FAILED',
  ).length;

  const proposal = evolution.proposeUpdate({
    recentErrorCount: failures,
    averageTaskLatencyMs: 0,
  });

  res.json({ ok: true, proposal });
});

router.post('/evolution/apply', (req: Request, res: Response) => {
  const { config: newConfig } = req.body ?? {};
  if (!newConfig || typeof newConfig !== 'object' || typeof newConfig.version !== 'number') {
    return res.status(400).json({ ok: false, error: 'invalid_config' });
  }
  evolution.applyUpdate(newConfig);
  res.json({ ok: true, applied: newConfig.version });
});

router.post('/evolution/rollback', (_req: Request, res: Response) => {
  const restored = evolution.rollback();
  if (!restored) return res.status(409).json({ ok: false, error: 'nothing_to_rollback' });
  res.json({ ok: true, restored });
});

export default router;
