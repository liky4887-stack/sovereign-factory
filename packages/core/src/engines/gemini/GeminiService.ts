// GeminiService — web-session client for gemini.google.com.
// Cookie + at-token, matching the Kimi pattern. Auth signs each request
// with SAPISIDHASH = SHA1(timestamp + " " + SAPISID + " " + origin).
import { createHash } from 'node:crypto';
import {
  LlmCallOptions,
  LlmResponse,
  LlmStreamChunk,
} from '../LlmEngine';

export interface GeminiConfig {
  baseUrl: string;
  defaultModel: string;
  requestTimeoutMs?: number;
  credentialsFile?: string;
  cookies?: string;
  atToken?: string;
}

export interface GeminiCredRaw {
  cookies: string;
  atToken: string | null;
  extraHeaders: Record<string, string> | null;
  acquiredAt: number | null;
}

interface RawMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function normalizeInput(
  input: string | Array<{ role: string; content: string }>,
): RawMessage[] {
  if (typeof input === 'string') return [{ role: 'user', content: input }];
  return input.map((m) => ({
    role: (m.role === 'assistant'
      ? 'assistant'
      : m.role === 'system'
      ? 'system'
      : 'user') as RawMessage['role'],
    content: String(m.content ?? ''),
  }));
}

function extractCookieValue(cookies: string, name: string): string | null {
  const re = new RegExp('(?:^|;\\s*)' + name + '=([^;]+)');
  const m = cookies.match(re);
  return m ? m[1] : null;
}

export class GeminiService {
  private cookies: string | null = null;
  private atToken: string | null = null;
  private extraHeaders: Record<string, string> | null = null;
  private acquiredAt: number | null = null;
  private lastCallAt: number | null = null;
  private lastCallOk: boolean | null = null;
  private lastCallError: string | null = null;

  constructor(private readonly cfg: GeminiConfig) {
    if (cfg.cookies) this.setCredentials({ cookies: cfg.cookies, atToken: cfg.atToken });
  }

  setCredentials(input: Record<string, unknown>): Record<string, unknown> {
    const cookies = typeof input.cookies === 'string' ? input.cookies.trim() : '';
    const at = typeof input.atToken === 'string' ? input.atToken.trim() : '';
    const extra = input.extraHeaders && typeof input.extraHeaders === 'object'
      ? (input.extraHeaders as Record<string, string>)
      : null;
    if (cookies) this.cookies = cookies;
    if (at) this.atToken = at;
    if (extra) this.extraHeaders = extra;
    this.acquiredAt = Date.now();
    return {
      cookiesLength: this.cookies?.length ?? 0,
      hasAtToken: this.atToken !== null,
      hasSapisid: this.sapisid() !== null,
      hasExtraHeaders: this.extraHeaders !== null,
      acquiredAt: this.acquiredAt,
    };
  }

  clearCredentials(): void {
    this.cookies = null;
    this.atToken = null;
    this.extraHeaders = null;
    this.acquiredAt = null;
  }

  hasCredentials(): boolean {
    return this.cookies !== null && this.cookies.length > 0 &&
           this.atToken !== null && this.atToken.length > 0 &&
           this.sapisid() !== null;
  }

  private sapisid(): string | null {
    if (!this.cookies) return null;
    // __Secure-3PAPISID is what Google uses for SAPISIDHASH on modern sessions;
    // fall back to SAPISID / __Secure-1PAPISID if absent.
    return (
      extractCookieValue(this.cookies, '__Secure-3PAPISID') ||
      extractCookieValue(this.cookies, 'SAPISID') ||
      extractCookieValue(this.cookies, '__Secure-1PAPISID')
    );
  }

  private buildAuthHeader(): string {
    const sapisid = this.sapisid();
    if (!sapisid) throw new Error('SAPISID cookie missing — cannot sign Gemini request');
    const ts = Math.floor(Date.now() / 1000);
    const origin = this.cfg.baseUrl;
    const hash = createHash('sha1').update(`${ts} ${sapisid} ${origin}`).digest('hex');
    return `SAPISIDHASH ${ts}_${hash}`;
  }

  getCredentialsRedacted(): GeminiCredRaw {
    return {
      cookies: this.cookies ? this.cookies.slice(0, 40) + '…' : '',
      atToken: this.atToken ? this.atToken.slice(0, 12) + '…' : null,
      extraHeaders: this.extraHeaders,
      acquiredAt: this.acquiredAt,
    };
  }

