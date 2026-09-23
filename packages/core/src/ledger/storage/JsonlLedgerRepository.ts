import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { LedgerRepository, IntegrityResult } from './LedgerRepository';
import {
  LedgerEntry,
  LedgerEntryInput,
  LedgerQuery,
  LedgerQueryResult,
} from '../models/LedgerEntry';

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const parts = keys.map(
    (k) => JSON.stringify(k) + ':' + canonicalize((value as any)[k]),
  );
  return '{' + parts.join(',') + '}';
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

function newId(): string {
  return 'led_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex');
}

export class JsonlLedgerRepository implements LedgerRepository {
  private readonly filePath: string;
  private lastHash: string | null = null;
  private entryCount = 0;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async init(): Promise<void> {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, '', { mode: 0o600 });
      this.lastHash = null;
      this.entryCount = 0;
      return;
    }
    const lines = this.readLines();
    this.entryCount = lines.length;
    if (lines.length > 0) {
      const last = JSON.parse(lines[lines.length - 1]) as LedgerEntry;
      this.lastHash = last.hash;
    } else {
      this.lastHash = null;
    }
  }

  private readLines(): string[] {
    if (!fs.existsSync(this.filePath)) return [];
    return fs
      .readFileSync(this.filePath, 'utf8')
      .split('\n')
      .filter((l) => l.trim().length > 0);
  }

  async append(input: LedgerEntryInput): Promise<LedgerEntry> {
    const createdAt = new Date().toISOString();
    const id = newId();
    const prevHash = this.lastHash;

    const bodyForHash = {
      id,
      createdAt,
      type: input.type,
      source: input.source,
      correlationId: input.correlationId ?? null,
      tags: input.tags ?? [],
      payload: input.payload ?? {},
      prevHash,
    };

    const hash = sha256(canonicalize(bodyForHash));

    const entry: LedgerEntry = {
      id,
      createdAt,
      type: input.type,
      source: input.source,
      correlationId: input.correlationId,
      tags: input.tags ?? [],
      payload: input.payload ?? {},
      prevHash,
      hash,
    };

    const line = JSON.stringify(entry) + '\n';
    await fs.promises.appendFile(this.filePath, line, { mode: 0o600 });

    this.lastHash = hash;
    this.entryCount += 1;
    return entry;
  }

  async query(q: LedgerQuery): Promise<LedgerQueryResult> {
    const all = this.readLines().map((l) => JSON.parse(l) as LedgerEntry);
    let filtered = all;

    if (q.type) filtered = filtered.filter((e) => e.type === q.type);
    if (q.source) filtered = filtered.filter((e) => e.source === q.source);
    if (q.correlationId) filtered = filtered.filter((e) => e.correlationId === q.correlationId);
    if (q.tags && q.tags.length > 0) {
      filtered = filtered.filter((e) =>
        q.tags!.every((t) => (e.tags ?? []).includes(t)),
      );
    }
    if (q.since) filtered = filtered.filter((e) => e.createdAt >= q.since!);
    if (q.until) filtered = filtered.filter((e) => e.createdAt <= q.until!);

    // newest first
    filtered = filtered.slice().reverse();

    const total = filtered.length;
    const limit = q.limit ?? 50;
    const offset = q.offset ?? 0;
    const entries = filtered.slice(offset, offset + limit);

    return { entries, total, limit, offset };
  }

  async getById(id: string): Promise<LedgerEntry | null> {
    const lines = this.readLines();
    for (let i = lines.length - 1; i >= 0; i--) {
      const e = JSON.parse(lines[i]) as LedgerEntry;
      if (e.id === id) return e;
    }
    return null;
  }

  async count(): Promise<number> {
    return this.entryCount;
  }

  async verifyIntegrity(): Promise<IntegrityResult> {
    const lines = this.readLines();
    let prevHash: string | null = null;
    for (let i = 0; i < lines.length; i++) {
      let e: LedgerEntry;
      try {
        e = JSON.parse(lines[i]) as LedgerEntry;
      } catch {
        return { ok: false, brokenAt: 'line_' + i, reason: 'json_parse_error' };
      }

      if (e.prevHash !== prevHash) {
        return { ok: false, brokenAt: e.id, reason: 'prevHash_mismatch' };
      }

      const bodyForHash = {
        id: e.id,
        createdAt: e.createdAt,
        type: e.type,
        source: e.source,
        correlationId: e.correlationId ?? null,
        tags: e.tags ?? [],
        payload: e.payload ?? {},
        prevHash: e.prevHash,
      };

      const computed = sha256(canonicalize(bodyForHash));
      if (computed !== e.hash) {
        return { ok: false, brokenAt: e.id, reason: 'hash_mismatch' };
      }

      prevHash = e.hash;
    }
    return { ok: true };
  }

  async close(): Promise<void> {
    // JSONL file has no open handle to release.
    return;
  }
}
