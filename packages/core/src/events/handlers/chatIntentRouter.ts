import { UEB } from '../EventBus';
import { EVENTS, SovereignEvent } from '../types';
import { ChatCommandPayload } from './chatHandler';
import { log } from '../../shared/logger';

interface RouteRule {
  name: string;
  pattern: RegExp;
  build: (m: RegExpMatchArray, ctx: ChatCommandPayload) => {
    event_type: string;
    source: string;
    payload: unknown;
    receipt: string;
  } | null;
}

const RULES: RouteRule[] = [
  {
    name: 'termux.run',
    pattern: /^(?:\/run|!run)\s+(.+)$/i,
    build: (m, ctx) => {
      const rest = m[1].trim();
      // Split "cmd arg1 arg2" — first token is the command, rest are args.
      const parts = rest.split(/\s+/);
      const cmd = parts[0];
      const args = parts.slice(1);
      return {
        event_type: EVENTS.TERMUX_EXECUTE_COMMAND,
        source: 'CHAT',
        payload: { command: cmd, args, cwd: undefined, timeout_ms: 30000 },
        receipt: `queued: ${cmd}${args.length ? ' ' + args.join(' ') : ''} (corr ${ctx.correlation_id})`,
      };
    },
  },
  {
    name: 'mystic.manifest',
    pattern: /^(?:\/manifest|!manifest)\s+(.+)$/i,
    build: (m, ctx) => ({
      event_type: EVENTS.MYSTIC_MANIFEST,
      source: 'CHAT',
      payload: { intent_text: m[1].trim(), correlation_id: ctx.correlation_id },
      receipt: `manifest queued: "${m[1].trim().slice(0, 60)}" (corr ${ctx.correlation_id})`,
    }),
  },
  {
    name: 'godmode.storm',
    pattern: /^(?:\/storm|!storm)\s+(\S+)(?:\s+(\d+))?$/i,
    build: (m, ctx) => {
      const target = m[1];
      const duration_ms = m[2] ? parseInt(m[2], 10) : 60000;
      return {
        event_type: EVENTS.GODMODE_LATENCY_STORM,
        source: 'CHAT',
        payload: { target_service: target, duration_ms, intensity: 'medium', correlation_id: ctx.correlation_id },
        receipt: `latency storm queued: target=${target} duration=${duration_ms}ms (corr ${ctx.correlation_id})`,
      };
    },
  },
  {
    name: 'workspace.ls',
    pattern: /^(?:\/ls|!ls)(?:\s+(.+))?$/i,
    build: (m, ctx) => {
      const target = (m[1] || '').trim();
      return {
        event_type: EVENTS.WORKSPACE_LIST_DIR,
        source: 'CHAT',
        payload: { op: 'list', path: target, correlation_id: ctx.correlation_id },
        receipt: 'listing: ' + (target || '(default)') + ' (corr ' + ctx.correlation_id + ')',
      };
    },
  },
  {
    name: 'workspace.read',
    pattern: /^(?:\/read|!read)\s+(.+)$/i,
    build: (m, ctx) => {
      const target = m[1].trim();
      return {
        event_type: EVENTS.WORKSPACE_FILE_READ,
        source: 'CHAT',
        payload: { op: 'read', path: target, correlation_id: ctx.correlation_id },
        receipt: 'reading: ' + target + ' (corr ' + ctx.correlation_id + ')',
      };
    },
  },
  {
    name: 'workspace.write',
    pattern: /^(?:\/write|!write)\s+(\S+)\s+([\s\S]+)$/i,
    build: (m, ctx) => {
      const target = m[1].trim();
      const content = m[2];
      return {
        event_type: EVENTS.WORKSPACE_WRITE_FILE,
        source: 'CHAT',
        payload: { op: 'write', path: target, content, correlation_id: ctx.correlation_id },
        receipt: 'writing ' + content.length + ' bytes to ' + target + ' (corr ' + ctx.correlation_id + ')',
      };
    },
  },
  {
    name: 'help',
    pattern: /^(?:\/help|!help)$/i,
    build: (_m, ctx) => ({
      event_type: EVENTS.CHAT_REPLY_READY,
      source: 'CHAT',
      payload: {
        correlation_id: ctx.correlation_id,
        text:
          'Commands: /run <cmd> [args] | /manifest <intent> | /storm <target> [duration_ms] | /help',
      },
      receipt:
        'Commands: /run <cmd> [args] | /manifest <intent> | /storm <target> [duration_ms] | /help',
    }),
  },
];

export interface RoutePeek {
  ruleName: string;
  event_type: string;
  receipt: string;
}

/**
 * Pure matcher. Returns what route WOULD fire for this prompt, or null.
 * Does not emit any events — the router handler still does the dispatch.
 */
export function peekRoute(prompt: string, correlation_id?: string): RoutePeek | null {
  const p = (prompt || '').trim();
  if (!p) return null;
  for (const rule of RULES) {
    const m = p.match(rule.pattern);
    if (!m) continue;
    const fakeCtx: ChatCommandPayload = {
      prompt: p,
      correlation_id: correlation_id ?? 'peek',
    };
    const built = rule.build(m, fakeCtx);
    if (!built) continue;
    return {
      ruleName: rule.name,
      event_type: built.event_type,
      receipt: built.receipt,
    };
  }
  return null;
}

export function registerChatIntentRouter(): void {
  UEB.on<ChatCommandPayload>(EVENTS.CHAT_COMMAND_PARSED, async (event) => {
    const ctx = event.payload;
    const prompt = (ctx.prompt || '').trim();
    if (!prompt) return;

    for (const rule of RULES) {
      const m = prompt.match(rule.pattern);
      if (!m) continue;

      const built = rule.build(m, ctx);
      if (!built) continue;

      log.info('chat.intent.routed', {
        rule: rule.name,
        correlation_id: ctx.correlation_id,
        event_type: built.event_type,
      });

      const out: SovereignEvent<unknown> = {
        event_type: built.event_type,
        source: built.source,
        correlation_id: ctx.correlation_id,
        timestamp: Date.now(),
        payload: built.payload,
      };
      await UEB.emit(out);
      return; // first match wins; do not double-dispatch
    }

    // No rule matched — normal conversation, no-op.
  });

  log.info('ueb.handler.registered', {
    handler: 'chatIntentRouter',
    event: EVENTS.CHAT_COMMAND_PARSED,
    rules: RULES.map((r) => r.name),
  });
}
