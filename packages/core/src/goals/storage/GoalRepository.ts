/**
 * goals/storage/GoalRepository.ts
 * Storage contract for goals. Mutable state, not an append-only log.
 */

import { Goal, GoalInput, GoalUpdate, GoalPriority, GoalStatus } from '../models/Goal';

export interface GoalQuery {
  projectId?: string;
  status?: GoalStatus;
  priority?: GoalPriority;
  limit?: number;
  offset?: number;
}

export interface GoalQueryResult {
  goals: Goal[];
  total: number;
  limit: number;
  offset: number;
}

export interface GoalRepository {
  init(): Promise<void>;
  create(input: GoalInput): Promise<Goal>;
  getById(id: string): Promise<Goal | null>;
  query(q: GoalQuery): Promise<GoalQueryResult>;
  update(id: string, patch: GoalUpdate): Promise<Goal | null>;
  addTaskId(goalId: string, taskId: string): Promise<Goal | null>;
  removeTaskId(goalId: string, taskId: string): Promise<Goal | null>;
  remove(id: string): Promise<boolean>;
  close(): Promise<void>;
}
