// DeepHat engine — talks to the local Deno gateway on 127.0.0.1:8089,
// which owns the browser-session cookie jar captured from app.deephat.ai.
//
// Mirrors KimiService.ts: thin OpenAI-shaped HTTP client to a local
// gateway. Never talks to app.deephat.ai directly.
import * as fs from 'node:fs';
import { log } from '../../shared/logger';
import {
  LlmEngine,
  LlmResponse,
  LlmStreamChunk,
  LlmCredentialsRedacted,
  LlmHealth,
  ENGINE_IDS,
} from '../../engines/LlmEngine';
import { DeepHatCallOptions } from './DeepHatTypes';
import { DeepHatApiError, DeepHatNoCredentialsError } from './DeepHatErrors';

const GATEWAY_URL = (process.env.DEEPHAT_GATEWAY_URL || 'http://127.0.0.1:8089').replace(/\/+$/, '');
const GATEWAY_KEY = process.env.DEEPHAT_GATEWAY_KEY || 'sk-local-deephat';
const GATEWAY_MODEL = process.env.DEEPHAT_GATEWAY_MODEL || 'deephat';
const CREDS_FILE = process.env.DEEPHAT_CREDS_FILE || '';

export class DeepHatService implements LlmEngine {
  readonly id = 'engine_deephat';
  readonly label = 'DeepHat';

  private lastCallAt: number | null = null;
  private lastCallOk: boolean | null = null;
  private lastCallError: string | null = null;

  constructor(private readonly opts: {
    baseUrl: string;
    requestTimeoutMs: number;
    credentialsFile?: string;
  }) {}

  setCredentials(_input: Record<string, unknown>): Record<string, unknown> {
    return { note: 'credentials managed by the DeepHat gateway' };
  }
  hasCredentials(): boolean {
    const f = this.opts.credentialsFile || CREDS_FILE;
    if (!f) return false;
    try { return fs.existsSync(f) && fs.readFileSync(f, 'utf8').length > 20; }
    catch { return false; }
  }

  getCredentialsRedacted(): LlmCredentialsRedacted {
    const ok = this.hasCredentials();
    return {
      configured: ok,
      hasCookies: ok,
      hasBearer: false,
      hasExtraHeaders: false,
      acquiredAt: null,
    };
  }

  isHealthy(): boolean { return this.hasCredentials(); }

  // ── Raw credential access (for the debug panel and CLI) ────
  getRawCredentials(): { cookies: string; authorization: string | null; acquiredAt: number | null } | null {
    const f = this.opts.credentialsFile || CREDS_FILE;
    if (!f) return null;
    try {
      if (!fs.existsSync(f)) return null;
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      return {
        cookies: typeof j.cookies === 'string' ? j.cookies : '',
        authorization: typeof j.authorization === 'string' ? j.authorization : null,
        acquiredAt: typeof j.acquiredAt === 'number' ? j.acquiredAt : null,
      };
    } catch { return null; }
  }

  writeCredentials(input: { cookies?: string; authorization?: string }): { cookiesLength: number; hasAuthorization: boolean } {
    const f = this.opts.credentialsFile || CREDS_FILE;
    if (!f) throw new Error('credentialsFile not configured');
    const next: Record<string, unknown> = { acquiredAt: Date.now() };
    if (typeof input.cookies === 'string') next.cookies = input.cookies;
    if (typeof input.authorization === 'string') next.authorization = input.authorization;
    fs.mkdirSync(require('node:path').dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
    return {
      cookiesLength: typeof next.cookies === 'string' ? (next.cookies as string).length : 0,
      hasAuthorization: typeof next.authorization === 'string' && (next.authorization as string).length > 0,
    };
  }

  clearCredentials(): void {
    const f = this.opts.credentialsFile || CREDS_FILE;
    if (!f) return;
    try { fs.unlinkSync(f); } catch {}
  }

  async healthCheck(): Promise<LlmHealth> {
    let gatewayOk = false;
    let gatewayErr: string | null = null;
    try {
      const h = await fetch(GATEWAY_URL + '/health', { signal: AbortSignal.timeout(3000) });
      gatewayOk = h.ok;
    } catch (e) {
      gatewayErr = e instanceof Error ? e.message : String(e);
    }
    return {
      engineId: this.id,
      configured: this.hasCredentials(),
      healthy: this.hasCredentials() && gatewayOk && this.lastCallOk !== false,
      gatewayUrl: GATEWAY_URL,
      gatewayOk,
      gatewayError: gatewayErr,
      lastCallAt: this.lastCallAt,
      lastCallOk: this.lastCallOk,
      lastCallError: this.lastCallError,
    };
  }

  private promptFromInput(input: string | Array<{ role: string; content: string }>): string {
    if (typeof input === 'string') return input;
    if (!Array.isArray(input) || input.length === 0) {
      throw new DeepHatApiError(-1, 'messages must be a non-empty array');
    }
    const last = input.filter((m) => m.role === 'user').pop();
    return last ? last.content : input[input.length - 1].content;
  }

  private async callGateway(prompt: string, options: DeepHatCallOptions): Promise<string> {
    if (!this.hasCredentials()) throw new DeepHatNoCredentialsError();
    const model = options.model || GATEWAY_MODEL;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.requestTimeoutMs || 300_000);
    let r: Response;
    try {
      r = await fetch(GATEWAY_URL + '/v1/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer ' + GATEWAY_KEY,
        },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),
        signal: options.signal ?? controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    const text = await r.text();
    let j: any = null;
    try { j = JSON.parse(text); } catch {}
    if (!r.ok) {
      this.lastCallAt = Date.now();
      this.lastCallOk = false;
      const detail = (j && j.error && (j.error.message || j.error)) || text.slice(0, 300);
      this.lastCallError = 'gateway ' + r.status + ': ' + String(detail).slice(0, 200);
      throw new DeepHatApiError(r.status, this.lastCallError);
    }
    const content = (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    this.lastCallAt = Date.now();
    this.lastCallOk = true;
    this.lastCallError = null;
    return content;
  }

  async call(
    input: string | Array<{ role: string; content: string }>,
    options: DeepHatCallOptions = {},
  ): Promise<LlmResponse> {
    const prompt = this.promptFromInput(input);
    try {
      const content = await this.callGateway(prompt, options);
      return {
        code: 0,
        msg: '',
        data: { content, chat_session_id: null, message_id: null },
      };
    } catch (e) {
      if (e instanceof DeepHatNoCredentialsError || e instanceof DeepHatApiError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      this.lastCallAt = Date.now();
      this.lastCallOk = false;
      this.lastCallError = msg;
      throw new DeepHatApiError(0, 'gateway network: ' + msg);
    }
  }

  async *stream(
    input: string | Array<{ role: string; content: string }>,
    options: DeepHatCallOptions = {},
  ): AsyncGenerator<LlmStreamChunk, void, unknown> {
    try {
      const content = await this.callGateway(this.promptFromInput(input), options);
      if (content) yield { type: 'chunk', content };
      yield { type: 'done' };
    } catch (e) {
      yield { type: 'error', error: e instanceof Error ? e.message : String(e) };
    }
  }
}
