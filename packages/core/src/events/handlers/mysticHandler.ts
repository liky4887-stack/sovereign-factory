import { UEB } from '../EventBus';
import { EVENTS, SovereignEvent } from '../types';
import { MysticRealmService } from '../../mystic-realm/api/MysticRealmService';
import { log } from '../../shared/logger';

interface ManifestPayload {
  intent_text: string;
  correlation_id?: string;
}

export function registerMysticHandler(mystic: MysticRealmService): void {
  UEB.on<ManifestPayload>(EVENTS.MYSTIC_MANIFEST, async (event) => {
    const p = event.payload;
    log.info('mystic.manifest.start', {
      correlation_id: event.correlation_id,
      intent_text: p.intent_text,
    });

    try {
      const result = await mystic.manifest(p.intent_text);
      const reply: SovereignEvent<unknown> = {
        event_type: EVENTS.MYSTIC_SPEC_READY,
        source: 'MYSTIC',
        correlation_id: event.correlation_id,
        timestamp: Date.now(),
        payload: result,
      };
      await UEB.emit(reply);
      log.info('mystic.manifest.done', {
        correlation_id: event.correlation_id,
      });
    } catch (err) {
      log.error('mystic.manifest.error', {
        correlation_id: event.correlation_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  log.info('ueb.handler.registered', {
    handler: 'mysticHandler',
    event: EVENTS.MYSTIC_MANIFEST,
  });
}
