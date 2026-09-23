/**
 * SimClient — HTTP adapter for external simulation engines.
 *
 * If SIM_API_URL is configured, forwards SimulationSpec to the engine and
 * returns whatever the engine reports. If not configured, requests fall
 * through to the local ShadowRunner — callers of PlanSimulator never need
 * to know which mode is active.
 *
 * Engine contract (recommended):
 *   POST {SIM_API_URL}
 *   Content-Type: application/json
 *   body: SimulationSpec
 *   200 → { runId?: string, successRate?: number, p50LatencyMs?: number, ... }
 *
 * Any engine that returns those fields will work. Engines that return
 * richer data pass through unchanged under `raw`.
 */

import { config } from '../config';
import { log } from '../core/logger';
import { UpstreamError, TimeoutError } from '../shared/types/errors';
import type { SimulationSpec, SimulationRun } from './types';

export interface ExternalSimResult {
  engine: string;
  externalRunId?: string;
  successRate?: number;
  p50LatencyMs?: number;
  p95LatencyMs?: number;
  p50CostUsd?: number;
  p95CostUsd?: number;
  robustness?: number;
  raw: unknown;
}

export class SimClient {
  private readonly timeoutMs: number;

  constructor(opts?: { timeoutMs?: number }) {
    this.timeoutMs = opts?.timeoutMs ?? 30000;
  }

  isConfigured(): boolean {
    return Boolean(config.SIM && config.SIM.apiUrl && config.SIM.apiUrl.length > 0);
  }

  async requestSimulation(spec: SimulationSpec): Promise<ExternalSimResult> {
    if (!this.isConfigured()) {
      throw new UpstreamError('SIM_API_URL not configured');
    }

    const url = config.SIM.apiUrl!;
    log.info('sim.client.request', { url, planId: spec.planId, trials: spec.trials });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'sovereign-bridge-sim-client',
        },
        body: JSON.stringify(spec),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new UpstreamError('sim engine ' + res.status + ': ' + text.slice(0, 300), {
          url,
          status: res.status,
        });
      }

      const json = (await res.json()) as Record<string, unknown>;

      return {
        engine: 'external',
        externalRunId: typeof json.runId === 'string' ? json.runId : undefined,
        successRate: typeof json.successRate === 'number' ? json.successRate : undefined,
        p50LatencyMs: typeof json.p50LatencyMs === 'number' ? json.p50LatencyMs : undefined,
        p95LatencyMs: typeof json.p95LatencyMs === 'number' ? json.p95LatencyMs : undefined,
        p50CostUsd: typeof json.p50CostUsd === 'number' ? json.p50CostUsd : undefined,
        p95CostUsd: typeof json.p95CostUsd === 'number' ? json.p95CostUsd : undefined,
        robustness: typeof json.robustness === 'number' ? json.robustness : undefined,
        raw: json,
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new TimeoutError('sim engine timed out after ' + this.timeoutMs + 'ms');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Blend external result into a SimulationRun. Fields the external engine
   * does not supply are left as-is from the local run.
   */
  mergeExternal(local: SimulationRun, external: ExternalSimResult): SimulationRun {
    return {
      ...local,
      mode: 'hybrid',
      successRate: external.successRate ?? local.successRate,
      p50LatencyMs: external.p50LatencyMs ?? local.p50LatencyMs,
      p95LatencyMs: external.p95LatencyMs ?? local.p95LatencyMs,
      p50CostUsd: external.p50CostUsd ?? local.p50CostUsd,
      p95CostUsd: external.p95CostUsd ?? local.p95CostUsd,
      robustness: external.robustness ?? local.robustness,
      external: {
        engine: external.engine,
        externalRunId: external.externalRunId,
        raw: external.raw,
      },
      notes: [
        ...local.notes,
        'External engine merged. Provided: ' +
          Object.entries(external)
            .filter(([k, v]) => k !== 'engine' && k !== 'externalRunId' && k !== 'raw' && v !== undefined)
            .map(([k]) => k)
            .join(', '),
      ],
    };
  }
}

export const simClient = new SimClient();
