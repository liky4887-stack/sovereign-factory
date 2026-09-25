import { Router, Request, Response } from 'express';
import { UEB } from '../EventBus';

export function createEventsRouter(): Router {
  const router = Router();

  router.get('/recent', (req: Request, res: Response) => {
    const limitRaw = parseInt(String(req.query.limit ?? '100'), 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 500 ? limitRaw : 100;
    const events = UEB.recent(limit);
    res.json({ ok: true, count: events.length, events });
  });

  router.get('/handlers', (_req: Request, res: Response) => {
    // The bus doesn't expose its handler table; return a static manifest
    // of the events we know are wired, so the frontend can display them.
    res.json({
      ok: true,
      known_events: [
        'CHAT.COMMAND_PARSED',
        'CHAT.REPLY_READY',
        'TERMUX.EXECUTE_COMMAND',
        'TERMUX.COMMAND_RESULT',
        'MYSTIC.MANIFEST',
        'MYSTIC.SPEC_READY',
        'GODMODE.LATENCY_STORM',
        'GODMODE.REPORT',
      ],
    });
  });

  return router;
}
