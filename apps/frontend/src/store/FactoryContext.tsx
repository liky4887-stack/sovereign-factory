import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { api } from '../services/api';
import type { Project, Agent, Task, LedgerEntry } from '../types';

interface FactoryState {
  projects: Project[];
  activeProjectId: string | null;
  agents: Agent[];
  tasks: Task[];
  ledger: LedgerEntry[];
  loading: boolean;
  error: string | null;
  loadProjects: () => Promise<void>;
  loadAgents: () => Promise<void>;
  loadTasks: (projectId?: string) => Promise<void>;
  loadLedger: (projectId?: string) => Promise<void>;
  setActiveProject: (id: string) => void;
  refreshAll: () => Promise<void>;
}

const Ctx = createContext<FactoryState | null>(null);

export function FactoryProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      setError(null);
      const list = await api.listProjects();
      setProjects(list);
      if (!activeProjectId && list.length > 0) setActiveProjectId(list[0].id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load projects');
    }
  }, [activeProjectId]);

  const loadAgents = useCallback(async () => {
    try {
      setError(null);
      setAgents(await api.listAgents());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load agents');
    }
  }, []);

  const loadTasks = useCallback(async (projectId?: string) => {
    try {
      setError(null);
      setTasks(await api.listTasks(projectId));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load tasks');
    }
  }, []);

  const loadLedger = useCallback(async (projectId?: string) => {
    try {
      setError(null);
      setLedger(await api.listLedger(projectId));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load ledger');
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadProjects(), loadAgents(), loadLedger()]);
    setLoading(false);
  }, [loadProjects, loadAgents, loadLedger]);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  const value: FactoryState = {
    projects, activeProjectId, agents, tasks, ledger, loading, error,
    loadProjects, loadAgents, loadTasks, loadLedger,
    setActiveProject: setActiveProjectId,
    refreshAll,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFactory(): FactoryState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFactory must be used inside FactoryProvider');
  return v;
}
