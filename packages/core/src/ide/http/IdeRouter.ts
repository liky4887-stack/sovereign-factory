/**
 * ide/http/IdeRouter.ts
 *   GET    /ide/session                  → single call for the whole screen
 *   GET    /ide/blueprints               → list (?projectId=)
 *   POST   /ide/blueprints               → create { projectId?, name, language?, code }
 *   GET    /ide/blueprints/:id           → fetch one
 *   PATCH  /ide/blueprints/:id           → update { name?, language?, code? }
 *   DELETE /ide/blueprints/:id           → remove
 *   POST   /ide/execute                  → run { command, args?, cwd?, timeoutMs?, blueprintId? }
 *   GET    /ide/history                  → recent runs from the ledger
 *   GET    /ide/corrections              → failed runs + blocked commands
 */

import { Router, Request, Response } from 'express';
import { IdeService } from '../api/IdeService';
import { BlueprintLanguage } from '../models/IdeState';
import { ValidationError, NotFoundError } from '../../shared/types/errors';

const LANGUAGES: BlueprintLanguage[] = ['typescript', 'javascript', 'json', 'text'];

export function createIdeRouter(service: IdeService): Router {
  const router = Router();

  router.get('/ide/session', async (req: Request, res: Response) => {
    const projectId = req.query.projectId ? String(req.query.projectId) : undefined;
    const session = await service.getSession(projectId);
    res.json({ ok: true, session });
  });

  router.get('/ide/blueprints', async (req: Request, res: Response) => {
    const projectId = req.query.projectId ? String(req.query.projectId) : undefined;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : undefined;
    const result = await service.queryBlueprints({ projectId, limit, offset });
    res.json({ ok: true, ...result });
  });

  router.post('/ide/blueprints', async (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      throw new ValidationError('name is required');
    }
    if (typeof body.code !== 'string') {
      throw new ValidationError('code is required');
    }
    if (body.language !== undefined && !LANGUAGES.includes(body.language)) {
      throw new ValidationError(`language must be one of: ${LANGUAGES.join(', ')}`);
    }
    const bp = await service.createBlueprint({
      projectId: typeof body.projectId === 'string' ? body.projectId : undefined,
      name: body.name,
      language: body.language,
      code: body.code,
    });
    res.status(201).json({ ok: true, blueprint: bp });
  });

  router.get('/ide/blueprints/:id', async (req: Request, res: Response) => {
    const bp = await service.getBlueprint(req.params.id);
    if (!bp) throw new NotFoundError('blueprint not found');
    res.json({ ok: true, blueprint: bp });
  });

  router.patch('/ide/blueprints/:id', async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const patch: { name?: string; language?: BlueprintLanguage; code?: string } = {};
    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim().length === 0) {
        throw new ValidationError('name must be a non-empty string');
      }
      patch.name = body.name;
    }
    if (body.language !== undefined) {
      if (!LANGUAGES.includes(body.language)) {
        throw new ValidationError(`language must be one of: ${LANGUAGES.join(', ')}`);
      }
      patch.language = body.language;
    }
    if (body.code !== undefined) {
      if (typeof body.code !== 'string') throw new ValidationError('code must be a string');
      patch.code = body.code;
    }
    if (Object.keys(patch).length === 0) {
      throw new ValidationError('no valid fields to update');
    }
    const bp = await service.updateBlueprint(req.params.id, patch);
    if (!bp) throw new NotFoundError('blueprint not found');
    res.json({ ok: true, blueprint: bp });
  });

  router.delete('/ide/blueprints/:id', async (req: Request, res: Response) => {
    const ok = await service.deleteBlueprint(req.params.id);
    if (!ok) throw new NotFoundError('blueprint not found');
    res.json({ ok: true });
  });

  router.post('/ide/execute', async (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (typeof body.command !== 'string' || body.command.trim().length === 0) {
      throw new ValidationError('command is required');
    }
    if (body.args !== undefined && !Array.isArray(body.args)) {
      throw new ValidationError('args must be an array of strings');
    }
    const result = await service.execute({
      command: body.command,
      args: body.args,
      cwd: typeof body.cwd === 'string' ? body.cwd : undefined,
      timeoutMs: typeof body.timeoutMs === 'number' ? body.timeoutMs : undefined,
      blueprintId: typeof body.blueprintId === 'string' ? body.blueprintId : undefined,
    });
    res.json({ ok: true, result });
  });

  router.get('/ide/history', async (req: Request, res: Response) => {
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const runs = await service.getHistory(limit);
    res.json({ ok: true, runs, total: runs.length });
  });

  router.get('/ide/corrections', async (req: Request, res: Response) => {
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
    const corrections = await service.getCorrections(limit);
    res.json({ ok: true, corrections, total: corrections.length });
  });

  return router;
}
