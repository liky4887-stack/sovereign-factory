// Qwen engine — service layer. Real protocol per captured browser traffic.
// Auth: Bearer accessToken (JWT, ~15 min) + WAF cookie jar + bx-* fingerprints.
// Endpoint: POST /api/v2/chat/completions?chat_id=<id>
// Body: matches the exact shape Qwen's web client sends.
import * as crypto from 'node:crypto';
import { QwenCredentialStore } from '../storage/QwenCredentialStore';
import {
  QwenCallOptions,
  QwenResponse,
  QwenServiceOptions,
  QwenPathToken,
} from '../models/QwenTypes';
import {
  QwenApiError,
  QwenAuthError,
  QwenNoCredentialsError,
} from '../models/QwenErrors';
import { log } from '../../shared/logger';
import {
  LlmEngine,
  LlmResponse,
  LlmStreamChunk,
  LlmCredentialsRedacted,
  LlmHealth,
  ENGINE_IDS,
} from '../../engines/LlmEngine';
import { QwenThrottle, QwenWafBreaker, QwenWafBlockedError, detectQwenWafPunishment } from '../resilience';

interface SseState {
  text: string;
  phase: string | null;
  chatId: string | null;
  parentId: string | null;
}

const QWEN_AUTH_BASE = 'https://auth.qwen.ai';
const QWEN_REFRESH_PATH = '/api/v2/auths/refresh';

function formatTimezone(): string {
  const d = new Date().toString();
  const idx = d.indexOf(' (');
  return idx > 0 ? d.slice(0, idx) : d;
}

function mergeSetCookies(jar: string, setCookies: string[]): string {
  if (!setCookies || setCookies.length === 0) return jar;
  const map = new Map<string, string>();
  for (const part of jar.split(';')) {
    const t = part.trim();
    if (!t) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    map.set(t.slice(0, eq), t.slice(eq + 1));
  }
  for (const sc of setCookies) {
    const first = sc.split(';')[0].trim();
    const eq = first.indexOf('=');
    if (eq < 0) continue;
    map.set(first.slice(0, eq), first.slice(eq + 1));
  }
  return Array.from(map.entries()).map(([k, v]) => k + '=' + v).join('; ');
}

// Qwen v2 SSE parser. Frames carry `choices[0].delta.phase`
// ("think" | "answer" | "web_search") and `choices[0].delta.content`.
// We accumulate only the answer phase — reasoning tokens dropped.
// TOKEN_EXPIRED_SIGNAL: Qwen sometimes wraps auth errors inside HTTP 200.
// chats/new returns {success:false, data:{code:"unauthorized"}} with HTTP 200.
// This helper detects that shape so callers can refresh + retry.
function isAuthFailureEnvelope(j: any): boolean {
  if (!j || typeof j !== "object") return false;
  if (j.success === true) return false;
  const d = j.data || {};
  const code = String(d.code || "").toLowerCase();
  const details = String(d.details || "").toLowerCase();
  if (code === "unauthorized") return true;
  if (details.indexOf("token has expired") !== -1) return true;
  if (details.indexOf("401") !== -1) return true;
  return false;
}

function applyQwenSsePayload(payload: string, state: SseState): string {
  if (!payload || payload === '[DONE]') return '';

  let j: any;
  try { j = JSON.parse(payload); } catch { return ''; }

  const before = state.text.length;

  // Envelope sometimes carries session/message ids at the top level.
  if (typeof j.chat_id === 'string' && !state.chatId) state.chatId = j.chat_id;
  if (typeof j.id === 'string' && !state.parentId) state.parentId = j.id;

  if (Array.isArray(j.choices) && j.choices.length > 0) {
    const c = j.choices[0];
    const delta = c?.delta ?? c?.message;
    if (delta) {
      const phase = typeof delta.phase === 'string' ? delta.phase : null;
      if (phase) state.phase = phase;
      if (phase === 'think' || phase === 'web_search') return '';
      const content = delta.content ?? delta.text;
      if (typeof content === 'string') state.text += content;
    }
    return state.text.slice(before);
  }

  if (typeof j.v === 'string') {
    state.text += j.v;
    return state.text.slice(before);
  }

  if (typeof j.content === 'string') {
    state.text += j.content;
    return state.text.slice(before);
  }

  return '';
}

