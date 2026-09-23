/**
 * ide/api/IdeService.ts
 * - Blueprint CRUD via IdeRepository
 * - Execute: uses the canonical CommandRunner (same process as the bridge)
 * - History: derived from the Truth Ledger (COMMAND_EXECUTED entries)
 * - Corrections: derived from failed runs in the ledger
 */

import { log } from '../../shared/logger';
import { LedgerService } from '../../ledger/api/LedgerService';
import { commandRunner } from '../../termux-server/services/CommandRunner';
import {
  Blueprint, BlueprintInput, BlueprintUpdate,
  IdeExecuteInput, IdeExecuteResult,
  IdeSession, IdeRunSummary, IdeCorrection,
} from '../models/IdeState';
import { IdeRepository, IdeQuery, IdeQueryResult } from '../storage/IdeRepository';
import { JsonIdeRepository } from '../storage/JsonIdeRepository';

export class IdeService {
  private ledger: LedgerService;
  private repo: IdeRepository;
  private initialised = false;

  constructor(opts: { ledger: LedgerService; repo?: IdeRepository }) {
    this.ledger = opts.ledger;
    this.repo = opts.repo ?? new JsonIdeRepository('');
  }

  setRepository(repo: IdeRepository): void {
    this.repo = repo;
    this.initialised = false;
  }

  async init(): Promise<void> {
    if (this.initialised) return;
    await this.repo.init();
    this.initialised = true;
    log.info('ide.service.ready');
  }

  private async ensureInit(): Promise<void> {
    if (!this.initialised) await this.init();
  }

  // ── Blueprints ───────────────────────────────────────────────
  async createBlueprint(input: BlueprintInput): Promise<Blueprint> {
    await this.ensureInit();
    const bp = await this.repo.create(input);
    log.info('ide.blueprint.created', { id: bp.id, name: bp.name });
    await this.ledger.append({
      type: 'FILE_WRITTEN',
      source: 'ide.blueprint',
      payload: { id: bp.id, name: bp.name, language: bp.language, version: bp.version },
      tags: ['ide', 'blueprint', 'create'],
    });
    return bp;
  }

  async getBlueprint(id: string): Promise<Blueprint | null> {
    await this.ensureInit();
    return this.repo.getById(id);
  }

  async queryBlueprints(q: IdeQuery): Promise<IdeQueryResult> {
    await this.ensureInit();
    return this.repo.query(q);
  }

  async updateBlueprint(id: string, patch: BlueprintUpdate): Promise<Blueprint | null> {
    await this.ensureInit();
    const bp = await this.repo.update(id, patch);
    if (bp) {
      log.info('ide.blueprint.updated', { id, version: bp.version });
      await this.ledger.append({
        type: 'FILE_WRITTEN',
        source: 'ide.blueprint',
        payload: { id, version: bp.version, fields: Object.keys(patch) },
        tags: ['ide', 'blueprint', 'update'],
      });
    }
    return bp;
  }

  async deleteBlueprint(id: string): Promise<boolean> {
    await this.ensureInit();
    const ok = await this.repo.remove(id);
    if (ok) {
      await this.ledger.append({
        type: 'FILE_BLOCKED',
        source: 'ide.blueprint',
        payload: { id, action: 'delete' },
        tags: ['ide', 'blueprint', 'delete'],
      });
    }
    return ok;
  }

  // ── Execute ──────────────────────────────────────────────────
  async execute(input: IdeExecuteInput): Promise<IdeExecuteResult> {
    await this.ensureInit();

    // If a blueprint is referenced, touch it so version tracking reflects runs
    if (input.blueprintId) {
      const bp = await this.repo.getById(input.blueprintId);
      if (bp) {
        await this.ledger.append({
          type: 'TASK_RECEIVED',
          source: 'ide.execute',
          payload: { blueprintId: bp.id, blueprintVersion: bp.version, command: input.command },
          tags: ['ide', 'execute'],
        });
      }
    }

    const result = await commandRunner.run({
      command: input.command,
      args: input.args ?? [],
      cwd: input.cwd,
      timeoutMs: input.timeoutMs,
    });

    const entry = await this.ledger.append({
      type: 'COMMAND_EXECUTED',
      source: 'ide.execute',
      payload: {
        command: input.command,
        args: input.args ?? [],
        cwd: result.cwd,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        truncated: result.truncated,
        stdoutPreview: result.stdout.slice(0, 500),
        stderrPreview: result.stderr.slice(0, 500),
      },
      tags: ['ide', 'execute', result.exitCode === 0 ? 'ok' : 'nonzero'],
    });

    log.info('ide.execute', { command: input.command, exitCode: result.exitCode, ledgerEntryId: entry.id });

    return {
      exitCode: result.exitCode,
      signal: result.signal,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.durationMs,
      truncated: result.truncated,
      command: result.command,
      args: result.args,
      cwd: result.cwd,
      ledgerEntryId: entry.id,
    };
  }

  // ── History ──────────────────────────────────────────────────
  async getHistory(limit = 50): Promise<IdeRunSummary[]> {
    await this.ensureInit();
    const { entries } = await this.ledger.query({ type: 'COMMAND_EXECUTED', limit });

    return entries.map((e) => {
      const p = e.payload as Record<string, unknown>;
      return {
        id: e.id,
        command: typeof p.command === 'string' ? p.command : '(unknown)',
        exitCode: typeof p.exitCode === 'number' ? p.exitCode : null,
        startedAt: e.createdAt,
        durationMs: typeof p.durationMs === 'number' ? p.durationMs : 0,
        source: e.source,
      };
    });
  }

  // ── Corrections ──────────────────────────────────────────────
  async getCorrections(limit = 20): Promise<IdeCorrection[]> {
    await this.ensureInit();
    const { entries } = await this.ledger.query({ limit: 500 });

    // Any COMMAND_EXECUTED with non-zero exit, plus POLICY_DENIED and ERROR
    const corrections: IdeCorrection[] = [];
    for (const e of entries) {
      const p = e.payload as Record<string, unknown>;
      if (e.type === 'COMMAND_EXECUTED' && typeof p.exitCode === 'number' && p.exitCode !== 0) {
        corrections.push({
          id: e.id,
          command: typeof p.command === 'string' ? p.command : '(unknown)',
          issue: `non-zero exit (${p.exitCode})`,
          severity: 'error',
          detectedAt: e.createdAt,
        });
      } else if (e.type === 'POLICY_DENIED' || e.type === 'COMMAND_BLOCKED') {
        corrections.push({
          id: e.id,
          command: typeof p.command === 'string' ? p.command : '(unknown)',
          issue: 'command not permitted by policy',
          severity: 'warning',
          detectedAt: e.createdAt,
        });
      } else if (e.type === 'ERROR') {
        corrections.push({
          id: e.id,
          command: '(system)',
          issue: typeof p.error === 'string' ? p.error : 'system error',
          severity: 'error',
          detectedAt: e.createdAt,
        });
      }
      if (corrections.length >= limit) break;
    }
    return corrections;
  }

  // ── Session (single call for the whole screen) ──────────────
  async getSession(projectId?: string): Promise<IdeSession> {
    await this.ensureInit();
    const [bpQuery, runs, corrections] = await Promise.all([
      this.repo.query({ projectId, limit: 100 }),
      this.getHistory(30),
      this.getCorrections(10),
    ]);

    return {
      blueprints: bpQuery.blueprints,
      recentRuns: runs,
      corrections,
      generatedAt: new Date().toISOString(),
    };
  }

  async close(): Promise<void> {
    if (!this.initialised) return;
    await this.repo.close();
    this.initialised = false;
  }
}
