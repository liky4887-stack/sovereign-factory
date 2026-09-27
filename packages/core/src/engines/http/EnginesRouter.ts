// HTTP surface for the engine registry and twin orchestrator.
//   GET    /engines                  list engines + status
//   GET    /engines/:id/health       per-engine health
//   POST   /engines/:id/chat         call a specific engine
//   POST   /engines/twin/chat        call ALL engines in parallel
//   GET    /engines/policy           current arbitration policy
import { Router, Request, Response } from 'express';
import { EngineRegistry } from '../EngineRegistry';
import { TwinOrchestrator } from '../TwinOrchestrator';
import { injectIdentity, type InjectMode } from '../../sovereign/IdentityInjector';
import { dispatchChatCommand } from '../CommandRouter';
import { QwenWafBlockedError } from '../../qwen/resilience';
import { QwenAuthError, QwenNoCredentialsError } from '../../qwen/models/QwenErrors';
import {
  KimiWafBlockedError,
  KimiThrottledError,
  KimiExpiredSessionError,
  KimiAuthError,
  KimiNoCredentialsError,
} from '../../kimi/models/KimiErrors';

function classifyEngineError(
  e: unknown,
  engineId: string,
): { status: number; body: Record<string, unknown> } {
  const msg = e instanceof Error ? e.message : String(e);
  if (e instanceof QwenWafBlockedError || e instanceof KimiWafBlockedError) {
    const retryAfterMs = (e as any).cooldownRemainingMs;
    return { status: 503, body: { ok: false, error: msg, code: 'WAF_COOLDOWN', engineId, ...(retryAfterMs ? { retryAfterMs } : {}) } };
  }
  if (e instanceof KimiThrottledError) {
    return { status: 429, body: { ok: false, error: msg, code: 'THROTTLED', engineId, retryAfterMs: e.retryAfterMs } };
  }
  if (e instanceof KimiExpiredSessionError) {
    return { status: 401, body: { ok: false, error: msg, code: 'EXPIRED_SESSION', engineId } };
  }
  if (e instanceof KimiAuthError || e instanceof QwenAuthError) {
    return { status: 401, body: { ok: false, error: msg, code: 'AUTH_REQUIRED', engineId } };
  }
  if (e instanceof KimiNoCredentialsError || e instanceof QwenNoCredentialsError) {
    return { status: 503, body: { ok: false, error: msg, code: 'NO_CREDS', engineId } };
  }
  return { status: 502, body: { ok: false, error: msg, code: 'ENGINE_ERROR', engineId } };
}

export function createEnginesRouter(
  registry: EngineRegistry,
  orchestrator: TwinOrchestrator,
): Router {
  const router = Router();

  // ── List engines ──────────────────────────────────────────
  router.get('/', async (_req: Request, res: Response) => {
    const engines = registry.list();
    const out: any[] = [];
    for (const e of engines) {
      let health: any = { configured: e.hasCredentials(), healthy: e.hasCredentials() };
      try { health = await e.healthCheck(); } catch {}
      out.push({
        id: e.id,
        label: e.label,
        configured: e.hasCredentials(),
        health,
      });
    }
    res.json({
      ok: true,
      count: engines.length,
      policy: orchestrator.getPolicy(),
      primaryEngineId: orchestrator.getPrimaryEngineId(),
      engines: out,
    });
  });

  // ── Policy ────────────────────────────────────────────────
  router.get('/policy', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      policy: orchestrator.getPolicy(),
      primaryEngineId: orchestrator.getPrimaryEngineId(),
      availablePolicies: ['all', 'first-available', 'fastest', 'primary-with-fallback'],
    });
  });

  // ── Twin dispatch ─────────────────────────────────────────
  // Must come BEFORE /:id/chat so 'twin' is not treated as an engine id.
  router.post('/twin/chat', async (req: Request, res: Response) => {
    try {
      const { prompt, messages, ...options } = req.body ?? {};
      const input = Array.isArray(messages) ? messages : prompt;
      if (!input) {
        res.status(400).json({ ok: false, error: 'Provide either "prompt" (string) or "messages" (array)' });
        return;
      }
      const rawMode = (req.body && req.body.mode) === 'plan' ? 'plan' : 'chat';
      const finalInput = injectIdentity(input as any, rawMode as InjectMode);
      const result = await orchestrator.callWithPolicy(finalInput as any, options as any);
      res.json({ ok: true, twin: result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // ── Per-engine health ─────────────────────────────────────
  router.get('/:id/health', async (req: Request, res: Response) => {
    const engine = registry.get(req.params.id);
    if (!engine) {
      res.status(404).json({ ok: false, error: 'engine not found: ' + req.params.id });
      return;
    }
    try {
      const status = await engine.healthCheck();
      res.json({ ok: true, engineId: engine.id, status });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // ── Per-engine chat ───────────────────────────────────────
  router.post('/:id/chat', async (req: Request, res: Response) => {
    const engine = registry.get(req.params.id);
    if (!engine) {
      res.status(404).json({ ok: false, error: 'engine not found: ' + req.params.id });
      return;
    }
    try {
      const { prompt, messages, ...options } = req.body ?? {};
      const input = Array.isArray(messages) ? messages : prompt;
      if (!input) {
        res.status(400).json({ ok: false, error: 'Provide either "prompt" (string) or "messages" (array)' });
        return;
      }
      const rawPrompt = typeof input === 'string'
        ? input
        : (Array.isArray(input)
            ? ((input.filter((m: any) => m.role === 'user').pop() as any)?.content ?? '')
            : '');
      const correlation_id = 'chat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const dispatch = await dispatchChatCommand(rawPrompt, correlation_id);
      if (dispatch.matched) {
        res.json({
          ok: true,
          engineId: engine.id,
          response: {
            code: 0,
            msg: '',
            data: { content: dispatch.content || '', chat_session_id: null, message_id: null },
          },
        });
        return;
      }
      const rawMode = (req.body && req.body.mode) === 'plan' ? 'plan' : 'chat';
      const finalInput = injectIdentity(input as any, rawMode as InjectMode);
      const result = await engine.call(finalInput as any, options as any);
      res.json({ ok: true, engineId: engine.id, response: result });
    } catch (e) {
      const { status, body } = classifyEngineError(e, engine.id);
      res.status(status).json(body);
    }
  });

  return router;
}
