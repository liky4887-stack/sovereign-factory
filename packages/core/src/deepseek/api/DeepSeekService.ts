import { CredentialStore } from '../storage/CredentialStore';
import { PowSolver } from '../pow/PowSolver';
import {
  CallDeepSeekOptions,
  DeepSeekApiResponse,
  DeepSeekMessage,
  DeepSeekServiceOptions,
  PathToken,
  PowChallenge,
  StreamChunk,
} from '../models/DeepSeekTypes';
import {
  DeepSeekApiError,
  DeepSeekAuthError,
  DeepSeekNoCredentialsError,
} from '../models/DeepSeekErrors';

export class DeepSeekService {
  private readonly pathTokens = new Map<string, PathToken>();

  constructor(
    private readonly creds: CredentialStore,
    private readonly pow: PowSolver,
    private readonly opts: DeepSeekServiceOptions,
  ) {}

  setCredentials(input: {
    bearerToken: string; cookies: string;
    hifLeim?: string; hifDliq?: string; deviceId?: string;
  }): { bearerToken: string; cookies: string } {
    const stored = this.creds.set(input);
    this.pathTokens.clear();
    return { bearerToken: stored.bearerToken, cookies: stored.cookies };
  }

  clearCredentials(): void { this.creds.clear(); this.pathTokens.clear(); }
  hasCredentials(): boolean { return this.creds.has(); }

  getCredentialsRedacted(): {
    configured: boolean; bearerLength: number; cookiesLength: number;
    hasHifLeim: boolean; hasHifDliq: boolean; hasDeviceId: boolean;
    acquiredAt: number | null;
  } {
    const c = this.creds.get();
    if (!c) return {
      configured: false, bearerLength: 0, cookiesLength: 0,
      hasHifLeim: false, hasHifDliq: false, hasDeviceId: false, acquiredAt: null,
    };
    return {
      configured: true,
      bearerLength: c.bearerToken.length,
      cookiesLength: c.cookies.length,
      hasHifLeim: !!c.hifLeim,
      hasHifDliq: !!c.hifDliq,
      hasDeviceId: !!c.deviceId,
      acquiredAt: c.acquiredAt,
    };
  }

  private requireCreds() {
    const c = this.creds.get();
    if (!c) throw new DeepSeekNoCredentialsError();
    return c;
  }

  private buildHeaders(extra?: Record<string, string>): Record<string, string> {
    const c = this.requireCreds();
    const h: Record<string, string> = {
      'content-type': 'application/json',
      'accept': '*/*',
      'accept-language': 'en-US',
      'authorization': `Bearer ${c.bearerToken}`,
      'cookie': c.cookies,
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
      'origin': this.opts.baseUrl,
      'referer': `${this.opts.baseUrl}/`,
      'priority': 'u=1, i',
      'sec-ch-ua': '"Chromium";v="127", "Not)A;Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Linux"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'x-client-bundle-id': 'com.deepseek.chat',
      'x-client-locale': 'en_US',
      'x-client-platform': 'web',
      'x-client-timezone-offset': '7200',
      'x-client-version': '2.5.0',
    };
    if (c.deviceId) h['x-device-id'] = c.deviceId;
    if (c.hifLeim) h['x-hif-leim'] = c.hifLeim;
    if (c.hifDliq) h['x-hif-dliq'] = c.hifDliq;
    if (extra) Object.assign(h, extra);
    return h;
  }

