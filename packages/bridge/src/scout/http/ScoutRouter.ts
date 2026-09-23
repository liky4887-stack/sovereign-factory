/**
 * routes for the GitHub Knowledge Scout, mounted at /scout.
 *
 * Endpoints:
 *   GET  /scout/status                       — counts + auth state
 *   POST /scout/search                       — search GitHub, no persistence
 *   POST /scout/ingest                       — ingest one repo by fullName
 *   POST /scout/scan                         — search + ingest top N in one call
 *   POST /scout/query                        — query stored patterns
 *   GET  /scout/repos                        — list ingested repos
 *   POST /scout/clear                        — wipe the local pattern store (dev only)
 */

import { Router, Request, Response } from 'express';
import { scout } from '../Scout';
import { ValidationError } from '../../shared/types/errors';
import { log } from '../../core/logger';

export function createScoutRouter(): Router {
  const router = Router();

  router.get('/scout/status', (_req: Request, res: Response) => {
    const s = scout.stats();
    res.json({ ok: true, ...s });
  });

  router.post('/scout/search', async (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (typeof body !== 'object') throw new ValidationError('body must be an object');
    log.info('scout.http.search', { text: body.text });
    const result = await scout.searchRepos({
      text: typeof body.text === 'string' ? body.text : undefined,
      language: typeof body.language === 'string' ? body.language : undefined,
      minStars: typeof body.minStars === 'number' ? body.minStars : undefined,
      maxStars: typeof body.maxStars === 'number' ? body.maxStars : undefined,
      topics: Array.isArray(body.topics) ? body.topics.filter((t: unknown) => typeof t === 'string') : undefined,
      license: typeof body.license === 'string' ? body.license : undefined,
      sort: typeof body.sort === 'string' ? body.sort : 'stars',
      limit: typeof body.limit === 'number' ? body.limit : 20,
    });
    res.json({ ok: true, ...result });
  });

  router.post('/scout/ingest', async (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (typeof body.fullName !== 'string' || body.fullName.length === 0) {
      throw new ValidationError('fullName is required (e.g. "vercel/next.js")');
    }
    log.info('scout.http.ingest', { fullName: body.fullName });
    const result = await scout.ingestRepo(body.fullName, { skipIfSeen: false });
    res.json({ ok: true, ...result });
  });

  router.post('/scout/scan', async (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (typeof body !== 'object') throw new ValidationError('body must be an object');
    const search = body.search ?? body;
    const maxIngest = typeof body.maxIngest === 'number' ? body.maxIngest : 5;
    log.info('scout.http.scan', { text: search.text, maxIngest });
    const summary = await scout.scanAndIngest({
      search: {
        text: typeof search.text === 'string' ? search.text : undefined,
        language: typeof search.language === 'string' ? search.language : undefined,
        minStars: typeof search.minStars === 'number' ? search.minStars : undefined,
        topics: Array.isArray(search.topics) ? search.topics.filter((t: unknown) => typeof t === 'string') : undefined,
        sort: typeof search.sort === 'string' ? search.sort : 'stars',
        limit: typeof search.limit === 'number' ? search.limit : 20,
      },
      maxIngest,
      skipAlreadyIngested: true,
    });
    res.json({ ok: true, ...summary });
  });

  router.post('/scout/query', (req: Request, res: Response) => {
    const body = req.body ?? {};
    const result = scout.queryPatterns({
      keywords: Array.isArray(body.keywords) ? body.keywords : undefined,
      tags: Array.isArray(body.tags) ? body.tags : undefined,
      kind: typeof body.kind === 'string' ? body.kind : undefined,
      domain: typeof body.domain === 'string' ? body.domain : undefined,
      minStars: typeof body.minStars === 'number' ? body.minStars : undefined,
      minConfidence: typeof body.minConfidence === 'number' ? body.minConfidence : undefined,
      licenseAllowlist: Array.isArray(body.licenseAllowlist) ? body.licenseAllowlist : undefined,
      limit: typeof body.limit === 'number' ? body.limit : 20,
    });
    res.json({ ok: true, ...result });
  });

  router.get('/scout/repos', (req: Request, res: Response) => {
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 100;
    const repos = scout.listRepos(Number.isFinite(limit) ? limit : 100);
    res.json({ ok: true, count: repos.length, repos });
  });

  router.post('/scout/clear', (_req: Request, res: Response) => {
    scout.clearStore();
    res.json({ ok: true, cleared: true });
  });

  return router;
}
