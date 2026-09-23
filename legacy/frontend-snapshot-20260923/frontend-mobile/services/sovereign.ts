// services/sovereign.ts
// Typed wrappers for sovereign-core's real HTTP API.
// Every type below mirrors a live handler in ~/sovereign-core/src.
// No invented fields. No compatibility shims. Extend by adding to sovereign-core first.

import { sovereignClient } from './sovereignClient';
import type {
  Project,
  Task,
  TaskStatus,
  TaskPriority,
  Agent,
  AgentRole,
  AgentStatus,
  ToolGrant,
  Goal,
  GoalPriority,
  GoalStatus,
  GoalCreator,
} from '@shared/factory';
import type {
  GrandSlamOffer,
  OfferInput,
  OfferUpdate,
} from '@shared/sales';

// ── Response types (verified against sovereign-core) ────────────────────
// Source: src/termux-server/services/ProcessInspector.ts
export interface ProcessStatus {
  pid: number;
  uptimeSeconds: number;
  nodeVersion: string;
  platform: string;
  arch: string;
  cpuCount: number;
  loadAvg: [number, number, number];
  memory: {
    totalBytes: number;
    freeBytes: number;
    usedBytes: number;
    processRssBytes: number;
    processHeapUsedBytes: number;
  };
  timestamp: string;
}

// Source: src/termux-server/routes/health.ts
export interface HealthResponse {
  ok: true;
  service: string;
  uptimeSeconds: number;
  snapshot: ProcessStatus;
}

// Source: src/termux-server/services/CommandRunner.ts
export interface RunResult {
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  truncated: boolean;
  command: string;
  args: string[];
  cwd: string;
}

// Source: src/termux-server/services/FileOperator.ts
export interface FileReadResult {
  path: string;
  size: number;
  content: string;
  encoding: 'utf8';
}

export interface FileWriteResult {
  path: string;
  bytesWritten: number;
}

export interface FileListEntry {
  name: string;
  path: string;
  type: 'file' | 'dir' | 'symlink' | 'other';
  size: number;
  modifiedAt: string;
}

export interface FileListResult {
  path: string;
  entries: FileListEntry[];
}

