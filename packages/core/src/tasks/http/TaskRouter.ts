/**
 * tasks/http/TaskRouter.ts
 * HTTP surface for tasks.
 *   GET    /tasks               list (?projectId=&status=&goalId=&assignedAgentId=)
 *   POST   /tasks               create
 *   GET    /tasks/:id           fetch one
 *   PATCH  /tasks/:id           update
 *   DELETE /tasks/:id           remove
 */

import { Router, Request, Response } from 'express';
import { TaskService } from '../api/TaskService';
import { TaskStatus, TaskPriority } from '../models/Task';
import { ValidationError, NotFoundError } from '../../shared/types/errors';
import { log } from '../../shared/logger';

const VALID_STATUSES: TaskStatus[] = ['backlog', 'ready', 'in_progress', 'review', 'blocked', 'done', 'failed'];
const VALID_PRIORITIES: TaskPriority[] = ['P0', 'P1', 'P2', 'P3'];

export function createTaskRouter(service: TaskService): Router {
  const router = Router();

  router.get('/tasks', async (req: Request, res: Response) => {
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : undefined;
    const projectId = req.query.projectId ? String(req.query.projectId) : undefined;
    const goalId = req.query.goalId ? String(req.query.goalId) : undefined;
    const assignedAgentId = req.query.assignedAgentId ? String(req.query.assignedAgentId) : undefined;
    const statusRaw = req.query.status ? String(req.query.status) : undefined;
    const status = statusRaw && VALID_STATUSES.includes(statusRaw as TaskStatus)
      ? (statusRaw as TaskStatus)
      : undefined;

    const result = await service.query({ projectId, goalId, status, assignedAgentId, limit, offset });
    res.json({ ok: true, ...result });
  });

  router.post('/tasks', async (req: Request, res: Response) => {
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
    if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
      throw new ValidationError('invalid status');
    }
    if (body.priority !== undefined && !VALID_PRIORITIES.includes(body.priority)) {
      throw new ValidationError('invalid priority');
    }

    const task = await service.create({
      projectId: body.projectId,
      goalId: typeof body.goalId === 'string' ? body.goalId : undefined,
      parentTaskId: typeof body.parentTaskId === 'string' ? body.parentTaskId : undefined,
      title: body.title,
      description: body.description,
      status: body.status,
      priority: body.priority,
      assignedAgentId: typeof body.assignedAgentId === 'string' ? body.assignedAgentId : undefined,
      dependsOn: Array.isArray(body.dependsOn) ? body.dependsOn.filter((x: unknown) => typeof x === 'string') : undefined,
      skillRequirements: Array.isArray(body.skillRequirements) ? body.skillRequirements.filter((x: unknown) => typeof x === 'string') : undefined,
      maxAttempts: typeof body.maxAttempts === 'number' ? body.maxAttempts : undefined,
    });

    log.info('tasks.http.created', { id: task.id, projectId: task.projectId });
    res.status(201).json({ ok: true, task });
  });

  router.get('/tasks/:id', async (req: Request, res: Response) => {
    const task = await service.getById(req.params.id);
    if (!task) throw new NotFoundError('task not found');
    res.json({ ok: true, task });
  });

  router.patch('/tasks/:id', async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const patch: {
      title?: string;
      description?: string;
      status?: TaskStatus;
      priority?: TaskPriority;
      assignedAgentId?: string;
      dependsOn?: string[];
      skillRequirements?: string[];
      maxAttempts?: number;
    } = {};

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
    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) throw new ValidationError('invalid status');
      patch.status = body.status;
    }
    if (body.priority !== undefined) {
      if (!VALID_PRIORITIES.includes(body.priority)) throw new ValidationError('invalid priority');
      patch.priority = body.priority;
    }
    if (body.assignedAgentId !== undefined) patch.assignedAgentId = String(body.assignedAgentId);
    if (Array.isArray(body.dependsOn)) patch.dependsOn = body.dependsOn.filter((x: unknown) => typeof x === 'string');
    if (Array.isArray(body.skillRequirements)) patch.skillRequirements = body.skillRequirements.filter((x: unknown) => typeof x === 'string');
    if (typeof body.maxAttempts === 'number') patch.maxAttempts = body.maxAttempts;

    if (Object.keys(patch).length === 0) {
      throw new ValidationError('no valid fields to update');
    }

    const updated = await service.update(req.params.id, patch);
    if (!updated) throw new NotFoundError('task not found');
    res.json({ ok: true, task: updated });
  });

  router.delete('/tasks/:id', async (req: Request, res: Response) => {
    const ok = await service.remove(req.params.id);
    if (!ok) throw new NotFoundError('task not found');
    res.json({ ok: true });
  });

  return router;
}
