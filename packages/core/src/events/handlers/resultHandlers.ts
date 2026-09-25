import { UEB } from '../EventBus';
import { EVENTS } from '../types';
import { log } from '../../shared/logger';

export function registerResultHandlers(): void {
  UEB.on(EVENTS.MYSTIC_SPEC_READY, (event) => {
    const p = event.payload as any;
    log.info('result.mystic.spec_ready', {
      correlation_id: event.correlation_id,
      keys: p ? Object.keys(p).slice(0, 8) : [],
    });
  });

  UEB.on(EVENTS.GODMODE_REPORT, (event) => {
    const p = event.payload as any;
    log.info('result.godmode.report', {
      correlation_id: event.correlation_id,
      target_service: p?.target_service,
      duration_ms: p?.duration_ms,
    });
  });

  UEB.on(EVENTS.TERMUX_COMMAND_RESULT, (event) => {
    const p = event.payload as any;
    log.info('result.termux.command', {
      correlation_id: event.correlation_id,
      command: p?.command,
      exit_code: p?.exit_code,
      duration_ms: p?.duration_ms,
      stdout_len: (p?.stdout || '').length,
      stderr_len: (p?.stderr || '').length,
    });
  });

  log.info('ueb.handler.registered', {
    handler: 'resultHandlers',
    events: [EVENTS.MYSTIC_SPEC_READY, EVENTS.GODMODE_REPORT],
  });
}
