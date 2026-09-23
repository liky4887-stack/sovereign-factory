/**
 * system-power/api/SystemPowerService.ts
 * Reads live host + process + system metrics from Node's os/process.
 * Persists the two toggles. Every toggle change is logged to the
 * Truth Ledger via an optional ledger reference (wired in the router).
 */

import * as os from 'os';
import { log } from '../../shared/logger';
import {
  SystemPowerStatus,
  SystemPowerToggles,
} from '../models/SystemPowerState';
import { SystemPowerRepository } from '../storage/SystemPowerRepository';
import { JsonSystemPowerRepository } from '../storage/JsonSystemPowerRepository';

export interface LedgerAppendFn {
  (entry: {
    type: 'SYSTEM_POWER_TOGGLE';
    source: 'system-power';
    payload: Record<string, unknown>;
    tags?: string[];
  }): Promise<void>;
}

export class SystemPowerService {
  private repo: SystemPowerRepository;
  private initialised = false;
  private ledgerAppend?: LedgerAppendFn;

  constructor(repo?: SystemPowerRepository) {
    this.repo = repo ?? new JsonSystemPowerRepository('');
  }

  setRepository(repo: SystemPowerRepository): void {
    this.repo = repo;
    this.initialised = false;
  }

  setLedgerAppend(fn: LedgerAppendFn): void {
    this.ledgerAppend = fn;
  }

  async init(): Promise<void> {
    if (this.initialised) return;
    await this.repo.init();
    this.initialised = true;
    log.info('system_power.service.ready', { toggles: await this.repo.getToggles() });
  }

  private async ensureInit(): Promise<void> {
    if (!this.initialised) await this.init();
  }

  async getStatus(): Promise<SystemPowerStatus> {
    await this.ensureInit();

    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    const mem = process.memoryUsage();
    const load = os.loadavg() as [number, number, number];
    const toggles = await this.repo.getToggles();

    return {
      host: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        uptimeSeconds: Math.floor(process.uptime()),
      },
      process: {
        pid: process.pid,
        cpuCount: os.cpus().length,
        loadAvg: load,
        rssBytes: mem.rss,
        heapUsedBytes: mem.heapUsed,
        heapTotalBytes: mem.heapTotal,
      },
      system: {
        totalMemoryBytes: total,
        freeMemoryBytes: free,
        usedMemoryPercent: total > 0 ? Math.round((used / total) * 1000) / 10 : 0,
      },
      toggles,
      ledgerEntryCount: 0, // filled by router when ledger is available
      updatedAt: new Date().toISOString(),
    };
  }

  async setToggle(key: keyof SystemPowerToggles, value: boolean): Promise<SystemPowerStatus> {
    await this.ensureInit();
    const next = await this.repo.setToggle(key, value);
    log.info('system_power.toggle', { key, value });

    if (this.ledgerAppend) {
      try {
        await this.ledgerAppend({
          type: 'SYSTEM_POWER_TOGGLE',
          source: 'system-power',
          payload: { key, value, toggles: next },
          tags: ['system-power', 'toggle'],
        });
      } catch (err) {
        log.warn('system_power.ledger_append_failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return this.getStatus();
  }

  async close(): Promise<void> {
    if (!this.initialised) return;
    await this.repo.close();
    this.initialised = false;
  }
}
