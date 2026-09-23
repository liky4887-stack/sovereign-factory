/**
 * goals/storage/JsonGoalRepository.ts
 * Single-file JSON storage for goals. Whole-file rewrite on mutation.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { log } from '../../shared/logger';
import {
  Goal,
  GoalInput,
  GoalUpdate,
} from '../models/Goal';
import {
  GoalRepository,
  GoalQuery,
  GoalQueryResult,
} from './GoalRepository';

function newId(): string {
  return 'goal_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex');
}

function nowIso(): string {
  return new Date().toISOString();
}

export class JsonGoalRepository implements GoalRepository {
  private readonly filePath: string;
  private goals: Goal[] = [];
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
          if (Array.isArray(parsed)) this.goals = parsed as Goal[];
        } catch (err) {
          log.warn('goals.repo.parse_error', {
            path: this.filePath,
            error: err instanceof Error ? err.message : String(err),
          });
          this.goals = [];
        }
      }
    } else {
      await fs.promises.writeFile(this.filePath, '[]', { mode: 0o600 });
    }
    this.initialised = true;
    log.info('goals.repo.ready', { path: this.filePath, count: this.goals.length });
  }

  private async persist(): Promise<void> {
    await fs.promises.writeFile(this.filePath, JSON.stringify(this.goals, null, 2), { mode: 0o600 });
  }

  private ensureInit(): void {
    if (!this.initialised) throw new Error('GoalRepository not initialised');
  }

  async create(input: GoalInput): Promise<Goal> {
    this.ensureInit();
    const now = nowIso();
    const goal: Goal = {
      id: newId(),
      projectId: input.projectId,
      title: input.title.trim(),
      description: input.description,
      constraints: input.constraints ?? [],
      priority: input.priority ?? 'P2',
      status: input.status ?? 'draft',
      createdAt: now,
      updatedAt: now,
      taskIds: [],
      createdBy: input.createdBy ?? 'ceo',
    };
    this.goals.push(goal);
    await this.persist();
    return goal;
  }

  async getById(id: string): Promise<Goal | null> {
    this.ensureInit();
    return this.goals.find((g) => g.id === id) ?? null;
  }

  async query(q: GoalQuery): Promise<GoalQueryResult> {
    this.ensureInit();
    let filtered = this.goals.slice();
    if (q.projectId) filtered = filtered.filter((g) => g.projectId === q.projectId);
    if (q.status) filtered = filtered.filter((g) => g.status === q.status);
    if (q.priority) filtered = filtered.filter((g) => g.priority === q.priority);
    filtered.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    const total = filtered.length;
    const limit = q.limit ?? 100;
    const offset = q.offset ?? 0;
    const goals = filtered.slice(offset, offset + limit);
    return { goals, total, limit, offset };
  }

  async update(id: string, patch: GoalUpdate): Promise<Goal | null> {
    this.ensureInit();
    const idx = this.goals.findIndex((g) => g.id === id);
    if (idx === -1) return null;
    const current = this.goals[idx];
    const updated: Goal = {
      ...current,
      title: patch.title ?? current.title,
      description: patch.description ?? current.description,
      constraints: patch.constraints ?? current.constraints,
      priority: patch.priority ?? current.priority,
      status: patch.status ?? current.status,
      updatedAt: nowIso(),
    };
    this.goals[idx] = updated;
    await this.persist();
    return updated;
  }

  async addTaskId(goalId: string, taskId: string): Promise<Goal | null> {
    this.ensureInit();
    const idx = this.goals.findIndex((g) => g.id === goalId);
    if (idx === -1) return null;
    const current = this.goals[idx];
    if (current.taskIds.includes(taskId)) return current;
    const updated: Goal = {
      ...current,
      taskIds: [...current.taskIds, taskId],
      updatedAt: nowIso(),
    };
    this.goals[idx] = updated;
    await this.persist();
    return updated;
  }

  async removeTaskId(goalId: string, taskId: string): Promise<Goal | null> {
    this.ensureInit();
    const idx = this.goals.findIndex((g) => g.id === goalId);
    if (idx === -1) return null;
    const current = this.goals[idx];
    if (!current.taskIds.includes(taskId)) return current;
    const updated: Goal = {
      ...current,
      taskIds: current.taskIds.filter((id) => id !== taskId),
      updatedAt: nowIso(),
    };
    this.goals[idx] = updated;
    await this.persist();
    return updated;
  }

  async remove(id: string): Promise<boolean> {
    this.ensureInit();
    const idx = this.goals.findIndex((g) => g.id === id);
    if (idx === -1) return false;
    this.goals.splice(idx, 1);
    await this.persist();
    return true;
  }

  async close(): Promise<void> {
    this.initialised = false;
  }
}
