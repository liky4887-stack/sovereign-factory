import { UEB } from '../EventBus';
import { pendingResults } from '../PendingResults';
import { EVENTS, SovereignEvent } from '../types';
import { MysticRealmService } from '../../mystic-realm/api/MysticRealmService';
import { log } from '../../shared/logger';

interface MissionDefinePayload {
  goal: string;
  correlation_id?: string;
}

interface MissionReport {
  id: string;
  intention: string;
  steps: Array<{ order: number; action: string; rationale: string }>;
  ledgerEntryId: string;
  dispatched: number;
  completedAt: string;
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
      // Step 1: produce a plan via the Mystic Realm.
      const manifestation = await mystic.manifest(goal);
      log.info('mission.manifest', {
        correlation_id: event.correlation_id,
        manifest_id: manifestation.id,
        step_count: manifestation.steps.length,
        ledger_entry: manifestation.ledgerEntryId,
      });

      // Step 2: emit one SOVEREIGN.MISSION_STEP per plan step so any
      // downstream module can subscribe without the mission handler
      // needing to classify them.
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
      }

      const report: MissionReport = {
        id: manifestation.id,
        intention: manifestation.intention,
        steps: manifestation.steps,
        ledgerEntryId: manifestation.ledgerEntryId,
        dispatched: manifestation.steps.length,
        completedAt: new Date().toISOString(),
      };

      const done: SovereignEvent<MissionReport> = {
        event_type: EVENTS.SOVEREIGN_MISSION_COMPLETE,
        source: 'SOVEREIGN',
        correlation_id: event.correlation_id,
        timestamp: Date.now(),
        payload: report,
      };
      await UEB.emit(done);

      log.info('mission.complete', {
        correlation_id: event.correlation_id,
        manifest_id: manifestation.id,
        dispatched: report.dispatched,
      });

      if (event.correlation_id) {
        pendingResults.resolve(event.correlation_id, { ok: true, report });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('mission.error', {
        correlation_id: event.correlation_id,
        error: msg,
      });
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
