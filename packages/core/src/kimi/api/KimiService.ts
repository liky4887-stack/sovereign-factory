// Kimi engine — service layer. Implements LlmEngine, mirrors QwenService.
//
// Auth: cookie-only. No API keys. No official SDK.
//
// Protocol: TODO: REPLACE all `TODO:` markers with real values once a
// capture from the kimi.ai browser session is provided. The service
// will register as `engine_kimi`, report configured:false until
// credentials are POSTed, and route via /kimi/* and /engines/*.
import * as crypto from 'node:crypto';
import { KimiCredentialStore } from '../storage/KimiCredentialStore';
import {
  KimiCallOptions,
  KimiServiceOptions,
} from '../models/KimiTypes';
import {
  KimiApiError,
  KimiAuthError,
  KimiNoCredentialsError,
  KimiExpiredSessionError,
} from '../models/KimiErrors';
import { KimiThrottle, KimiWafBreaker, detectKimiWafSignal } from '../resilience';
import { log } from '../../shared/logger';
import {
  LlmEngine,
  LlmResponse,
  LlmStreamChunk,
  LlmCredentialsRedacted,
  LlmHealth,
  ENGINE_IDS,
} from '../../engines/LlmEngine';

interface SseState {
  text: string;
  lastPath: string | null;
  chatId: string | null;
}

function applyKimiSsePayload(payload: string, state: SseState): string {
  if (!payload || payload === '[DONE]') return '';
  let j: any;
  try { j = JSON.parse(payload); } catch { return ''; }
  const before = state.text.length;

  // Shape A: OpenAI-style { choices: [{ delta: { content } }] }
  if (Array.isArray(j.choices) && j.choices.length > 0) {
    const c = j.choices[0];
    const delta = c?.delta?.content ?? c?.message?.content ?? c?.text;
    if (typeof delta === 'string') state.text += delta;
    state.lastPath = 'choices/0';
    return state.text.slice(before);
  }
  // Shape B: { content: "..." }
  if (typeof j.content === 'string') {
    state.text += j.content;
    state.lastPath = 'content';
    return state.text.slice(before);
  }
  // Shape C: bare { v: "..." } continuation
  if (typeof j.v === 'string' && state.lastPath) {
    state.text += j.v;
    return state.text.slice(before);
  }
  return '';
}

export class KimiService implements LlmEngine {
  readonly id = ENGINE_IDS.KIMI;
  readonly label = 'Kimi';

  private lastCallAt: number | null = null;
  private lastCallOk: boolean | null = null;
  private lastCallError: string | null = null;

  private readonly throttle: KimiThrottle;
  private readonly wafBreaker = new KimiWafBreaker(3 * 60 * 60 * 1000);

  constructor(
    private readonly creds: KimiCredentialStore,
    private readonly opts: KimiServiceOptions,
  ) {
    this.throttle = new KimiThrottle(
      // State file next to the credentials file
      opts.credentialsFile.replace(/\.json$/, '.throttle.json'),
      opts.minRequestGapSeconds,
      opts.maxRequestsPerDay,
    );
  }

  // ── Credentials ────────────────────────────────────────────
  setCredentials(input: Record<string, unknown>): Record<string, unknown> {
    const stored = this.creds.set({
      cookies: typeof input.cookies === 'string' ? input.cookies : '',
      bearerToken: typeof input.bearerToken === 'string' ? input.bearerToken : undefined,
      csrfToken: typeof input.csrfToken === 'string' ? input.csrfToken : undefined,
      extraHeaders: typeof input.extraHeaders === 'object' && input.extraHeaders !== null
        ? (input.extraHeaders as Record<string, string>)
        : undefined,
    });
    return {
      cookiesLength: stored.cookies.length,
      hasBearer: !!stored.bearerToken,
      hasCsrf: !!stored.csrfToken,
    };
  }

  clearCredentials(): void { this.creds.clear(); }
  hasCredentials(): boolean { return this.creds.has(); }

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

  getRawCredentials() {
    return this.creds.get();
  }

  private requireCreds() {
    const c = this.creds.get();
    if (!c) throw new KimiNoCredentialsError();
    return c;
  }

