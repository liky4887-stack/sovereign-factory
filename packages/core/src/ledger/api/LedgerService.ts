import { JsonlLedgerRepository } from '../storage/JsonlLedgerRepository';
import { LedgerRepository, IntegrityResult } from '../storage/LedgerRepository';
import {
  LedgerEntry,
  LedgerEntryInput,
  LedgerQuery,
  LedgerQueryResult,
} from '../models/LedgerEntry';
import { log } from '../../shared/logger';

export class LedgerService {
  private repo: LedgerRepository;
  private initialised = false;

  constructor(repo?: LedgerRepository) {
    this.repo = repo ?? new JsonlLedgerRepository('');
  }

  setRepository(repo: LedgerRepository): void {
    this.repo = repo;
    this.initialised = false;
  }

  async init(): Promise<void> {
    if (this.initialised) return;
    await this.repo.init();
    this.initialised = true;
    log.info('ledger.service.ready', { count: await this.repo.count() });
  }

  async append(input: LedgerEntryInput): Promise<LedgerEntry> {
    if (!this.initialised) await this.init();
    const entry = await this.repo.append(input);
    return entry;
  }

  async query(q: LedgerQuery): Promise<LedgerQueryResult> {
    if (!this.initialised) await this.init();
    return this.repo.query(q);
  }

  async getById(id: string): Promise<LedgerEntry | null> {
    if (!this.initialised) await this.init();
    return this.repo.getById(id);
  }

  async count(): Promise<number> {
    if (!this.initialised) await this.init();
    return this.repo.count();
  }

  async verifyIntegrity(): Promise<IntegrityResult> {
    if (!this.initialised) await this.init();
    return this.repo.verifyIntegrity();
  }

  async close(): Promise<void> {
    if (!this.initialised) return;
    await this.repo.close();
    this.initialised = false;
  }
}
