// shared/factory.ts
// AI Factory v2 — canonical type contracts.
// Both bridge (JSDoc) and app (TS) import from this file.

// ────────────────────────────────────────────────────────────────────────────
// Project
// ────────────────────────────────────────────────────────────────────────────
export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string;
  repoUrl?: string;
  localPath?: string;
  createdAt: string;  // ISO
  updatedAt: string;  // ISO
  archived: boolean;
  metrics: ProjectMetrics;
}

export interface ProjectMetrics {
  goalCount: number;
  openTaskCount: number;
  doneTaskCount: number;
  activeAgentCount: number;
  ledgerEntryCount: number;
  lastActivityAt: string;  // ISO
}

// ────────────────────────────────────────────────────────────────────────────
// Goal
// ────────────────────────────────────────────────────────────────────────────
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
  createdAt: string;  // ISO
  updatedAt: string;  // ISO
  taskIds: string[];
  createdBy: GoalCreator;
}

// ────────────────────────────────────────────────────────────────────────────
// Task
// ────────────────────────────────────────────────────────────────────────────
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
  goalId?: string;  // optional — matches sovereign-core
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

// ────────────────────────────────────────────────────────────────────────────
// Agent
// ────────────────────────────────────────────────────────────────────────────
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

export interface AgentStats {
  tasksCompleted: number;
  tasksFailed: number;
  avgTaskDurationMs: number;
  totalTokensUsed: number;
}

export interface ToolGrant {
  tool: ToolKind;
  constraints: Record<string, unknown>;
}

// ────────────────────────────────────────────────────────────────────────────
// Skill
// ────────────────────────────────────────────────────────────────────────────
export interface SkillPermission {
  scope: 'shell' | 'fs' | 'net' | 'git';
  detail: string;
  granted: boolean;
}

export interface SkillV2 {
  id: string;
  name: string;
  version: string;
  description: string;
  source: 'builtin' | 'github' | 'local' | 'fused';
  sourceUrl?: string;
  localPath: string;
  capabilities: string[];
  permissions: SkillPermission[];
  entryPoint: string;
  installedAt: string;  // ISO
  updatedAt: string;  // ISO
  enabled: boolean;
  parents?: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// Truth Ledger
// ────────────────────────────────────────────────────────────────────────────
export type LedgerKind =
  | 'decision'
  | 'schema_change'
  | 'prompt_change'
  | 'deploy'
  | 'bug'
  | 'pivot'
  | 'omega_action'
  | 'compliance_review'
  | 'skill_install'
  | 'skill_remove'
  | 'agent_action';

export interface LedgerDiff {
  path: string;
  before?: string;
  after?: string;
  patch?: string;
}

export interface LedgerEntryV2 {
  id: string;
  projectId?: string;
  taskId?: string;
  agentId?: string;
  kind: LedgerKind;
  title: string;
  body: string;
  diff?: LedgerDiff;
  refs: string[];
  tags: string[];
  createdAt: string;  // ISO
  immutable: true;
}

// ────────────────────────────────────────────────────────────────────────────
// Execution Log
// ────────────────────────────────────────────────────────────────────────────
export interface ExecutionLog {
  id: string;
  taskId: string;
  agentId: string;
  command: string;
  args: string[];
  cwd: string;
  exitCode?: number;
  stdout: string;
  stderr: string;
  startedAt: string;  // ISO
  finishedAt?: string;  // ISO
  omegaForced: boolean;
  complianceReviewId?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Compliance Review
// ────────────────────────────────────────────────────────────────────────────
export interface ComplianceReview {
  id: string;
  taskId: string;
  originalCommand: string;
  verdict: 'clear' | 'needs_clarification' | 'conflicts_with_ledger' | 'high_risk';
  concerns: string[];
  suggestedAlternatives: string[];
  followUpQuestions: string[];
  createdAt: string;  // ISO
  resolvedAt?: string;  // ISO
  resolution?: 'proceeded' | 'amended' | 'omega_forced' | 'cancelled';
  amendedCommand?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// SSE stream events
// ────────────────────────────────────────────────────────────────────────────
export type StreamEventName =
  | 'hello'
  | 'ledger.appended'
  | 'task.status'
  | 'task.created'
  | 'goal.planned'
  | 'compliance.review'
  | 'omega.fired'
  | 'omega.output'
  | 'skill.installed'
  | 'skill.removed'
  | 'project.created';

export interface StreamEvent<T = unknown> {
  event: StreamEventName;
  data: T;
}
