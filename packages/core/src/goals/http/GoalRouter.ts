/**
 * goals/http/GoalRouter.ts
 * HTTP surface for goals.
 *   GET    /goals                   list (?projectId=&status=&priority=)
 *   POST   /goals                   create
 *   GET    /goals/:id               fetch one
 *   PATCH  /goals/:id               update
 *   DELETE /goals/:id               remove
 *   POST   /goals/:id/tasks         link a task   { taskId }
 *   DELETE /goals/:id/tasks/:taskId unlink a task
 */

import { Router, Request, Response } from 'express';
import { GoalService } from '../api/GoalService';
import { GoalPriority, GoalStatus } from '../models/Goal';
import { ValidationError, NotFoundError } from '../../shared/types/errors';
import { log } from '../../shared/logger';

const VALID_PRIORITIES: GoalPriority[] = ['P0', 'P1', 'P2', 'P3'];
const VALID_STATUSES: GoalStatus[] = ['draft', 'planning', 'active', 'blocked', 'done', 'abandoned'];

export function createGoalRouter(service: GoalService): Router {
  const router = Router();

  router.get('/goals', async (req: Request, res: Response) => {
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : undefined;
    const projectId = req.query.projectId ? String(req.query.projectId) : undefined;
    const priorityRaw = req.query.priority ? String(req.query.priority) : undefined;
    const statusRaw = req.query.status ? String(req.query.status) : undefined;
    const priority = priorityRaw && VALID_PRIORITIES.includes(priorityRaw as GoalPriority) ? (priorityRaw as GoalPriority) : undefined;
    const status = statusRaw && VALID_STATUSES.includes(statusRaw as GoalStatus) ? (statusRaw as GoalStatus) : undefined;

    const result = await service.query({ projectId, priority, status, limit, offset });
    res.json({ ok: true, ...result });
  });

  router.post('/goals', async (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (typeof body.projectId !== 'string' || body.projectId.length === 0) {
      throw new ValidationError('projectId is required');
    }
    if (typeof body.title !== 'string' || body.title.trim().length === 0) {
      throw new ValidationError('title is required');
    }
    if (typeof body.description !== 'string') {
      throw new ValidationError('description is required');
    }
    if (body.priority !== undefined && !VALID_PRIORITIES.includes(body.priority)) {
      throw new ValidationError('invalid priority');
    }
    if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
      throw new ValidationError('invalid status');
    }
    if (body.createdBy !== undefined && body.createdBy !== 'ceo' && body.createdBy !== 'system') {
      throw new ValidationError('createdBy must be ceo or system');
    }

    const goal = await service.create({
      projectId: body.projectId,
      title: body.title,
      description: body.description,
      constraints: Array.isArray(body.constraints) ? body.constraints.filter((x: unknown) => typeof x === 'string') : undefined,
      priority: body.priority,
      status: body.status,
      createdBy: body.createdBy,
    });

    log.info('goals.http.created', { id: goal.id, projectId: goal.projectId });
    res.status(201).json({ ok: true, goal });
  });

  router.get('/goals/:id', async (req: Request, res: Response) => {
    const goal = await service.getById(req.params.id);
    if (!goal) throw new NotFoundError('goal not found');
    res.json({ ok: true, goal });
  });

  router.patch('/goals/:id', async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const patch: Record<string, unknown> = {};

    if (body.title !== undefined) {
      if (typeof body.title !== 'string' || body.title.trim().length === 0) {
        throw new ValidationError('title must be a non-empty string');
      }
      patch.title = body.title;
    }
    if (body.description !== undefined) {
      if (typeof body.description !== 'string') throw new ValidationError('description must be a string');
      patch.description = body.description;
    }
    if (Array.isArray(body.constraints)) patch.constraints = body.constraints.filter((x: unknown) => typeof x === 'string');
    if (body.priority !== undefined) {
      if (!VALID_PRIORITIES.includes(body.priority)) throw new ValidationError('invalid priority');
      patch.priority = body.priority;
    }
    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) throw new ValidationError('invalid status');
      patch.status = body.status;
    }

    if (Object.keys(patch).length === 0) {
      throw new ValidationError('no valid fields to update');
    }

    const updated = await service.update(req.params.id, patch as Parameters<typeof service.update>[1]);
    if (!updated) throw new NotFoundError('goal not found');
    res.json({ ok: true, goal: updated });
  });

  router.delete('/goals/:id', async (req: Request, res: Response) => {
    const ok = await service.remove(req.params.id);
    if (!ok) throw new NotFoundError('goal not found');
    res.json({ ok: true });
  });

  router.post('/goals/:id/tasks', async (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (typeof body.taskId !== 'string' || body.taskId.length === 0) {
      throw new ValidationError('taskId is required');
    }
    const goal = await service.linkTask(req.params.id, body.taskId);
    if (!goal) throw new NotFoundError('goal not found');
    res.json({ ok: true, goal });
  });

  router.delete('/goals/:id/tasks/:taskId', async (req: Request, res: Response) => {
    const goal = await service.unlinkTask(req.params.id, req.params.taskId);
    if (!goal) throw new NotFoundError('goal not found');
    res.json({ ok: true, goal });
  });

  return router;
}
