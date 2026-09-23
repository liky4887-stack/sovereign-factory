/**
 * routes/ledger.ts - read-only view of the Truth Ledger.
 */

import { Router, Request, Response } from 'express';
import { ledger } from '../ledger/TruthLedger';

const router = Router();

router.get('/ledger', (req: Request, res: Response) => {
  const limit = Math.min(
    parseInt((req.query.limit as string) ?? '20', 10) || 20,
    500,
  );
  res.json({ ok: true, summary: ledger.getSummary(limit) });
});

router.get('/ledger/verify', (_req: Request, res: Response) => {
  res.json({ ok: true, result: ledger.verifyLedger() });
});

export default router;
