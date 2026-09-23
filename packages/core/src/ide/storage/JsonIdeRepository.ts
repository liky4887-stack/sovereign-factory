/**
 * ide/storage/JsonIdeRepository.ts
 * Single-file JSON storage for blueprints. Bumps version on every code change.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { log } from '../../shared/logger';
import { Blueprint, BlueprintInput, BlueprintUpdate } from '../models/IdeState';
import { IdeRepository, IdeQuery, IdeQueryResult } from './IdeRepository';

function newId(): string {
  return 'bp_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex');
}

function nowIso(): string {
  return new Date().toISOString();
}

export class JsonIdeRepository implements IdeRepository {
  private readonly filePath: string;
  private blueprints: Blueprint[] = [];
  private initialised = false;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async init(): Promise<void> {
    if (this.initialised) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = await fs.promises.readFile(this.filePath, 'utf8');
        if (raw.trim().length > 0) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) this.blueprints = parsed as Blueprint[];
        }
      } catch (err) {
        log.warn('ide.repo.parse_error', {
          path: this.filePath,
          error: err instanceof Error ? err.message : String(err),
        });
        this.blueprints = [];
      }
    } else {
      await fs.promises.writeFile(this.filePath, '[]', { mode: 0o600 });
    }
    this.initialised = true;
    log.info('ide.repo.ready', { path: this.filePath, count: this.blueprints.length });
  }

  private async persist(): Promise<void> {
    await fs.promises.writeFile(this.filePath, JSON.stringify(this.blueprints, null, 2), { mode: 0o600 });
  }

  private ensureInit(): void {
    if (!this.initialised) throw new Error('IdeRepository not initialised');
  }

  async create(input: BlueprintInput): Promise<Blueprint> {
    this.ensureInit();
    const now = nowIso();
    const bp: Blueprint = {
      id: newId(),
      projectId: input.projectId,
      name: input.name.trim(),
      language: input.language ?? 'typescript',
      code: input.code,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.blueprints.push(bp);
    await this.persist();
    return bp;
  }

  async getById(id: string): Promise<Blueprint | null> {
    this.ensureInit();
    return this.blueprints.find((b) => b.id === id) ?? null;
  }

  async query(q: IdeQuery): Promise<IdeQueryResult> {
    this.ensureInit();
    let filtered = this.blueprints.slice();
    if (q.projectId) filtered = filtered.filter((b) => b.projectId === q.projectId);
    filtered.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    const total = filtered.length;
    const limit = q.limit ?? 100;
    const offset = q.offset ?? 0;
    const blueprints = filtered.slice(offset, offset + limit);
    return { blueprints, total, limit, offset };
  }

  async update(id: string, patch: BlueprintUpdate): Promise<Blueprint | null> {
    this.ensureInit();
    const idx = this.blueprints.findIndex((b) => b.id === id);
    if (idx === -1) return null;
    const current = this.blueprints[idx];
    const codeChanged = patch.code !== undefined && patch.code !== current.code;
    const updated: Blueprint = {
      ...current,
      name: patch.name ?? current.name,
      language: patch.language ?? current.language,
      code: patch.code ?? current.code,
      version: codeChanged ? current.version + 1 : current.version,
      updatedAt: nowIso(),
    };
    this.blueprints[idx] = updated;
    await this.persist();
    return updated;
  }

  async remove(id: string): Promise<boolean> {
    this.ensureInit();
    const idx = this.blueprints.findIndex((b) => b.id === id);
    if (idx === -1) return false;
    this.blueprints.splice(idx, 1);
    await this.persist();
    return true;
  }

  async close(): Promise<void> {
    this.initialised = false;
  }
}
