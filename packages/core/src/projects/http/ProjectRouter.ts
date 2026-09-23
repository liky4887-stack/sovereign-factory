/**
 * projects/http/ProjectRouter.ts
 * HTTP surface for projects.
 *   GET    /projects          list
 *   POST   /projects          create
 *   GET    /projects/:id      fetch one
 *   PATCH  /projects/:id      update
 * Mirrors the LedgerHttpRouter pattern — factory, ValidationError, ok envelopes.
 */

import { Router, Request, Response } from 'express';
import { ProjectService } from '../api/ProjectService';
import { ValidationError, NotFoundError } from '../../shared/types/errors';
import { log } from '../../shared/logger';

export function createProjectRouter(service: ProjectService): Router {
  const router = Router();

  router.get('/projects', async (req: Request, res: Response) => {
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : undefined;
    const archived =
      req.query.archived === undefined
        ? undefined
        : String(req.query.archived) === 'true';
    const slug = req.query.slug ? String(req.query.slug) : undefined;

    const result = await service.query({ archived, slug, limit, offset });
    res.json({ ok: true, ...result });
  });

  router.post('/projects', async (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      throw new ValidationError('name is required');
    }
    if (typeof body.description !== 'string') {
      throw new ValidationError('description is required');
    }
    const slug = typeof body.slug === 'string' ? body.slug : '';
    const repoUrl = typeof body.repoUrl === 'string' ? body.repoUrl : undefined;
    const localPath = typeof body.localPath === 'string' ? body.localPath : undefined;

    const project = await service.create({
      name: body.name,
      slug,
      description: body.description,
      repoUrl,
      localPath,
    });

    log.info('projects.http.created', { id: project.id });
    res.status(201).json({ ok: true, project });
  });

  router.get('/projects/:id', async (req: Request, res: Response) => {
    const project = await service.getById(req.params.id);
    if (!project) throw new NotFoundError('project not found');
    res.json({ ok: true, project });
  });

  router.patch('/projects/:id', async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const patch: {
      name?: string;
      description?: string;
      repoUrl?: string;
      localPath?: string;
      archived?: boolean;
    } = {};

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim().length === 0) {
        throw new ValidationError('name must be a non-empty string');
      }
      patch.name = body.name;
    }
    if (body.description !== undefined) {
      if (typeof body.description !== 'string') {
        throw new ValidationError('description must be a string');
      }
      patch.description = body.description;
    }
    if (body.repoUrl !== undefined) patch.repoUrl = String(body.repoUrl);
    if (body.localPath !== undefined) patch.localPath = String(body.localPath);
    if (body.archived !== undefined) {
      if (typeof body.archived !== 'boolean') {
        throw new ValidationError('archived must be a boolean');
      }
      patch.archived = body.archived;
    }

    if (Object.keys(patch).length === 0) {
      throw new ValidationError('no valid fields to update');
    }

    const updated = await service.update(req.params.id, patch);
    if (!updated) throw new NotFoundError('project not found');
    res.json({ ok: true, project: updated });
  });

  return router;
}
