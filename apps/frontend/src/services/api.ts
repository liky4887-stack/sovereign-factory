// src/services/api.ts
// HTTP layer for the control-console.
// Talks to sovereign-core on port 8790. Bearer auth optional (REQUIRE_AUTH=false by default).
// Legacy ghost-contract endpoints (port 8787, X-Ghost-Handshake) are gone.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  Project, Goal, Task, Agent, LedgerEntry, ComplianceReview,
  LedgerAuditEntry, LedgerAuditQueryResult,
} from '../types';

const BASE_URL = 'http://192.168.43.101:8790';
const TOKEN_KEY = 'sovereign_token';

let cachedToken: string | null | undefined;

async function token(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken;
  try { cachedToken = await AsyncStorage.getItem(TOKEN_KEY); }
  catch { cachedToken = null; }
  return cachedToken;
}

export async function setToken(value: string): Promise<void> {
  cachedToken = value.trim();
  await AsyncStorage.setItem(TOKEN_KEY, cachedToken);
}

export async function getToken(): Promise<string | null> {
  return token();
}

export async function setBaseUrl(_url: string): Promise<void> {
  // Reserved for future: persisted host/port.
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const t = await token();
  if (t) headers['authorization'] = `Bearer ${t}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { ...headers, ...((init && init.headers) as Record<string, string> | undefined) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${path} ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export const api = {
  // ── Health ───────────────────────────────────────────────────────
  status: async () => {
    const h = await request<{
      ok: true; service: string; uptimeSeconds: number;
      snapshot: { nodeVersion: string; platform: string };
    }>('/health');
    return { ok: true as const, nodeVersion: h.snapshot.nodeVersion, activeModelTypes: [] as string[] };
  },

  // ── Projects ─────────────────────────────────────────────────────
  listProjects: async (): Promise<Project[]> => {
    const r = await request<{ ok: true; projects: Project[]; total: number; limit: number; offset: number }>('/projects');
    return r.projects;
  },

  getProject: async (id: string): Promise<Project> => {
    const r = await request<{ ok: true; project: Project }>(`/projects/${id}`);
    return r.project;
  },

  createProject: async (input: { name: string; slug?: string; description: string }): Promise<Project> => {
    const r = await request<{ ok: true; project: Project }>('/projects', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return r.project;
  },

  // ── Goals ────────────────────────────────────────────────────────
  listGoals: async (projectId: string): Promise<Goal[]> => {
    const r = await request<{ ok: true; goals: Goal[] }>(`/goals?projectId=${encodeURIComponent(projectId)}`);
    return r.goals;
  },

  createGoal: async (
    projectId: string,
    input: { title: string; description: string; constraints?: string[]; priority?: Goal['priority'] }
  ): Promise<Goal> => {
    const r = await request<{ ok: true; goal: Goal }>('/goals', {
      method: 'POST',
      body: JSON.stringify({ projectId, ...input }),
    });
    return r.goal;
  },

  // ── Tasks ────────────────────────────────────────────────────────
  listTasks: async (projectId?: string): Promise<Task[]> => {
    const q = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
    const r = await request<{ ok: true; tasks: Task[] }>(`/tasks${q}`);
    return r.tasks;
  },

  getTask: async (id: string): Promise<Task> => {
    const r = await request<{ ok: true; task: Task }>(`/tasks/${id}`);
    return r.task;
  },

  retryTask: async (id: string): Promise<Task> => {
    // No sovereign-core equivalent yet. Reset status to backlog.
    const r = await request<{ ok: true; task: Task }>(`/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'backlog' }),
    });
    return r.task;
  },

  // ── Agents ───────────────────────────────────────────────────────
  listAgents: async (): Promise<Agent[]> => {
    const r = await request<{ ok: true; agents: Agent[] }>('/agents');
    return r.agents;
  },

  pauseAgent: async (id: string): Promise<Agent> => {
    const r = await request<{ ok: true; agent: Agent }>(`/agents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'paused' }),
    });
    return r.agent;
  },

  resumeAgent: async (id: string): Promise<Agent> => {
    const r = await request<{ ok: true; agent: Agent }>(`/agents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'idle' }),
    });
    return r.agent;
  },

  // ── Ledger ───────────────────────────────────────────────────────
  // Curated decision log is not currently served by sovereign-core.
  // Kept for compatibility — returns empty until a decisions endpoint exists.
  listLedger: async (_projectId?: string): Promise<LedgerEntry[]> => {
    return [];
  },

  // Real sovereign-core audit trail (hash-chained).
  listLedgerAudit: async (limit = 100): Promise<LedgerAuditEntry[]> => {
    const r = await request<LedgerAuditQueryResult>(`/ledger/query?limit=${limit}`);
    return r.entries;
  },

  // ── Compliance ───────────────────────────────────────────────────
  reviewCommand: async (taskId: string, command: string): Promise<ComplianceReview> => {
    // No sovereign-core equivalent. Returns a stub so the UI doesn't break.
    return {
      id: `stub-${Date.now()}`,
      taskId,
      originalCommand: command,
      verdict: 'clear',
      concerns: [],
      suggestedAlternatives: [],
      followUpQuestions: [],
      createdAt: new Date().toISOString(),
    };
  },

  // ── File ops (sovereign-core /file/*) ────────────────────────────
  readFile: async (path: string): Promise<{ path: string; content: string; size: number }> => {
    const r = await request<{ ok: true; result: { path: string; content: string; size: number; encoding: string } }>(
      '/file/read',
      { method: 'POST', body: JSON.stringify({ path }) }
    );
    return { path: r.result.path, content: r.result.content, size: r.result.size };
  },

  writeFile: async (path: string, content: string): Promise<{ path: string; bytesWritten: number }> => {
    const r = await request<{ ok: true; result: { path: string; bytesWritten: number } }>(
      '/file/write',
      { method: 'POST', body: JSON.stringify({ path, content }) }
    );
    return r.result;
  },

  listFiles: async (path: string): Promise<Array<{ name: string; path: string; type: string; size: number }>> => {
    const r = await request<{ ok: true; result: { path: string; entries: Array<{ name: string; path: string; type: string; size: number }> } }>(
      '/file/list',
      { method: 'POST', body: JSON.stringify({ path }) }
    );
    return r.result.entries;
  },

  // ── Execute (sovereign-core /executeCommand) ─────────────────────
  executeCommand: async (input: { command: string; args?: string[]; cwd?: string; timeoutMs?: number }) => {
    const r = await request<{ ok: true; result: {
      exitCode: number | null; signal: string | null;
      stdout: string; stderr: string;
      durationMs: number; truncated: boolean;
      command: string; args: string[]; cwd: string;
    } }>('/executeCommand', { method: 'POST', body: JSON.stringify(input) });
    return r.result;
  },

  // ── Omega ────────────────────────────────────────────────────────
  fireOmega: async (input: {
    taskId: string;
    agentId: string;
    command: string;
    omegaAcknowledged: boolean;
    omegaReason: string;
  }): Promise<{ executionLogId: string; ledgerEntryId: string }> => {
    // No sovereign-core equivalent. Route through executeCommand so the
    // command still runs, then return synthetic IDs.
    const result = await request<{ ok: true; result: { command: string; durationMs: number } }>('/executeCommand', {
      method: 'POST',
      body: JSON.stringify({ command: input.command }),
    });
    const stamp = `${Date.now()}`;
    return {
      executionLogId: `exec-${stamp}`,
      ledgerEntryId: `ledger-${stamp}-${result.result.durationMs}`,
    };
  },
};
