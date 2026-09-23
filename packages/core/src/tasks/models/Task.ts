/**
 * tasks/models/Task.ts
 * Canonical Task shape. Source of truth for Console (via HTTP).
 * Timestamps are ISO strings, matching the ledger and project conventions.
 */

export type TaskStatus =
  | 'backlog'
  | 'ready'
  | 'in_progress'
  | 'review'
  | 'blocked'
  | 'done'
  | 'failed';

export type TaskPriority = 'P0' | 'P1' | 'P2' | 'P3';

export interface Task {
  id: string;
  projectId: string;
  goalId?: string;
  parentTaskId?: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedAgentId?: string;
  dependsOn: string[];
  skillRequirements: string[];
  createdAt: string;  // ISO
  updatedAt: string;  // ISO
  startedAt?: string;  // ISO
  completedAt?: string;  // ISO
  attempts: number;
  maxAttempts: number;
  lastLedgerRef?: string;
  executionLogIds: string[];
}

export interface TaskInput {
  projectId: string;
  goalId?: string;
  parentTaskId?: string;
  title: string;
  description: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignedAgentId?: string;
  dependsOn?: string[];
  skillRequirements?: string[];
  maxAttempts?: number;
}

export interface TaskUpdate {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignedAgentId?: string;
  dependsOn?: string[];
  skillRequirements?: string[];
  maxAttempts?: number;
}
