/**
 * sourceMapper.ts - maps a raw goal to a structured execution plan.
 *
 * This is the "Autonomous First Principles Synthesis" tier made concrete:
 * it decomposes the goal to its primitive shape, decides which layers are
 * required, and emits an ordered plan the orchestrator can execute.
 */

export type LayerId =
  | 'orchestrator'
  | 'modal'
  | 'simulation'
  | 'evolution'
  | 'ledger';

export interface ExecutionStep {
  order: number;
  layer: LayerId;
  action: string;
}

export interface ExecutionPlan {
  goal: string;
  requiredLayers: LayerId[];
  steps: ExecutionStep[];
  notes: string[];
}

const SIM_HINTS = ['render', '3d', 'simulate', 'physics', '8k', 'scene', 'world'];
const EVOLUTION_HINTS = ['improve', 'optimize', 'evolve', 'learn', 'adapt', 'tune'];
const MODAL_HINTS = ['image', 'vision', 'audio', 'video', 'multimodal'];

export class SourceMapper {
  mapGoalToPlan(goal: string): ExecutionPlan {
    const lower = goal.toLowerCase();
    const layers = new Set<LayerId>(['orchestrator', 'ledger']);
    const notes: string[] = [];

    if (SIM_HINTS.some((h) => lower.includes(h))) {
      layers.add('simulation');
      notes.push('Simulation layer engaged (scene/physics/3d hint detected).');
    }
    if (EVOLUTION_HINTS.some((h) => lower.includes(h))) {
      layers.add('evolution');
      notes.push('Evolution layer engaged (self-improvement hint detected).');
    }
    if (MODAL_HINTS.some((h) => lower.includes(h))) {
      layers.add('modal');
      notes.push('Modal layer engaged (non-text modality hint detected).');
    }
    if (!layers.has('modal') && !layers.has('simulation')) {
      layers.add('modal');
      notes.push('Defaulting to modal/text dispatch.');
    }

    const steps: ExecutionStep[] = [];
    let order = 1;
    steps.push({ order: order++, layer: 'ledger', action: 'record goal received' });
    steps.push({ order: order++, layer: 'orchestrator', action: 'normalize intent' });
    if (layers.has('modal')) {
      steps.push({ order: order++, layer: 'modal', action: 'dispatch by modality' });
    }
    if (layers.has('simulation')) {
      steps.push({ order: order++, layer: 'simulation', action: 'produce render plan' });
    }
    if (layers.has('evolution')) {
      steps.push({ order: order++, layer: 'evolution', action: 'propose config update' });
    }
    steps.push({ order: order++, layer: 'ledger', action: 'record outcome' });

    return {
      goal,
      requiredLayers: Array.from(layers),
      steps,
      notes,
    };
  }
}

export const sourceMapper = new SourceMapper();
