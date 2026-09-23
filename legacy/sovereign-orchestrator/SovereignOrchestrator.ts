/**
 * SovereignOrchestrator — the single entry point for all tasks.
 *
 * Flow:
 *   1. Normalize intent (PromptAdapter).
 *   2. Dispatch by modality (ModalRouter).
 *   3. If vision_3d and a scene is provided, produce a SimulationPlan.
 *   4. Record every step in the TruthLedger.
 *   5. Return a TaskResult.
 *
 * Cites P2 (preserve intent), P3 (transparency), P4 (separation).
 */

import { randomUUID } from 'crypto';
import { Task, TaskResult, Modality } from '../types';
import { promptAdapter } from '../compliance/PromptAdapter';
import { modalRouter } from '../modal/ModalRouter';
import { simulationHub } from '../simulation/SimulationHub';
import { ledger } from '../ledger/TruthLedger';

export class SovereignOrchestrator {
  async run(task: Task): Promise<TaskResult> {
    const taskId = task.id ?? randomUUID();
    const modality: Modality = task.modality ?? 'text';

    ledger.appendEntry({
      actor: 'orchestrator',
      eventType: 'TASK_RECEIVED',
      payload: { taskId, modality, promptLength: task.prompt.length },
    });

    try {
      const intent = promptAdapter.normalize(task.prompt);

      ledger.appendEntry({
        actor: 'orchestrator',
        eventType: 'TASK_ROUTED',
        payload: { taskId, modality, ambiguities: intent.ambiguities },
      });

      let output: unknown;

      if (modality === 'vision_3d' && task.metadata && task.metadata.scene) {
        const scene = String(task.metadata.scene);
        const resolution =
          (task.metadata.resolution as { width: number; height: number }) ??
          { width: 1920, height: 1080 };
        const frames = Number(task.metadata.frames ?? 120);
        const physics = (task.metadata.physics as {
          gravity: number;
          collide: boolean;
          materials: string[];
        }) ?? { gravity: 9.81, collide: true, materials: ['default'] };

        output = simulationHub.plan({
          scene,
          resolution,
          frames,
          physics,
        });
      } else {
        output = await modalRouter.dispatch(modality, intent);
      }

      const entry = ledger.appendEntry({
        actor: 'orchestrator',
        eventType: 'TASK_COMPLETED',
        payload: { taskId, modality },
      });

      return {
        ok: true,
        taskId,
        modality,
        output,
        ledgerEntryId: entry.id,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      const entry = ledger.appendEntry({
        actor: 'orchestrator',
        eventType: 'TASK_FAILED',
        payload: { taskId, modality, error: message },
      });

      return {
        ok: false,
        taskId,
        modality,
        output: null,
        ledgerEntryId: entry.id,
        error: message,
      };
    }
  }
}

export const orchestrator = new SovereignOrchestrator();
