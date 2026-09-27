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

interface SseState {
  text: string;
  phase: string | null;
  chatId: string | null;
  parentId: string | null;
}

// Qwen v2 SSE parser. Frames carry `choices[0].delta.phase`
// ("think" | "answer" | "web_search") and `choices[0].delta.content`.
// We accumulate only the answer phase — reasoning tokens dropped.
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
      if (res.status === 401 || res.status === 403) throw new QwenAuthError(res.status, text.slice(0, 200));
      throw new QwenApiError(-1, 'chats/new HTTP ' + res.status + ': ' + text.slice(0, 200), res.status);
    }
    let j: any;
    try { j = JSON.parse(text); } catch {
      throw new QwenApiError(-1, 'chats/new returned non-JSON', res.status);
    }
    const id = j?.data?.id ?? j?.id ?? j?.chat_id;
    if (!id || typeof id !== 'string') {
      throw new QwenApiError(-1, 'chats/new returned no id: ' + text.slice(0, 200), res.status);
    }
    return id;
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
  async call(
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
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      this.lastCallAt = Date.now();
      this.lastCallOk = false;
      this.lastCallError = 'HTTP ' + res.status;
      if (res.status === 401 || res.status === 403) throw new QwenAuthError(res.status, text.slice(0, 200));
      throw new QwenApiError(-1, 'HTTP ' + res.status + ': ' + text.slice(0, 300), res.status);
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
    return {
      engineId: this.id,
      configured: redacted.configured,
      healthy: redacted.configured && redacted.hasAccessToken,
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
