/**
 * god-mode/http/GodModeRouter.ts
 *   GET  /god-mode/logic?view=data|state|error
 *   GET  /god-mode/probability
 *   POST /god-mode/chaos       { toggles: {edgeCases,latencyStorm,dataCorruption} }
 *   GET  /god-mode/search?q=&mode=Ledger|Logs|All
 *   GET  /god-mode/project-map
 */

import { Router, Request, Response } from 'express';
import { GodModeService } from '../api/GodModeService';
import {
  LogicView, SearchMode,
  DEFAULT_CHAOS_TOGGLES,
} from '../models/GodModeState';
import { ValidationError } from '../../shared/types/errors';

const VIEWS: LogicView[] = ['data', 'state', 'error'];
const MODES: SearchMode[] = ['Code', 'Ledger', 'Docs', 'Logs', 'All'];

export function createGodModeRouter(service: GodModeService): Router {
  const router = Router();

  router.get('/god-mode/logic', async (req: Request, res: Response) => {
    const raw = String(req.query.view ?? 'data');
    if (!VIEWS.includes(raw as LogicView)) {
      throw new ValidationError(`view must be one of: ${VIEWS.join(', ')}`);
    }
    const graph = await service.getLogicGraph(raw as LogicView);
    res.json({ ok: true, graph });
  });

  router.get('/god-mode/probability', async (_req: Request, res: Response) => {
    const report = await service.getProbability();
    res.json({ ok: true, report });
  });

  router.post('/god-mode/chaos', async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const raw = body.toggles ?? {};
    const toggles = {
      edgeCases:      typeof raw.edgeCases === 'boolean'      ? raw.edgeCases      : DEFAULT_CHAOS_TOGGLES.edgeCases,
      latencyStorm:   typeof raw.latencyStorm === 'boolean'   ? raw.latencyStorm   : DEFAULT_CHAOS_TOGGLES.latencyStorm,
      dataCorruption: typeof raw.dataCorruption === 'boolean' ? raw.dataCorruption : DEFAULT_CHAOS_TOGGLES.dataCorruption,
    };
    const run = await service.runChaos(toggles);
    res.json({ ok: true, run });
  });

  router.get('/god-mode/search', async (req: Request, res: Response) => {
    const q = String(req.query.q ?? '');
    const modeRaw = String(req.query.mode ?? 'All');
    if (!MODES.includes(modeRaw as SearchMode)) {
      throw new ValidationError(`mode must be one of: ${MODES.join(', ')}`);
    }
    const result = await service.search(q, modeRaw as SearchMode);
    res.json({ ok: true, result });
  });

  router.get('/god-mode/project-map', async (_req: Request, res: Response) => {
    const map = await service.getProjectMap();
    res.json({ ok: true, map });
  });

  return router;
}
