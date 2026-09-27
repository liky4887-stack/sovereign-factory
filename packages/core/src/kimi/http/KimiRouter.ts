// HTTP surface for the Kimi engine. Mirrors QwenRouter.
//   GET    /kimi/health              -> { ok, status }
//   GET    /kimi/credentials/status  -> { ok, status }
//   GET    /kimi/credentials/raw     -> { ok, values }
//   POST   /kimi/credentials         -> { ok, stored }
//   DELETE /kimi/credentials         -> { ok }
//   POST   /kimi/chat                -> { ok, response, engineId }
//   POST   /kimi/chat/stream         -> text/event-stream
//   GET    /kimi/throttle            -> { ok, state }
import { Router, Request, Response } from 'express';
import { KimiService } from '../api/KimiService';
import { log } from '../../shared/logger';
import {
  KimiApiError,
  KimiAuthError,
  KimiNoCredentialsError,
  KimiExpiredSessionError,
  KimiThrottledError,
  KimiWafBlockedError,
} from '../models/KimiErrors';

export function createKimiRouter(service: KimiService): Router {
  const router = Router();

  function sendError(res: Response, err: unknown): void {
    if (err instanceof KimiNoCredentialsError) {
      res.status(503).json({ ok: false, error: err.message, code: 'KIMI_NO_CREDS' });
      return;
    }
    if (err instanceof KimiExpiredSessionError) {
      res.status(401).json({ ok: false, error: err.message, code: 'EXPIRED_SESSION' });
      return;
    }
    if (err instanceof KimiAuthError) {
      res.status(401).json({ ok: false, error: err.message, code: 'AUTH_REQUIRED', kimiCode: err.kimiCode });
      return;
    }
    if (err instanceof KimiThrottledError) {
      res.status(429).json({
        ok: false,
        error: err.message,
        code: 'THROTTLED',
        retryAfterMs: err.retryAfterMs,
      });
      return;
    }
    if (err instanceof KimiWafBlockedError) {
      res.status(503).json({
        ok: false,
        error: err.message,
        code: 'WAF_COOLDOWN',
        retryAfterMs: err.cooldownRemainingMs,
      });
      return;
    }
    if (err instanceof KimiApiError) {
      const msg = err.message;
      const code = msg.includes('WAF') || msg.includes('captcha') ? 'WAF_COOLDOWN' : 'KIMI_API';
      const status = code === 'WAF_COOLDOWN' ? 503 : 502;
      res.status(status).json({ ok: false, error: msg, code });
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
        bearerToken: creds.bearerToken ?? null,
        csrfToken: creds.csrfToken ?? null,
        extraHeaders: creds.extraHeaders ?? null,
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
      log.info('kimi.credentials.http_set', {
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
      const { prompt, messages, ...options } = req.body ?? {};
      const input = Array.isArray(messages) ? messages : prompt;
      if (!input) {
        res.status(400).json({ ok: false, error: 'Provide either "prompt" (string) or "messages" (array)' });
        return;
      }
      const result = await service.call(input, options as any);
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
      for await (const chunk of service.stream(input, { ...options, signal: controller.signal } as any)) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.write(`data: ${JSON.stringify({ type: 'error', error: message })}\n\n`);
    } finally {
      res.end();
    }
  });

  return router;
}
