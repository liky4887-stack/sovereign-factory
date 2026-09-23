import {
  LedgerEntry,
  LedgerEntryInput,
  LedgerQuery,
  LedgerQueryResult,
} from '../models/LedgerEntry';

export interface IntegrityResult {
  ok: boolean;
  brokenAt?: string;
  reason?: string;
}

export interface LedgerRepository {
  init(): Promise<void>;
  append(entry: LedgerEntryInput): Promise<LedgerEntry>;
  query(q: LedgerQuery): Promise<LedgerQueryResult>;
  getById(id: string): Promise<LedgerEntry | null>;
  count(): Promise<number>;
  verifyIntegrity(): Promise<IntegrityResult>;
  close(): Promise<void>;
}
