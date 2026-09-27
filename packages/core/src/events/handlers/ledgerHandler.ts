import { UEB } from '../EventBus';
import { pendingResults } from '../PendingResults';
import { EVENTS, SovereignEvent } from '../types';
import { LedgerService } from '../../ledger/api/LedgerService';
import { log } from '../../shared/logger';

interface QueryPayload {
  limit: number;
}

async function emitResult(
  correlation_id: string | undefined,
  payload: unknown,
): Promise<void> {
  const reply: SovereignEvent<unknown> = {
    event_type: EVENTS.LEDGER_RESULT,
    source: 'LEDGER',
    correlation_id,
    timestamp: Date.now(),
    payload,
  };
  await UEB.emit(reply);
  if (correlation_id) pendingResults.resolve(correlation_id, payload);
}

export function registerLedgerHandler(ledger: LedgerService): void {
  UEB.on<QueryPayload>(EVENTS.LEDGER_QUERY, async (event) => {
    const p = event.payload;
    const started = Date.now();
    log.info('ledger.query.start', {
      limit: p.limit,
      correlation_id: event.correlation_id,
    });
    try {
      const result = await ledger.query({ limit: p.limit });
      await emitResult(event.correlation_id, {
        ok: true,
        entries: result.entries,
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        duration_ms: Date.now() - started,
      });
    } catch (err) {
      await emitResult(event.correlation_id, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        duration_ms: Date.now() - started,
      });
    }
  });

  log.info('ueb.handler.registered', {
    handler: 'ledgerHandler',
    events: [EVENTS.LEDGER_QUERY],
  });
}
