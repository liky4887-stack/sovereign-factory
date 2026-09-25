import { Router, Request, Response } from 'express';
import { ChatService } from '../api/ChatService';
import { ValidationError, NotFoundError } from '../../shared/types/errors';

export function createChatRouter(service: ChatService): Router {
  const router = Router();

  function sendError(res: Response, err: unknown): void {
    if (err instanceof ValidationError) { res.status(400).json({ ok: false, error: err.message }); return; }
    if (err instanceof NotFoundError) { res.status(404).json({ ok: false, error: err.message }); return; }
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, error: msg });
  }

  router.get('/sessions', async (_req: Request, res: Response) => {
    try {
      const sessions = await service.listSessions();
      res.json({ ok: true, sessions });
    } catch (err) { sendError(res, err); }
  });

  router.post('/sessions', async (req: Request, res: Response) => {
    try {
      const { id, title } = req.body ?? {};
      const session = await service.createSession(id, title ?? null);
      res.status(201).json({ ok: true, session });
    } catch (err) { sendError(res, err); }
  });

  router.get('/sessions/:id', async (req: Request, res: Response) => {
    try {
      const session = await service.getSession(req.params.id);
      res.json({ ok: true, session });
    } catch (err) { sendError(res, err); }
  });

  router.delete('/sessions/:id', async (req: Request, res: Response) => {
    try {
      await service.deleteSession(req.params.id);
      res.json({ ok: true });
    } catch (err) { sendError(res, err); }
  });

  router.get('/sessions/:id/messages', async (req: Request, res: Response) => {
    try {
      const limitRaw = parseInt(String(req.query.limit ?? '50'), 10);
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 500 ? limitRaw : 50;
      const messages = await service.getRecentMessages(req.params.id, limit);
      res.json({ ok: true, count: messages.length, messages });
    } catch (err) { sendError(res, err); }
  });

  router.post('/messages', async (req: Request, res: Response) => {
    try {
      const { sessionId, role, content } = req.body ?? {};
      const msg = await service.appendMessage(sessionId, role, content);
      res.status(201).json({ ok: true, message: msg });
    } catch (err) { sendError(res, err); }
  });

  return router;
}
