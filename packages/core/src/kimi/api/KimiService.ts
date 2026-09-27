// Kimi engine — official Moonshot API transport.
// Replaces the Connect RPC / browser-attestation path (kept in git
// history at 8565165). The old path required x-msh-shield-data issued
// by a browser VM; this one uses a standard API key.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { KimiCredentialStore } from '../storage/KimiCredentialStore';
import { KimiCallOptions, KimiServiceOptions } from '../models/KimiTypes';
import {
  KimiApiError,
  KimiAuthError,
  KimiNoCredentialsError,
} from '../models/KimiErrors';
import { log } from '../../shared/logger';
import {
  LlmEngine,
  LlmResponse,
  LlmStreamChunk,
  LlmCredentialsRedacted,
  LlmHealth,
  ENGINE_IDS,
} from '../../engines/LlmEngine';

const MOONSHOT_BASE = 'https://api.moonshot.cn/v1';
const DEFAULT_MODEL = 'moonshot-v1-8k';
const KEY_FILE = path.join(process.env.HOME || '', 'cookies', 'moonshot-api-key.txt');

function loadApiKey(): string | null {
  const fromEnv = (process.env.MOONSHOT_API_KEY || '').trim();
  if (fromEnv.startsWith('sk-')) return fromEnv;
  try {
    const fromFile = fs.readFileSync(KEY_FILE, 'utf8').trim();
    if (fromFile.startsWith('sk-')) return fromFile;
  } catch {}
  return null;
}

export class KimiService implements LlmEngine {
  readonly id = ENGINE_IDS.KIMI;
  readonly label = 'Kimi';

  private lastCallAt: number | null = null;
  private lastCallOk: boolean | null = null;
  private lastCallError: string | null = null;

  constructor(
    private readonly creds: KimiCredentialStore,
    private readonly opts: KimiServiceOptions,
  ) {}

  setCredentials(input: Record<string, unknown>): Record<string, unknown> {
    const key = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
    const stored = this.creds.set({
      cookies: typeof input.cookies === 'string' ? input.cookies : '',
      bearerToken: key.startsWith('sk-') ? key : (typeof input.bearerToken === 'string' ? input.bearerToken.trim() : undefined),
      csrfToken: typeof input.csrfToken === 'string' ? input.csrfToken : undefined,
      extraHeaders: typeof input.extraHeaders === 'object' && input.extraHeaders !== null
        ? (input.extraHeaders as Record<string, string>)
        : undefined,
    });
    return { cookiesLength: stored.cookies.length, hasBearer: !!stored.bearerToken, hasCsrf: !!stored.csrfToken };
  }

  clearCredentials(): void { this.creds.clear(); }

  hasCredentials(): boolean { return !!loadApiKey(); }

  getCredentialsRedacted(): LlmCredentialsRedacted {
    const key = loadApiKey();
    const r = this.creds.redacted();
    return {
      configured: !!key,
      hasCookies: false,
      hasBearer: !!key,
      hasExtraHeaders: false,
      acquiredAt: r.acquiredAt,
    };
  }

  getRawCredentials() {
    const key = loadApiKey();
    return { cookies: '', bearerToken: key, csrfToken: null, extraHeaders: null, acquiredAt: this.creds.redacted().acquiredAt };
  }

  private requireKey(): string {
    const key = loadApiKey();
    if (!key) throw new KimiNoCredentialsError();
    return key;
  }

  private buildHeaders(): Record<string, string> {
    return {
      'content-type': 'application/json',
      'accept': 'application/json',
      'authorization': 'Bearer ' + this.requireKey(),
    };
  }

  private promptFromInput(input: string | Array<{ role: string; content: string }>): string {
    if (typeof input === 'string') return input;
    if (!Array.isArray(input) || input.length === 0) {
      throw new KimiApiError(-1, 'messages must be a non-empty array', 0);
    }
    const last = input.filter((m) => m.role === 'user').pop();
    return last ? last.content : input[input.length - 1].content;
  }

  private buildBody(prompt: string, options: KimiCallOptions, stream: boolean) {
    return {
      model: options.model || DEFAULT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: typeof options.temperature === 'number' ? options.temperature : 0.6,
      stream,
    };
  }

  async call(
    input: string | Array<{ role: string; content: string }>,
    options: KimiCallOptions = {},
  ): Promise<LlmResponse> {
    const prompt = this.promptFromInput(input);
    try {
      const r = await fetch(MOONSHOT_BASE + '/chat/completions', {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(this.buildBody(prompt, options, false)),
        signal: options.signal,
      });
      const text = await r.text();
      let j: any = null;
      try { j = JSON.parse(text); } catch {}
      if (!r.ok) {
        this.lastCallAt = Date.now();
        this.lastCallOk = false;
        this.lastCallError = 'HTTP ' + r.status;
        if (r.status === 401 || r.status === 403) {
          throw new KimiAuthError(r.status, (j && j.error && j.error.message) || text.slice(0, 200));
        }
        throw new KimiApiError(-1, 'HTTP ' + r.status + ': ' + text.slice(0, 300), r.status);
      }
      const content = j && j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content || '' : '';
      this.lastCallAt = Date.now();
      this.lastCallOk = true;
      this.lastCallError = null;
      return {
        code: 0,
        msg: '',
        data: { content, chat_session_id: (j && j.id) || null, message_id: (j && j.id) || null },
      };
    } catch (e) {
      if (e instanceof KimiAuthError || e instanceof KimiApiError) throw e;
      this.lastCallAt = Date.now();
      this.lastCallOk = false;
      this.lastCallError = e instanceof Error ? e.message : String(e);
      throw new KimiApiError(-1, 'network: ' + this.lastCallError, 0);
    }
  }

  async *stream(
    input: string | Array<{ role: string; content: string }>,
    options: KimiCallOptions = {},
  ): AsyncGenerator<LlmStreamChunk, void, unknown> {
    const prompt = this.promptFromInput(input);
    let r: Response;
    try {
      r = await fetch(MOONSHOT_BASE + '/chat/completions', {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(this.buildBody(prompt, options, true)),
        signal: options.signal,
      });
    } catch (e) {
      yield { type: 'error', error: e instanceof Error ? e.message : String(e) };
      return;
    }
    if (!r.ok || !r.body) {
      const text = await r.text().catch(() => '');
      yield { type: 'error', error: 'HTTP ' + r.status + ': ' + text.slice(0, 200) };
      return;
    }
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          for (const line of block.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            let j: any = null;
            try { j = JSON.parse(payload); } catch { continue; }
            const delta = j && j.choices && j.choices[0] && j.choices[0].delta ? j.choices[0].delta.content : null;
            if (typeof delta === 'string' && delta.length > 0) {
              yield { type: 'chunk', content: delta, raw: payload };
            }
          }
        }
      }
      yield { type: 'done' };
    } catch (e) {
      yield { type: 'error', error: e instanceof Error ? e.message : String(e) };
    } finally {
      try { reader.releaseLock(); } catch {}
    }
  }

  isHealthy(): boolean { return this.hasCredentials(); }

  async healthCheck(): Promise<LlmHealth> {
    const key = loadApiKey();
    return {
      engineId: this.id,
      configured: !!key,
      healthy: !!key,
      bearerPrefix: key ? key.slice(0, 6) + '...' : null,
      base: MOONSHOT_BASE,
      model: DEFAULT_MODEL,
      lastCallAt: this.lastCallAt,
      lastCallOk: this.lastCallOk,
      lastCallError: this.lastCallError,
    };
  }
}
