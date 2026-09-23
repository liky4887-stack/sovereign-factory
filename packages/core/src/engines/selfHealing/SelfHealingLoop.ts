/**
 * SelfHealingLoop — periodic observer that watches for anomalies.
 *
 * Heuristics:
 *   - If the last N ledger entries contain >= 3 ERROR / TASK_FAILED events,
 *     propose a config update via SelfEvolutionEngine.
 *   - If ledger verification fails, refuse to act and log the failure.
 *
 * Interval: SELF_HEAL_INTERVAL_MS (default 60_000).
 * Cites P1 (never mutate ledger), P3 (log every action).
 */

import { ledger } from '../ledger/TruthLedger';
import { evolution } from '../evolution/SelfEvolutionEngine';

const INTERVAL_MS = parseInt(
  process.env.SELF_HEAL_INTERVAL_MS ?? '60000',
  10,
);

export class SelfHealingLoop {
  private timer: NodeJS.Timeout | null = null;

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick().catch(() => {}), INTERVAL_MS);
    if (this.timer.unref) this.timer.unref();
    ledger.appendEntry({
      actor: 'selfHealingLoop',
      eventType: 'SELF_HEAL',
      payload: { action: 'started', intervalMs: INTERVAL_MS },
    });
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    ledger.appendEntry({
      actor: 'selfHealingLoop',
      eventType: 'SELF_HEAL',
      payload: { action: 'stopped' },
    });
  }

  async tick(): Promise<void> {
    const verify = ledger.verifyLedger();
    if (!verify.ok) {
      ledger.appendEntry({
        actor: 'selfHealingLoop',
        eventType: 'VERIFY_FAIL',
        payload: { brokenAt: verify.brokenAt, reason: verify.reason },
      });
      return;
    }

    const recent = ledger.getSummary(50);
    const failures = recent.filter(
      (e) => e.eventType === 'ERROR' || e.eventType === 'TASK_FAILED',
    );

    if (failures.length >= 3) {
      const candidate = evolution.proposeUpdate({
        recentErrorCount: failures.length,
        averageTaskLatencyMs: 0,
      });
      evolution.applyUpdate(candidate);

      ledger.appendEntry({
        actor: 'selfHealingLoop',
        eventType: 'SELF_HEAL',
        payload: {
          action: 'config_updated',
          newVersion: candidate.version,
          trigger: failures.length + ' recent failures',
        },
      });
    }
  }
}

export const selfHealingLoop = new SelfHealingLoop();
