/**
 * ide/storage/IdeRepository.ts
 * Persists blueprints. History and corrections come from the ledger.
 */

import { Blueprint, BlueprintInput, BlueprintUpdate } from '../models/IdeState';

export interface IdeQuery {
  projectId?: string;
  limit?: number;
  offset?: number;
}

export interface IdeQueryResult {
  blueprints: Blueprint[];
  total: number;
  limit: number;
  offset: number;
}

export interface IdeRepository {
  init(): Promise<void>;
  create(input: BlueprintInput): Promise<Blueprint>;
  getById(id: string): Promise<Blueprint | null>;
  query(q: IdeQuery): Promise<IdeQueryResult>;
  update(id: string, patch: BlueprintUpdate): Promise<Blueprint | null>;
  remove(id: string): Promise<boolean>;
  close(): Promise<void>;
}
