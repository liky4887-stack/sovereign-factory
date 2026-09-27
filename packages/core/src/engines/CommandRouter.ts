// Shared slash-command router for chat endpoints.
//
// Extracted from DeepSeekService.callDeepSeek so any engine route
// (/engines/:id/chat, /engines/twin/chat, /qwen/chat, /kimi/chat) can
// recognize and dispatch slash-commands the same way /deepseek/chat does.
//
// The function is pure orchestration: it emits CHAT.COMMAND_PARSED on
// the bus, awaits the pending result if the route resolves via a
// handler, formats the reply text, and returns. Callers check
// result.matched; if false, they proceed with their normal LLM call.
import { UEB, EVENTS, peekRoute, pendingResults } from '../events';

export interface DispatchResult {
  matched: boolean;
  content?: string;
  ruleName?: string;
}

export async function dispatchChatCommand(
  rawPrompt: string,
  correlation_id: string,
): Promise<DispatchResult> {
  const route = peekRoute(rawPrompt, correlation_id);
  if (!route) return { matched: false };

  const isTermuxRoute = route.ruleName === 'termux.run';
  const isWorkspaceRoute =
    route.ruleName === 'workspace.ls' ||
    route.ruleName === 'workspace.read' ||
    route.ruleName === 'workspace.write';
  const isMissionRoute = route.ruleName === 'sovereign.mission';
  const isLedgerRoute = route.ruleName === 'ledger.query';
  const isEventsRoute = route.ruleName === 'events.query';

  let commandPromise: Promise<any> | null = null;
  if (isTermuxRoute || isWorkspaceRoute || isMissionRoute || isLedgerRoute) {
    commandPromise = pendingResults.wait(correlation_id, 35000);
  }

  await UEB.emit({
    event_type: EVENTS.CHAT_COMMAND_PARSED,
    source: 'CHAT',
    timestamp: Date.now(),
    correlation_id,
    payload: { prompt: rawPrompt, correlation_id },
  });

  if (isTermuxRoute && commandPromise) {
    try {
      const r: any = await commandPromise;
      const parts: string[] = [];
      const stdout = String((r && r.stdout) || '').trimEnd();
      const stderr = String((r && r.stderr) || '').trimEnd();
      if (stdout) parts.push(stdout);
      if (stderr) parts.push('[stderr]\n' + stderr);
      parts.push('(exit ' + (r && r.exit_code != null ? r.exit_code : -1) + ')');
      return { matched: true, ruleName: route.ruleName, content: parts.join('\n') };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { matched: true, ruleName: route.ruleName, content: 'run failed: ' + msg };
    }
  }

  if (isLedgerRoute && commandPromise) {
    try {
      const lr: any = await commandPromise;
      if (!lr || lr.ok === false) {
        return { matched: true, ruleName: route.ruleName, content: 'ledger error: ' + (lr && lr.error ? lr.error : 'unknown') };
      }
      const entries = lr.entries || [];
      const head = 'ledger - ' + entries.length + ' of ' + (lr.total != null ? lr.total : entries.length) + ' entries';
      if (entries.length === 0) return { matched: true, ruleName: route.ruleName, content: head };
      const rows = entries.map((e: any) => {
        const ts = e.createdAt ? String(e.createdAt).replace('T', ' ').slice(0, 19) : '--';
        return ts + '  ' + (e.source || '?') + '  ' + (e.type || '?') + '  ' + (e.id || '');
      });
      return { matched: true, ruleName: route.ruleName, content: head + '\n' + rows.join('\n') };
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      return { matched: true, ruleName: route.ruleName, content: 'ledger failed: ' + m };
    }
  }

  if (isWorkspaceRoute && commandPromise) {
    try {
      const ws: any = await commandPromise;
      let text = '';
      if (!ws || ws.ok === false) {
        text = 'workspace error: ' + (ws && ws.error ? ws.error : 'unknown');
      } else if (ws.op === 'list') {
        const lines = (ws.entries || []).map((e: any) =>
          e.type.padEnd(5) + '  ' + String(e.size).padStart(8) + '  ' + e.name
        );
        text = (ws.path || '') + '\n' + lines.join('\n');
      } else if (ws.op === 'read') {
        text = (ws.path || '') + ' (' + (ws.size != null ? ws.size : 0) + ' bytes)\n---\n' + (ws.content || '');
      } else if (ws.op === 'write') {
        text = 'wrote ' + (ws.bytesWritten != null ? ws.bytesWritten : 0) + ' bytes to ' + (ws.path || '');
      } else {
        text = JSON.stringify(ws);
      }
      return { matched: true, ruleName: route.ruleName, content: text };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { matched: true, ruleName: route.ruleName, content: 'workspace failed: ' + msg };
    }
  }

  if (isMissionRoute && commandPromise) {
    try {
      const mr: any = await commandPromise;
      if (!mr || mr.ok === false) {
        return { matched: true, ruleName: route.ruleName, content: 'mission failed: ' + (mr && mr.error ? mr.error : 'unknown') };
      }
      const r = mr.report;
      const lines: string[] = [];
      lines.push('mission ' + r.id + ' \u2014 "' + r.intention.slice(0, 60) + '"');
      lines.push('ledger: ' + r.ledgerEntryId);
      lines.push('dispatched ' + r.dispatched + ' step(s):');
      (r.steps || []).forEach((st: any) => {
        lines.push('  ' + st.order + '. ' + st.action);
        lines.push('     \u2514 ' + st.rationale);
      });
      if (r.dispatch && r.dispatch.kind && r.dispatch.kind !== 'audit') {
        lines.push('');
        lines.push('dispatched: ' + r.dispatch.kind + ' -> ' + (r.dispatch.event_type || '?'));
        if (r.dispatch.error) lines.push('  error: ' + r.dispatch.error);
        else if (r.dispatch.kind === 'write' && r.dispatch.payload && r.dispatch.payload.path) {
          lines.push('  path: ' + r.dispatch.payload.path);
        }
      } else if (r.dispatch) {
        lines.push('');
        lines.push('dispatched: (no concrete action - audit only)');
      }
      return { matched: true, ruleName: route.ruleName, content: lines.join('\n') };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { matched: true, ruleName: route.ruleName, content: 'mission failed: ' + msg };
    }
  }

  if (isEventsRoute) {
    const mm = rawPrompt.match(/^(?:\/events|!events)(?:\s+(\d+))?$/i);
    const limit = mm && mm[1] ? Math.max(1, Math.min(200, parseInt(mm[1], 10))) : 20;
    const evs = UEB.recent(limit);
    const lines = evs.map((e: any) => {
      const ts = new Date(e.timestamp).toISOString().replace('T', ' ').slice(0, 19);
      return ts + '  ' + (e.source || '?') + '  ' + (e.event_type || '?');
    });
    const text = 'events - ' + evs.length + ' recent' + (lines.length ? '\n' + lines.join('\n') : '');
    return { matched: true, ruleName: route.ruleName, content: text };
  }

  return { matched: true, ruleName: route.ruleName, content: route.receipt };
}
