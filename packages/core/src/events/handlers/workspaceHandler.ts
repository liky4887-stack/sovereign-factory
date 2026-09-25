import { UEB } from '../EventBus';
import { pendingResults } from '../PendingResults';
import { EVENTS, SovereignEvent } from '../types';
import { fileOperator } from '../../termux-server/services/FileOperator';
import { log } from '../../shared/logger';

interface OpPayload {
  op: 'list' | 'read' | 'write';
  path: string;
  content?: string;
}

async function emitResult(correlation_id: string | undefined, payload: unknown): Promise<void> {
  const reply: SovereignEvent<unknown> = {
    event_type: EVENTS.WORKSPACE_RESULT,
    source: 'WORKSPACE',
    correlation_id,
    timestamp: Date.now(),
    payload,
  };
  await UEB.emit(reply);
  if (correlation_id) pendingResults.resolve(correlation_id, payload);
}

export function registerWorkspaceHandler(): void {
  UEB.on<OpPayload>(EVENTS.WORKSPACE_LIST_DIR, async (event) => {
    const p = event.payload;
    const started = Date.now();
    log.info('workspace.list.start', { path: p.path, correlation_id: event.correlation_id });
    try {
      const result = await fileOperator.list(p.path);
      await emitResult(event.correlation_id, {
        op: 'list', ok: true, path: result.path,
        entries: result.entries, duration_ms: Date.now() - started,
      });
    } catch (err) {
      await emitResult(event.correlation_id, {
        op: 'list', ok: false,
        error: err instanceof Error ? err.message : String(err),
        duration_ms: Date.now() - started,
      });
    }
  });

  UEB.on<OpPayload>(EVENTS.WORKSPACE_FILE_READ, async (event) => {
    const p = event.payload;
    const started = Date.now();
    log.info('workspace.read.start', { path: p.path, correlation_id: event.correlation_id });
    try {
      const result = await fileOperator.read(p.path);
      await emitResult(event.correlation_id, {
        op: 'read', ok: true, path: result.path,
        size: result.size, content: result.content,
        duration_ms: Date.now() - started,
      });
    } catch (err) {
      await emitResult(event.correlation_id, {
        op: 'read', ok: false,
        error: err instanceof Error ? err.message : String(err),
        duration_ms: Date.now() - started,
      });
    }
  });

  UEB.on<OpPayload>(EVENTS.WORKSPACE_WRITE_FILE, async (event) => {
    const p = event.payload;
    const started = Date.now();
    log.info('workspace.write.start', { path: p.path, correlation_id: event.correlation_id });
    try {
      const result = await fileOperator.write(p.path, p.content ?? '');
      await emitResult(event.correlation_id, {
        op: 'write', ok: true, path: result.path,
        bytesWritten: result.bytesWritten,
        duration_ms: Date.now() - started,
      });
    } catch (err) {
      await emitResult(event.correlation_id, {
        op: 'write', ok: false,
        error: err instanceof Error ? err.message : String(err),
        duration_ms: Date.now() - started,
      });
    }
  });

  log.info('ueb.handler.registered', {
    handler: 'workspaceHandler',
    events: [EVENTS.WORKSPACE_LIST_DIR, EVENTS.WORKSPACE_FILE_READ, EVENTS.WORKSPACE_WRITE_FILE],
  });
}