function nowFormattedTimezone(): string {
  return new Date().toString();
}

export class QwenService implements LlmEngine {
  readonly id = ENGINE_IDS.QWEN;
  readonly label = 'Qwen';

  private readonly pathTokens = new Map<string, QwenPathToken>();
  private lastCallAt: number | null = null;
  private lastCallOk: boolean | null = null;
  private lastCallError: string | null = null;
  private refreshingPromise: Promise<string> | null = null;
  private readonly throttle = new QwenThrottle(2, 1);
  private readonly wafBreaker = new QwenWafBreaker(45 * 60 * 1000);

  constructor(
    private readonly creds: QwenCredentialStore,
    private readonly opts: QwenServiceOptions,
  ) {}

  // ── Credentials ───────────────────────────────────────────────
  setCredentials(input: Record<string, unknown>): Record<string, unknown> {
    const stored = this.creds.set({
      cookies: typeof input.cookies === 'string' ? input.cookies : '',
      accessToken: typeof input.accessToken === 'string' ? input.accessToken : '',
      refreshToken: typeof input.refreshToken === 'string' ? input.refreshToken : undefined,
      bxUa: typeof input.bxUa === 'string' ? input.bxUa : undefined,
      bxUmidToken: typeof input.bxUmidToken === 'string' ? input.bxUmidToken : undefined,
      bxV: typeof input.bxV === 'string' ? input.bxV : undefined,
      timezone: typeof input.timezone === 'string' ? input.timezone : undefined,
      extraHeaders: typeof input.extraHeaders === 'object' && input.extraHeaders !== null
        ? (input.extraHeaders as Record<string, string>)
        : undefined,
    });
    this.pathTokens.clear();
    return {
      cookiesLength: stored.cookies.length,
      accessTokenLength: stored.accessToken?.length ?? 0,
      hasRefreshToken: !!stored.refreshToken,
      hasBxUa: !!stored.bxUa,
    };
  }

  clearCredentials(): void {
    this.creds.clear();
    this.pathTokens.clear();
  }

  hasCredentials(): boolean {
    return this.creds.has();
  }

  /** Full raw credentials for the local debug panel. */
  /** Refresh the access token via auth.qwen.ai. Mutex: concurrent callers share one refresh. */
  private async refreshAccessToken(): Promise<string> {
    if (this.refreshingPromise) return this.refreshingPromise;
    this.refreshingPromise = (async () => {
      try {
        const c = this.requireCreds();
        if (!c.refreshToken) throw new QwenAuthError(401, 'no refresh_token in store');

        const url = QWEN_AUTH_BASE + QWEN_REFRESH_PATH;
        const headers: Record<string, string> = {
          'accept': 'application/json, text/plain, */*',
          'accept-language': 'en-US,en;q=0.9',
          'cookie': c.cookies,
          'origin': this.opts.baseUrl,
          'referer': this.opts.baseUrl + '/c/new-chat',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-site',
          'timezone': formatTimezone(),
          'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
          'x-request-id': crypto.randomUUID(),
          'x-request-origin': this.opts.baseUrl,
          'source': 'web',
          'version': '0.3.11',
          'sec-ch-ua': '"Chromium";v="127", "Not)A;Brand";v="99", "Microsoft Edge Simulate";v="127", "Lemur";v="127"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Linux"',
        };
        if (c.bxUa) headers['bx-ua'] = c.bxUa;
        if (c.bxUmidToken) headers['bx-umidtoken'] = c.bxUmidToken;

        const r = await fetch(url, { method: 'GET', headers });
        let j: any = null;
        try { j = await r.json(); } catch {}

        if (!j || !j.success || !j.data || typeof j.data.access_token !== 'string') {
          const detail = j && j.data ? (j.data.details || j.data.code || JSON.stringify(j).slice(0, 200)) : ('HTTP ' + r.status);
          throw new QwenAuthError(r.status, 'refresh failed: ' + detail);
        }

        const newAccessToken = j.data.access_token as string;
        const newRefreshToken = (typeof j.data.refresh_token === 'string' && j.data.refresh_token.length > 0)
          ? j.data.refresh_token as string
          : c.refreshToken;

        let mergedCookies = c.cookies;
        try {
          const setCookies = typeof (r.headers as any).getSetCookie === 'function'
            ? ((r.headers as any).getSetCookie() as string[])
            : [];
          mergedCookies = mergeSetCookies(c.cookies, setCookies);
        } catch {}

        this.creds.set({
          cookies: mergedCookies,
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          bxUa: c.bxUa,
          bxUmidToken: c.bxUmidToken,
          bxV: c.bxV,
          timezone: c.timezone,
          extraHeaders: c.extraHeaders,
        });

        log.info('qwen.token.refreshed', {
          accessTokenLength: newAccessToken.length,
          cookiesLength: mergedCookies.length,
        });
        return newAccessToken;
      } finally {
        this.refreshingPromise = null;
      }
    })();
    return this.refreshingPromise;
  }

