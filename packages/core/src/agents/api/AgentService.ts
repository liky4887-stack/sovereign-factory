/**
 * agents/api/AgentService.ts
 * Business logic for agents. Thin wrapper over AgentRepository.
 */

import { log } from '../../shared/logger';
import { Agent, AgentInput, AgentUpdate } from '../models/Agent';
import {
  AgentRepository,
  AgentQuery,
  AgentQueryResult,
} from '../storage/AgentRepository';
import { JsonAgentRepository } from '../storage/JsonAgentRepository';

export class AgentService {
  private repo: AgentRepository;
  private initialised = false;

  constructor(repo?: AgentRepository) {
    this.repo = repo ?? new JsonAgentRepository('');
  }

  setRepository(repo: AgentRepository): void {
    this.repo = repo;
    this.initialised = false;
  }

  async init(): Promise<void> {
    if (this.initialised) return;
    await this.repo.init();
    this.initialised = true;
    log.info('agents.service.ready', { count: (await this.repo.query({})).total });
  }

  private async ensureInit(): Promise<void> {
    if (!this.initialised) await this.init();
  }

  async create(input: AgentInput): Promise<Agent> {
    await this.ensureInit();
    const a = await this.repo.create(input);
    log.info('agents.created', { id: a.id, role: a.role });
    return a;
  }

  async getById(id: string): Promise<Agent | null> {
    await this.ensureInit();
    return this.repo.getById(id);
  }

  async query(q: AgentQuery): Promise<AgentQueryResult> {
    await this.ensureInit();
    return this.repo.query(q);
  }

  async update(id: string, patch: AgentUpdate): Promise<Agent | null> {
    await this.ensureInit();
    const a = await this.repo.update(id, patch);
    if (a) log.info('agents.updated', { id, fields: Object.keys(patch) });
    return a;
  }

  async remove(id: string): Promise<boolean> {
    await this.ensureInit();
    const ok = await this.repo.remove(id);
    if (ok) log.info('agents.removed', { id });
    return ok;
  }

  async close(): Promise<void> {
    if (!this.initialised) return;
    await this.repo.close();
    this.initialised = false;
  }
}
