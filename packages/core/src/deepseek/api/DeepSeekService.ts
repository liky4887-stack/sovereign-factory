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
import { UEB, EVENTS, peekRoute, pendingResults } from '../../events';

/**
 * DeepSeek streams JSON-Patch style SSE frames. Three shapes:
 *   1. Initial:  {"v":{"response":{"fragments":[{"content":"Hello"}]}}}
 *   2. Patch:    {"p":"response/fragments/-1/content","o":"APPEND","v":" there"}
 *   3. Bare:     {"v":" how"}  -- continues the last active content path
 *
 * The helper below tracks a running text buffer across frames. It returns
 * the delta produced by the current payload (empty string if nothing added).
 */
interface SseState {
  text: string;
  lastPath: string | null;
}

function applySsePayload(payload: string, state: SseState): string {
  if (!payload || payload === '[DONE]') return '';

  let j: any;
  try { j = JSON.parse(payload); } catch { return ''; }

  const before = state.text.length;

  // Case 1: initial frame with fragments array.
  if (j.v && typeof j.v === 'object' && j.v.response) {
    const frags = j.v.response.fragments;
    if (Array.isArray(frags)) {
      for (const f of frags) {
        if (f && typeof f.content === 'string') {
          state.text += f.content;
        }
      }
    }
    state.lastPath = 'response/fragments/-1/content';
    return state.text.slice(before);
  }

  // Case 2: explicit JSON patch {p, o, v}.
  if (typeof j.p === 'string' && typeof j.o === 'string') {
    if (j.p.includes('content') && typeof j.v === 'string') {
      if (j.o === 'APPEND') state.text += j.v;
      else if (j.o === 'SET') state.text = j.v;
    }
    state.lastPath = j.p;
    return state.text.slice(before);
  }

  // Case 3: bare continuation {v: "..."} — append to last content path.
  if (typeof j.v === 'string' && state.lastPath && state.lastPath.includes('content')) {
    state.text += j.v;
    return state.text.slice(before);
  }

  return '';
}

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

    const correlation_id = 'chat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const route = peekRoute(prompt, correlation_id);

    // If /run matched, register the waiter BEFORE emitting so we don't
    // race the termuxHandler's async resolution.
    let commandPromise: Promise<any> | null = null;
    const isTermuxRoute = route && route.ruleName === 'termux.run';
    const isWorkspaceRoute = route && (
      route.ruleName === 'workspace.ls' ||
      route.ruleName === 'workspace.read' ||
      route.ruleName === 'workspace.write'
    );
    if (route && (isTermuxRoute || isWorkspaceRoute)) {
      commandPromise = pendingResults.wait(correlation_id, 35000);
    }

    // Emit CHAT.COMMAND_PARSED and await the full handler chain. If the
    // route is termux.run, this also runs the command and resolves the
    // pending promise before we return.
    await UEB.emit({
      event_type: EVENTS.CHAT_COMMAND_PARSED,
      source: 'CHAT',
      timestamp: Date.now(),
      correlation_id,
      payload: { prompt, correlation_id, target_path: targetPath },
    });

    // Slash command routing.
    if (route) {
      if (isTermuxRoute && commandPromise) {
        try {
          const cmdResult: any = await commandPromise;
          const parts: string[] = [];
          const stdout = String(cmdResult && cmdResult.stdout || '').trimEnd();
          const stderr = String(cmdResult && cmdResult.stderr || '').trimEnd();
          if (stdout) parts.push(stdout);
          if (stderr) parts.push('[stderr]\n' + stderr);
          parts.push('(exit ' + (cmdResult && cmdResult.exit_code != null ? cmdResult.exit_code : -1) + ')');
          return {
            code: 0,
            msg: '',
            data: { content: parts.join('\n'), chat_session_id: null, message_id: null },
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            code: 0,
            msg: '',
            data: { content: 'run failed: ' + msg, chat_session_id: null, message_id: null },
          };
        }
      }

      if (isWorkspaceRoute && commandPromise) {
        try {
          const ws: any = await commandPromise;
          let text = '';
          if (!ws || ws.ok === false) {
            text = 'workspace error: ' + (ws && ws.error ? ws.error : 'unknown');
          } else if (ws.op === 'list') {
            const lines = (ws.entries || []).map((e: any) =>
              e.type.padEnd(5) + '  ' + String(e.size).padStart(8) + '  ' + e.name
            );
            text = (ws.path || '') + '\n' + lines.join('\n');
          } else if (ws.op === 'read') {
            text = (ws.path || '') + ' (' + (ws.size ?? 0) + ' bytes)\n---\n' + (ws.content ?? '');
          } else if (ws.op === 'write') {
            text = 'wrote ' + (ws.bytesWritten ?? 0) + ' bytes to ' + (ws.path || '');
          } else {
            text = JSON.stringify(ws);
          }
          return {
            code: 0,
            msg: '',
            data: { content: text, chat_session_id: null, message_id: null },
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            code: 0,
            msg: '',
            data: { content: 'workspace failed: ' + msg, chat_session_id: null, message_id: null },
          };
        }
      }
      return {
        code: 0,
        msg: '',
        data: {
          content: route.receipt,
          chat_session_id: null,
          message_id: null,
        },
      };
    }

    const ch = await this.createPowChallenge(targetPath);
    const answer = await this.pow.solve(ch.challenge, ch.salt, ch.expireAt, ch.difficulty);
    const powHeader = this.buildPowHeader(ch, answer, targetPath);

    const sessionId = options.chatSessionId
      || (await this.refreshPathToken(targetPath, false)).token;

    const url = targetPath.startsWith('http') ? targetPath : this.opts.baseUrl + targetPath;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.requestTimeoutMs);

    let response: Response;
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

    const state: SseState = { text: '', lastPath: null };
    const reader = response.body.getReader();
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
          if (!payload) continue;
          applySsePayload(payload, state);
        }
      }
    }
    try { reader.releaseLock(); } catch (_) {}

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
            const delta = applySsePayload(payload, state);
            if (delta) yield { type: 'chunk', content: delta, raw: payload };
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
