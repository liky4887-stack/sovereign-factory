import { config } from '../config';
import { UpstreamError, TimeoutError } from '../shared/types/errors';
import {
  LedgerEntry,
  LedgerEntryInput,
  LedgerEntryType,
  LedgerQuery,
  LedgerQueryResult,
} from '../ledger/models/LedgerEntry';

export class TruthLedgerClient {
  private readonly baseUrl: string;
  private readonly defaultTimeoutMs: number;

  constructor(baseUrl?: string, defaultTimeoutMs = 15000) {
    this.baseUrl = (baseUrl ?? 'http://' + config.HOST + ':' + config.BRIDGE_PORT).replace(/\/+$/, '');
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  private authHeaders(): Record<string, string> {
    if (!config.BRIDGE_TOKEN || !config.REQUIRE_AUTH) return {};
    return { 'x-bridge-token': config.BRIDGE_TOKEN };
  }

  private async call<T>(path: string, init: RequestInit, timeoutMs?: number): Promise<T> {
    const url = this.baseUrl + path;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs ?? this.defaultTimeoutMs);
    try {
      const res = await fetch(url, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...this.authHeaders(), ...(init.headers as Record<string, string> | undefined) },
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new UpstreamError('ledger ' + res.status + ' on ' + path + ': ' + text.slice(0, 300));
      }
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new TimeoutError('ledger call timed out');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async append(input: LedgerEntryInput): Promise<LedgerEntry> {
    const json = await this.call<{ ok: true; entry: LedgerEntry }>('/ledger/append', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return json.entry;
  }

  async query(q: LedgerQuery): Promise<LedgerQueryResult> {
    const params = new URLSearchParams();
    if (q.type) params.set('type', q.type);
    if (q.source) params.set('source', q.source);
    if (q.correlationId) params.set('correlationId', q.correlationId);
    if (q.tags && q.tags.length > 0) params.set('tags', q.tags.join(','));
    if (q.since) params.set('since', q.since);
    if (q.until) params.set('until', q.until);
    if (q.limit !== undefined) params.set('limit', String(q.limit));
    if (q.offset !== undefined) params.set('offset', String(q.offset));

    const qs = params.toString();
    const path = qs.length > 0 ? '/ledger/query?' + qs : '/ledger/query';
    const json = await this.call<{ ok: true; entries: LedgerEntry[]; total: number; limit: number; offset: number }>(path, { method: 'GET' });
    return { entries: json.entries, total: json.total, limit: json.limit, offset: json.offset };
  }

  async getById(id: string): Promise<LedgerEntry | null> {
    const json = await this.call<{ ok: true; entry: LedgerEntry }>('/ledger/entry/' + encodeURIComponent(id), { method: 'GET' });
    return json.entry ?? null;
  }

  async integrity(): Promise<{ ok: boolean; integrity: { ok: boolean; brokenAt?: string; reason?: string }; count: number }> {
    return this.call('/ledger/integrity', { method: 'GET' });
  }

  async appendSafe(input: {
    type: LedgerEntryType;
    source: string;
    payload: Record<string, unknown>;
    correlationId?: string;
    tags?: string[];
  }): Promise<LedgerEntry | null> {
    try {
      return await this.append(input);
    } catch {
      return null;
    }
  }
}

export const truthLedgerClient = new TruthLedgerClient();
