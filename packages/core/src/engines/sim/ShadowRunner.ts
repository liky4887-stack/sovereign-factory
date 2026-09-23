/**
 * ShadowRunner — deterministic Monte Carlo simulation of a plan.
 *
 * Each step in the plan is assigned a StepProfile describing its failure
 * probability and its latency / cost distributions. Running N trials under
 * a seeded RNG produces a reproducible distribution.
 *
 * Step profiles are derived from the step's layer (ledger, orchestrator,
 * modal, simulation, evolution, fusion, persona) and from the plan's
 * structural features. This means a plan for a distributed system gets
 * higher variance than a plan for a single-actor system, etc.
 */

import { randomUUID, createHash } from 'crypto';
import type {
  SimulationSpec,
  SimulationRun,
  TrialResult,
} from './types';
import { log } from '../core/logger';

interface StepProfile {
  failureProbability: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  costP50Usd: number;
  costP95Usd: number;
}

/**
 * mulberry32 — small deterministic PRNG. Same seed → same sequence.
 * Reference: https://github.com/bryc/code/blob/master/jshash/PRNGs.md
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Log-normal sample from a p50 and p95. This gives the right shape for
 * latency and cost distributions: strictly positive, right-skewed.
 */
function sampleLogNormal(rng: () => number, p50: number, p95: number): number {
  // p95 / p50 = exp(1.645 * sigma)  →  sigma = ln(p95/p50) / 1.645
  const ratio = Math.max(p95 / Math.max(p50, 0.001), 1.01);
  const sigma = Math.log(ratio) / 1.645;
  const mu = Math.log(Math.max(p50, 0.001));

  // Box-Muller for normal sample
  const u1 = Math.max(rng(), 1e-9);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

  return Math.exp(mu + sigma * z);
}

function deriveStepProfile(layer: string, features: string[]): StepProfile {
  const has = (f: string) => features.includes(f);

  // Baseline per layer — reflects a lightweight default
  const base: Record<string, StepProfile> = {
    ledger:       { failureProbability: 0.002, latencyP50Ms: 30,   latencyP95Ms: 120,  costP50Usd: 0,       costP95Usd: 0.0001 },
    orchestrator: { failureProbability: 0.010, latencyP50Ms: 200,  latencyP95Ms: 900,  costP50Usd: 0.0002,  costP95Usd: 0.002 },
    modal:        { failureProbability: 0.020, latencyP50Ms: 800,  latencyP95Ms: 3000, costP50Usd: 0.002,   costP95Usd: 0.020 },
    simulation:   { failureProbability: 0.015, latencyP50Ms: 1500, latencyP95Ms: 8000, costP50Usd: 0.005,   costP95Usd: 0.050 },
    evolution:    { failureProbability: 0.008, latencyP50Ms: 300,  latencyP95Ms: 1500, costP50Usd: 0.001,   costP95Usd: 0.010 },
    fusion:       { failureProbability: 0.005, latencyP50Ms: 150,  latencyP95Ms: 500,  costP50Usd: 0.0005,  costP95Usd: 0.005 },
    persona:      { failureProbability: 0.004, latencyP50Ms: 100,  latencyP95Ms: 400,  costP50Usd: 0.0003,  costP95Usd: 0.003 },
  };

  const profile: StepProfile = base[layer] ?? {
    failureProbability: 0.010,
    latencyP50Ms: 250,
    latencyP95Ms: 1200,
    costP50Usd: 0.001,
    costP95Usd: 0.010,
  };

  // Feature-based adjustments — multiplicative on failure and variance
  if (has('adversarial')) {
    profile.failureProbability *= 2.5;
    profile.latencyP95Ms *= 1.4;
  }
  if (has('high_volume')) {
    profile.latencyP50Ms *= 1.6;
    profile.latencyP95Ms *= 2.2;
    profile.costP50Usd *= 2.0;
    profile.costP95Usd *= 2.5;
  }
  if (has('low_latency')) {
    // Aggressive optimization reduces variability (tighter tails)
    profile.latencyP95Ms *= 0.75;
    profile.failureProbability *= 1.3;
  }
  if (has('high_reliability')) {
    profile.failureProbability *= 0.4;
  }
  if (has('safety_critical')) {
    profile.failureProbability *= 0.6;
    profile.costP50Usd *= 1.3;
  }
  if (has('resource_constrained')) {
    profile.latencyP50Ms *= 1.2;
    profile.costP50Usd *= 0.7;
  }
  if (has('real_time')) {
    profile.latencyP95Ms *= 0.85;
  }
  if (has('experimental')) {
    profile.failureProbability *= 1.8;
    profile.latencyP95Ms *= 1.3;
  }

  return profile;
}

