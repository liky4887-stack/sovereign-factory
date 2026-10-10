// ChatGptService — chatgpt.com cookie+token client.
// Fixes 403 "Unusual activity" by using the correct two-call Sentinel flow:
//   POST /backend-api/sentinel/chat-requirements/prepare   → prepare_token
//   POST /backend-api/sentinel/chat-requirements           → chat-req-token + PoW seed/diff
//   solve SHA3-512 PoW locally                             → proof_token
//   POST /backend-api/conversation with both as headers
//
// References:
//   github.com/starbaser/ccproxy@a9a50ad  (prepare→finalize flow)
//   github.com/diegosouzapw/OmniRoute PR #1593  (warmup + prekey shape)
//   github.com/Octo-Lex/ChatGPT-Web2API/docs/protocol-reference.md (protocol)

import { createHash, randomUUID } from 'node:crypto';
import { LlmCallOptions, LlmResponse, LlmStreamChunk } from '../LlmEngine';

export interface ChatGptConfig {
  baseUrl: string;
  defaultModel: string;
  requestTimeoutMs?: number;
  userAgent?: string;
  cookies?: string;
}

const DEFAULT_UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36';

interface RawMessage { role: 'system' | 'user' | 'assistant'; content: string; }

function normalizeInput(input: string | Array<{ role: string; content: string }>): RawMessage[] {
  if (typeof input === 'string') return [{ role: 'user', content: input }];
  return input.map((m) => ({
    role: (m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user') as RawMessage['role'],
    content: String(m.content ?? ''),
  }));
}

// ─── 18-element browser fingerprint prekey ──────────────────────
// Matches chat2api / openai-sentinel shape. Includes U+2212 MINUS SIGN
// in "webdriver−false" (not ASCII hyphen). Thin shapes get escalated to
// mandatory Turnstile, per OmniRoute PR #1593.
function buildPrekey(ua: string, attempt = 0, performanceNow = 0): any[] {
  const dateStr = new Date().toUTCString().replace('GMT', 'GMT+0000 (Coordinated Universal Time)');
  const navKeys = [
    'registerProtocolHandler\u2212function registerProtocolHandler() { [native code] }',
    'storage\u2212[object StorageManager]',
    'appCodeName\u2212Mozilla',
    'webdriver\u2212false',
  ];
  const docKeys = ['_reactListening'];
  const winKeys = ['window', 'self', 'document'];

  return [
    1920 + 1080,                                                   // 0 screen sum
    dateStr,                                                       // 1 date string
    4294705152,                                                    // 2 fixed constant
    attempt,                                                       // 3 attempt counter
    ua,                                                            // 4 user agent
    'https://chatgpt.com/backend-api/sentinel/sdk.js',             // 5 script url
    'prod-a194cd50d4416d3c0b47c740f206b12ce60f5887',               // 6 build id
    'en-US',                                                       // 7 language
    'en-US,en',                                                    // 8 languages
    performanceNow,                                                // 9 performance.now()
    navKeys[Math.floor(Math.random() * navKeys.length)],           // 10
    docKeys[0],                                                    // 11
    winKeys[Math.floor(Math.random() * winKeys.length)],           // 12
    Math.floor(Math.random() * 1e9),                               // 13
    '',                                                            // 14
    '',                                                            // 15
    '',                                                            // 16
    Math.floor(Date.now() / 1000),                                 // 17 time origin
  ];
}

// ─── SHA3-512 PoW ───────────────────────────────────────────────
function solvePow(seed: string, difficulty: string, ua: string): string {
  const target = Buffer.from(difficulty, 'hex');
  const diffLen = Math.floor(difficulty.length / 2);
  const seedBytes = Buffer.from(seed, 'utf8');

  for (let i = 0; i < 500000; i++) {
    const cfg = buildPrekey(ua, i, i >> 1);
    const encoded = Buffer.from(JSON.stringify(cfg), 'utf8').toString('base64');
    const hash = createHash('sha3-512')
      .update(seedBytes)
      .update(Buffer.from(encoded, 'utf8'))
      .digest();
    let ok = true;
    for (let b = 0; b < diffLen; b++) {
      if (hash[b] < target[b]) { ok = true; break; }
      if (hash[b] > target[b]) { ok = false; break; }
    }
    if (ok) return 'gAAAAAB' + encoded;
  }
  // Fallback per gpt4free
  const fb = Buffer.from(JSON.stringify(seed), 'utf8').toString('base64');
  return 'gAAAAABwQ8Lk5FbGpA2NcR9dShT6gYjU7VxZ4D' + fb;
}

// ─── Service ─────────────────────────────────────────────────────
async function fetchWithContext(url: string, init: RequestInit, timeoutMs = 60000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`fetch(${url.replace('https://chatgpt.com', '')}) failed: ${msg}`);
  } finally {
    clearTimeout(timer);
  }
}

