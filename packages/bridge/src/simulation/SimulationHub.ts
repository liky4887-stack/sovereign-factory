/**
 * SimulationHub — accepts a scene description and produces a render plan.
 *
 * No renderer is bundled. This module's job is to translate a high-level
 * request into a structured plan that an external 3D/physics engine can
 * consume. A real engine connects by reading plan.engineHint and the
 * passes list, then driving its own scene graph.
 */

import { SimulationRequest, SimulationPlan } from '../types';
import { ledger } from '../ledger/TruthLedger';

export class SimulationHub {
  plan(req: SimulationRequest): SimulationPlan {
    const pixelCount = req.resolution.width * req.resolution.height;
    const is8K = pixelCount >= 33_000_000;
    const estimatedVramMb = Math.round((pixelCount * req.frames * 4) / (1024 * 1024));

    const passes: string[] = [
      'depth-prepass',
      'shadow-cascade',
      'physics-step',
      'raster-opaque',
      'raster-transparent',
      'post-tonemap',
    ];
    if (is8K) passes.push('temporal-upscale-8k');
    if (req.physics.collide) passes.push('collision-resolve');

    const result: SimulationPlan = {
      accepted: true,
      plan: {
        engineHint: 'external-3d-engine',
        passes,
        estimatedVramMb,
        notes: is8K
          ? '8K target detected — external engine should allocate tiered buffers.'
          : 'Standard resolution target.',
      },
    };

    ledger.appendEntry({
      actor: 'simulationHub',
      eventType: 'SIMULATION_PLANNED',
      payload: {
        resolution: req.resolution,
        frames: req.frames,
        physics: req.physics,
        passes,
        estimatedVramMb,
      },
    });

    return result;
  }
}

export const simulationHub = new SimulationHub();
