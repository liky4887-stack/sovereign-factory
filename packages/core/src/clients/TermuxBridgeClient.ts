import { config } from '../config';
import { UpstreamError, TimeoutError } from '../shared/types/errors';
import { log } from '../shared/logger';

export interface BridgeCallOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  timeoutMs?: number;
  authToken?: string;
}

export interface BridgeRunResult {
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  truncated: boolean;
  command: string;
  args: string[];
  cwd: string;
}

export interface BridgeFileReadResult {
  path: string;
  size: number;
  content: string;
  encoding: 'utf8';
}

export interface BridgeFileWriteResult {
  path: string;
  bytesWritten: number;
}

export interface BridgeFileListEntry {
  name: string;
  path: string;
  type: 'file' | 'dir' | 'symlink' | 'other';
  size: number;
  modifiedAt: string;
}

export interface BridgeFileListResult {
  path: string;
  entries: BridgeFileListEntry[];
}

export class TermuxBridgeClient {
  private readonly baseUrl: string;
  private readonly defaultTimeoutMs: number;

  constructor(baseUrl?: string, defaultTimeoutMs = 30000) {
    this.baseUrl = (baseUrl ?? 'http://' + config.HOST + ':' + config.BRIDGE_PORT).replace(/\/+$/, '');
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  private authHeaders(token?: string): Record<string, string> {
    const t = token ?? config.BRIDGE_TOKEN;
    if (!t || !config.REQUIRE_AUTH) return {};
    return { 'x-bridge-token': t };
  }

  private async call<T>(path: string, opts: BridgeCallOptions): Promise<T> {
    const url = this.baseUrl + path;
    const timeoutMs = opts.timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: opts.method ?? 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.authHeaders(opts.authToken),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new UpstreamError('bridge ' + res.status + ' on ' + path + ': ' + text.slice(0, 300), {
          path,
          status: res.status,
        });
      }

      const json = (await res.json()) as { ok?: boolean; result?: T; status?: T; entry?: T } & T;
      return (json.result ?? json.status ?? json.entry ?? json) as T;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new TimeoutError('bridge call timed out after ' + timeoutMs + 'ms');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<{ ok: boolean; service: string; uptimeSeconds: number }> {
    return this.call('/health', { method: 'GET' });
  }

  async processStatus(): Promise<Record<string, unknown>> {
    return this.call('/process/status', { method: 'GET' });
  }

  async executeCommand(input: {
    command: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    timeoutMs?: number;
  }): Promise<BridgeRunResult> {
    log.debug('bridge.client.execute', { command: input.command });
    return this.call('/executeCommand', { method: 'POST', body: input });
  }

  async fileRead(path: string): Promise<BridgeFileReadResult> {
    return this.call('/file/read', { method: 'POST', body: { path } });
  }

  async fileWrite(path: string, content: string): Promise<BridgeFileWriteResult> {
    return this.call('/file/write', { method: 'POST', body: { path, content } });
  }

  async fileList(path: string): Promise<BridgeFileListResult> {
    return this.call('/file/list', { method: 'POST', body: { path } });
  }
}

export const termuxBridgeClient = new TermuxBridgeClient();
