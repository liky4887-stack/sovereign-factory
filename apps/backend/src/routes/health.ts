/**
 * routes/health.ts - server status + principle advertisement.
 */

import { Router, Request, Response } from 'express';
import { ledger } from '../ledger/TruthLedger';
import { evolution } from '../evolution/SelfEvolutionEngine';
import { PRINCIPLES } from '../core/absoluteSource';
import { OMEGA_TIERS } from '../core/omegaTiers';
import { config } from '../config';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  const verify = ledger.verifyLedger();
  const cfg = evolution.getCurrentConfig();
  res.json({
    ok: true,
    uptimeSeconds: Math.floor(process.uptime()),
    ledger: {
      path: ledger.path,
      verified: verify.ok,
      brokenAt: verify.brokenAt ?? null,
    },
    selfHealing: { intervalMs: config.SELF_HEAL_INTERVAL_MS },
    evolution: { version: cfg.version, updatedAt: cfg.updatedAt },
    principles: PRINCIPLES,
    omegaTiers: OMEGA_TIERS.length,
  });
});

export default router;
