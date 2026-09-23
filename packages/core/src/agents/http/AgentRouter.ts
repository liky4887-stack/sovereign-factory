/**
 * agents/http/AgentRouter.ts
 * HTTP surface for agents.
 *   GET    /agents           list (?role=&status=)
 *   POST   /agents           create
 *   GET    /agents/:id       fetch one
 *   PATCH  /agents/:id       update
 *   DELETE /agents/:id       remove
 */

import { Router, Request, Response } from 'express';
import { AgentService } from '../api/AgentService';
import { AgentRole, AgentStatus, ToolGrant } from '../models/Agent';
import { ValidationError, NotFoundError } from '../../shared/types/errors';
import { log } from '../../shared/logger';

const VALID_ROLES: AgentRole[] = ['ceo', 'architect', 'builder', 'reviewer', 'chaos_monkey', 'scout', 'librarian'];
const VALID_STATUSES: AgentStatus[] = ['idle', 'busy', 'paused', 'offline'];
const VALID_TOOLS = ['shell', 'git', 'http', 'filesystem', 'model'] as const;

function parseTools(input: unknown): ToolGrant[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const out: ToolGrant[] = [];
  for (const t of input) {
    if (typeof t !== 'object' || t === null) continue;
    const tool = (t as { tool?: unknown }).tool;
    const constraints = (t as { constraints?: unknown }).constraints;
    if (typeof tool !== 'string' || !VALID_TOOLS.includes(tool as typeof VALID_TOOLS[number])) continue;
    out.push({
      tool: tool as ToolGrant['tool'],
      constraints: (typeof constraints === 'object' && constraints !== null ? constraints : {}) as Record<string, unknown>,
    });
  }
  return out;
}

export function createAgentRouter(service: AgentService): Router {
  const router = Router();

  router.get('/agents', async (req: Request, res: Response) => {
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : undefined;
    const roleRaw = req.query.role ? String(req.query.role) : undefined;
    const statusRaw = req.query.status ? String(req.query.status) : undefined;
    const role = roleRaw && VALID_ROLES.includes(roleRaw as AgentRole) ? (roleRaw as AgentRole) : undefined;
    const status = statusRaw && VALID_STATUSES.includes(statusRaw as AgentStatus) ? (statusRaw as AgentStatus) : undefined;

    const result = await service.query({ role, status, limit, offset });
    res.json({ ok: true, ...result });
  });

  router.post('/agents', async (req: Request, res: Response) => {
    const body = req.body ?? {};
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      throw new ValidationError('name is required');
    }
    if (typeof body.role !== 'string' || !VALID_ROLES.includes(body.role)) {
      throw new ValidationError('valid role is required');
    }
    if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
      throw new ValidationError('invalid status');
    }

    const agent = await service.create({
      name: body.name,
      role: body.role,
      persona: typeof body.persona === 'string' ? body.persona : undefined,
      skills: Array.isArray(body.skills) ? body.skills.filter((x: unknown) => typeof x === 'string') : undefined,
      tools: parseTools(body.tools),
      status: body.status,
      maxConcurrency: typeof body.maxConcurrency === 'number' ? body.maxConcurrency : undefined,
    });

    log.info('agents.http.created', { id: agent.id, role: agent.role });
    res.status(201).json({ ok: true, agent });
  });

  router.get('/agents/:id', async (req: Request, res: Response) => {
    const agent = await service.getById(req.params.id);
    if (!agent) throw new NotFoundError('agent not found');
    res.json({ ok: true, agent });
  });

  router.patch('/agents/:id', async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const patch: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim().length === 0) {
        throw new ValidationError('name must be a non-empty string');
      }
      patch.name = body.name;
    }
    if (body.role !== undefined) {
      if (!VALID_ROLES.includes(body.role)) throw new ValidationError('invalid role');
      patch.role = body.role;
    }
    if (body.persona !== undefined) patch.persona = String(body.persona);
    if (Array.isArray(body.skills)) patch.skills = body.skills.filter((x: unknown) => typeof x === 'string');
    if (body.tools !== undefined) {
      const t = parseTools(body.tools);
      if (t !== undefined) patch.tools = t;
    }
    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) throw new ValidationError('invalid status');
      patch.status = body.status;
    }
    if (body.currentTaskId !== undefined) patch.currentTaskId = String(body.currentTaskId);
    if (typeof body.maxConcurrency === 'number') patch.maxConcurrency = body.maxConcurrency;
    if (body.stats !== undefined && typeof body.stats === 'object' && body.stats !== null) {
      patch.stats = body.stats;
    }

    if (Object.keys(patch).length === 0) {
      throw new ValidationError('no valid fields to update');
    }

    const updated = await service.update(req.params.id, patch as Parameters<typeof service.update>[1]);
    if (!updated) throw new NotFoundError('agent not found');
    res.json({ ok: true, agent: updated });
  });

  router.delete('/agents/:id', async (req: Request, res: Response) => {
    const ok = await service.remove(req.params.id);
    if (!ok) throw new NotFoundError('agent not found');
    res.json({ ok: true });
  });

  return router;
}
