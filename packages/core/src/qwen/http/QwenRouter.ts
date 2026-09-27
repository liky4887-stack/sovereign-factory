// HTTP surface for the Qwen engine. Mirrors DeepSeekRouter shape so
// upstream layers treat both engines identically.
//   GET    /qwen/health              -> { ok, status }
//   GET    /qwen/credentials/status  -> { ok, status }
//   POST   /qwen/credentials         -> { ok, stored }
//   DELETE /qwen/credentials         -> { ok }
//   POST   /qwen/chat                -> { ok, response }
//   POST   /qwen/chat/stream         -> text/event-stream
//   GET    /qwen/session-tokens      -> { ok, tokens }
import { Router, Request, Response } from 'express';
import { QwenService } from '../api/QwenService';
import { injectIdentity, type InjectMode } from '../../sovereign/IdentityInjector';
import { log } from '../../shared/logger';
import {
  QwenApiError,
  QwenAuthError,
  QwenNoCredentialsError,
} from '../models/QwenErrors';

export function createQwenRouter(service: QwenService): Router {
  const router = Router();

  function sendError(res: Response, err: unknown): void {
    if (err instanceof QwenNoCredentialsError) {
      res.status(503).json({ ok: false, error: err.message, code: 'QWEN_NO_CREDS' });
      return;
    }
    if (err instanceof QwenAuthError) {
      res.status(401).json({ ok: false, error: err.message, code: 'QWEN_AUTH', qwenCode: err.qwenCode });
      return;
    }
    if (err instanceof QwenApiError) {
      res.status(502).json({ ok: false, error: err.message, code: 'QWEN_API', qwenCode: err.qwenCode });
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: message, code: 'INTERNAL' });
  }

  router.get('/health', async (_req: Request, res: Response) => {
    try {
      const status = await service.healthCheck();
      res.json({ ok: true, status });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get('/credentials/status', (_req: Request, res: Response) => {
    res.json({ ok: true, status: service.getCredentialsRedacted() });
  });

  router.get('/credentials/raw', (_req: Request, res: Response) => {
    const creds = service.getRawCredentials();
    if (!creds) {
      res.status(404).json({ ok: false, error: 'no credentials' });
      return;
    }
    res.json({
      ok: true,
      values: {
        cookies: creds.cookies,
        accessToken: creds.accessToken ?? null,
        refreshToken: creds.refreshToken ?? null,
        bxUa: creds.bxUa ?? null,
        bxUmidToken: creds.bxUmidToken ?? null,
        bxV: creds.bxV ?? null,
        timezone: creds.timezone ?? null,
        acquiredAt: creds.acquiredAt,
      },
    });
  });

  router.post('/credentials', (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      if (typeof body.cookies !== 'string' || body.cookies.trim().length === 0) {
        res.status(400).json({ ok: false, error: 'cookies is required' });
        return;
      }
      const stored = service.setCredentials(body);
      log.info('qwen.credentials.http_set', {
        cookiesLength: stored.cookiesLength,
        hasBearer: stored.hasBearer,
      });
      res.json({ ok: true, stored });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.delete('/credentials', (_req: Request, res: Response) => {
    service.clearCredentials();
    res.json({ ok: true });
  });

  router.post('/chat', async (req: Request, res: Response) => {
    try {
      const { prompt, messages, sessionId, ...options } = req.body ?? {};
      const input = Array.isArray(messages) ? messages : prompt;
      if (!input) {
        res.status(400).json({ ok: false, error: 'Provide either "prompt" (string) or "messages" (array)' });
        return;
      }
      const rawMode = (req.body && req.body.mode) === 'plan' ? 'plan' : 'chat';
      const finalInput = injectIdentity(input as any, rawMode as InjectMode);
      const result = await service.call(finalInput as any, options as any);
      res.json({ ok: true, response: result, engineId: service.id });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/chat/stream', async (req: Request, res: Response) => {
    const { prompt, messages, ...options } = req.body ?? {};
    const input = Array.isArray(messages) ? messages : prompt;
    if (!input) {
      res.status(400).json({ ok: false, error: 'Provide either "prompt" (string) or "messages" (array)' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const controller = new AbortController();
    req.on('close', () => controller.abort());

    try {
      const rawMode = (req.body && req.body.mode) === 'plan' ? 'plan' : 'chat';
      const finalInput = injectIdentity(input as any, rawMode as InjectMode);
      for await (const chunk of service.stream(finalInput as any, { ...options, signal: controller.signal } as any)) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.write(`data: ${JSON.stringify({ type: 'error', error: message })}\n\n`);
    } finally {
      res.end();
    }
  });

  router.get('/session-tokens', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      tokens: service.listCachedPathTokens().map((t) => ({
        targetPath: t.targetPath,
        expiresAt: t.expiresAt,
        preview: t.token.slice(0, 20) + '...',
      })),
    });
  });

  return router;
}
