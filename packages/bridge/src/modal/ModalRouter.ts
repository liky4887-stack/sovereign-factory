/**
 * ModalRouter — dispatches normalized intent by modality.
 * New modalities register a handler; the orchestrator never changes.
 * Cites P4 (separation of concerns).
 */

import { Modality, NormalizedIntent } from '../types';
import { ledger } from '../ledger/TruthLedger';

export type ModalHandler = (intent: NormalizedIntent) => Promise<unknown>;

export class ModalRouter {
  private handlers = new Map<Modality, ModalHandler>();

  register(modality: Modality, handler: ModalHandler): void {
    this.handlers.set(modality, handler);
  }

  async dispatch(
    modality: Modality,
    intent: NormalizedIntent,
  ): Promise<unknown> {
    ledger.appendEntry({
      actor: 'modalRouter',
      eventType: 'MODAL_DISPATCH',
      payload: { modality, tokenCount: intent.tokens.length },
    });

    const handler = this.handlers.get(modality);
    if (!handler) {
      throw new Error('No handler registered for modality: ' + modality);
    }
    return handler(intent);
  }

  listModalities(): Modality[] {
    return Array.from(this.handlers.keys());
  }
}

export const modalRouter = new ModalRouter();

modalRouter.register('text', async (intent) => ({
  kind: 'text',
  normalized: intent.normalized,
  note: 'stub text handler; wire a real provider here',
}));

modalRouter.register('vision_3d', async (intent) => ({
  kind: 'vision_3d',
  sceneHint: intent.normalized,
  note: 'stub vision_3d handler; forward to SimulationHub for a render plan',
}));
