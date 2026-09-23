/**
 * routes/simulation.ts - forwards scene specs to an external engine.
 */

import { Router, Request, Response } from 'express';
import { simClient } from '../core/adapters/simClient';
import { simulationHub } from '../simulation/SimulationHub';
import { ledger } from '../ledger/TruthLedger';

const router = Router();

router.post('/simulation/run', async (req: Request, res: Response) => {
  const { scene, resolution, frames, physics } = req.body ?? {};
  if (typeof scene !== 'string' || scene.length === 0) {
    return res.status(400).json({ ok: false, error: 'scene_required' });
  }

  const spec = {
    scene,
    resolution: resolution ?? { width: 1920, height: 1080 },
    frames: Number(frames ?? 120),
    physics: physics ?? { gravity: 9.81, collide: true, materials: ['default'] },
  };

  ledger.appendEntry({
    actor: 'simulationHub',
    eventType: 'SIMULATION_PLANNED',
    payload: { scene, external: simClient.isConfigured() },
  });

  if (simClient.isConfigured()) {
    const remote = await simClient.requestSimulation(spec);
    return res.json({ ok: remote.ok, remote, spec });
  }

  const localPlan = simulationHub.plan(spec);
  return res.json({ ok: true, remote: { external: false, engine: 'local' }, localPlan, spec });
});

router.get('/simulation/status/:id', async (req: Request, res: Response) => {
  const status = await simClient.getSimulationStatus(req.params.id);
  res.json({ ok: status.ok, status });
});

export default router;