  getCredentialsFull(): GeminiCredRaw {
    return {
      cookies: this.cookies ?? '',
      atToken: this.atToken,
      extraHeaders: this.extraHeaders,
      acquiredAt: this.acquiredAt,
    };
  }

  async call(
    input: string | Array<{ role: string; content: string }>,
    options: LlmCallOptions = {},
  ): Promise<LlmResponse> {
    if (!this.hasCredentials()) {
      throw new Error(
        'Gemini credentials not configured. POST /gemini/credentials with {cookies, atToken}.',
      );
    }
    const messages = normalizeInput(input);
    const userText = messages
      .filter((m) => m.role !== 'system')
      .map((m) => m.content)
      .join('\n\n');

    // Google's batchexecute body: f.req=<URL-encoded JSON-array-of-array>
    const innerReq = [
      null,
      JSON.stringify([
        [userText],
        null,
        null,
        null,
      ]),
    ];
    const fReq = JSON.stringify([innerReq]);
    const body = new URLSearchParams({
      'f.req': fReq,
      at: this.atToken!,
    });

    const headers: Record<string, string> = {
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      authorization: this.buildAuthHeader(),
      origin: this.cfg.baseUrl,
      referer: this.cfg.baseUrl + '/app',
      'x-same-domain': '1',
    };
    if (this.cookies) headers.cookie = this.cookies;
    if (this.extraHeaders) Object.assign(headers, this.extraHeaders);

    this.lastCallAt = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.cfg.requestTimeoutMs ?? 120_000);

    try {
      const url =
        this.cfg.baseUrl +
        '/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate' +
        '?bl=boq_assistant-bard-web-server_20241125.06_p0&_reqid=1&rt=c';
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: body.toString(),
        signal: options.signal ?? ctrl.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Gemini HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      const raw = await res.text();
      const content = this.parseStreamGenerate(raw);
      this.lastCallOk = true;
      this.lastCallError = null;
      return {
        code: 0,
        msg: '',
        data: {
          content,
          chat_session_id: null,
          message_id: null,
        },
      };
    } catch (e) {
      this.lastCallOk = false;
      this.lastCallError = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  // Response is `)]}'` prefixed, then length-prefixed JSON lines with a
  // wrb.fr wrapper. Walk it, find assistant text.
  private parseStreamGenerate(raw: string): string {
    const cleaned = raw.replace(/^\)\]\}'\s*/, '');
    const lines = cleaned.split('\n');
    let out = '';
    for (const line of lines) {
      const t = line.trim();
      if (!t || t === 'wrb.fr' || t.startsWith('[') === false) {
        // Some lines are just length counters. Skip.
      }
      if (!t.includes('wrb.fr')) continue;
      // Each payload line: [["wrb.fr", null, "<json string>", ...]]
      try {
        const arr = JSON.parse(t) as any;
        for (const entry of arr) {
          if (!Array.isArray(entry)) continue;
          if (entry[0] !== 'wrb.fr' && !(entry[2] && typeof entry[2] === 'string')) continue;
          const payload = entry[2];
          if (typeof payload !== 'string') continue;
          const inner = JSON.parse(payload) as any;
          // inner[4] is an array of chunks; each chunk[1][0] is the text
          const chunks = inner?.[4];
          if (!Array.isArray(chunks)) continue;
          for (const ch of chunks) {
            const text = ch?.[1]?.[0];
            if (typeof text === 'string') out += text;
          }
        }
      } catch {
        continue;
      }
    }
    return out;
  }

  async *stream(
    input: string | Array<{ role: string; content: string }>,
    options: LlmCallOptions = {},
  ): AsyncGenerator<LlmStreamChunk, void, unknown> {
    const r = await this.call(input, options);
    yield { type: 'chunk', content: r.data.content };
    yield { type: 'done' };
  }

  async healthCheck() {
    return {
      engineId: 'engine_gemini',
      configured: this.hasCredentials(),
      healthy: this.hasCredentials(),
      cookiesLength: this.cookies?.length ?? 0,
      hasAtToken: this.atToken !== null,
      hasSapisid: this.sapisid() !== null,
      hasExtraHeaders: this.extraHeaders !== null,
      acquiredAt: this.acquiredAt,
      lastCallAt: this.lastCallAt,
      lastCallOk: this.lastCallOk,
      lastCallError: this.lastCallError,
      provider: 'gemini.google.com',
      model: this.cfg.defaultModel,
    };
  }
}
