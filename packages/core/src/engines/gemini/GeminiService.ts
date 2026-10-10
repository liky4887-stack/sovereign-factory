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
  private _atCached: string | null = null;
  private _atExpiresAt = 0;

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
    // Reference implementations (HanaokaYuzu/Gemini-API, ntthanh2603/gemini-web-to-api)
    // use __Secure-1PSID + __Secure-1PSIDTS cookies + at token. No SAPISID signing.
    return this.cookies !== null && this.cookies.length > 0
        && this.atToken !== null && this.atToken.length > 0
        && this.cookies.includes('__Secure-1PSID');
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

  private buildAuthHeader(): string | null {
    // Gemini web does NOT use SAPISIDHASH. The __Secure-1PSID cookie is the session.
    // Reference: HanaokaYuzu/Gemini-API src/gemini_webapi/utils/get_access_token.py
    return null;
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

  /**
   * Fetch a fresh `at` token from gemini.google.com/app.
   * The SNlM0e value is embedded in the page HTML and rotates every ~2 minutes,
   * so we refresh on demand with a 60-second cache.
   * Reference: HanaokaYuzu/Gemini-API get_access_token.py
   */
  private async refreshAtToken(force = false): Promise<string> {
    if (!force && this._atCached && Date.now() < this._atExpiresAt) {
      return this._atCached;
    }
    if (!this.cookies) throw new Error('Gemini cookies missing');
    try {
      const res = await fetch('https://gemini.google.com/app', {
        method: 'GET',
        headers: {
          cookie: this.cookies,
          'user-agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'en-US,en;q=0.9',
        },
      });
      if (!res.ok) throw new Error(`at refresh HTTP ${res.status}`);
      const html = await res.text();
      const m = html.match(/"SNlM0e":"([^"]+)"/);
      if (!m) throw new Error('SNlM0e not found in page HTML');
      this._atCached = m[1];
      this._atExpiresAt = Date.now() + 60_000;
      return m[1];
    } catch (e) {
      // Fall back to cached/static value from creds file on refresh failure.
      if (this.atToken) {
        this._atCached = this.atToken;
        this._atExpiresAt = Date.now() + 30_000;
        return this.atToken;
      }
      throw e;
    }
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

    // Refresh `at` on every call — it rotates every ~2 minutes.
    const atToken = await this.refreshAtToken();

    // 102-element sparse array — Gemini's StreamGenerate JSPB payload.
    // Reference: zread.ai/WslzGmzs/gemini-web2api-pool §"Field Index Mapping"
    // + Sophomoresty/gemini-web2api (2.1k stars, verified working)
    //   inner[79] modelNumber: 1–64 (1 = default model)
    //   inner[80] extendedThinking: 1 = off, 2 = on
    //   inner[17] thinkingMode: [[0]] standard, [[N]] N=thinking depth
    // NOTE: array MUST be at least 102 long — short arrays return [13].
    const inner: any[] = new Array(102).fill(null);
    inner[0] = [userText, 0, null, null, null, null, 0];
    inner[1] = ['en'];
    inner[2] = ['', '', '', null, null, null, null, null, null, ''];
    inner[6] = [0];
    inner[7] = 1;
    inner[10] = 1;
    inner[11] = 0;
    inner[17] = [[0]];
    inner[18] = 0;
    inner[27] = 1;
    inner[30] = [4];
    inner[41] = [2];
    inner[45] = 1;
    inner[53] = 0;
    inner[59] = (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)).toUpperCase();
    inner[61] = [];
    inner[68] = 1;
    inner[79] = 1;
    inner[80] = 1;

    const fReq = JSON.stringify([null, JSON.stringify(inner)]);
    const body = new URLSearchParams({
      'f.req': fReq,
      at: atToken,
    });

    const headers: Record<string, string> = {
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      origin: this.cfg.baseUrl,
      referer: this.cfg.baseUrl + '/app',
      'x-same-domain': '1',
    };
    const auth = this.buildAuthHeader();
    if (auth) headers.authorization = auth;
    if (this.cookies) headers.cookie = this.cookies;
    // Side-channel headers — model selection + request tracing.
    // Reference: zread.ai/WslzGmzs/gemini-web2api-pool §"Model Selection Headers"
    //            + yeahhe365/Gemini-Nexus §"StreamGenerate"
    // Model hashes (Gemini-Nexus, verified 2026-09-03):
    //   56fdd199312815e2 = 3.8 Flash (default)
    //   cf41b0e0dd7d53e5 = 3.5 Flash-Lite
    //   e6fa609c3fa255c0 = 3.1 Pro
    const reqId = (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)).toUpperCase();
    headers['x-goog-ext-525001261-jspb'] =
      '[1,null,null,null,"56fdd199312815e2",null,null,0,[4],null,null,null,null,6,null,"' + reqId + '"]';
    headers['x-goog-ext-525005358-jspb'] = '["' + reqId + '",1]';
    headers['x-goog-ext-73010989-jspb'] = '[0]';
    headers['x-goog-ext-73010990-jspb'] = '[0,0,0]';
    if (this.extraHeaders) Object.assign(headers, this.extraHeaders);

    this.lastCallAt = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.cfg.requestTimeoutMs ?? 120_000);

    try {
      const liveBl = (this.extraHeaders as any)?._bl || 'boq_assistant-bard-web-server_20260716.08_p0';
      const liveFsid = (this.extraHeaders as any)?._fsid || '';
      const reqId = String(Math.floor(Math.random() * 900000) + 100000);
      const url =
        this.cfg.baseUrl +
        '/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate' +
        '?bl=' + encodeURIComponent(liveBl) +
        '&hl=en' +
        '&_reqid=' + reqId +
        (liveFsid ? '&f.sid=' + encodeURIComponent(liveFsid) : '') +
        '&rt=c';
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
      // Debug: dump raw response so we can inspect the true nesting shape.
      // Log first 2000 chars (enough to see wrb.fr + inner JSON structure).
      try {
        const fs = require('node:fs');
        fs.writeFileSync(
          process.env.HOME + '/gemini-raw-response.txt',
          raw
        );
      } catch {}
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
  // wrb.fr wrapper. Parse each JSON payload and walk to inner[4] for text.
  // Reference: xtekky/gpt4free Gemini.py _extract_response_content()
  private parseStreamGenerate(raw: string): string {
    const cleaned = raw.replace(/^\)\]\}'\s*/, '');
    const lines = cleaned.split('\n');
    const snapshots: string[] = [];
    for (const line of lines) {
      const t = line.trim();
      if (!t.includes('wrb.fr')) continue;
      try {
        const arr = JSON.parse(t) as any;
        for (const entry of arr) {
          if (!Array.isArray(entry)) continue;
          const payload = entry[2];
          if (typeof payload !== 'string') continue;
          const inner = JSON.parse(payload) as any;
          // inner[4] is the array of content parts
          const parts = inner?.[4];
          if (!Array.isArray(parts)) continue;
          for (const part of parts) {
            if (!Array.isArray(part) || part.length <= 1) continue;
            const values = part[1];
            if (typeof values === 'string') {
              snapshots.push(values);
            } else if (Array.isArray(values)) {
              for (const v of values) {
                if (typeof v === 'string') snapshots.push(v);
              }
            }
          }
        }
      } catch {
        continue;
      }
    }
    // Return the longest snapshot — that's the final response, not a partial chunk.
    if (snapshots.length === 0) return '';
    return snapshots.reduce((a, b) => (a.length >= b.length ? a : b));
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