function deriveSeed(spec: SimulationSpec): number {
  if (typeof spec.seed === 'number') return spec.seed >>> 0;
  const h = createHash('sha256').update(spec.planId + '|' + spec.goal).digest('hex').slice(0, 8);
  return parseInt(h, 16) >>> 0;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function runTrial(
  rng: () => number,
  profiles: StepProfile[],
  spec: SimulationSpec,
  trialIndex: number,
): TrialResult {
  let totalLatencyMs = 0;
  let totalCostUsd = 0;
  const notes: string[] = [];

  for (let i = 0; i < spec.steps.length; i++) {
    const step = spec.steps[i];
    const profile = profiles[i];

    // Failure roll
    if (rng() < profile.failureProbability) {
      notes.push('failed at step ' + step.order + ' (' + step.layer + ')');
      return {
        trialIndex,
        success: false,
        totalLatencyMs: Math.round(totalLatencyMs),
        totalCostUsd: Number(totalCostUsd.toFixed(6)),
        failedAtStepOrder: step.order,
        notes,
      };
    }

    totalLatencyMs += sampleLogNormal(rng, profile.latencyP50Ms, profile.latencyP95Ms);
    totalCostUsd += sampleLogNormal(rng, profile.costP50Usd + 0.0001, profile.costP95Usd + 0.0001);
  }

  return {
    trialIndex,
    success: true,
    totalLatencyMs: Math.round(totalLatencyMs),
    totalCostUsd: Number(totalCostUsd.toFixed(6)),
    notes,
  };
}

export class ShadowRunner {
  run(spec: SimulationSpec, opts?: { trials?: number; seed?: number }): SimulationRun {
    const startedAt = new Date().toISOString();
    const t0 = Date.now();

    const trials = Math.max(1, Math.min(opts?.trials ?? spec.trials ?? 200, 5000));
    const seed = opts?.seed ?? deriveSeed(spec);

    const rng = mulberry32(seed);
    const profiles = spec.steps.map((s) => deriveStepProfile(s.layer, spec.features));

    const results: TrialResult[] = [];
    const failureCounts = new Map<number, number>();

    for (let i = 0; i < trials; i++) {
      const r = runTrial(rng, profiles, spec, i);
      results.push(r);
      if (!r.success && r.failedAtStepOrder !== undefined) {
        failureCounts.set(r.failedAtStepOrder, (failureCounts.get(r.failedAtStepOrder) ?? 0) + 1);
      }
    }

    const successful = results.filter((r) => r.success);
    const successRate = successful.length / trials;

    const latencies = successful.map((r) => r.totalLatencyMs).sort((a, b) => a - b);
    const costs = successful.map((r) => r.totalCostUsd).sort((a, b) => a - b);

    const p50LatencyMs = percentile(latencies, 50);
    const p95LatencyMs = percentile(latencies, 95);
    const p50CostUsd = percentile(costs, 50);
    const p95CostUsd = percentile(costs, 95);

    // Robustness = 1 - coefficient of variation on latency, bounded to [0,1]
    const meanLatency = latencies.length > 0
      ? latencies.reduce((s, l) => s + l, 0) / latencies.length
      : 0;
    const variance = latencies.length > 1
      ? latencies.reduce((s, l) => s + (l - meanLatency) ** 2, 0) / (latencies.length - 1)
      : 0;
    const stddev = Math.sqrt(variance);
    const cv = meanLatency > 0 ? stddev / meanLatency : 1;
    const robustness = Math.max(0, Math.min(1, 1 - cv));

    const failureDistribution = spec.steps
      .map((s) => ({
        stepOrder: s.order,
        layer: s.layer,
        action: s.action,
        failures: failureCounts.get(s.order) ?? 0,
      }))
      .filter((f) => f.failures > 0)
      .sort((a, b) => b.failures - a.failures);

    const sampleTrials = this.pickSampleTrials(results);

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - t0;

    const notes: string[] = [];
    if (successRate >= 0.95) notes.push('High success probability.');
    else if (successRate >= 0.80) notes.push('Moderate success probability — some failure modes likely.');
    else notes.push('Low success probability — reconsider plan before real execution.');

    if (robustness < 0.4) notes.push('Low robustness — latency has high variance.');
    if (failureDistribution.length > 0) {
      notes.push('Most likely failure point: step ' + failureDistribution[0].stepOrder + ' (' + failureDistribution[0].layer + ').');
    }

    const runId = randomUUID();

    log.info('sim.shadow.complete', {
      runId,
      planId: spec.planId,
      trials,
      successRate: Number(successRate.toFixed(3)),
      robustness: Number(robustness.toFixed(3)),
    });

    return {
      runId,
      planId: spec.planId,
      goal: spec.goal,
      mode: 'heuristic',
      trials,
      seed,
      startedAt,
      completedAt,
      durationMs,
      successRate: Number(successRate.toFixed(4)),
      p50LatencyMs: Math.round(p50LatencyMs),
      p95LatencyMs: Math.round(p95LatencyMs),
      p50CostUsd: Number(p50CostUsd.toFixed(6)),
      p95CostUsd: Number(p95CostUsd.toFixed(6)),
      robustness: Number(robustness.toFixed(4)),
      failureDistribution,
      sampleTrials,
      notes,
    };
  }

  private pickSampleTrials(all: TrialResult[]): TrialResult[] {
    if (all.length === 0) return [];
    const out: TrialResult[] = [all[0]];
    const firstFailure = all.find((t) => !t.success);
    if (firstFailure && firstFailure !== all[0]) out.push(firstFailure);
    if (all.length > 1) out.push(all[all.length - 1]);
    return out;
  }
}

export const shadowRunner = new ShadowRunner();
