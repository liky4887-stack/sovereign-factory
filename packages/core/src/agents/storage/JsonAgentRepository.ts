/**
 * agents/storage/JsonAgentRepository.ts
 * Single-file JSON storage for agents. Whole-file rewrite on mutation.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { log } from '../../shared/logger';
import {
  Agent,
  AgentInput,
  AgentUpdate,
  AgentStats,
  emptyStats,
} from '../models/Agent';
import {
  AgentRepository,
  AgentQuery,
  AgentQueryResult,
} from './AgentRepository';

function newId(): string {
  return 'agent_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex');
}

function nowIso(): string {
  return new Date().toISOString();
}

export class JsonAgentRepository implements AgentRepository {
  private readonly filePath: string;
  private agents: Agent[] = [];
  private initialised = false;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async init(): Promise<void> {
    if (this.initialised) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (fs.existsSync(this.filePath)) {
      const raw = await fs.promises.readFile(this.filePath, 'utf8');
      if (raw.trim().length > 0) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) this.agents = parsed as Agent[];
        } catch (err) {
          log.warn('agents.repo.parse_error', {
            path: this.filePath,
            error: err instanceof Error ? err.message : String(err),
          });
          this.agents = [];
        }
      }
    } else {
      await fs.promises.writeFile(this.filePath, '[]', { mode: 0o600 });
    }
    this.initialised = true;
    log.info('agents.repo.ready', { path: this.filePath, count: this.agents.length });
  }

  private async persist(): Promise<void> {
    await fs.promises.writeFile(this.filePath, JSON.stringify(this.agents, null, 2), { mode: 0o600 });
  }

  private ensureInit(): void {
    if (!this.initialised) throw new Error('AgentRepository not initialised');
  }

  async create(input: AgentInput): Promise<Agent> {
    this.ensureInit();
    const now = nowIso();
    const agent: Agent = {
      id: newId(),
      name: input.name.trim(),
      role: input.role,
      persona: input.persona ?? '',
      skills: input.skills ?? [],
      tools: input.tools ?? [],
      status: input.status ?? 'idle',
      maxConcurrency: input.maxConcurrency ?? 1,
      createdAt: now,
      updatedAt: now,
      stats: emptyStats(),
    };
    this.agents.push(agent);
    await this.persist();
    return agent;
  }

  async getById(id: string): Promise<Agent | null> {
    this.ensureInit();
    return this.agents.find((a) => a.id === id) ?? null;
  }

  async query(q: AgentQuery): Promise<AgentQueryResult> {
    this.ensureInit();
    let filtered = this.agents.slice();
    if (q.role) filtered = filtered.filter((a) => a.role === q.role);
    if (q.status) filtered = filtered.filter((a) => a.status === q.status);
    filtered.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    const total = filtered.length;
    const limit = q.limit ?? 100;
    const offset = q.offset ?? 0;
    const agents = filtered.slice(offset, offset + limit);
    return { agents, total, limit, offset };
  }

  async update(id: string, patch: AgentUpdate): Promise<Agent | null> {
    this.ensureInit();
    const idx = this.agents.findIndex((a) => a.id === id);
    if (idx === -1) return null;
    const current = this.agents[idx];

    const mergedStats: AgentStats = patch.stats
      ? { ...current.stats, ...patch.stats }
      : current.stats;

    const updated: Agent = {
      ...current,
      name: patch.name ?? current.name,
      role: patch.role ?? current.role,
      persona: patch.persona ?? current.persona,
      skills: patch.skills ?? current.skills,
      tools: patch.tools ?? current.tools,
      status: patch.status ?? current.status,
      currentTaskId: patch.currentTaskId !== undefined ? patch.currentTaskId : current.currentTaskId,
      maxConcurrency: patch.maxConcurrency ?? current.maxConcurrency,
      updatedAt: nowIso(),
      stats: mergedStats,
    };
    this.agents[idx] = updated;
    await this.persist();
    return updated;
  }

  async remove(id: string): Promise<boolean> {
    this.ensureInit();
    const idx = this.agents.findIndex((a) => a.id === id);
    if (idx === -1) return false;
    this.agents.splice(idx, 1);
    await this.persist();
    return true;
  }

  async close(): Promise<void> {
    this.initialised = false;
  }
}
