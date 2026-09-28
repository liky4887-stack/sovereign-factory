// Kimi engine — talks to the local Deno gateway instead of the Kimi
// web endpoint directly.
//
// Background: Node's undici HTTP stack gets a 401 signature is invalid
// from www.kimi.ai for reasons we could not reproduce in the header/
// body layer. The same request from Deno succeeds. So the working shape
// is a small Deno gateway (~/kimi-local/main.ts) on 127.0.0.1:8088 that
// performs the Connect RPC call, and KimiService talks to the gateway
// over plain OpenAI-shaped JSON.
import { KimiCredentialStore } from '../storage/KimiCredentialStore';
import { KimiCallOptions, KimiServiceOptions } from '../models/KimiTypes';
import {
  KimiApiError,
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

const GATEWAY_URL =
  (process.env.KIMI_GATEWAY_URL || 'http://127.0.0.1:8088').replace(/\/+$/, '');
const GATEWAY_KEY = process.env.KIMI_GATEWAY_KEY || 'sk-local-kimi';
const GATEWAY_MODEL = process.env.KIMI_GATEWAY_MODEL || 'k2d6-chat';

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

  // ── Credentials (kept for interface parity; the gateway owns the real creds) ──
  setCredentials(input: Record<string, unknown>): Record<string, unknown> {
    const stored = this.creds.set({
      cookies: typeof input.cookies === 'string' ? input.cookies : '',
      bearerToken: typeof input.bearerToken === 'string' ? input.bearerToken.trim() : undefined,
      csrfToken: typeof input.csrfToken === 'string' ? input.csrfToken : undefined,
      extraHeaders: typeof input.extraHeaders === 'object' && input.extraHeaders !== null
        ? (input.extraHeaders as Record<string, string>)
        : undefined,
    });
    return { cookiesLength: stored.cookies.length, hasBearer: !!stored.bearerToken, hasCsrf: !!stored.csrfToken };
  }

  clearCredentials(): void { this.creds.clear(); }

  hasCredentials(): boolean {
    // The gateway reads the credentials itself from ~/cookies/kimi-creds.json.
    // We report true when the Kimi credential store has something.
    return this.creds.has();
  }

  getCredentialsRedacted(): LlmCredentialsRedacted {
    const r = this.creds.redacted();
    return {
      configured: r.configured,
      hasCookies: r.cookiesLength > 0,
      hasBearer: r.hasBearer,
      hasExtraHeaders: r.hasCsrf,
      acquiredAt: r.acquiredAt,
    };
  }

  getRawCredentials() { return this.creds.get(); }

  private gatewayHeaders(): Record<string, string> {
    return {
      'content-type': 'application/json',
      'accept': 'application/json',
      'authorization': 'Bearer ' + GATEWAY_KEY,
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

  private async callGateway(prompt: string, options: KimiCallOptions): Promise<string> {
    if (!this.creds.has()) {
      throw new KimiNoCredentialsError();
    }
    const model = options.model || GATEWAY_MODEL;
    const r = await fetch(GATEWAY_URL + '/v1/chat/completions', {
      method: 'POST',
      headers: this.gatewayHeaders(),
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: options.signal,
    });
    const text = await r.text();
    let j: any = null;
    try { j = JSON.parse(text); } catch {}
    if (!r.ok) {
      this.lastCallAt = Date.now();
      this.lastCallOk = false;
      const detail =
        (j && j.error && (j.error.message || j.error)) ||
        text.slice(0, 300);
      this.lastCallError = 'gateway ' + r.status + ': ' + String(detail).slice(0, 200);
      throw new KimiApiError(-1, this.lastCallError, r.status);
    }
    const content = (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    this.lastCallAt = Date.now();
    this.lastCallOk = true;
    this.lastCallError = null;
    return content;
  }

  async call(
    input: string | Array<{ role: string; content: string }>,
    options: KimiCallOptions = {},
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
      if (e instanceof KimiNoCredentialsError || e instanceof KimiApiError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      this.lastCallAt = Date.now();
      this.lastCallOk = false;
      this.lastCallError = msg;
      throw new KimiApiError(-1, 'gateway network: ' + msg, 0);
    }
  }

  async *stream(
    input: string | Array<{ role: string; content: string }>,
    options: KimiCallOptions = {},
  ): AsyncGenerator<LlmStreamChunk, void, unknown> {
    try {
      const content = await this.callGateway(this.promptFromInput(input), options);
      if (content) yield { type: 'chunk', content };
      yield { type: 'done' };
    } catch (e) {
      yield { type: 'error', error: e instanceof Error ? e.message : String(e) };
    }
  }

  isHealthy(): boolean { return this.hasCredentials(); }

  async healthCheck(): Promise<LlmHealth> {
    const r = this.creds.redacted();
    let gatewayOk = false;
    let gatewayErr: string | null = null;
    try {
      const h = await fetch(GATEWAY_URL + '/health', {
        signal: AbortSignal.timeout(3000),
      });
      gatewayOk = h.ok;
    } catch (e) {
      gatewayErr = e instanceof Error ? e.message : String(e);
    }
    return {
      engineId: this.id,
      configured: r.configured,
      healthy: r.configured && gatewayOk && this.lastCallOk !== false,
      gatewayUrl: GATEWAY_URL,
      gatewayOk,
      gatewayError: gatewayErr,
      cookiesLength: r.cookiesLength,
      hasBearer: r.hasBearer,
      hasCsrf: r.hasCsrf,
      acquiredAt: r.acquiredAt,
      lastCallAt: this.lastCallAt,
      lastCallOk: this.lastCallOk,
      lastCallError: this.lastCallError,
    };
  }
}
