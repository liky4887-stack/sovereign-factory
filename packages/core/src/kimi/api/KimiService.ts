// Kimi engine — service layer. Implements LlmEngine.
// Protocol: Connect RPC over HTTP (application/connect+json).
// Endpoint: POST /apiv2/kimi.gateway.chat.v1.ChatService/Chat
// Auth: Bearer access token + stable device headers.
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
import {
  encodeConnectFrame,
  decodeConnectFrames,
  parseEventOp,
  newStreamState,
  applyEventOp,
} from './KimiConnect';
import { log } from '../../shared/logger';
import {
  LlmEngine,
  LlmResponse,
  LlmStreamChunk,
  LlmCredentialsRedacted,
  LlmHealth,
  ENGINE_IDS,
} from '../../engines/LlmEngine';

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
  hasCredentials(): boolean {
    const c = this.creds.get();
    return !!c && c.cookies.length > 0 && !!c.bearerToken;
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

  private requireCreds() {
    const c = this.creds.get();
    if (!c) throw new KimiNoCredentialsError();
    return c;
  }

  // ── Headers ────────────────────────────────────────────────
  // Stable per-device headers. No rotation.
  private buildHeaders(): Record<string, string> {
    const c = this.requireCreds();
    const h: Record<string, string> = {
      'accept': '*/*',
      'accept-language': 'en-US',
      'content-type': 'application/connect+json',
      'connect-protocol-version': '1',
      'cookie': c.cookies,
      'origin': this.opts.baseUrl,
      'referer': this.opts.baseUrl + '/',
      'priority': 'u=1, i',
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
      'sec-ch-ua': '"Chromium";v="127", "Not)A;Brand";v="99", "Microsoft Edge Simulate";v="127", "Lemur";v="127"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Linux"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'x-language': 'en-US',
      'x-msh-platform': 'web',
      'x-msh-version': '2.3.0',
    };
    if (c.bearerToken) h['authorization'] = 'Bearer ' + c.bearerToken;
    if (this.opts.defaultTimezone) h['r-timezone'] = this.opts.defaultTimezone;
    if (this.opts.defaultDeviceId) h['x-msh-device-id'] = this.opts.defaultDeviceId;
    if (this.opts.defaultSessionId) h['x-msh-session-id'] = this.opts.defaultSessionId;
    if (this.opts.defaultTrafficId) h['x-traffic-id'] = this.opts.defaultTrafficId;
    if (this.opts.defaultShieldData) h['x-msh-shield-data'] = this.opts.defaultShieldData;
    if (c.extraHeaders) Object.assign(h, c.extraHeaders);
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

  // ── Connect request body ───────────────────────────────────
  private buildConnectBody(prompt: string, options: KimiCallOptions): Buffer {
    const chatId = options.chatSessionId || crypto.randomUUID();
    const parentId = options.parentMessageId || crypto.randomUUID();
    const model = options.model ?? this.opts.defaultModel;
    const payload = {
      chat_id: chatId,
      scenario: 'SCENARIO_CHAT',
      tools: [
        { type: 'TOOL_TYPE_SEARCH', search: {} },
        { type: 'TOOL_TYPE_CRON_JOB' },
      ],
      message: {
        parent_id: parentId,
        role: 'user',
        blocks: [{ message_id: '', text: { content: prompt } }],
        scenario: 'SCENARIO_CHAT',
        is_goal: false,
      },
      options: {
        thinking: options.thinkingEnabled ?? true,
        enable_plugin: true,
        reasoning_effort: 'REASONING_EFFORT_LOW',
        model,
      },
      project_id: '',
    };
    return encodeConnectFrame(JSON.stringify(payload));
  }

  // ── Inner call (throttle + breaker wrapped in call()) ──────
  private async callInner(
    input: string | Array<{ role: string; content: string }>,
    options: KimiCallOptions = {},
  ): Promise<LlmResponse> {
    const prompt = this.promptFromInput(input);
    const targetPath = options.targetPath ?? this.opts.defaultTargetPath;
    const url = targetPath.startsWith('http') ? targetPath : this.opts.baseUrl + targetPath;
    const bodyBuf = this.buildConnectBody(prompt, options);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.requestTimeoutMs);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: bodyBuf,
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
      if (detectKimiWafSignal(res.status, text)) {
        log.warn('kimi.completions.waf_signal', { status: res.status, preview: text.slice(0, 160) });
        throw new KimiApiError(-1, 'WAF signal: ' + text.slice(0, 200), res.status);
      }
      log.warn('kimi.completions.http_error', { status: res.status, body: text.slice(0, 400) });
      if (res.status === 401) throw new KimiExpiredSessionError('Kimi 401: ' + text.slice(0, 200));
      if (res.status === 403) throw new KimiAuthError(res.status, text.slice(0, 200));
      throw new KimiApiError(-1, 'HTTP ' + res.status + ': ' + text.slice(0, 300), res.status);
    }

    const state = newStreamState();
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const buf = Buffer.from(buffer, 'binary');
      const { frames, remainder } = decodeConnectFrames(buf);
      // Re-encode remainder for next iteration
      buffer = remainder.toString('binary');
      for (const frame of frames) {
        const op = parseEventOp(frame.payload);
        if (op) applyEventOp(op, state);
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
        chat_session_id: state.chatId,
        message_id: state.messageId,
      },
    };
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
        this.throttle.recordNonWafFailure();
      }
      throw e;
    }
  }

  // ── Streaming variant ──────────────────────────────────────
  async *stream(
    input: string | Array<{ role: string; content: string }>,
    options: KimiCallOptions = {},
  ): AsyncGenerator<LlmStreamChunk, void, unknown> {
    const decision = this.wafBreaker.canCall();
    if (!decision.allowed) {
      yield { type: 'error', error: decision.reason || 'WAF cooldown active' };
      return;
    }
    try { await this.throttle.acquire(); }
    catch (e) { yield { type: 'error', error: e instanceof Error ? e.message : String(e) }; return; }

    try {
      const result = await this.callInner(input, options);
      if (result.data.content) yield { type: 'chunk', content: result.data.content };
      yield { type: 'done' };
      this.wafBreaker.recordSuccess();
      this.throttle.recordSuccess();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('WAF') || msg.includes('captcha')) {
        this.wafBreaker.recordWafPunishment();
        this.throttle.recordWafPunishment();
      } else {
        this.throttle.recordNonWafFailure();
      }
      yield { type: 'error', error: msg };
    }
  }

  // ── Health + panel state ───────────────────────────────────
  isHealthy(): boolean { return this.wafBreaker.isHealthy(); }

  async healthCheck(): Promise<LlmHealth> {
    const r = this.creds.redacted();
    const credsPresent = r.configured && r.hasBearer;
    const lastFailed = this.lastCallOk === false;
    // 'healthy' must mean 'this engine can serve a request right now'.
    // Credentials present is necessary but not sufficient — if the last
    // call failed (Kimi's 401 signature rejection), the engine is not
    // healthy regardless of what the credential store holds.
    const healthy = credsPresent && !lastFailed && this.wafBreaker.isHealthy();
    return {
      engineId: this.id,
      configured: r.configured,
      healthy,
      credsPresent,
      serverAcceptsCredentials:
        this.lastCallOk === null ? null : this.lastCallOk === true,
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
