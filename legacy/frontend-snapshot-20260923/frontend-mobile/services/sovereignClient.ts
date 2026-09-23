// services/sovereignClient.ts
// Single HTTP client for sovereign-core.
// All Console backend calls route through this module.
// Bearer token auth, base URL on port 8790, structured logs, real error surfacing.

import * as SecureStore from 'expo-secure-store';
import { preferences } from './preferences';

const HOST_KEY   = 'sovereign_host';
const PORT_KEY   = 'sovereign_port';
const SCHEME_KEY = 'sovereign_scheme';
const TOKEN_KEY  = 'sovereign_token';

const DEFAULT_HOST   = '192.168.43.101';
const DEFAULT_PORT   = '8790';
const DEFAULT_SCHEME: 'http' | 'https' = 'http';

const DEFAULT_TIMEOUT_MS = 15000;

async function buildBaseUrl(): Promise<string> {
  const [host, port, scheme] = await Promise.all([
    SecureStore.getItemAsync(HOST_KEY),
    SecureStore.getItemAsync(PORT_KEY),
    SecureStore.getItemAsync(SCHEME_KEY),
  ]);
  const s = scheme === 'https' ? 'https' : DEFAULT_SCHEME;
  return `${s}://${host ?? DEFAULT_HOST}:${port ?? DEFAULT_PORT}`;
}

async function readToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export class SovereignError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'SovereignError';
    this.status = status;
  }
}

export interface SovereignRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  timeoutMs?: number;
}

export const sovereignClient = {
  // ── Config ──────────────────────────────────────────────────────────
  async setHost(host: string): Promise<void> {
    await SecureStore.setItemAsync(HOST_KEY, host.trim());
  },
  async setPort(port: string): Promise<void> {
    await SecureStore.setItemAsync(PORT_KEY, port.trim());
  },
  async setScheme(scheme: 'http' | 'https'): Promise<void> {
    await SecureStore.setItemAsync(SCHEME_KEY, scheme);
  },
  async setToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(TOKEN_KEY, token.trim());
  },
  async clearToken(): Promise<void> {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  },

  async getHost(): Promise<string> {
    return (await SecureStore.getItemAsync(HOST_KEY)) ?? DEFAULT_HOST;
  },
  async getPort(): Promise<string> {
    return (await SecureStore.getItemAsync(PORT_KEY)) ?? DEFAULT_PORT;
  },
  async getScheme(): Promise<'http' | 'https'> {
    const s = await SecureStore.getItemAsync(SCHEME_KEY);
    return s === 'https' ? 'https' : 'http';
  },
  async hasToken(): Promise<boolean> {
    return !!(await readToken());
  },
  async buildHeaders(): Promise<Record<string, string>> {
    const token = await readToken();
    const ceoHeaders = await preferences.getRequestHeaders();
    const headers: Record<string, string> = { ...ceoHeaders };
    if (token) headers['authorization'] = `Bearer ${token}`;
    return headers;
  },
  async getBaseUrl(): Promise<string> {
    return buildBaseUrl();
  },

  // ── Request ─────────────────────────────────────────────────────────
  async request<T>(opts: SovereignRequestOptions): Promise<T> {
    const started = Date.now();
    const base = await buildBaseUrl();
    const token = await readToken();
    const ceoHeaders = await preferences.getRequestHeaders();

    const qs = opts.query
      ? '?' +
        Object.entries(opts.query)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join('&')
      : '';
    const url = `${base}${opts.path}${qs}`;

    const headers: Record<string, string> = { ...ceoHeaders };
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    if (token) headers['authorization'] = `Bearer ${token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: opts.method ?? 'GET',
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });

      const latencyMs = Date.now() - started;
      const text = await res.text();
      let parsed: unknown = null;
      try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }

      if (!res.ok) {
        const errMsg =
          parsed && typeof parsed === 'object' && 'error' in parsed
            ? String((parsed as { error: unknown }).error)
            : `HTTP ${res.status}`;
        console.warn('[sovereign] error', { method: opts.method ?? 'GET', path: opts.path, status: res.status, latencyMs });
        throw new SovereignError(errMsg, res.status);
      }

      console.log('[sovereign] ok', { method: opts.method ?? 'GET', path: opts.path, status: res.status, latencyMs });
      return parsed as T;
    } catch (err) {
      if (err instanceof SovereignError) throw err;
      const latencyMs = Date.now() - started;
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[sovereign] network-error', { path: opts.path, latencyMs, message });
      throw new SovereignError(message, 0);
    } finally {
      clearTimeout(timer);
    }
  },

  get: <T>(path: string, query?: Record<string, string | number | undefined>) =>
    sovereignClient.request<T>({ method: 'GET', path, query }),

  post: <T>(path: string, body?: unknown) =>
    sovereignClient.request<T>({ method: 'POST', path, body }),
};
