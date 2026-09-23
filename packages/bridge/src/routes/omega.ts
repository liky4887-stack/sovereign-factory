/**
 * routes/omega.ts - the full-stack pipeline.
 *
 * Flow:
 *   directive -> ManifestationEngine -> SourceMapper -> ComplianceOverride
 *             -> SovereignOrchestrator -> ledger
 *
 * Each stage writes to the Truth Ledger so the entire decision chain is
 * auditable from a single goal id.
 */

import { Router, Request, Response } from 'express';
import { manifestationEngine } from '../core/manifestationEngine';
import { sourceMapper } from '../core/sourceMapper';
import { orchestrator } from '../orchestrator/SovereignOrchestrator';
import { ledger } from '../ledger/TruthLedger';

const router = Router();

router.post('/omega/execute', async (req: Request, res: Response) => {
  const { goal } = req.body ?? {};
  if (typeof goal !== 'string' || goal.length === 0) {
    return res.status(400).json({ ok: false, error: 'goal_required' });
  }

  const manifestation = manifestationEngine.takeOwnerDirective(goal);

  if (manifestation.framing === 'blocked') {
    ledger.appendEntry({
      actor: 'orchestrator',
      eventType: 'ERROR',
      payload: { goal, reason: manifestation.compliance.reason },
    });
    return res.status(422).json({
      ok: false,
      blocked: true,
      reason: manifestation.compliance.reason,
      alternative: manifestation.compliance.alternative,
    });
  }

  const plan = sourceMapper.mapGoalToPlan(manifestation.compliance.normalizedSpec);

  ledger.appendEntry({
    actor: 'orchestrator',
    eventType: 'TASK_RECEIVED',
    payload: {
      goal,
      framing: manifestation.framing,
      chosenPath: manifestation.chosenCandidateId,
      requiredLayers: plan.requiredLayers,
      steps: plan.steps.length,
    },
  });

  const result = await orchestrator.run({
    prompt: manifestation.compliance.normalizedSpec,
    modality: 'text',
  });

  res.json({
    ok: result.ok,
    goal,
    manifestation,
    plan,
    result,
  });
});

export default router;