  isHealthy(): boolean { return this.wafBreaker.isHealthy(); }

  getWafState() { return this.wafBreaker.snapshot(); }

  getThrottleState() { return this.throttle.snapshot(); }

  getRawCredentials(): import('../models/QwenTypes').QwenCredentials | null {
    return this.creds.get();
  }

  getCredentialsRedacted(): LlmCredentialsRedacted {
    const r = this.creds.redacted();
    return {
      configured: r.configured,
      hasCookies: r.cookiesLength > 0,
      hasBearer: r.hasAccessToken,
      hasExtraHeaders: r.hasBxUa || r.hasBxUmidToken || r.hasBxV,
      acquiredAt: r.acquiredAt,
    };
  }

  private requireCreds() {
    const c = this.creds.get();
    if (!c) throw new QwenNoCredentialsError();
    return c;
  }

  // ── Headers ──────────────────────────────────────────────────
  // Matches the exact header set from the captured browser request.
  private buildHeaders(extra?: Record<string, string>): Record<string, string> {
    const c = this.requireCreds();
    const h: Record<string, string> = {
      'accept': 'application/json',
      'accept-language': 'en-US,en;q=0.9',
      'content-type': 'application/json',
      'cookie': c.cookies,
      'origin': this.opts.baseUrl,
      'referer': this.opts.baseUrl + '/',
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
      'sec-ch-ua': '"Chromium";v="127", "Not)A;Brand";v="99", "Microsoft Edge Simulate";v="127", "Lemur";v="127"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Linux"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'source': 'web',
      'version': '0.3.11',
      'timezone': c.timezone ?? nowFormattedTimezone(),
      'x-accel-buffering': 'no',
      'x-request-id': crypto.randomUUID(),
    };

    // Bearer is mandatory for authenticated calls.
    if (c.accessToken && c.accessToken.length > 0) {
      h['authorization'] = 'Bearer ' + c.accessToken;
    }

    // Alibaba WAF fingerprints — required, request is rejected without them.
    if (c.bxUa) h['bx-ua'] = c.bxUa;
    if (c.bxUmidToken) h['bx-umidtoken'] = c.bxUmidToken;
    if (c.bxV) h['bx-v'] = c.bxV;

    if (c.extraHeaders) Object.assign(h, c.extraHeaders);
    if (extra) Object.assign(h, extra);
    return h;
  }

  private promptFromInput(input: string | Array<{ role: string; content: string }>): string {
    if (typeof input === 'string') return input;
    if (!Array.isArray(input) || input.length === 0) {
      throw new QwenApiError(-1, 'messages must be a non-empty array', 0);
    }
    const last = input.filter((m) => m.role === 'user').pop();
    return last ? last.content : input[input.length - 1].content;
  }

