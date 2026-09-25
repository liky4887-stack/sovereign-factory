import { Router, Request, Response } from 'express';
import { DeepSeekService } from '../api/DeepSeekService';
import { UEB, EVENTS } from '../../events';
import {
  DeepSeekApiError,
  DeepSeekAuthError,
  DeepSeekNoCredentialsError,
  DeepSeekPowError,
} from '../models/DeepSeekErrors';

export function createDeepSeekRouter(service: DeepSeekService): Router {
  const router = Router();

  function sendError(res: Response, err: unknown): void {
    if (err instanceof DeepSeekNoCredentialsError) {
      res.status(503).json({ ok: false, error: err.message, code: 'DEEPSEEK_NO_CREDS' });
      return;
    }
    if (err instanceof DeepSeekAuthError) {
      res.status(401).json({ ok: false, error: err.message, code: 'DEEPSEEK_AUTH', deepseekCode: err.deepseekCode });
      return;
    }
    if (err instanceof DeepSeekPowError) {
      res.status(500).json({ ok: false, error: err.message, code: 'DEEPSEEK_POW' });
      return;
    }
    if (err instanceof DeepSeekApiError) {
      res.status(502).json({ ok: false, error: err.message, code: 'DEEPSEEK_API', deepseekCode: err.deepseekCode });
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

  router.post('/credentials', (req: Request, res: Response) => {
    try {
      const { bearerToken, cookies, hifLeim, hifDliq, deviceId } = req.body ?? {};
      const stored = service.setCredentials({ bearerToken, cookies, hifLeim, hifDliq, deviceId });
      res.json({
        ok: true,
        stored: {
          bearerLength: stored.bearerToken.length,
          cookiesLength: stored.cookies.length,
        },
      });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post('/credentials/clear', (_req: Request, res: Response) => {
    service.clearCredentials();
    res.json({ ok: true });
  });

  router.get('/credentials/status', (_req: Request, res: Response) => {
    res.json({ ok: true, status: service.getCredentialsRedacted() });
  });

  router.post('/refresh', async (req: Request, res: Response) => {
    try {
      const targetPath = typeof req.body?.targetPath === 'string' ? req.body.targetPath : undefined;
      const force = req.body?.force === true;
      const result = await service.refreshPathToken(targetPath, force);
      res.json({
        ok: true,
        tokenPreview: result.token.slice(0, 20) + '...',
        expiresAt: result.expiresAt,
      });
    } catch (err) {
      sendError(res, err);
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

  router.post('/chat', async (req: Request, res: Response) => {
    try {
      const { prompt, messages, ...options } = req.body ?? {};
      const input = Array.isArray(messages) ? messages : prompt;
      if (!input) {
        res.status(400).json({ ok: false, error: 'Provide either "prompt" (string) or "messages" (array)' });
        return;
      }
      const result = await service.callDeepSeek(input, options);

      // Persist both sides of the turn via the event bus.
      const promptText = typeof input === 'string'
        ? input
        : (Array.isArray(input) ? (input.find((m: any) => m.role === 'user')?.content ?? '') : '');
      const assistantText = (result && result.data && typeof (result.data as any).content === 'string')
        ? (result.data as any).content
        : '';

      // Await sequentially so persist order matches conversation order.
      if (promptText) {
        await UEB.emit({
          event_type: EVENTS.CHAT_USER_MESSAGE,
          source: 'CHAT',
          timestamp: Date.now(),
          payload: { prompt: promptText },
        });
      }
      if (assistantText) {
        await UEB.emit({
          event_type: EVENTS.CHAT_ASSISTANT_MESSAGE,
          source: 'CHAT',
          timestamp: Date.now(),
          payload: { content: assistantText },
        });
      }

      res.json({ ok: true, response: result });
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
      for await (const chunk of service.streamDeepSeek(input, { ...options, signal: controller.signal })) {
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
