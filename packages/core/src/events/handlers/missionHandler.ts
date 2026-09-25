import { UEB } from '../EventBus';
import { pendingResults } from '../PendingResults';
import { EVENTS, SovereignEvent } from '../types';
import { MysticRealmService } from '../../mystic-realm/api/MysticRealmService';
import { log } from '../../shared/logger';

interface MissionDefinePayload {
  goal: string;
  correlation_id?: string;
}

interface Dispatch {
  kind: 'write' | 'run' | 'simulate' | 'audit';
  event_type?: string;
  payload?: unknown;
  error?: string;
}

interface MissionReport {
  id: string;
  intention: string;
  steps: Array<{ order: number; action: string; rationale: string }>;
  ledgerEntryId: string;
  dispatched: number;
  dispatch: Dispatch;
  completedAt: string;
}

function classifyGoal(goal: string): { kind: Dispatch['kind'], payload: any } {
  const g = goal.toLowerCase();

  if (/\b(write|create|draft|save|generate|produce)\b/.test(g)) {
    const m = goal.match(/(?:to|at|in)\s+([^\s]+\.(txt|md|json|log|html))/i);
    const path = m ? m[1] : '~/bridge-workspace/mission-output.md';
    const content = '# Mission output\n\n' +
      'Generated at ' + new Date().toISOString() + '\n\n' +
      'Goal: ' + goal + '\n';
    return { kind: 'write', payload: { op: 'write', path, content } };
  }

  if (/\b(run|execute|launch|deploy|start)\b/.test(g)) {
    return { kind: 'run', payload: { command: 'echo', args: ['mission dispatched'] } };
  }

  if (/\b(test|stress|simulate|latency|chaos)\b/.test(g)) {
    return { kind: 'simulate', payload: { target_service: 'sovereign-console', duration_ms: 30000, intensity: 'medium' } };
  }

  return { kind: 'audit', payload: null };
}

async function dispatchFor(
  goal: string,
  correlation_id: string | undefined,
): Promise<Dispatch> {
  const { kind, payload } = classifyGoal(goal);
  if (kind === 'audit') return { kind };

  try {
    let event_type: string;
    if (kind === 'write') event_type = EVENTS.WORKSPACE_WRITE_FILE;
    else if (kind === 'run') event_type = EVENTS.TERMUX_EXECUTE_COMMAND;
    else event_type = EVENTS.GODMODE_LATENCY_STORM;

    // Use a distinct correlation_id so the downstream handler's
    // pendingResults.resolve() does not resolve the mission's own promise.
    const subCorrelation = correlation_id ? (correlation_id + '.sub') : undefined;
    const ev: SovereignEvent<unknown> = {
      event_type,
      source: 'SOVEREIGN',
      correlation_id: subCorrelation,
      timestamp: Date.now(),
      payload,
    };
    await UEB.emit(ev);
    return { kind, event_type, payload };
  } catch (err) {
    return { kind, error: err instanceof Error ? err.message : String(err) };
  }
}

export function registerMissionHandler(mystic: MysticRealmService): void {
  UEB.on<MissionDefinePayload>(EVENTS.SOVEREIGN_MISSION_DEFINE, async (event) => {
    const p = event.payload;
    const goal = (p && typeof p.goal === 'string') ? p.goal.trim() : '';
    if (!goal) {
      log.warn('mission.define.empty');
      if (event.correlation_id) {
        pendingResults.resolve(event.correlation_id, { ok: false, error: 'empty goal' });
      }
      return;
    }

    log.info('mission.start', {
      correlation_id: event.correlation_id,
      goal_preview: goal.slice(0, 80),
    });

    try {
      const manifestation = await mystic.manifest(goal);
      log.info('mission.manifest', {
        correlation_id: event.correlation_id,
        manifest_id: manifestation.id,
        step_count: manifestation.steps.length,
        ledger_entry: manifestation.ledgerEntryId,
      });

      // Emit one STEP per plan step for visibility on the bus.
      for (const step of manifestation.steps) {
        const stepEvent: SovereignEvent<unknown> = {
          event_type: EVENTS.SOVEREIGN_MISSION_STEP,
          source: 'SOVEREIGN',
          correlation_id: event.correlation_id,
          timestamp: Date.now(),
          payload: {
            manifest_id: manifestation.id,
            order: step.order,
            action: step.action,
            rationale: step.rationale,
          },
        };
        await UEB.emit(stepEvent);
        await UEB.emit({
          event_type: EVENTS.SOVEREIGN_MISSION_STEP_DONE,
          source: 'SOVEREIGN',
          correlation_id: event.correlation_id,
          timestamp: Date.now(),
          payload: { manifest_id: manifestation.id, order: step.order },
        });
      }

      // Dispatch one concrete downstream action based on goal intent.
      const dispatch = await dispatchFor(goal, event.correlation_id);
      log.info('mission.dispatch', {
        correlation_id: event.correlation_id,
        kind: dispatch.kind,
        event_type: dispatch.event_type,
        error: dispatch.error,
      });

      const report: MissionReport = {
        id: manifestation.id,
        intention: manifestation.intention,
        steps: manifestation.steps,
        ledgerEntryId: manifestation.ledgerEntryId,
        dispatched: manifestation.steps.length,
        dispatch,
        completedAt: new Date().toISOString(),
      };

      await UEB.emit({
        event_type: EVENTS.SOVEREIGN_MISSION_COMPLETE,
        source: 'SOVEREIGN',
        correlation_id: event.correlation_id,
        timestamp: Date.now(),
        payload: report,
      });

      log.info('mission.complete', {
        correlation_id: event.correlation_id,
        manifest_id: manifestation.id,
        dispatched: report.dispatched,
        dispatch_kind: dispatch.kind,
      });

      if (event.correlation_id) {
        pendingResults.resolve(event.correlation_id, { ok: true, report });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('mission.error', { correlation_id: event.correlation_id, error: msg });
      if (event.correlation_id) {
        pendingResults.resolve(event.correlation_id, { ok: false, error: msg });
      }
    }
  });

  log.info('ueb.handler.registered', {
    handler: 'missionHandler',
    event: EVENTS.SOVEREIGN_MISSION_DEFINE,
  });
}
