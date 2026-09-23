/**
 * projects/storage/ProjectRepository.ts
 * Storage contract for projects. Mutable state, not an append-only log.
 */

import { Project, ProjectInput, ProjectUpdate } from '../models/Project';

export interface ProjectQuery {
  archived?: boolean;
  slug?: string;
  limit?: number;
  offset?: number;
}

export interface ProjectQueryResult {
  projects: Project[];
  total: number;
  limit: number;
  offset: number;
}

export interface ProjectRepository {
  init(): Promise<void>;
  create(input: ProjectInput): Promise<Project>;
  getById(id: string): Promise<Project | null>;
  getBySlug(slug: string): Promise<Project | null>;
  query(q: ProjectQuery): Promise<ProjectQueryResult>;
  update(id: string, patch: ProjectUpdate): Promise<Project | null>;
  touch(id: string): Promise<Project | null>;
  close(): Promise<void>;
}
