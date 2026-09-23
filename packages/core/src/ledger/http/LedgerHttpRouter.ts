import { Router, Request, Response } from 'express';
import { LedgerService } from '../api/LedgerService';
import { LedgerEntryType, LedgerQuery } from '../models/LedgerEntry';
import { ValidationError } from '../../shared/types/errors';
import { log } from '../../shared/logger';

export function createLedgerRouter(service: LedgerService): Router {
  const router = Router();

  router.post('/ledger/append', async (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (typeof body.type !== 'string' || typeof body.source !== 'string') {
      throw new ValidationError('type and source are required');
    }
    if (typeof body.payload !== 'object' || body.payload === null) {
      throw new ValidationError('payload must be an object');
    }

    const entry = await service.append({
      type: body.type as LedgerEntryType,
      source: body.source,
      payload: body.payload as Record<string, unknown>,
      correlationId: typeof body.correlationId === 'string' ? body.correlationId : undefined,
      tags: Array.isArray(body.tags) ? body.tags.filter((t: unknown) => typeof t === 'string') : [],
    });

    log.info('ledger.append', { id: entry.id, type: entry.type });
    res.status(201).json({ ok: true, entry });
  });

  router.get('/ledger/query', async (req: Request, res: Response) => {
    const q: LedgerQuery = {
      type: req.query.type as LedgerEntryType | undefined,
      source: req.query.source as string | undefined,
      correlationId: req.query.correlationId as string | undefined,
      tags: req.query.tags ? String(req.query.tags).split(',').map((s) => s.trim()) : undefined,
      since: req.query.since as string | undefined,
      until: req.query.until as string | undefined,
      limit: req.query.limit ? parseInt(String(req.query.limit), 10) : undefined,
      offset: req.query.offset ? parseInt(String(req.query.offset), 10) : undefined,
    };
    const result = await service.query(q);
    res.json({ ok: true, ...result });
  });

  router.get('/ledger/entry/:id', async (req: Request, res: Response) => {
    const entry = await service.getById(req.params.id);
    if (!entry) return res.status(404).json({ ok: false, error: 'not_found' });
    res.json({ ok: true, entry });
  });

  router.get('/ledger/integrity', async (_req: Request, res: Response) => {
    const result = await service.verifyIntegrity();
    res.json({ ok: true, integrity: result, count: await service.count() });
  });

  return router;
}