  // ── Header construction ────────────────────────────────────
  // One stable browser signature. No UA rotation. No fake jitter.
  private buildHeaders(extra?: Record<string, string>): Record<string, string> {
    const c = this.requireCreds();
    const h: Record<string, string> = {
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'en-US,en;q=0.9',
      'content-type': 'application/json',
      'cookie': c.cookies,
      'origin': this.opts.baseUrl,
      'referer': this.opts.baseUrl + '/',
      'user-agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
    };
    if (c.bearerToken) h['authorization'] = 'Bearer ' + c.bearerToken;
    if (c.csrfToken) h['x-csrf-token'] = c.csrfToken;
    if (c.extraHeaders) Object.assign(h, c.extraHeaders);
    if (extra) Object.assign(h, extra);
    return h;
  }

  private promptFromInput(input: string | Array<{ role: string; content: string }>): string {
    if (typeof input === 'string') return input;
    if (!Array.isArray(input) || input.length === 0) {
      throw new KimiApiError(-1, 'messages must be a non-empty array', 0);
    }
    const last = input.filter((m) => m.role === 'user').pop();
    return last ? last.content : input[input.length - 1].content;
  }

  // ── Body construction ──────────────────────────────────────
  // TODO: REPLACE once Kimi's real payload shape is known from a
  // captured browser request. Current shape is OpenAI-compatible.
  private buildBody(prompt: string, options: KimiCallOptions): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: options.model ?? this.opts.defaultModel,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    };
    for (const k of Object.keys(body)) {
      if (body[k] === undefined) delete body[k];
    }
    return body;
  }

  // ── Inner call (throttle + breaker wrapper lives in call()) ─
  private async callInner(
    input: string | Array<{ role: string; content: string }>,
    options: KimiCallOptions = {},
  ): Promise<LlmResponse> {
    const prompt = this.promptFromInput(input);
    const targetPath = options.targetPath ?? this.opts.defaultTargetPath;
    const url = targetPath.startsWith('http') ? targetPath : this.opts.baseUrl + targetPath;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.requestTimeoutMs);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders({ 'accept': 'text/event-stream' }),
        body: JSON.stringify(this.buildBody(prompt, options)),
        signal: options.signal ?? controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const ctype = (res.headers.get('content-type') || '').toLowerCase();

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      this.lastCallAt = Date.now();
      this.lastCallOk = false;
      this.lastCallError = 'HTTP ' + res.status;

      if (detectKimiWafSignal(res.status, text)) {
        log.warn('kimi.completions.waf_signal', { status: res.status, preview: text.slice(0, 160) });
        throw new KimiApiError(-1, 'WAF signal: ' + text.slice(0, 200), res.status);
      }
      if (res.status === 401) {
        throw new KimiExpiredSessionError();
      }
      if (res.status === 403) {
        throw new KimiAuthError(res.status, text.slice(0, 200));
      }
      throw new KimiApiError(-1, 'HTTP ' + res.status + ': ' + text.slice(0, 300), res.status);
    }

    // Non-SSE branch (single JSON body)
    if (!ctype.includes('text/event-stream')) {
      const raw = await res.text().catch(() => '');
      let j: any = null;
      try { j = JSON.parse(raw); } catch {}

      if (detectKimiWafSignal(res.status, raw)) {
        log.warn('kimi.completions.waf_signal', { status: res.status, preview: raw.slice(0, 160) });
        throw new KimiApiError(-1, 'WAF signal in JSON body: ' + raw.slice(0, 200), res.status);
      }

      let content = '';
      if (j && typeof j === 'object') {
        if (typeof j.content === 'string') content = j.content;
        else if (j.data && typeof j.data.content === 'string') content = j.data.content;
        else if (j.choices && j.choices[0]?.message?.content) content = j.choices[0].message.content;
      }
      this.lastCallAt = Date.now();
      this.lastCallOk = !!content;
      this.lastCallError = content ? null : 'json body without content';
      if (content) {
        return { code: 0, msg: '', data: { content, chat_session_id: null, message_id: null } };
      }
      throw new KimiApiError(-1, 'non-SSE body with no content: ' + raw.slice(0, 300), res.status);
    }

    // SSE branch
    const state: SseState = { text: '', lastPath: null, chatId: null };
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
          applyKimiSsePayload(payload, state);
        }
      }
    }
    try { reader.releaseLock(); } catch {}

    this.lastCallAt = Date.now();
    this.lastCallOk = true;
    this.lastCallError = null;
    return { code: 0, msg: '', data: { content: state.text, chat_session_id: state.chatId, message_id: null } };
  }

  // ── Public call with throttle + breaker ────────────────────
  async call(
    input: string | Array<{ role: string; content: string }>,
    options: KimiCallOptions = {},
  ): Promise<LlmResponse> {
    const decision = this.wafBreaker.canCall();
    if (!decision.allowed) {
      throw new KimiApiError(-1, decision.reason || 'WAF cooldown active', 0);
    }
    await this.throttle.acquire();
    try {
      const result = await this.callInner(input, options);
      this.wafBreaker.recordSuccess();
      this.throttle.recordSuccess();
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('WAF') || msg.includes('captcha') || msg.includes('rate limit')) {
        this.wafBreaker.recordWafPunishment();
        this.throttle.recordWafPunishment();
      } else {
        this.wafBreaker.recordNonWafFailure?.();
        this.throttle.recordNonWafFailure();
      }
      throw e;
    }
  }

  // ── Streaming variant (same throttle semantics) ────────────
  async *stream(
    input: string | Array<{ role: string; content: string }>,
    options: KimiCallOptions = {},
  ): AsyncGenerator<LlmStreamChunk, void, unknown> {
    const decision = this.wafBreaker.canCall();
    if (!decision.allowed) {
      yield { type: 'error', error: decision.reason || 'WAF cooldown active' };
      return;
    }
    try {
      await this.throttle.acquire();
    } catch (e) {
      yield { type: 'error', error: e instanceof Error ? e.message : String(e) };
      return;
    }

    const prompt = this.promptFromInput(input);
    const targetPath = options.targetPath ?? this.opts.defaultTargetPath;
    const url = targetPath.startsWith('http') ? targetPath : this.opts.baseUrl + targetPath;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders({ 'accept': 'text/event-stream' }),
        body: JSON.stringify(this.buildBody(prompt, options)),
        signal: options.signal,
      });
    } catch (e) {
      this.throttle.recordNonWafFailure();
      yield { type: 'error', error: e instanceof Error ? e.message : String(e) };
      return;
    }

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      this.throttle.recordNonWafFailure();
      if (detectKimiWafSignal(res.status, text)) {
        this.wafBreaker.recordWafPunishment();
        this.throttle.recordWafPunishment();
      }
      yield { type: 'error', error: 'HTTP ' + res.status + ': ' + text.slice(0, 300) };
      return;
    }

    const state: SseState = { text: '', lastPath: null, chatId: null };
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
            const delta = applyKimiSsePayload(payload, state);
            if (delta) yield { type: 'chunk', content: delta, raw: payload };
          }
        }
      }
      yield { type: 'done' };
    } catch (e) {
      yield { type: 'error', error: e instanceof Error ? e.message : String(e) };
    } finally {
      try { reader.releaseLock(); } catch {}
      this.throttle.recordSuccess();
      this.wafBreaker.recordSuccess();
    }
  }

  // ── Health + panel state ───────────────────────────────────
  isHealthy(): boolean { return this.wafBreaker.isHealthy(); }

  async healthCheck(): Promise<LlmHealth> {
    const r = this.creds.redacted();
    const healthy = r.configured && this.wafBreaker.isHealthy();
    return {
      engineId: this.id,
      configured: r.configured,
      healthy,
      cookiesLength: r.cookiesLength,
      hasBearer: r.hasBearer,
      hasCsrf: r.hasCsrf,
      acquiredAt: r.acquiredAt,
      wafState: this.wafBreaker.snapshot(),
      throttleState: this.throttle.snapshot(),
      lastCallAt: this.lastCallAt,
      lastCallOk: this.lastCallOk,
      lastCallError: this.lastCallError,
    };
  }
}