// Source: src/termux-server/routes/executeCommand.ts
export interface ExecuteCommandInput {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

// Source: src/projects/models/Project.ts (sovereign-core)
export interface ProjectsListResponse {
  ok: true;
  projects: Project[];
  total: number;
  limit: number;
  offset: number;
}

export interface ProjectResponse {
  ok: true;
  project: Project;
}

export interface CreateProjectInput {
  name: string;
  slug?: string;
  description: string;
  repoUrl?: string;
  localPath?: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  repoUrl?: string;
  localPath?: string;
  archived?: boolean;
}

// Source: src/tasks/models/Task.ts (sovereign-core)
export interface TasksListResponse {
  ok: true;
  tasks: Task[];
  total: number;
  limit: number;
  offset: number;
}

export interface TaskResponse {
  ok: true;
  task: Task;
}

export interface CreateTaskInput {
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

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignedAgentId?: string;
  dependsOn?: string[];
  skillRequirements?: string[];
  maxAttempts?: number;
}

export interface ListTasksQuery {
  projectId?: string;
  goalId?: string;
  status?: TaskStatus;
  assignedAgentId?: string;
  limit?: number;
  offset?: number;
}

// Source: src/agents/models/Agent.ts (sovereign-core)
export interface AgentsListResponse {
  ok: true;
  agents: Agent[];
  total: number;
  limit: number;
  offset: number;
}

export interface AgentResponse {
  ok: true;
  agent: Agent;
}

export interface CreateAgentInput {
  name: string;
  role: AgentRole;
  persona?: string;
  skills?: string[];
  tools?: ToolGrant[];
  status?: AgentStatus;
  maxConcurrency?: number;
}

export interface UpdateAgentInput {
  name?: string;
  role?: AgentRole;
  persona?: string;
  skills?: string[];
  tools?: ToolGrant[];
  status?: AgentStatus;
  currentTaskId?: string;
  maxConcurrency?: number;
  stats?: Partial<Agent['stats']>;
}

export interface ListAgentsQuery {
  role?: AgentRole;
  status?: AgentStatus;
  limit?: number;
  offset?: number;
}

// Source: src/goals/models/Goal.ts (sovereign-core)
export interface GoalsListResponse {
  ok: true;
  goals: Goal[];
  total: number;
  limit: number;
  offset: number;
}

export interface GoalResponse {
  ok: true;
  goal: Goal;
}

export interface CreateGoalInput {
  projectId: string;
  title: string;
  description: string;
  constraints?: string[];
  priority?: GoalPriority;
  status?: GoalStatus;
  createdBy?: GoalCreator;
}

export interface UpdateGoalInput {
  title?: string;
  description?: string;
  constraints?: string[];
  priority?: GoalPriority;
  status?: GoalStatus;
}

export interface ListGoalsQuery {
  projectId?: string;
  status?: GoalStatus;
  priority?: GoalPriority;
  limit?: number;
  offset?: number;
}

// Source: src/offers/models/Offer.ts (sovereign-core)
export interface OffersListResponse {
  ok: true;
  offers: GrandSlamOffer[];
  total: number;
  limit: number;
  offset: number;
}

export interface OfferResponse {
  ok: true;
  offer: GrandSlamOffer;
}

export interface ListOffersQuery {
  icpId?: string;
  limit?: number;
  offset?: number;
}

// Source: src/ledger/models/LedgerEntry.ts (sovereign-core)
export type LedgerEntryType =
  | 'TASK_RECEIVED'
  | 'TASK_COMPLETED'
  | 'TASK_FAILED'
  | 'COMMAND_EXECUTED'
  | 'COMMAND_BLOCKED'
  | 'FILE_READ'
  | 'FILE_WRITTEN'
  | 'FILE_BLOCKED'
  | 'PROCESS_INSPECTED'
  | 'WORKFLOW_STARTED'
  | 'WORKFLOW_COMPLETED'
  | 'WORKFLOW_FAILED'
  | 'POLICY_DENIED'
  | 'ERROR'
  | 'HEALTH_CHECK'
  | 'SERVER_START'
  | 'SERVER_STOP';

export interface LedgerEntry {
  id: string;
  createdAt: string;        // ISO
  type: LedgerEntryType;
  source: string;
  correlationId?: string;
  tags: string[];
  payload: Record<string, unknown>;
  prevHash: string | null;
  hash: string;
}

export interface LedgerQueryResult {
  ok: true;
  entries: LedgerEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface LedgerQuery {
  type?: LedgerEntryType;
  source?: string;
  correlationId?: string;
  tags?: string;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}

// ── Client ──────────────────────────────────────────────────────────────
export const sovereign = {
  // Health & status
  getHealth: () =>
    sovereignClient.get<HealthResponse>('/health'),

  getProcessStatus: () =>
    sovereignClient.get<{ ok: true; status: ProcessStatus }>('/process/status'),

  // Command execution
  executeCommand: (input: ExecuteCommandInput) =>
    sovereignClient.post<{ ok: true; result: RunResult }>('/executeCommand', input),

  // File ops
  readFile: (path: string) =>
    sovereignClient.post<{ ok: true; result: FileReadResult }>('/file/read', { path }),

  writeFile: (path: string, content: string) =>
    sovereignClient.post<{ ok: true; result: FileWriteResult }>('/file/write', { path, content }),

  listFiles: (path: string) =>
    sovereignClient.post<{ ok: true; result: FileListResult }>('/file/list', { path }),

  // Projects
  listProjects: (q?: { archived?: boolean; slug?: string; limit?: number; offset?: number }) =>
    sovereignClient.get<ProjectsListResponse>('/projects', {
      archived: q?.archived === undefined ? undefined : String(q.archived),
      slug: q?.slug,
      limit: q?.limit,
      offset: q?.offset,
    }),

  getProject: (id: string) =>
    sovereignClient.get<ProjectResponse>(`/projects/${id}`),

  createProject: (input: CreateProjectInput) =>
    sovereignClient.post<ProjectResponse>('/projects', input),

  updateProject: (id: string, patch: UpdateProjectInput) =>
    sovereignClient.request<ProjectResponse>({
      method: 'PATCH',
      path: `/projects/${id}`,
      body: patch,
    }),

  // Tasks
  listTasks: (q?: ListTasksQuery) =>
    sovereignClient.get<TasksListResponse>('/tasks', {
      projectId: q?.projectId,
      goalId: q?.goalId,
      status: q?.status,
      assignedAgentId: q?.assignedAgentId,
      limit: q?.limit,
      offset: q?.offset,
    }),

  getTask: (id: string) =>
    sovereignClient.get<TaskResponse>(`/tasks/${id}`),

  createTask: (input: CreateTaskInput) =>
    sovereignClient.post<TaskResponse>('/tasks', input),

  updateTask: (id: string, patch: UpdateTaskInput) =>
    sovereignClient.request<TaskResponse>({
      method: 'PATCH',
      path: `/tasks/${id}`,
      body: patch,
    }),

  deleteTask: (id: string) =>
    sovereignClient.request<{ ok: true }>({
      method: 'DELETE',
      path: `/tasks/${id}`,
    }),

  // Agents
  listAgents: (q?: ListAgentsQuery) =>
    sovereignClient.get<AgentsListResponse>('/agents', {
      role: q?.role,
      status: q?.status,
      limit: q?.limit,
      offset: q?.offset,
    }),

  getAgent: (id: string) =>
    sovereignClient.get<AgentResponse>(`/agents/${id}`),

  createAgent: (input: CreateAgentInput) =>
    sovereignClient.post<AgentResponse>('/agents', input),

  updateAgent: (id: string, patch: UpdateAgentInput) =>
    sovereignClient.request<AgentResponse>({
      method: 'PATCH',
      path: `/agents/${id}`,
      body: patch,
    }),

  deleteAgent: (id: string) =>
    sovereignClient.request<{ ok: true }>({
      method: 'DELETE',
      path: `/agents/${id}`,
    }),

  // Goals
  listGoals: (q?: ListGoalsQuery) =>
    sovereignClient.get<GoalsListResponse>('/goals', {
      projectId: q?.projectId,
      status: q?.status,
      priority: q?.priority,
      limit: q?.limit,
      offset: q?.offset,
    }),

  getGoal: (id: string) =>
    sovereignClient.get<GoalResponse>(`/goals/${id}`),

  createGoal: (input: CreateGoalInput) =>
    sovereignClient.post<GoalResponse>('/goals', input),

  updateGoal: (id: string, patch: UpdateGoalInput) =>
    sovereignClient.request<GoalResponse>({
      method: 'PATCH',
      path: `/goals/${id}`,
      body: patch,
    }),

  deleteGoal: (id: string) =>
    sovereignClient.request<{ ok: true }>({
      method: 'DELETE',
      path: `/goals/${id}`,
    }),

  linkTaskToGoal: (goalId: string, taskId: string) =>
    sovereignClient.post<GoalResponse>(`/goals/${goalId}/tasks`, { taskId }),

  unlinkTaskFromGoal: (goalId: string, taskId: string) =>
    sovereignClient.request<GoalResponse>({
      method: 'DELETE',
      path: `/goals/${goalId}/tasks/${taskId}`,
    }),

  // Offers
  listOffers: (q?: ListOffersQuery) =>
    sovereignClient.get<OffersListResponse>('/offers', {
      icpId: q?.icpId,
      limit: q?.limit,
      offset: q?.offset,
    }),

  getOffer: (id: string) =>
    sovereignClient.get<OfferResponse>(`/offers/${id}`),

  createOffer: (input: OfferInput) =>
    sovereignClient.post<OfferResponse>('/offers', input),

  updateOffer: (id: string, patch: OfferUpdate) =>
    sovereignClient.request<OfferResponse>({
      method: 'PATCH',
      path: `/offers/${id}`,
      body: patch,
    }),

  deleteOffer: (id: string) =>
    sovereignClient.request<{ ok: true }>({
      method: 'DELETE',
      path: `/offers/${id}`,
    }),

  // Ledger (audit trail)
  listLedger: (q?: LedgerQuery) =>
    sovereignClient.get<LedgerQueryResult>('/ledger/query', {
      type: q?.type,
      source: q?.source,
      correlationId: q?.correlationId,
      tags: q?.tags,
      since: q?.since,
      until: q?.until,
      limit: q?.limit ?? 50,
      offset: q?.offset,
    }),
};
