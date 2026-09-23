/**
 * agents/storage/AgentRepository.ts
 * Storage contract for agents. Mutable state, not an append-only log.
 */

import { Agent, AgentInput, AgentUpdate, AgentRole, AgentStatus } from '../models/Agent';

export interface AgentQuery {
  role?: AgentRole;
  status?: AgentStatus;
  limit?: number;
  offset?: number;
}

export interface AgentQueryResult {
  agents: Agent[];
  total: number;
  limit: number;
  offset: number;
}

export interface AgentRepository {
  init(): Promise<void>;
  create(input: AgentInput): Promise<Agent>;
  getById(id: string): Promise<Agent | null>;
  query(q: AgentQuery): Promise<AgentQueryResult>;
  update(id: string, patch: AgentUpdate): Promise<Agent | null>;
  remove(id: string): Promise<boolean>;
  close(): Promise<void>;
}
