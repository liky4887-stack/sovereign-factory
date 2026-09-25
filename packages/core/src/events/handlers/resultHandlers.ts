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

  UEB.on(EVENTS.SOVEREIGN_MISSION_STEP, (event) => {
    const p = event.payload as any;
    log.info('result.mission.step', {
      correlation_id: event.correlation_id,
      manifest_id: p?.manifest_id,
      order: p?.order,
    });
  });

  UEB.on(EVENTS.SOVEREIGN_MISSION_COMPLETE, (event) => {
    const p = event.payload as any;
    log.info('result.mission.complete', {
      correlation_id: event.correlation_id,
      manifest_id: p?.id,
      dispatched: p?.dispatched,
      dispatch_kind: p?.dispatch?.kind,
    });
  });

  UEB.on(EVENTS.SOVEREIGN_MISSION_STEP_DONE, (event) => {
    const p = event.payload as any;
    log.info('result.mission.step_done', {
      correlation_id: event.correlation_id,
      manifest_id: p?.manifest_id,
      order: p?.order,
    });
  });

  log.info('ueb.handler.registered', {
    handler: 'resultHandlers',
    events: [
      EVENTS.MYSTIC_SPEC_READY,
      EVENTS.GODMODE_REPORT,
      EVENTS.TERMUX_COMMAND_RESULT,
      EVENTS.SOVEREIGN_MISSION_STEP,
      EVENTS.SOVEREIGN_MISSION_COMPLETE,
      EVENTS.SOVEREIGN_MISSION_STEP_DONE,
    ],
  });
}
