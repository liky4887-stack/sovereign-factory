/**
 * routes for the Simulation layer, mounted at /sim.
 *
 * Endpoints:
 *   GET  /sim/status              — external engine config state
 *   POST /sim/run                 — run a simulation (heuristic/external/hybrid)
 *   POST /sim/compare             — compare a run against a real outcome
 *
 * Note: distinct from the pre-existing /simulation/* endpoints which
 * produce render-plan JSON for 3D scenes. This router is about plan
 * simulation, not scene planning.
 */

import { Router, Request, Response } from 'express';
import { planSimulator } from '../PlanSimulator';
import { abstractionEngine } from '../../fusion/AbstractionEngine';
import { ValidationError } from '../../shared/types/errors';
import { log } from '../../core/logger';
import type { SimulationMode, SimulationRun } from '../types';

function isMode(s: unknown): s is SimulationMode {
  return s === 'heuristic' || s === 'external' || s === 'hybrid';
}

export function createSimRouter(): Router {
  const router = Router();

  router.get('/sim/status', (_req: Request, res: Response) => {
    const stats = planSimulator.stats();
    res.json({ ok: true, ...stats });
  });

  router.post('/sim/run', async (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (typeof body.goal !== 'string' || body.goal.length === 0) {
      throw new ValidationError('goal is required');
    }

    // Derive abstraction features from the goal so step profiles reflect
    // the plan's structural characteristics.
    const abstraction = abstractionEngine.abstract(body.goal, body.constraints ?? []);

    log.info('sim.http.run', {
      goal: body.goal.slice(0, 80),
      mode: body.mode ?? 'heuristic',
      features: abstraction.features.length,
    });

    const run = await planSimulator.simulate({
      planId: typeof body.planId === 'string' ? body.planId : undefined,
      goal: body.goal,
      features: abstraction.features,
      constraints: Array.isArray(body.constraints) ? body.constraints : [],
      steps: Array.isArray(body.steps) ? body.steps : undefined,
      mode: isMode(body.mode) ? body.mode : 'heuristic',
      trials: typeof body.trials === 'number' ? body.trials : undefined,
      seed: typeof body.seed === 'number' ? body.seed : undefined,
    });

    res.json({ ok: true, abstraction, run });
  });

  router.post('/sim/compare', (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (typeof body.actualSuccess !== 'boolean') {
      throw new ValidationError('actualSuccess (boolean) is required');
    }
    if (typeof body.actualLatencyMs !== 'number' || typeof body.actualCostUsd !== 'number') {
      throw new ValidationError('actualLatencyMs and actualCostUsd (numbers) are required');
    }
    if (!body.run || typeof body.run !== 'object') {
      throw new ValidationError('run (SimulationRun) is required');
    }

    const comparison = planSimulator.compare({
      run: body.run as SimulationRun,
      actualSuccess: body.actualSuccess,
      actualLatencyMs: body.actualLatencyMs,
      actualCostUsd: body.actualCostUsd,
    });

    res.json({ ok: true, comparison });
  });

  return router;
}
