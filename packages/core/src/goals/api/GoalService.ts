/**
 * goals/api/GoalService.ts
 * Business logic for goals. Thin wrapper over GoalRepository.
 */

import { log } from '../../shared/logger';
import { Goal, GoalInput, GoalUpdate } from '../models/Goal';
import {
  GoalRepository,
  GoalQuery,
  GoalQueryResult,
} from '../storage/GoalRepository';
import { JsonGoalRepository } from '../storage/JsonGoalRepository';

export class GoalService {
  private repo: GoalRepository;
  private initialised = false;

  constructor(repo?: GoalRepository) {
    this.repo = repo ?? new JsonGoalRepository('');
  }

  setRepository(repo: GoalRepository): void {
    this.repo = repo;
    this.initialised = false;
  }

  async init(): Promise<void> {
    if (this.initialised) return;
    await this.repo.init();
    this.initialised = true;
    log.info('goals.service.ready', { count: (await this.repo.query({})).total });
  }

  private async ensureInit(): Promise<void> {
    if (!this.initialised) await this.init();
  }

  async create(input: GoalInput): Promise<Goal> {
    await this.ensureInit();
    const g = await this.repo.create(input);
    log.info('goals.created', { id: g.id, projectId: g.projectId, priority: g.priority });
    return g;
  }

  async getById(id: string): Promise<Goal | null> {
    await this.ensureInit();
    return this.repo.getById(id);
  }

  async query(q: GoalQuery): Promise<GoalQueryResult> {
    await this.ensureInit();
    return this.repo.query(q);
  }

  async update(id: string, patch: GoalUpdate): Promise<Goal | null> {
    await this.ensureInit();
    const g = await this.repo.update(id, patch);
    if (g) log.info('goals.updated', { id, fields: Object.keys(patch) });
    return g;
  }

  async linkTask(goalId: string, taskId: string): Promise<Goal | null> {
    await this.ensureInit();
    const g = await this.repo.addTaskId(goalId, taskId);
    if (g) log.info('goals.task_linked', { goalId, taskId });
    return g;
  }

  async unlinkTask(goalId: string, taskId: string): Promise<Goal | null> {
    await this.ensureInit();
    const g = await this.repo.removeTaskId(goalId, taskId);
    if (g) log.info('goals.task_unlinked', { goalId, taskId });
    return g;
  }

  async remove(id: string): Promise<boolean> {
    await this.ensureInit();
    const ok = await this.repo.remove(id);
    if (ok) log.info('goals.removed', { id });
    return ok;
  }

  async close(): Promise<void> {
    if (!this.initialised) return;
    await this.repo.close();
    this.initialised = false;
  }
}