export class ChatGptService {
  private cookies: string | null = null;
  private accessToken: string | null = null;
  private csrfToken: string | null = null;
  private deviceId: string;
  private acquiredAt: number | null = null;
  private lastCallAt: number | null = null;
  private lastCallOk: boolean | null = null;
  private lastCallError: string | null = null;
  private readonly ua: string;
  private warmedUp = false;

  constructor(private readonly cfg: ChatGptConfig) {
    this.deviceId = randomUUID();
    this.ua = cfg.userAgent || DEFAULT_UA;
    if (cfg.cookies) this.setCredentials({ cookies: cfg.cookies });
  }

  setCredentials(input: Record<string, unknown>): Record<string, unknown> {
    const cookies = typeof input.cookies === 'string' ? input.cookies.trim() : '';
    if (cookies) {
      this.cookies = cookies;
      this.acquiredAt = Date.now();
      this.accessToken = null;
      this.csrfToken = null;
      this.warmedUp = false;
    }
    return { cookiesLength: this.cookies?.length ?? 0, acquiredAt: this.acquiredAt };
  }

  clearCredentials(): void {
    this.cookies = null;
    this.accessToken = null;
    this.csrfToken = null;
    this.acquiredAt = null;
    this.warmedUp = false;
  }

  hasCredentials(): boolean {
    return this.cookies !== null && this.cookies.length > 0;
  }

  getCredentialsRedacted() {
    return {
      configured: this.hasCredentials(),
      cookiesLength: this.cookies?.length ?? 0,
      hasAccessToken: this.accessToken !== null,
      acquiredAt: this.acquiredAt,
    };
  }

  async healthCheck() {
    return {
      engineId: 'engine_chatgpt',
      configured: this.hasCredentials(),
      healthy: this.hasCredentials(),
      cookiesLength: this.cookies?.length ?? 0,
      hasAccessToken: this.accessToken !== null,
      acquiredAt: this.acquiredAt,
      lastCallAt: this.lastCallAt,
      lastCallOk: this.lastCallOk,
      lastCallError: this.lastCallError,
      provider: 'chatgpt.com',
      model: this.cfg.defaultModel,
    };
  }

  private baseHeaders(): Record<string, string> {
    return {
      'cookie': this.cookies!,
      'user-agent': this.ua,
      'accept': '*/*',
      'accept-language': 'en-US,en;q=0.9',
      'oai-device-id': this.deviceId,
      'oai-language': 'en-US',
    };
  }

  private async _fetchTokens(): Promise<void> {
    if (!this.cookies) throw new Error('No cookies');

    const sessionRes = await fetchWithContext(this.cfg.baseUrl + '/api/auth/session', { headers: this.baseHeaders() });
    if (!sessionRes.ok) throw new Error(`Session fetch failed: ${sessionRes.status}`);
    const session = (await sessionRes.json()) as any;
    if (!session.accessToken) throw new Error('No accessToken in session response');
    this.accessToken = session.accessToken;

    const csrfRes = await fetchWithContext(this.cfg.baseUrl + '/api/auth/csrf', { headers: this.baseHeaders() });
    if (!csrfRes.ok) throw new Error(`CSRF fetch failed: ${csrfRes.status}`);
    const csrf = (await csrfRes.json()) as any;
    this.csrfToken = csrf.csrfToken;
  }

  // GET /backend-api/me warms the session so Sentinel scores us as a
  // returning user rather than a cold bot.
  private async _warmup(): Promise<void> {
    if (this.warmedUp || !this.accessToken) return;
    try {
      await fetchWithContext(this.cfg.baseUrl + '/backend-api/me', {
        headers: { ...this.baseHeaders(), 'authorization': `Bearer ${this.accessToken}` },
      });
      await fetchWithContext(this.cfg.baseUrl + '/backend-api/conversations?offset=0&limit=1&order=updated', {
        headers: { ...this.baseHeaders(), 'authorization': `Bearer ${this.accessToken}` },
      });
      this.warmedUp = true;
    } catch {
      // Warmup is best-effort; if it fails, proceed anyway.
      this.warmedUp = true;
    }
  }

