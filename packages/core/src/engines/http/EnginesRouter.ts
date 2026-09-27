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
      const rawMode = (req.body && req.body.mode) === 'plan' ? 'plan' : 'chat';
      const finalInput = injectIdentity(input as any, rawMode as InjectMode);
      const result = await engine.call(finalInput as any, options as any);
      res.json({ ok: true, engineId: engine.id, response: result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(502).json({ ok: false, error: msg, engineId: engine.id });
    }
  });

  return router;
}
