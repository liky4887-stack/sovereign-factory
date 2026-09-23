/**
 * projects/storage/JsonProjectRepository.ts
 * Single-file JSON storage for projects. Whole-file rewrite on mutation.
 * Suited to mutable state (few, small records); not an append log.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { log } from '../../shared/logger';
import {
  Project,
  ProjectInput,
  ProjectUpdate,
  emptyMetrics,
} from '../models/Project';
import {
  ProjectRepository,
  ProjectQuery,
  ProjectQueryResult,
} from './ProjectRepository';

function newId(): string {
  return 'proj_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex');
}

function nowIso(): string {
  return new Date().toISOString();
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export class JsonProjectRepository implements ProjectRepository {
  private readonly filePath: string;
  private projects: Project[] = [];
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
          if (Array.isArray(parsed)) this.projects = parsed as Project[];
        } catch (err) {
          log.warn('projects.repo.parse_error', {
            path: this.filePath,
            error: err instanceof Error ? err.message : String(err),
          });
          this.projects = [];
        }
      }
    } else {
      await fs.promises.writeFile(this.filePath, '[]', { mode: 0o600 });
    }
    this.initialised = true;
    log.info('projects.repo.ready', { path: this.filePath, count: this.projects.length });
  }

  private async persist(): Promise<void> {
    await fs.promises.writeFile(this.filePath, JSON.stringify(this.projects, null, 2), { mode: 0o600 });
  }

  private ensureInit(): void {
    if (!this.initialised) throw new Error('ProjectRepository not initialised');
  }

  async create(input: ProjectInput): Promise<Project> {
    this.ensureInit();
    const now = nowIso();
    const slug = input.slug.trim().length > 0 ? input.slug.trim() : slugify(input.name);
    const project: Project = {
      id: newId(),
      name: input.name.trim(),
      slug,
      description: input.description,
      repoUrl: input.repoUrl,
      localPath: input.localPath,
      createdAt: now,
      updatedAt: now,
      archived: false,
      metrics: emptyMetrics(now),
    };
    this.projects.push(project);
    await this.persist();
    return project;
  }

  async getById(id: string): Promise<Project | null> {
    this.ensureInit();
    return this.projects.find((p) => p.id === id) ?? null;
  }

  async getBySlug(slug: string): Promise<Project | null> {
    this.ensureInit();
    return this.projects.find((p) => p.slug === slug) ?? null;
  }

  async query(q: ProjectQuery): Promise<ProjectQueryResult> {
    this.ensureInit();
    let filtered = this.projects.slice();
    if (q.archived !== undefined) filtered = filtered.filter((p) => p.archived === q.archived);
    if (q.slug) filtered = filtered.filter((p) => p.slug === q.slug);
    filtered.sort((a, b) => (a.metrics.lastActivityAt < b.metrics.lastActivityAt ? 1 : -1));
    const total = filtered.length;
    const limit = q.limit ?? 100;
    const offset = q.offset ?? 0;
    const projects = filtered.slice(offset, offset + limit);
    return { projects, total, limit, offset };
  }

  async update(id: string, patch: ProjectUpdate): Promise<Project | null> {
    this.ensureInit();
    const idx = this.projects.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    const current = this.projects[idx];
    const updated: Project = {
      ...current,
      name: patch.name ?? current.name,
      description: patch.description ?? current.description,
      repoUrl: patch.repoUrl ?? current.repoUrl,
      localPath: patch.localPath ?? current.localPath,
      archived: patch.archived ?? current.archived,
      updatedAt: nowIso(),
    };
    this.projects[idx] = updated;
    await this.persist();
    return updated;
  }

  async touch(id: string): Promise<Project | null> {
    this.ensureInit();
    const idx = this.projects.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    const current = this.projects[idx];
    const now = nowIso();
    this.projects[idx] = {
      ...current,
      updatedAt: now,
      metrics: { ...current.metrics, lastActivityAt: now },
    };
    await this.persist();
    return this.projects[idx];
  }

  async close(): Promise<void> {
    this.initialised = false;
  }
}
