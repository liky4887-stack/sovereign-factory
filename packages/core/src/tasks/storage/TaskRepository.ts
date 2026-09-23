/**
 * tasks/storage/TaskRepository.ts
 * Storage contract for tasks. Mutable state, not an append-only log.
 */

import { Task, TaskInput, TaskUpdate, TaskStatus } from '../models/Task';

export interface TaskQuery {
  projectId?: string;
  goalId?: string;
  status?: TaskStatus;
  assignedAgentId?: string;
  limit?: number;
  offset?: number;
}

export interface TaskQueryResult {
  tasks: Task[];
  total: number;
  limit: number;
  offset: number;
}

export interface TaskRepository {
  init(): Promise<void>;
  create(input: TaskInput): Promise<Task>;
  getById(id: string): Promise<Task | null>;
  query(q: TaskQuery): Promise<TaskQueryResult>;
  update(id: string, patch: TaskUpdate): Promise<Task | null>;
  remove(id: string): Promise<boolean>;
  close(): Promise<void>;
}