  // ── Chat creation ────────────────────────────────────────────
  // Assumed endpoint. If the real one differs, we adjust on the next
  // captured request (chat creation is also visible in DevTools).
  private async createChat(model: string): Promise<string> {
    const url = this.opts.baseUrl + '/api/v2/chats/new';

    const doFetch = async (): Promise<{ id: string | null; authFail: boolean; raw: string; status: number }> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.opts.requestTimeoutMs);
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: this.buildHeaders(),
          body: JSON.stringify({ title: 'Sovereign Factory', models: [model] }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      const text = await res.text().catch(() => '');
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          return { id: null, authFail: true, raw: text, status: res.status };
        }
        throw new QwenApiError(-1, 'chats/new HTTP ' + res.status + ': ' + text.slice(0, 200), res.status);
      }
      let j: any = null;
      try { j = JSON.parse(text); } catch {
        throw new QwenApiError(-1, 'chats/new returned non-JSON', res.status);
      }
      if (isAuthFailureEnvelope(j)) {
        return { id: null, authFail: true, raw: text, status: res.status };
      }
      const id = j?.data?.id ?? j?.id ?? j?.chat_id;
      if (!id || typeof id !== 'string') {
        throw new QwenApiError(-1, 'chats/new returned no id: ' + text.slice(0, 200), res.status);
      }
      return { id, authFail: false, raw: '', status: res.status };
    };

    const first = await doFetch();
    if (first.id) return first.id;

    if (first.authFail) {
      log.info('qwen.chats_new.auth_expired_refreshing');
      await this.refreshAccessToken();
      const second = await doFetch();
      if (second.id) {
        log.info('qwen.chats_new.retried_after_refresh');
        return second.id;
      }
      throw new QwenAuthError(401, 'chats/new auth failure after refresh: ' + second.raw.slice(0, 200));
    }

    throw new QwenApiError(-1, 'chats/new produced no id', first.status);
  }

  private async getOrCreateChat(model: string, provided?: string): Promise<string> {
    if (provided && provided.length > 0) return provided;
    const cacheKey = 'chat:' + model;
    const cached = this.pathTokens.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.token;
    const id = await this.createChat(model);
    this.pathTokens.set(cacheKey, {
      targetPath: cacheKey,
      token: id,
      expiresAt: Date.now() + 30 * 60 * 1000,
    });
    return id;
  }

  // ── Body construction (matches captured payload exactly) ─────
  private buildBody(
    chatId: string,
    prompt: string,
    options: QwenCallOptions,
  ): Record<string, unknown> {
    const model = options.model ?? this.opts.defaultModel;
    const ts = Math.floor(Date.now() / 1000);
    const fid = crypto.randomUUID();
    const parentId = options.parentMessageId ?? null;

    const message: Record<string, unknown> = {
      id: null,
      fid,
      parentId,
      childrenIds: [],
      role: 'user',
      content: prompt,
      user_action: 'chat',
      files: [],
      timestamp: ts,
      models: [model],
      model: '',
      chat_type: 't2t',
      feature_config: {
        thinking_enabled: options.thinkingEnabled ?? true,
        output_schema: 'phase',
        research_mode: 'normal',
        auto_thinking: true,
        thinking_mode: 'Auto',
        thinking_format: 'summary',
        auto_search: options.searchEnabled ?? true,
      },
      extra: { meta: { subChatType: 't2t' } },
      sub_chat_type: 't2t',
      parent_id: parentId,
    };

    return {
      stream: true,
      version: '2.1',
      incremental_output: true,
      chatId,
      parentId,
      chat_id: chatId,
      chat_mode: 'normal',
      model,
      parent_id: parentId,
      messages: [message],
      timestamp: ts,
    };
  }

  // ── call() ───────────────────────────────────────────────────
  private async callInner(
    input: string | Array<{ role: string; content: string }>,
    options: QwenCallOptions = {},
  ): Promise<LlmResponse> {
    const prompt = this.promptFromInput(input);
    const model = options.model ?? this.opts.defaultModel;

    let chatId: string;
    try {
      chatId = await this.getOrCreateChat(model, options.chatSessionId);
    } catch (e) {
      this.lastCallAt = Date.now();
      this.lastCallOk = false;
      this.lastCallError = e instanceof Error ? e.message : String(e);
      throw e;
    }

    const url = this.opts.baseUrl + '/api/v2/chat/completions?chat_id=' + encodeURIComponent(chatId);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.requestTimeoutMs);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(this.buildBody(chatId, prompt, options)),
        signal: options.signal ?? controller.signal,
      });
      if (res.status === 401 || res.status === 403) {
        try { await res.body?.cancel(); } catch {}
        await this.refreshAccessToken();
        res = await fetch(url, {
          method: 'POST',
          headers: this.buildHeaders(),
          body: JSON.stringify(this.buildBody(chatId, prompt, options)),
          signal: options.signal ?? controller.signal,
        });
      }
    } finally {
      clearTimeout(timer);
    }

    // QWEN_CTYPE_DEBUG
    if (process.env.QWEN_SSE_DEBUG === '1') {
      log.info('qwen.resp.headers', {
        status: res.status,
        contentType: res.headers.get('content-type'),
        contentLength: res.headers.get('content-length'),
        transferEncoding: res.headers.get('transfer-encoding'),
      });
    }
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      this.lastCallAt = Date.now();
      this.lastCallOk = false;
      this.lastCallError = 'HTTP ' + res.status;
      if (res.status === 401 || res.status === 403) throw new QwenAuthError(res.status, text.slice(0, 200));
      throw new QwenApiError(-1, 'HTTP ' + res.status + ': ' + text.slice(0, 300), res.status);
    }

    // QWEN_JSON_BRANCH: if content-type isn't SSE, read the body as JSON.
    // Handles the case where Qwen returns a single JSON object instead of a stream.
    const ctype = (res.headers.get('content-type') || '').toLowerCase();
    if (!ctype.includes('text/event-stream')) {
      const raw = await res.text().catch(() => '');
      log.info('qwen.completions.json_body', { body: raw.slice(0, 500) });
      let j: any = null;
      try { j = JSON.parse(raw); } catch {}
      // WAF punishment detection
      if (detectQwenWafPunishment(res.status, raw)) {
        log.warn('qwen.completions.waf_punishment', { status: res.status, preview: raw.slice(0, 160) });
        throw new QwenWafBlockedError('WAF punishment: ' + raw.slice(0, 160));
      }
      // Auth envelope → refresh and retry once
      if (j && isAuthFailureEnvelope(j)) {
        log.info('qwen.completions.auth_expired_refreshing');
        await this.refreshAccessToken();
        return await this.call(input, { ...options, chatSessionId: chatId });
      }
      // Extract content if there is any
      let content = '';
      if (j && typeof j === 'object') {
        if (typeof j.content === 'string') content = j.content;
        else if (j.data && typeof j.data.content === 'string') content = j.data.content;
        else if (j.data && typeof j.data.answer === 'string') content = j.data.answer;
      }
      this.lastCallAt = Date.now();
      this.lastCallOk = !!content;
      this.lastCallError = content ? null : 'json response without content';
      if (content) {
        return {
          code: 0,
          msg: '',
          data: { content, chat_session_id: chatId, message_id: null },
        };
      }
      throw new QwenApiError(-1, 'non-SSE response with no content: ' + raw.slice(0, 300), res.status);
    }

    const state: SseState = { text: '', phase: null, chatId, parentId: null };
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

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
          // QWEN_SSE_DEBUG
          if (process.env.QWEN_SSE_DEBUG === '1') {
            log.info('qwen.sse.frame', { preview: payload.slice(0, 300) });
          }
          applyQwenSsePayload(payload, state);
        }
      }
    }
    try { reader.releaseLock(); } catch {}

    this.lastCallAt = Date.now();
    this.lastCallOk = true;
    this.lastCallError = null;

    return {
      code: 0,
      msg: '',
      data: {
        content: state.text,
        chat_session_id: chatId,
        message_id: state.parentId,
      },
    };
  }

  // ── stream() ─────────────────────────────────────────────────
  // RESILIENCE_WRAPPER: throttle + WAF breaker around callInner.
  async call(
    input: string | Array<{ role: string; content: string }>,
    options: QwenCallOptions = {},
  ): Promise<LlmResponse> {
    const decision = this.wafBreaker.canCall();
    if (!decision.allowed) {
      throw new QwenWafBlockedError(decision.reason || 'Qwen WAF cooldown active');
    }
    await this.throttle.acquire();
    try {
      const result = await this.callInner(input, options);
      this.wafBreaker.recordSuccess();
      return result;
    } catch (e) {
      if (e instanceof QwenWafBlockedError) {
        this.wafBreaker.recordWafPunishment();
      } else {
        this.wafBreaker.recordNonWafFailure();
      }
      throw e;
    }
  }

  async *stream(
    input: string | Array<{ role: string; content: string }>,
    options: QwenCallOptions = {},
  ): AsyncGenerator<LlmStreamChunk, void, unknown> {
    const prompt = this.promptFromInput(input);
    const model = options.model ?? this.opts.defaultModel;

    let chatId: string;
    try {
      chatId = await this.getOrCreateChat(model, options.chatSessionId);
    } catch (e) {
      yield { type: 'error', error: e instanceof Error ? e.message : String(e) };
      return;
    }

    const url = this.opts.baseUrl + '/api/v2/chat/completions?chat_id=' + encodeURIComponent(chatId);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(this.buildBody(chatId, prompt, options)),
        signal: options.signal,
      });
      if (res.status === 401 || res.status === 403) {
        try { await res.body?.cancel(); } catch {}
        await this.refreshAccessToken();
        res = await fetch(url, {
          method: 'POST',
          headers: this.buildHeaders(),
          body: JSON.stringify(this.buildBody(chatId, prompt, options)),
          signal: options.signal,
        });
      }
    } catch (e) {
      yield { type: 'error', error: e instanceof Error ? e.message : String(e) };
      return;
    }

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      yield { type: 'error', error: 'HTTP ' + res.status + ': ' + text.slice(0, 300) };
      return;
    }

    const state: SseState = { text: '', phase: null, chatId, parentId: null };
    const reader = res.body.getReader();
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
            if (!payload) continue;
            if (payload === '[DONE]') { yield { type: 'done' }; return; }
            const delta = applyQwenSsePayload(payload, state);
            if (delta) yield { type: 'chunk', content: delta, raw: payload };
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

  // ── Health ───────────────────────────────────────────────────
  async healthCheck(): Promise<LlmHealth> {
    const redacted = this.creds.redacted();
    const wafState = this.wafBreaker.snapshot();
    const throttleState = this.throttle.snapshot();
    const healthy = redacted.configured && redacted.hasAccessToken && this.wafBreaker.isHealthy();
    return {
      engineId: this.id,
      configured: redacted.configured,
      healthy,
      wafState,
      throttleState,
      cookiesLength: redacted.cookiesLength,
      hasAccessToken: redacted.hasAccessToken,
      hasRefreshToken: redacted.hasRefreshToken,
      hasBxUa: redacted.hasBxUa,
      hasBxUmidToken: redacted.hasBxUmidToken,
      hasBxV: redacted.hasBxV,
      extraHeaderNames: redacted.extraHeaderNames,
      acquiredAt: redacted.acquiredAt,
      lastCallAt: this.lastCallAt,
      lastCallOk: this.lastCallOk,
      lastCallError: this.lastCallError,
    };
  }

  listCachedPathTokens(): QwenPathToken[] {
    return Array.from(this.pathTokens.values()).map((t) => ({ ...t }));
  }
}