  private async fetchJson(path: string, init: RequestInit): Promise<{ response: Response; json: DeepSeekApiResponse }> {
    const url = path.startsWith('http') ? path : this.opts.baseUrl + path;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.requestTimeoutMs);
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: init.signal ?? controller.signal });
    } finally {
      clearTimeout(timer);
    }
    const text = await response.text();
    let json: DeepSeekApiResponse;
    try { json = JSON.parse(text); }
    catch { throw new DeepSeekApiError(-1, `Non-JSON response (${response.status}): ${text.slice(0, 200)}`, response.status); }
    return { response, json };
  }

  private async createPowChallenge(targetPath: string): Promise<PowChallenge> {
    const { json } = await this.fetchJson('/api/v0/chat/create_pow_challenge', {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({ target_path: targetPath }),
    });
    if (json.code !== 0) {
      if (json.code === 40002 || json.code === 40003) throw new DeepSeekAuthError(json.code, json.msg);
      throw new DeepSeekApiError(json.code, json.msg, 200);
    }
    const chal = (json.data as any).biz_data.challenge;
    return {
      challenge: chal.challenge,
      salt: chal.salt,
      expireAt: chal.expire_at,
      difficulty: chal.difficulty,
      signature: chal.signature,
      algorithm: chal.algorithm || 'DeepSeekHashV1',
    };
  }

  private buildPowHeader(pow: PowChallenge, answer: number, targetPath: string): string {
    const payload = JSON.stringify({
      algorithm: pow.algorithm,
      challenge: pow.challenge,
      salt: pow.salt,
      answer,
      signature: pow.signature,
      target_path: targetPath,
    });
    return Buffer.from(payload, 'utf8').toString('base64');
  }

  private async createChatSession(pow: PowChallenge, answer: number, targetPath: string): Promise<string> {
    const { json } = await this.fetchJson('/api/v0/chat_session/create', {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({
        challenge: pow.challenge,
        target_path: targetPath,
        salt: pow.salt,
        answer: String(answer),
        signature: pow.signature,
      }),
    });
    if (json.code !== 0) {
      if (json.code === 40002 || json.code === 40003) throw new DeepSeekAuthError(json.code, json.msg);
      throw new DeepSeekApiError(json.code, json.msg, 200);
    }
    const biz = (json.data as any).biz_data;
    const sessionId = biz && biz.chat_session && biz.chat_session.id;
    if (!sessionId) throw new DeepSeekApiError(-1, 'chat_session/create returned no id', 200);
    return sessionId;
  }

  async refreshPathToken(targetPath?: string, force = false): Promise<{ token: string; expiresAt: number }> {
    const path = targetPath ?? this.opts.defaultTargetPath;
    if (!force) {
      const cached = this.pathTokens.get(path);
      if (cached && cached.expiresAt > Date.now()) return { token: cached.token, expiresAt: cached.expiresAt };
    }
    const ch = await this.createPowChallenge(path);
    const answer = await this.pow.solve(ch.challenge, ch.salt, ch.expireAt, ch.difficulty);
    const sessionId = await this.createChatSession(ch, answer, path);
    const expiresAt = Date.now() + 3600 * 1000;
    this.pathTokens.set(path, { targetPath: path, token: sessionId, expiresAt });
    return { token: sessionId, expiresAt };
  }

  listCachedPathTokens(): PathToken[] {
    return Array.from(this.pathTokens.values()).map((t) => ({ ...t }));
  }

  private promptFromInput(input: string | DeepSeekMessage[]): string {
    if (typeof input === 'string') return input;
    if (!Array.isArray(input) || input.length === 0) {
      throw new DeepSeekApiError(-1, 'messages must be a non-empty array', 0);
    }
    const last = input.filter((m) => m.role === 'user').pop();
    return last ? last.content : input[input.length - 1].content;
  }

  private buildBody(sessionId: string, prompt: string, options: CallDeepSeekOptions): Record<string, unknown> {
    const body: Record<string, unknown> = {
      chat_session_id: sessionId,
      parent_message_id: options.parentMessageId ?? null,
      model_type: options.modelType ?? null,
      prompt,
      ref_file_ids: [],
      thinking_enabled: options.thinkingEnabled ?? false,
      search_enabled: options.searchEnabled ?? false,
      action: null,
      preempt: false,
    };
    if (typeof options.temperature === 'number') body.temperature = options.temperature;
    if (typeof options.maxTokens === 'number') body.max_tokens = options.maxTokens;
    return body;
  }

  async callDeepSeek(input: string | DeepSeekMessage[], options: CallDeepSeekOptions = {}): Promise<DeepSeekApiResponse> {
    const targetPath = options.targetPath ?? this.opts.defaultTargetPath;
    const prompt = this.promptFromInput(input);

    const ch = await this.createPowChallenge(targetPath);
    const answer = await this.pow.solve(ch.challenge, ch.salt, ch.expireAt, ch.difficulty);
    const powHeader = this.buildPowHeader(ch, answer, targetPath);

    const sessionId = options.chatSessionId
      || (await this.refreshPathToken(targetPath, false)).token;

    const url = targetPath.startsWith('http') ? targetPath : this.opts.baseUrl + targetPath;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.requestTimeoutMs);

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders({ 'x-ds-pow-response': powHeader, 'accept': 'text/event-stream' }),
        body: JSON.stringify(this.buildBody(sessionId, prompt, options)),
        signal: options.signal ?? controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      throw new DeepSeekApiError(-1, 'HTTP ' + response.status + ': ' + text.slice(0, 300), response.status);
    }

    // DeepSeek always returns SSE here, even with stream:false.
    // Accumulate text fragments from the stream.
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulated = '';
    let sessionId_seen: string | null = sessionId;
    let messageId: number | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        for (const line of block.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;

          let parsed;
          try { parsed = JSON.parse(payload); } catch { continue; }

          // Shape 1: {"v":{"response":{"content":"..."}}}
          const vResp = parsed && parsed.v && parsed.v.response;
          if (vResp) {
            if (typeof vResp.content === 'string' && vResp.content.length > 0) {
              accumulated += vResp.content;
            }
            if (typeof vResp.message_id === 'number') messageId = vResp.message_id;
          }

          // Shape 2: OpenAI-style
          const delta = parsed && parsed.choices && parsed.choices[0] && parsed.choices[0].delta;
          if (delta && typeof delta.content === 'string') {
            accumulated += delta.content;
          }

          // Shape 3: bare content field
          if (!vResp && !delta && typeof parsed.content === 'string') {
            accumulated += parsed.content;
          }
        }
      }
    }
    try { reader.releaseLock(); } catch (_) {}

    return {
      code: 0,
      msg: '',
      data: {
        content: accumulated,
        chat_session_id: sessionId_seen,
        message_id: messageId,
      },
    };
  }

  async *streamDeepSeek(input: string | DeepSeekMessage[], options: CallDeepSeekOptions = {}): AsyncGenerator<StreamChunk, void, unknown> {
    const targetPath = options.targetPath ?? this.opts.defaultTargetPath;
    const prompt = this.promptFromInput(input);

    const ch = await this.createPowChallenge(targetPath);
    const answer = await this.pow.solve(ch.challenge, ch.salt, ch.expireAt, ch.difficulty);
    const powHeader = this.buildPowHeader(ch, answer, targetPath);

    const sessionId = options.chatSessionId
      || (await this.refreshPathToken(targetPath, false)).token;

    const url = targetPath.startsWith('http') ? targetPath : this.opts.baseUrl + targetPath;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders({ 'x-ds-pow-response': powHeader, 'accept': 'text/event-stream' }),
      body: JSON.stringify(this.buildBody(sessionId, prompt, options)),
      signal: options.signal,
    });

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      yield { type: 'error', error: `HTTP ${response.status}: ${text.slice(0, 300)}` };
      return;
    }

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
            const isData = line.startsWith('data:');
            const isEvent = line.startsWith('event:');
            if (isEvent) {
              const evt = line.slice(6).trim();
              if (evt === 'finish') { yield { type: 'done' }; return; }
            }
            if (!isData) continue;
            const payload = line.slice(5).trim();
            if (payload.length === 0) continue;
            if (payload === '[DONE]') { yield { type: 'done' }; return; }
            try {
              const parsed = JSON.parse(payload);
              // DeepSeek SSE shapes vary: pick content wherever it lives.
              const content =
                parsed?.choices?.[0]?.delta?.content ??
                parsed?.choices?.[0]?.message?.content ??
                parsed?.data?.biz_data?.choices?.[0]?.delta?.content ??
                parsed?.content ??
                parsed?.text ??
                '';
              if (content) yield { type: 'chunk', content, raw: payload };
            } catch {
              yield { type: 'chunk', content: payload, raw: payload };
            }
          }
        }
      }
      yield { type: 'done' };
    } catch (err) {
      yield { type: 'error', error: err instanceof Error ? err.message : String(err) };
    } finally {
      try { reader.releaseLock(); } catch { /* noop */ }
    }
  }

  async verifyCredentials(): Promise<{ ok: boolean; code: number; msg: string }> {
    const { json } = await this.fetchJson('/api/v0/users/current', { method: 'GET', headers: this.buildHeaders() });
    return { ok: json.code === 0, code: json.code, msg: json.msg };
  }

  async healthCheck(): Promise<{
    credentialsConfigured: boolean;
    bearerLength: number;
    cookiesLength: number;
    hasHifLeim: boolean;
    hasHifDliq: boolean;
    hasDeviceId: boolean;
    acquiredAt: number | null;
    powWasmPresent: boolean;
    powWasmLoaded: boolean;
    cachedPathTokens: number;
    bearerValid: boolean | null;
    lastError?: string;
  }> {
    const c = this.getCredentialsRedacted();
    const out = {
      credentialsConfigured: c.configured,
      bearerLength: c.bearerLength,
      cookiesLength: c.cookiesLength,
      hasHifLeim: c.hasHifLeim,
      hasHifDliq: c.hasHifDliq,
      hasDeviceId: c.hasDeviceId,
      acquiredAt: c.acquiredAt,
      powWasmPresent: this.pow.wasmExists(),
      powWasmLoaded: this.pow.isReady(),
      cachedPathTokens: this.pathTokens.size,
      bearerValid: null as boolean | null,
      lastError: undefined as string | undefined,
    };
    if (!c.configured) return out;
    try {
      const v = await this.verifyCredentials();
      out.bearerValid = v.ok;
      if (!v.ok) out.lastError = `${v.code} ${v.msg}`;
    } catch (err) {
      out.bearerValid = false;
      out.lastError = err instanceof Error ? err.message : String(err);
    }
    return out;
  }
}
