/**
 * routes/orchestrator.ts - the primary task entrypoint.
 * Matches the original /task contract so existing clients keep working.
 */

import { Router, Request, Response } from 'express';
import { orchestrator } from '../orchestrator/SovereignOrchestrator';
import { ledger } from '../ledger/TruthLedger';

const router = Router();

router.post('/task', async (req: Request, res: Response) => {
  const { prompt, modality, metadata } = req.body ?? {};
  if (typeof prompt !== 'string' || prompt.length === 0) {
    ledger.appendEntry({
      actor: 'server',
      eventType: 'ERROR',
      payload: { reason: 'missing_prompt', path: '/task' },
    });
    return res.status(400).json({ ok: false, error: 'prompt_required' });
  }

  const result = await orchestrator.run({ prompt, modality, metadata });
  return res.status(result.ok ? 200 : 500).json(result);
});

export default router;
