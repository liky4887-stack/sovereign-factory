/**
 * High-Fidelity Simulation Hook — canonical types.
 *
 * A SimulationRun represents N Monte Carlo trials of the same plan under
 * the same assumptions. Results are aggregated so callers get a distribution,
 * not a single point estimate.
 *
 * Metrics:
 *   successRate    — fraction of trials that completed without failure
 *   p50LatencyMs   — median total latency across trials
 *   p95LatencyMs   — 95th percentile total latency
 *   p50CostUsd     — median total cost
 *   p95CostUsd     — 95th percentile cost
 *   robustness     — 1 - CV(latency), bounded to [0, 1]
 *   failureDist    — how often each step was the failure point
 */

export type SimulationMode = 'heuristic' | 'external' | 'hybrid';

export interface SimulationSpec {
  planId: string;
  goal: string;
  steps: Array<{ order: number; layer: string; action: string }>;
  features: string[];
  constraints: string[];
  trials?: number;
  seed?: number;
}

export interface TrialResult {
  trialIndex: number;
  success: boolean;
  totalLatencyMs: number;
  totalCostUsd: number;
  failedAtStepOrder?: number;
  notes: string[];
}

export interface SimulationRun {
  runId: string;
  planId: string;
  goal: string;
  mode: SimulationMode;
  trials: number;
  seed: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  successRate: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p50CostUsd: number;
  p95CostUsd: number;
  robustness: number;
  failureDistribution: Array<{ stepOrder: number; layer: string; action: string; failures: number }>;
  sampleTrials: TrialResult[];
  external?: {
    engine: string;
    externalRunId?: string;
    raw?: unknown;
  };
  notes: string[];
}

export interface SimulationComparison {
  planId: string;
  simRunId: string;
  predictedSuccessRate: number;
  actualSuccess: boolean;
  predictedP50LatencyMs: number;
  actualLatencyMs: number;
  predictedP50CostUsd: number;
  actualCostUsd: number;
  latencyErrorPct: number;
  costErrorPct: number;
  verdict: 'accurate' | 'optimistic' | 'pessimistic' | 'inconclusive';
  notes: string[];
  comparedAt: string;
}

export interface SimulatorOptions {
  mode?: SimulationMode;
  trials?: number;
  seed?: number;
}
