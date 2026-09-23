/**
 * projects/api/ProjectService.ts
 * Business logic for projects. Thin wrapper over ProjectRepository.
 * Mirrors the LedgerService pattern: lazy init, pass-throughs, logging.
 */

import { log } from '../../shared/logger';
import {
  Project,
  ProjectInput,
  ProjectUpdate,
} from '../models/Project';
import {
  ProjectRepository,
  ProjectQuery,
  ProjectQueryResult,
} from '../storage/ProjectRepository';
import { JsonProjectRepository } from '../storage/JsonProjectRepository';

export class ProjectService {
  private repo: ProjectRepository;
  private initialised = false;

  constructor(repo?: ProjectRepository) {
    this.repo = repo ?? new JsonProjectRepository('');
  }

  setRepository(repo: ProjectRepository): void {
    this.repo = repo;
    this.initialised = false;
  }

  async init(): Promise<void> {
    if (this.initialised) return;
    await this.repo.init();
    this.initialised = true;
    log.info('projects.service.ready', { count: (await this.repo.query({})).total });
  }

  private async ensureInit(): Promise<void> {
    if (!this.initialised) await this.init();
  }

  async create(input: ProjectInput): Promise<Project> {
    await this.ensureInit();
    const p = await this.repo.create(input);
    log.info('projects.created', { id: p.id, slug: p.slug });
    return p;
  }

  async getById(id: string): Promise<Project | null> {
    await this.ensureInit();
    return this.repo.getById(id);
  }

  async getBySlug(slug: string): Promise<Project | null> {
    await this.ensureInit();
    return this.repo.getBySlug(slug);
  }

  async query(q: ProjectQuery): Promise<ProjectQueryResult> {
    await this.ensureInit();
    return this.repo.query(q);
  }

  async update(id: string, patch: ProjectUpdate): Promise<Project | null> {
    await this.ensureInit();
    const p = await this.repo.update(id, patch);
    if (p) log.info('projects.updated', { id, fields: Object.keys(patch) });
    return p;
  }

  async touch(id: string): Promise<Project | null> {
    await this.ensureInit();
    return this.repo.touch(id);
  }

  async close(): Promise<void> {
    if (!this.initialised) return;
    await this.repo.close();
    this.initialised = false;
  }
}
