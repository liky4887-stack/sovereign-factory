/**
 * agents/models/Agent.ts
 * Canonical Agent shape. Config registry — no runtime state machine.
 * Timestamps are ISO strings, matching the ledger, project, and task conventions.
 */

export type AgentRole =
  | 'ceo'
  | 'architect'
  | 'builder'
  | 'reviewer'
  | 'chaos_monkey'
  | 'scout'
  | 'librarian';

export type AgentStatus = 'idle' | 'busy' | 'paused' | 'offline';

export type ToolKind = 'shell' | 'git' | 'http' | 'filesystem' | 'model';

export interface ToolGrant {
  tool: ToolKind;
  constraints: Record<string, unknown>;
}

export interface AgentStats {
  tasksCompleted: number;
  tasksFailed: number;
  avgTaskDurationMs: number;
  totalTokensUsed: number;
}

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  persona: string;
  skills: string[];
  tools: ToolGrant[];
  status: AgentStatus;
  currentTaskId?: string;
  maxConcurrency: number;
  createdAt: string;  // ISO
  updatedAt: string;  // ISO
  stats: AgentStats;
}

export interface AgentInput {
  name: string;
  role: AgentRole;
  persona?: string;
  skills?: string[];
  tools?: ToolGrant[];
  status?: AgentStatus;
  maxConcurrency?: number;
}

export interface AgentUpdate {
  name?: string;
  role?: AgentRole;
  persona?: string;
  skills?: string[];
  tools?: ToolGrant[];
  status?: AgentStatus;
  currentTaskId?: string;
  maxConcurrency?: number;
  stats?: Partial<AgentStats>;
}

export function emptyStats(): AgentStats {
  return {
    tasksCompleted: 0,
    tasksFailed: 0,
    avgTaskDurationMs: 0,
    totalTokensUsed: 0,
  };
}
