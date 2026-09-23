/**
 * simClient.ts - HTTP adapter for an external simulation / 3D / physics engine.
 *
 * If SIM_API_URL is set, forwards the request and returns the engine's reply.
 * Otherwise returns a local fallback plan so SimulationHub remains the source
 * of truth when no engine is attached.
 */

import { config } from '../../config';

export interface SimulationSpec {
  scene: string;
  resolution: { width: number; height: number };
  frames: number;
  physics: { gravity: number; collide: boolean; materials: string[] };
}

export interface SimulationResponse {
  ok: boolean;
  engine: string;
  external: boolean;
  assetId?: string;
  plan?: unknown;
  error?: string;
}

export class SimClient {
  isConfigured(): boolean {
    return Boolean(config.SIM.apiUrl);
  }

  async requestSimulation(spec: SimulationSpec): Promise<SimulationResponse> {
    if (!this.isConfigured()) {
      return {
        ok: true,
        external: false,
        engine: 'local-fallback',
        plan: { note: 'no SIM_API_URL configured; using SimulationHub locally' },
      };
    }

    try {
      const res = await fetch(config.SIM.apiUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spec),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { ok: false, external: true, engine: 'remote', error: 'engine ' + res.status + ': ' + text.slice(0, 200) };
      }
      const json = (await res.json()) as { assetId?: string; plan?: unknown };
      return { ok: true, external: true, engine: 'remote', assetId: json.assetId, plan: json.plan };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, external: true, engine: 'remote', error: message };
    }
  }

  async getSimulationStatus(id: string): Promise<SimulationResponse> {
    if (!this.isConfigured()) {
      return { ok: true, external: false, engine: 'local-fallback', plan: { note: 'status check not applicable locally' } };
    }
    try {
      const res = await fetch(config.SIM.apiUrl!.replace(/\/+$/, '') + '/' + id);
      if (!res.ok) return { ok: false, external: true, engine: 'remote', error: 'status ' + res.status };
      const json = (await res.json()) as { plan?: unknown };
      return { ok: true, external: true, engine: 'remote', plan: json.plan };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, external: true, engine: 'remote', error: message };
    }
  }
}

export const simClient = new SimClient();
