/**
 * tasks/storage/JsonTaskRepository.ts
 * Single-file JSON storage for tasks. Whole-file rewrite on mutation.
 * Status transitions maintain startedAt / completedAt automatically.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { log } from '../../shared/logger';
import {
  Task,
  TaskInput,
  TaskUpdate,
} from '../models/Task';
import {
  TaskRepository,
  TaskQuery,
  TaskQueryResult,
} from './TaskRepository';

function newId(): string {
  return 'task_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex');
}

function nowIso(): string {
  return new Date().toISOString();
}

export class JsonTaskRepository implements TaskRepository {
  private readonly filePath: string;
  private tasks: Task[] = [];
  private initialised = false;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async init(): Promise<void> {
    if (this.initialised) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (fs.existsSync(this.filePath)) {
      const raw = await fs.promises.readFile(this.filePath, 'utf8');
      if (raw.trim().length > 0) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) this.tasks = parsed as Task[];
        } catch (err) {
          log.warn('tasks.repo.parse_error', {
            path: this.filePath,
            error: err instanceof Error ? err.message : String(err),
          });
          this.tasks = [];
        }
      }
    } else {
      await fs.promises.writeFile(this.filePath, '[]', { mode: 0o600 });
    }
    this.initialised = true;
    log.info('tasks.repo.ready', { path: this.filePath, count: this.tasks.length });
  }

  private async persist(): Promise<void> {
    await fs.promises.writeFile(this.filePath, JSON.stringify(this.tasks, null, 2), { mode: 0o600 });
  }

  private ensureInit(): void {
    if (!this.initialised) throw new Error('TaskRepository not initialised');
  }

  async create(input: TaskInput): Promise<Task> {
    this.ensureInit();
    const now = nowIso();
    const task: Task = {
      id: newId(),
      projectId: input.projectId,
      goalId: input.goalId,
      parentTaskId: input.parentTaskId,
      title: input.title.trim(),
      description: input.description,
      status: input.status ?? 'backlog',
      priority: input.priority ?? 'P2',
      assignedAgentId: input.assignedAgentId,
      dependsOn: input.dependsOn ?? [],
      skillRequirements: input.skillRequirements ?? [],
      createdAt: now,
      updatedAt: now,
      attempts: 0,
      maxAttempts: input.maxAttempts ?? 3,
      executionLogIds: [],
    };
    this.tasks.push(task);
    await this.persist();
    return task;
  }

  async getById(id: string): Promise<Task | null> {
    this.ensureInit();
    return this.tasks.find((t) => t.id === id) ?? null;
  }

  async query(q: TaskQuery): Promise<TaskQueryResult> {
    this.ensureInit();
    let filtered = this.tasks.slice();
    if (q.projectId) filtered = filtered.filter((t) => t.projectId === q.projectId);
    if (q.goalId) filtered = filtered.filter((t) => t.goalId === q.goalId);
    if (q.status) filtered = filtered.filter((t) => t.status === q.status);
    if (q.assignedAgentId) filtered = filtered.filter((t) => t.assignedAgentId === q.assignedAgentId);
    filtered.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    const total = filtered.length;
    const limit = q.limit ?? 100;
    const offset = q.offset ?? 0;
    const tasks = filtered.slice(offset, offset + limit);
    return { tasks, total, limit, offset };
  }

  async update(id: string, patch: TaskUpdate): Promise<Task | null> {
    this.ensureInit();
    const idx = this.tasks.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    const current = this.tasks[idx];
    const now = nowIso();

    const nextStatus = patch.status ?? current.status;
    const startedAt =
      current.startedAt ??
      (nextStatus === 'in_progress' || nextStatus === 'review' || nextStatus === 'done'
        ? now
        : undefined);
    const completedAt =
      current.completedAt ??
      (nextStatus === 'done' || nextStatus === 'failed' ? now : undefined);

    const updated: Task = {
      ...current,
      title: patch.title ?? current.title,
      description: patch.description ?? current.description,
      status: nextStatus,
      priority: patch.priority ?? current.priority,
      assignedAgentId: patch.assignedAgentId ?? current.assignedAgentId,
      dependsOn: patch.dependsOn ?? current.dependsOn,
      skillRequirements: patch.skillRequirements ?? current.skillRequirements,
      maxAttempts: patch.maxAttempts ?? current.maxAttempts,
      updatedAt: now,
      startedAt,
      completedAt,
    };
    this.tasks[idx] = updated;
    await this.persist();
    return updated;
  }

  async remove(id: string): Promise<boolean> {
    this.ensureInit();
    const idx = this.tasks.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    this.tasks.splice(idx, 1);
    await this.persist();
    return true;
  }

  async close(): Promise<void> {
    this.initialised = false;
  }
}
