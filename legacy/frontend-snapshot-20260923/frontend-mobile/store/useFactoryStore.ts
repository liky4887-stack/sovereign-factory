// store/useFactoryStore.ts
// Factory store. All data sources backed by sovereign-core HTTP.
//   projects · tasks · agents · goals   — real
//   stream (SSE)                        — not yet provisioned

import { create } from 'zustand';
import type { Project, Goal, Task, Agent } from '@shared/factory';
import {
  sovereign,
  type CreateProjectInput,
  type CreateTaskInput,
  type UpdateTaskInput,
  type CreateGoalInput,
  type UpdateGoalInput,
} from '@/services/sovereign';

interface FactoryState {
  projects: Project[];
  activeProjectId: string | null;
  goals: Record<string, Goal[]>;
  tasks: Record<string, Task[]>;
  agents: Agent[];
  loading: boolean;
  error: string | null;
  connected: boolean;
  lastEventAt: number;

  loadProjects: () => Promise<void>;
  setActiveProject: (id: string) => void;
  createProject: (input: CreateProjectInput) => Promise<Project>;
  createTask: (input: CreateTaskInput) => Promise<Task>;
  updateTask: (id: string, patch: UpdateTaskInput) => Promise<Task>;
  createGoal: (input: CreateGoalInput) => Promise<Goal>;
  updateGoal: (id: string, patch: UpdateGoalInput) => Promise<Goal>;
  loadGoals: (projectId: string) => Promise<void>;
  loadTasks: (projectId: string) => Promise<void>;
  loadAgents: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => void;
  applyTaskDelta: (task: Task) => void;
}

export const useFactoryStore = create<FactoryState>((set) => ({
  projects: [],
  activeProjectId: null,
  goals: {},
  tasks: {},
  agents: [],
  loading: false,
  error: null,
  connected: false,
  lastEventAt: 0,

  loadProjects: async () => {
    set({ loading: true, error: null });
    try {
      const res = await sovereign.listProjects();
      set({ projects: res.projects, loading: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      set({ loading: false, error: msg, projects: [] });
    }
  },

  setActiveProject: (id) => set({ activeProjectId: id }),

  createProject: async (input) => {
    const res = await sovereign.createProject(input);
    set((s) => ({ projects: [res.project, ...s.projects] }));
    return res.project;
  },

  createTask: async (input) => {
    const res = await sovereign.createTask(input);
    set((s) => {
      const list = s.tasks[res.task.projectId] ?? [];
      return { tasks: { ...s.tasks, [res.task.projectId]: [res.task, ...list] } };
    });
    return res.task;
  },

  updateTask: async (id, patch) => {
    const res = await sovereign.updateTask(id, patch);
    set((s) => {
      const projectId = res.task.projectId;
      const list = s.tasks[projectId] ?? [];
      const idx = list.findIndex((t) => t.id === id);
      const next = idx >= 0
        ? list.map((t) => (t.id === id ? res.task : t))
        : [res.task, ...list];
      return { tasks: { ...s.tasks, [projectId]: next } };
    });
    return res.task;
  },

  createGoal: async (input) => {
    const res = await sovereign.createGoal(input);
    set((s) => {
      const list = s.goals[res.goal.projectId] ?? [];
      return { goals: { ...s.goals, [res.goal.projectId]: [res.goal, ...list] } };
    });
    return res.goal;
  },

  updateGoal: async (id, patch) => {
    const res = await sovereign.updateGoal(id, patch);
    set((s) => {
      const projectId = res.goal.projectId;
      const list = s.goals[projectId] ?? [];
      const idx = list.findIndex((g) => g.id === id);
      const next = idx >= 0
        ? list.map((g) => (g.id === id ? res.goal : g))
        : [res.goal, ...list];
      return { goals: { ...s.goals, [projectId]: next } };
    });
    return res.goal;
  },

  loadGoals: async (projectId) => {
    try {
      const res = await sovereign.listGoals({ projectId, limit: 500 });
      set((s) => ({ goals: { ...s.goals, [projectId]: res.goals }, error: null }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      set((s) => ({ goals: { ...s.goals, [projectId]: [] }, error: msg }));
    }
  },

  loadTasks: async (projectId) => {
    try {
      const res = await sovereign.listTasks({ projectId, limit: 500 });
      set((s) => ({ tasks: { ...s.tasks, [projectId]: res.tasks }, error: null }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      set((s) => ({ tasks: { ...s.tasks, [projectId]: [] }, error: msg }));
    }
  },

  loadAgents: async () => {
    try {
      const res = await sovereign.listAgents();
      set({ agents: res.agents, error: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      set({ agents: [], error: msg });
    }
  },

  connect: async () => {
    // No /stream endpoint yet.
    set({ connected: false, lastEventAt: 0 });
  },

  disconnect: () => {
    set({ connected: false });
  },

  applyTaskDelta: () => {
    // No task stream yet.
  },
}));
