import { UEB } from '../EventBus';
import { EVENTS, SovereignEvent } from '../types';
import { GodModeService } from '../../god-mode/api/GodModeService';
import { log } from '../../shared/logger';

interface StormPayload {
  target_service: string;
  duration_ms: number;
  intensity?: string;
  correlation_id?: string;
}

export function registerGodModeHandler(godMode: GodModeService): void {
  UEB.on<StormPayload>(EVENTS.GODMODE_LATENCY_STORM, async (event) => {
    const p = event.payload;
    log.info('godmode.storm.start', {
      correlation_id: event.correlation_id,
      target_service: p.target_service,
      duration_ms: p.duration_ms,
      intensity: p.intensity,
    });

    try {
      const run = await godMode.runChaos({
        edgeCases: true,
        latencyStorm: true,
        dataCorruption: false,
      });
      const reply: SovereignEvent<unknown> = {
        event_type: EVENTS.GODMODE_REPORT,
        source: 'GODMODE',
        correlation_id: event.correlation_id,
        timestamp: Date.now(),
        payload: {
          target_service: p.target_service,
          duration_ms: p.duration_ms,
          run,
        },
      };
      await UEB.emit(reply);
      log.info('godmode.storm.done', {
        correlation_id: event.correlation_id,
      });
    } catch (err) {
      log.error('godmode.storm.error', {
        correlation_id: event.correlation_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  log.info('ueb.handler.registered', {
    handler: 'godmodeHandler',
    event: EVENTS.GODMODE_LATENCY_STORM,
  });
}
