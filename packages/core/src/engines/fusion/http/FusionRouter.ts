/**
 * routes for the Cross-Domain Fusion Engine, mounted at /fusion.
 *
 * Endpoints:
 *   GET  /fusion/status              — mechanism count + domain list
 *   GET  /fusion/domains             — full domain list
 *   POST /fusion/fuse                — run the full pipeline for a goal
 *   POST /fusion/abstract            — inspect abstraction alone
 *   POST /fusion/match               — inspect analogy matches alone
 */

import { Router, Request, Response } from 'express';
import { fusionEngine } from '../FusionEngine';
import { abstractionEngine } from '../AbstractionEngine';
import { analogyEngine } from '../AnalogyEngine';
import { ValidationError } from '../../shared/types/errors';
import { log } from '../../core/logger';
import type { Domain, Mechanism } from '../types';

export function createFusionRouter(): Router {
  const router = Router();

  router.get('/fusion/status', (_req: Request, res: Response) => {
    const stats = fusionEngine.stats();
    res.json({ ok: true, ...stats, domains: fusionEngine.listDomains() });
  });

  router.get('/fusion/domains', (_req: Request, res: Response) => {
    res.json({ ok: true, domains: fusionEngine.listDomains() });
  });

  router.post('/fusion/fuse', (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (typeof body.goal !== 'string' || body.goal.length === 0) {
      throw new ValidationError('goal is required');
    }

    log.info('fusion.http.fuse', { goal: body.goal.slice(0, 80) });

    const result = fusionEngine.fuse({
      goal: body.goal,
      constraints: Array.isArray(body.constraints) ? body.constraints : undefined,
      allowedDomains: Array.isArray(body.allowedDomains) ? (body.allowedDomains as Domain[]) : undefined,
      maxResults: typeof body.maxResults === 'number' ? body.maxResults : undefined,
      minFitScore: typeof body.minFitScore === 'number' ? body.minFitScore : undefined,
      intensityCeiling: typeof body.intensityCeiling === 'string'
        ? (body.intensityCeiling as Mechanism['intensity'])
        : undefined,
    });

    res.json({ ok: true, ...result });
  });

  router.post('/fusion/abstract', (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (typeof body.goal !== 'string' || body.goal.length === 0) {
      throw new ValidationError('goal is required');
    }
    const abstraction = abstractionEngine.abstract(
      body.goal,
      Array.isArray(body.constraints) ? body.constraints : [],
    );
    res.json({ ok: true, abstraction });
  });

  router.post('/fusion/match', (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (typeof body.goal !== 'string' || body.goal.length === 0) {
      throw new ValidationError('goal is required');
    }
    const abstraction = abstractionEngine.abstract(
      body.goal,
      Array.isArray(body.constraints) ? body.constraints : [],
    );
    const analogies = analogyEngine.match(abstraction, {
      allowedDomains: Array.isArray(body.allowedDomains) ? (body.allowedDomains as Domain[]) : undefined,
      intensityCeiling: typeof body.intensityCeiling === 'string'
        ? (body.intensityCeiling as Mechanism['intensity'])
        : undefined,
      minFitScore: typeof body.minFitScore === 'number' ? body.minFitScore : undefined,
      maxResults: typeof body.maxResults === 'number' ? body.maxResults : undefined,
    });
    res.json({ ok: true, abstraction, analogies });
  });

  return router;
}
