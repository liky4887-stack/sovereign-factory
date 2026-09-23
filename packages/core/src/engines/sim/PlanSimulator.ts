/**
 * PlanSimulator — top-level orchestrator for the Simulation layer.
 *
 * Chooses the mode (heuristic / external / hybrid), invokes the appropriate
 * runner(s), and produces a SimulationRun. Also exposes comparison between
 * a prior simulation and a real-world outcome.
 *
 * Callers:
 *   - /sim/run from the HTTP router
 *   - /omega/execute can call simulate() after persona refinement, before
 *     the real Orchestrator run, to gate on prediction.
 */

import { shadowRunner, ShadowRunner } from './ShadowRunner';
import { simClient, SimClient } from './SimClient';
import { sourceMapper } from '../core/sourceMapper';
import { log } from '../core/logger';
import { ValidationError } from '../shared/types/errors';
import type {
  SimulationSpec,
  SimulationRun,
  SimulationComparison,
  SimulationMode,
} from './types';

export interface SimulateOptions {
  planId?: string;
  goal: string;
  features?: string[];
  constraints?: string[];
  steps?: Array<{ order: number; layer: string; action: string }>;
  mode?: SimulationMode;
  trials?: number;
  seed?: number;
}

export class PlanSimulator {
  private readonly shadow: ShadowRunner;
  private readonly client: SimClient;

  constructor(opts?: { shadow?: ShadowRunner; client?: SimClient }) {
    this.shadow = opts?.shadow ?? shadowRunner;
    this.client = opts?.client ?? simClient;
  }

  /**
   * Run a simulation. If the mode is external but the engine is not
   * configured, falls back to heuristic. If mode is hybrid, always runs
   * heuristic first, then merges external on top.
   */
  async simulate(opts: SimulateOptions): Promise<SimulationRun> {
    if (!opts.goal || typeof opts.goal !== 'string') {
      throw new ValidationError('goal is required');
    }

    const mode: SimulationMode = opts.mode ?? 'heuristic';
    const planId = opts.planId ?? this.derivePlanId(opts.goal);

    // Derive steps from SourceMapper if not passed in
    const steps = opts.steps && opts.steps.length > 0
      ? opts.steps
      : sourceMapper.mapGoalToPlan(opts.goal).steps;

    const spec: SimulationSpec = {
      planId,
      goal: opts.goal,
      steps,
      features: opts.features ?? [],
      constraints: opts.constraints ?? [],
      trials: opts.trials,
      seed: opts.seed,
    };

    // Always run heuristic first — it is cheap, deterministic, and gives
    // baseline numbers even when the external engine is unreliable.
    const heuristic = this.shadow.run(spec, { trials: opts.trials, seed: opts.seed });

    if (mode === 'heuristic') {
      return heuristic;
    }

    if (!this.client.isConfigured()) {
      log.warn('sim.plan.external_not_configured', { planId, fallback: 'heuristic' });
      return {
        ...heuristic,
        notes: [...heuristic.notes, 'External engine requested but SIM_API_URL not configured; using heuristic only.'],
      };
    }

    try {
      const external = await this.client.requestSimulation(spec);
      if (mode === 'external') {
        // Replace heuristic numbers with external, but keep failureDistribution
        return this.client.mergeExternal(heuristic, external);
      }
      // hybrid
      return this.client.mergeExternal(heuristic, external);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error('sim.plan.external_failed', { planId, error: message });
      return {
        ...heuristic,
        notes: [...heuristic.notes, 'External engine failed: ' + message + '. Returning heuristic-only result.'],
      };
    }
  }

  /**
   * Compare a simulation run against a real outcome. Produces error
   * percentages and a verdict that Self-Evolution can learn from.
   */
  compare(input: {
    run: SimulationRun;
    actualSuccess: boolean;
    actualLatencyMs: number;
    actualCostUsd: number;
  }): SimulationComparison {
    const { run, actualSuccess, actualLatencyMs, actualCostUsd } = input;

    const latencyErrorPct = run.p50LatencyMs > 0
      ? ((actualLatencyMs - run.p50LatencyMs) / run.p50LatencyMs) * 100
      : 0;
    const costErrorPct = run.p50CostUsd > 0
      ? ((actualCostUsd - run.p50CostUsd) / run.p50CostUsd) * 100
      : 0;

    const predictedSuccessProb = run.successRate;
    const actualSuccessProb = actualSuccess ? 1 : 0;
    const successDelta = actualSuccessProb - predictedSuccessProb;

    // Verdict thresholds:
    //   |latencyError| < 50% AND |costError| < 60%  → accurate
    //   latencyError > 0 (worse) AND successDelta < 0  → optimistic
    //   latencyError < 0 (better) AND successDelta > 0 → pessimistic
    //   otherwise → inconclusive
    let verdict: SimulationComparison['verdict'] = 'inconclusive';
    const latencyWithin = Math.abs(latencyErrorPct) < 50;
    const costWithin = Math.abs(costErrorPct) < 60;

    if (latencyWithin && costWithin) verdict = 'accurate';
    else if (latencyErrorPct > 50 && successDelta < -0.1) verdict = 'optimistic';
    else if (latencyErrorPct < -50 && successDelta > 0.1) verdict = 'pessimistic';

    const notes: string[] = [];
    if (Math.abs(latencyErrorPct) > 100) notes.push('Predicted latency off by more than 2x.');
    if (Math.abs(costErrorPct) > 100) notes.push('Predicted cost off by more than 2x.');
    if (!actualSuccess && predictedSuccessProb > 0.8) notes.push('Simulation was optimistic on success.');
    if (actualSuccess && predictedSuccessProb < 0.5) notes.push('Simulation was pessimistic on success.');

    log.info('sim.plan.compare', {
      runId: run.runId,
      verdict,
      latencyErrorPct: Number(latencyErrorPct.toFixed(1)),
      costErrorPct: Number(costErrorPct.toFixed(1)),
    });

    return {
      planId: run.planId,
      simRunId: run.runId,
      predictedSuccessRate: run.successRate,
      actualSuccess,
      predictedP50LatencyMs: run.p50LatencyMs,
      actualLatencyMs,
      predictedP50CostUsd: run.p50CostUsd,
      actualCostUsd,
      latencyErrorPct: Number(latencyErrorPct.toFixed(2)),
      costErrorPct: Number(costErrorPct.toFixed(2)),
      verdict,
      notes,
      comparedAt: new Date().toISOString(),
    };
  }

  private derivePlanId(goal: string): string {
    // Cheap deterministic id from goal string. Not cryptographic.
    let h = 0;
    for (let i = 0; i < goal.length; i++) {
      h = ((h << 5) - h + goal.charCodeAt(i)) | 0;
    }
    return 'plan_' + (h >>> 0).toString(36);
  }

  stats(): { externalConfigured: boolean } {
    return { externalConfigured: this.client.isConfigured() };
  }
}

export const planSimulator = new PlanSimulator();
