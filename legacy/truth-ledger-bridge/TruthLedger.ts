/**
 * TruthLedger — append-only, tamper-evident log.
 *
 * JSON Lines format. Each entry stores prevHash and hash so the chain can
 * be verified independently. The file is NEVER truncated or rewritten (P1).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  Actor,
  EventType,
  LedgerEntry,
  LedgerEntryInput,
} from '../types';
import { assertNotMutatingLedger } from '../core/absoluteSource';

const LEDGER_DIR = path.resolve(process.cwd(), 'data');
const LEDGER_PATH = path.join(LEDGER_DIR, 'truth-ledger.jsonl');

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

export class TruthLedger {
  private lastHash: string | null = null;
  private lastId = 0;

  constructor() {
    fs.mkdirSync(LEDGER_DIR, { recursive: true });
    if (!fs.existsSync(LEDGER_PATH)) {
      fs.writeFileSync(LEDGER_PATH, '');
      this.lastHash = null;
      this.lastId = 0;
    } else {
      this.rehydrate();
    }
  }

  private rehydrate(): void {
    const lines = fs
      .readFileSync(LEDGER_PATH, 'utf8')
      .split('\n')
      .filter((l) => l.trim().length > 0);
    if (lines.length === 0) return;
    const last = JSON.parse(lines[lines.length - 1]) as LedgerEntry;
    this.lastHash = last.hash;
    this.lastId = last.id;
  }

  appendEntry(input: LedgerEntryInput): LedgerEntry {
    assertNotMutatingLedger('append');

    const id = this.lastId + 1;
    const timestamp = new Date().toISOString();
    const prevHash = this.lastHash;

    const bodyForHash = {
      id,
      timestamp,
      actor: input.actor,
      eventType: input.eventType,
      payload: input.payload ?? {},
      refs: input.refs ?? [],
      prevHash,
    };

    const hash = sha256(canonicalize(bodyForHash));
    const entry: LedgerEntry = { ...bodyForHash, hash };

    fs.appendFileSync(LEDGER_PATH, JSON.stringify(entry) + '\n');
    this.lastHash = hash;
    this.lastId = id;
    return entry;
  }

  readAll(): LedgerEntry[] {
    if (!fs.existsSync(LEDGER_PATH)) return [];
    return fs
      .readFileSync(LEDGER_PATH, 'utf8')
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as LedgerEntry);
  }

  verifyLedger(): { ok: boolean; brokenAt?: number; reason?: string } {
    const entries = this.readAll();
    let prevHash: string | null = null;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.prevHash !== prevHash) {
        return { ok: false, brokenAt: i, reason: 'prevHash mismatch' };
      }
      const { hash: _h, ...rest } = e;
      const computed = sha256(canonicalize(rest));
      if (computed !== e.hash) {
        return { ok: false, brokenAt: i, reason: 'hash mismatch' };
      }
      prevHash = e.hash;
    }
    return { ok: true };
  }

  getSummary(limit = 20): LedgerEntry[] {
    const all = this.readAll();
    return all.slice(-limit);
  }

  get path(): string {
    return LEDGER_PATH;
  }
}

export const ledger = new TruthLedger();