  // Two-call Sentinel flow — matches ccproxy's fix and OmniRoute's PR.
  // Single-call /sentinel/req yields chatgpt-noauth → 403 Unusual activity.
  private async _getSentinelTokens(): Promise<{ requirements: string; proof: string }> {
    if (!this.accessToken || !this.cookies) throw new Error('Auth tokens not ready');

    const authHeaders: Record<string, string> = {
      'authorization': `Bearer ${this.accessToken}`,
      'cookie': this.cookies,
      'content-type': 'application/json',
      'user-agent': this.ua,
      'origin': this.cfg.baseUrl,
      'referer': this.cfg.baseUrl + '/',
      'accept': '*/*',
      'accept-language': 'en-US,en;q=0.9',
      'oai-device-id': this.deviceId,
      'oai-language': 'en-US',
    };

    // ─── Call 1: prepare ─────────────────────────────────────
    const prekey = buildPrekey(this.ua, 0, 0);
    const pToken = 'gAAAAAC' + Buffer.from(JSON.stringify(prekey), 'utf8').toString('base64');

    const prepareRes = await fetchWithContext(
      this.cfg.baseUrl + '/backend-api/sentinel/chat-requirements/prepare',
      { method: 'POST', headers: authHeaders, body: JSON.stringify({ p: pToken }) },
    );
    if (!prepareRes.ok) {
      const text = await prepareRes.text().catch(() => '');
      throw new Error(`Sentinel prepare failed: ${prepareRes.status} ${text.slice(0, 200)}`);
    }
    const prepareData = (await prepareRes.json()) as any;
    const prepareToken = prepareData.prepare_token;
    if (!prepareToken) throw new Error('No prepare_token in prepare response');

    // ─── Call 2: finalize ────────────────────────────────────
    const finalizeRes = await fetchWithContext(
      this.cfg.baseUrl + '/backend-api/sentinel/chat-requirements',
      {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ prepare_token: prepareToken }),
      },
    );
    if (!finalizeRes.ok) {
      const text = await finalizeRes.text().catch(() => '');
      throw new Error(`Sentinel finalize failed: ${finalizeRes.status} ${text.slice(0, 200)}`);
    }
    const finalizeData = (await finalizeRes.json()) as any;

    // ─── PoW ─────────────────────────────────────────────────
    let proofToken = '';
    const pow = finalizeData.proofofwork;
    if (pow?.required && pow.seed && pow.difficulty) {
      proofToken = solvePow(pow.seed, pow.difficulty, this.ua);
    }

    return {
      requirements: finalizeData.token || '',
      proof: proofToken,
    };
  }

  async call(input: string | Array<{ role: string; content: string }>, options: LlmCallOptions = {}): Promise<LlmResponse> {
    if (!this.hasCredentials()) throw new Error('ChatGPT credentials not configured');
    this.lastCallAt = Date.now();

    try {
      if (!this.accessToken || !this.csrfToken) await this._fetchTokens();
      await this._warmup();
      const { requirements, proof } = await this._getSentinelTokens();

      const messages = normalizeInput(input);
      const userText = messages.filter((m) => m.role !== 'system').map((m) => m.content).join('\n\n');

      const body: Record<string, unknown> = {
        action: 'next',
        messages: [{
          id: randomUUID(),
          author: { role: 'user' },
          content: { content_type: 'text', parts: [userText] },
          metadata: {},
        }],
        model: this.cfg.defaultModel || 'auto',
        parent_message_id: randomUUID(),
        conversation_mode: { kind: 'primary_assistant' },
        conversation_id: null,
        timezone_offset_min: -120,
        suggestions: [],
        history_and_training_disabled: false,
        system_hints: [],
        supports_buffering: true,
        supported_encodings: ['v1'],
        client_contextual_info: {
          is_dark_mode: false,
          time_since_loaded: 5000,
          page_height: 945,
          page_width: 1920,
          pixel_ratio: 2,
          screen_height: 1080,
          screen_width: 1920,
          app_name: 'chatgpt.com',
        },
        force_parallel_switch: 'auto',
      };

      const headers: Record<string, string> = {
        'content-type': 'application/json',
        'authorization': `Bearer ${this.accessToken}`,
        'cookie': this.cookies!,
        'csrf-token': this.csrfToken!,
        'openai-sentinel-chat-requirements-token': requirements,
        'openai-sentinel-proof-token': proof,
        'user-agent': this.ua,
        'origin': this.cfg.baseUrl,
        'referer': this.cfg.baseUrl + '/',
        'accept': 'text/event-stream',
        'accept-language': 'en-US,en;q=0.9',
        'oai-device-id': this.deviceId,
        'oai-language': 'en-US',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
      };

      const res = await fetchWithContext(this.cfg.baseUrl + '/backend-api/conversation', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`ChatGPT HTTP ${res.status}: ${text.slice(0, 300)}`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let content = '';
      let conversationId: string | null = null;

      if (reader) {
        let buffer = '';
        // v1 delta-encoding state: reconstruct assistant text from patches.
        // Protocol: `data: {"p":"<path>","o":"add|append|replace","v":<value>}`
        //   - add with p="" and v.message  → new message object
        //   - append with p="/message/content/parts/0" and v=string → text chunk
        //   - replace with same path → overwrite text
        let assistantText = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith('data:')) continue;
            const payload = t.slice(5).trim();
            if (payload === '[DONE]') break;
            try {
              const j = JSON.parse(payload) as any;

              // conversation_id can appear at various nesting levels
              if (j.conversation_id) conversationId = j.conversation_id;
              if (j.v?.conversation_id) conversationId = j.v.conversation_id;

              // ── Shape A: message add. {"v":{"message":{...}}, "c":N}
              //    No top-level `o`. The author tells us whether it's the
              //    user echo, a system rebase, or the assistant's reply.
              if (j.v?.message) {
                const m = j.v.message;
                if (
                  m.author?.role === 'assistant' &&
                  Array.isArray(m.content?.parts)
                ) {
                  const joined = m.content.parts.join('');
                  // A new assistant message resets the accumulator; empty
                  // parts mean "will be filled by append patches later".
                  if (m.content.content_type === 'text') {
                    assistantText = joined; // may be '' — patches will append
                  }
                }
              }

              // ── Shape B: batch patch. {"o":"patch","v":[{p,o,v},...]}
              //    Each patch element applies a single mutation.
              if (j.o === 'patch' && Array.isArray(j.v)) {
                for (const patch of j.v) {
                  if (
                    typeof patch.p === 'string' &&
                    patch.p.indexOf('/message/content/parts/0') === 0
                  ) {
                    if (patch.o === 'append' && typeof patch.v === 'string') {
                      assistantText += patch.v;
                    } else if (patch.o === 'replace' && typeof patch.v === 'string') {
                      assistantText = patch.v;
                    }
                  }
                }
              }

              // ── Shape C: standalone patch on the top level.
              if (
                (j.o === 'append' || j.o === 'replace') &&
                typeof j.p === 'string' &&
                j.p.indexOf('/message/content/parts/0') === 0 &&
                typeof j.v === 'string'
              ) {
                assistantText = j.o === 'append' ? assistantText + j.v : j.v;
              }

              // ── Shape D: legacy non-delta fallback.
              if (
                j.message?.author?.role === 'assistant' &&
                Array.isArray(j.message.content?.parts)
              ) {
                const joined = j.message.content.parts.join('');
                if (joined && joined.trim().length > 0) assistantText = joined;
              }
            } catch { /* partial chunk */ }
          }
        }
        if (assistantText) content = assistantText;
      }

      this.lastCallOk = true;
      this.lastCallError = null;
      return {
        code: 0,
        msg: '',
        data: { content, chat_session_id: conversationId, message_id: null },
      };
    } catch (e) {
      this.lastCallOk = false;
      this.lastCallError = e instanceof Error ? e.message : String(e);
      throw e;
    }
  }

  async *stream(input: string | Array<{ role: string; content: string }>, options: LlmCallOptions = {}): AsyncGenerator<LlmStreamChunk, void, unknown> {
    const r = await this.call(input, options);
    yield { type: 'chunk', content: r.data.content };
    yield { type: 'done' };
  }
}
