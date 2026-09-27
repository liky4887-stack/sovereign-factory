// Qwen engine — service layer. Mirrors DeepSeekService structure.
// Cookie-first auth (Alibaba web session), bearer as fallback.
// Every Qwen-specific unknown is marked `TODO: REPLACE` — after
// capturing a real request from chat.qwen.ai, those get filled in.
import { QwenCredentialStore } from '../storage/QwenCredentialStore';
import {
  QwenCallOptions,
  QwenChatMessage,
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
import { LlmEngine, LlmCallOptions, LlmResponse, LlmStreamChunk, LlmCredentialsRedacted, LlmHealth, ENGINE_IDS } from '../../engines/LlmEngine';

interface SseState {
  text: string;
  lastPath: string | null;
}

// Qwen SSE parser — best-effort. Covers OpenAI-compatible deltas and
// a generic JSON-patch shape. TODO: REPLACE if Qwen uses a different
// wire format — the captured SSE frames from DevTools will confirm.
function applyQwenSsePayload(payload: string, state: SseState): string {
  if (!payload || payload === '[DONE]') return '';

  let j: any;
  try { j = JSON.parse(payload); } catch { return ''; }

  const before = state.text.length;

  // OpenAI-compatible delta: { choices: [{ delta: { content } }] }
  if (Array.isArray(j.choices) && j.choices.length > 0) {
    const c = j.choices[0];
    const delta = c?.delta?.content ?? c?.message?.content ?? c?.text;
    if (typeof delta === 'string') state.text += delta;
    state.lastPath = 'choices/0';
    return state.text.slice(before);
  }

  // Generic JSON-patch: { p, o, v }
  if (typeof j.p === 'string' && typeof j.o === 'string') {
    if (j.p.includes('content') && typeof j.v === 'string') {
      if (j.o === 'APPEND') state.text += j.v;
      else if (j.o === 'SET') state.text = j.v;
    }
    state.lastPath = j.p;
    return state.text.slice(before);
  }

  // Simple { content: "..." } delta
  if (typeof j.content === 'string') {
    state.text += j.content;
    state.lastPath = 'content';
    return state.text.slice(before);
  }

  // Bare continuation { v: "..." }
  if (typeof j.v === 'string' && state.lastPath) {
    state.text += j.v;
    return state.text.slice(before);
  }

  return '';
}

export class QwenService implements LlmEngine {
  readonly id = ENGINE_IDS.QWEN;
  readonly label = 'Qwen';

  private readonly pathTokens = new Map<string, QwenPathToken>();
  private lastCallAt: number | null = null;
  private lastCallOk: boolean | null = null;
  private lastCallError: string | null = null;

  constructor(
    private readonly creds: QwenCredentialStore,
    private readonly opts: QwenServiceOptions,
  ) {}

  // ── Credential management ─────────────────────────────────────
  setCredentials(input: Record<string, unknown>): Record<string, unknown> {
    const stored = this.creds.set({
      cookies: typeof input.cookies === 'string' ? input.cookies : '',
      bearerToken: typeof input.bearerToken === 'string' ? input.bearerToken : undefined,
      hifLeim: typeof input.hifLeim === 'string' ? input.hifLeim : undefined,
      hifDliq: typeof input.hifDliq === 'string' ? input.hifDliq : undefined,
      deviceId: typeof input.deviceId === 'string' ? input.deviceId : undefined,
      extraHeaders: typeof input.extraHeaders === 'object' && input.extraHeaders !== null
        ? (input.extraHeaders as Record<string, string>)
        : undefined,
    });
    this.pathTokens.clear();
    return { cookiesLength: stored.cookies.length, hasBearer: !!stored.bearerToken };
  }

  clearCredentials(): void {
    this.creds.clear();
    this.pathTokens.clear();
  }

  hasCredentials(): boolean {
    return this.creds.has();
  }

  getCredentialsRedacted(): LlmCredentialsRedacted {
    const r = this.creds.redacted();
    return {
      configured: r.configured,
      hasCookies: r.cookiesLength > 0,
      hasBearer: r.hasBearer,
      hasExtraHeaders: r.hasExtraHeaders,
      acquiredAt: r.acquiredAt,
    };
  }

  private requireCreds() {
    const c = this.creds.get();
    if (!c) throw new QwenNoCredentialsError();
    return c;
  }

  // ── Header construction ───────────────────────────────────────
  // Mirrors DeepSeekService.buildHeaders. TODO: REPLACE the
  // X-* header set with the exact ones Qwen expects — captured from
  // DevTools Network tab on chat.qwen.ai.
  private buildHeaders(extra?: Record<string, string>): Record<string, string> {
    const c = this.requireCreds();
    const h: Record<string, string> = {
      'content-type': 'application/json',
      'accept': '*/*',
      'accept-language': 'en-US,en;q=0.9',
      'cookie': c.cookies,
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
      'origin': this.opts.baseUrl,
      'referer': this.opts.baseUrl + '/',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
    };
    // TODO: REPLACE — verify which of these Qwen actually needs.
    // Kept here because the DeepSeek bridge required them and the
    // Qwen web product may mirror the same anti-bot posture.
    if (c.hifLeim) h['x-hif-leim'] = c.hifLeim;
    if (c.hifDliq) h['x-hif-dliq'] = c.hifDliq;
    if (c.deviceId) h['x-device-id'] = c.deviceId;

    // Bearer fallback (used only if the cookie path fails or the user
    // provided one explicitly).
    if (c.bearerToken) h['authorization'] = 'Bearer ' + c.bearerToken;

    // Any extra headers captured from the real request.
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

  // ── Body construction ─────────────────────────────────────────
  // OpenAI-compatible chat body. TODO: REPLACE if Qwen web uses a
  // proprietary shape. The captured request body will tell us.
  private buildBody(prompt: string, options: QwenCallOptions): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: options.model ?? this.opts.defaultModel,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      temperature: options.temperature,
      top_p: options.topP,
      max_tokens: options.maxTokens,
    };
    // Strip undefined values so we don't send nulls the API rejects.
    for (const k of Object.keys(body)) {
      if (body[k] === undefined) delete body[k];
    }
    return body;
  }

  // ── Single-call entry (LlmEngine interface) ───────────────────
  async call(
    input: string | Array<{ role: string; content: string }>,
    options: QwenCallOptions = {},
  ): Promise<LlmResponse> {
    const prompt = this.promptFromInput(input);
    const targetPath = options.targetPath ?? this.opts.defaultTargetPath;
    const url = targetPath.startsWith('http') ? targetPath : this.opts.baseUrl + targetPath;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.requestTimeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders({ 'accept': 'text/event-stream' }),
        body: JSON.stringify(this.buildBody(prompt, options)),
        signal: options.signal ?? controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      this.lastCallAt = Date.now();
      this.lastCallOk = false;
      this.lastCallError = 'HTTP ' + response.status;

      if (response.status === 401 || response.status === 403) {
        throw new QwenAuthError(response.status, text.slice(0, 200));
      }
      throw new QwenApiError(-1, 'HTTP ' + response.status + ': ' + text.slice(0, 300), response.status);
    }

    const state: SseState = { text: '', lastPath: null };
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let sessionId: string | null = null;

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
          if (payload === '[DONE]') break;
          applyQwenSsePayload(payload, state);
          // TODO: REPLACE — extract session id if Qwen sends one.
          // Common field names: id, request_id, session_id.
          try {
            const j = JSON.parse(payload);
            if (!sessionId && typeof j.id === 'string') sessionId = j.id;
            if (!sessionId && typeof j.session_id === 'string') sessionId = j.session_id;
          } catch {}
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
        chat_session_id: sessionId,
        message_id: null,
      },
    };
  }

  // ── Streaming variant (LlmEngine interface) ───────────────────
  async *stream(
    input: string | Array<{ role: string; content: string }>,
    options: QwenCallOptions = {},
  ): AsyncGenerator<LlmStreamChunk, void, unknown> {
    const prompt = this.promptFromInput(input);
    const targetPath = options.targetPath ?? this.opts.defaultTargetPath;
    const url = targetPath.startsWith('http') ? targetPath : this.opts.baseUrl + targetPath;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders({ 'accept': 'text/event-stream' }),
        body: JSON.stringify(this.buildBody(prompt, options)),
        signal: options.signal,
      });
    } catch (e) {
      yield { type: 'error', error: e instanceof Error ? e.message : String(e) };
      return;
    }

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      yield { type: 'error', error: 'HTTP ' + response.status + ': ' + text.slice(0, 300) };
      return;
    }

    const state: SseState = { text: '', lastPath: null };
    const reader = response.body.getReader();
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

  // ── Health ────────────────────────────────────────────────────
  async healthCheck(): Promise<LlmHealth> {
    const redacted = this.creds.redacted();
    return {
      engineId: this.id,
      configured: redacted.configured,
      healthy: redacted.configured,
      cookiesLength: redacted.cookiesLength,
      hasBearer: redacted.hasBearer,
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
