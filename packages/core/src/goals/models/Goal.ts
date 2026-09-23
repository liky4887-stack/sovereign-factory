/**
 * goals/models/Goal.ts
 * Canonical Goal shape. Source of truth for Console (via HTTP).
 * Timestamps are ISO strings, matching the rest of sovereign-core.
 */

export type GoalPriority = 'P0' | 'P1' | 'P2' | 'P3';

export type GoalStatus =
  | 'draft'
  | 'planning'
  | 'active'
  | 'blocked'
  | 'done'
  | 'abandoned';

export type GoalCreator = 'ceo' | 'system';

export interface Goal {
  id: string;
  projectId: string;
  title: string;
  description: string;
  constraints: string[];
  priority: GoalPriority;
  status: GoalStatus;
  createdAt: string;
  updatedAt: string;
  taskIds: string[];
  createdBy: GoalCreator;
}

export interface GoalInput {
  projectId: string;
  title: string;
  description: string;
  constraints?: string[];
  priority?: GoalPriority;
  status?: GoalStatus;
  createdBy?: GoalCreator;
}

export interface GoalUpdate {
  title?: string;
  description?: string;
  constraints?: string[];
  priority?: GoalPriority;
  status?: GoalStatus;
}
