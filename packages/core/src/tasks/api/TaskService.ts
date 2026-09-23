/**
 * tasks/api/TaskService.ts
 * Business logic for tasks. Thin wrapper over TaskRepository.
 */

import { log } from '../../shared/logger';
import { Task, TaskInput, TaskUpdate } from '../models/Task';
import {
  TaskRepository,
  TaskQuery,
  TaskQueryResult,
} from '../storage/TaskRepository';
import { JsonTaskRepository } from '../storage/JsonTaskRepository';

export class TaskService {
  private repo: TaskRepository;
  private initialised = false;

  constructor(repo?: TaskRepository) {
    this.repo = repo ?? new JsonTaskRepository('');
  }

  setRepository(repo: TaskRepository): void {
    this.repo = repo;
    this.initialised = false;
  }

  async init(): Promise<void> {
    if (this.initialised) return;
    await this.repo.init();
    this.initialised = true;
    log.info('tasks.service.ready', { count: (await this.repo.query({})).total });
  }

  private async ensureInit(): Promise<void> {
    if (!this.initialised) await this.init();
  }

  async create(input: TaskInput): Promise<Task> {
    await this.ensureInit();
    const t = await this.repo.create(input);
    log.info('tasks.created', { id: t.id, projectId: t.projectId, status: t.status });
    return t;
  }

  async getById(id: string): Promise<Task | null> {
    await this.ensureInit();
    return this.repo.getById(id);
  }

  async query(q: TaskQuery): Promise<TaskQueryResult> {
    await this.ensureInit();
    return this.repo.query(q);
  }

  async update(id: string, patch: TaskUpdate): Promise<Task | null> {
    await this.ensureInit();
    const t = await this.repo.update(id, patch);
    if (t) log.info('tasks.updated', { id, fields: Object.keys(patch), status: t.status });
    return t;
  }

  async remove(id: string): Promise<boolean> {
    await this.ensureInit();
    const ok = await this.repo.remove(id);
    if (ok) log.info('tasks.removed', { id });
    return ok;
  }

  async close(): Promise<void> {
    if (!this.initialised) return;
    await this.repo.close();
    this.initialised = false;
  }
}
