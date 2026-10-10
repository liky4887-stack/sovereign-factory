// GrokService — web-session client for grok.com. Cookie + bearer token,
// matching the Kimi pattern. No API key. Cloudflare sits in front, so
// cookies must include cf_clearance + __cf_bm from a fresh browser session.
import {
  LlmCallOptions,
  LlmResponse,
  LlmStreamChunk,
} from '../LlmEngine';

export interface GrokConfig {
  baseUrl: string;
  defaultModel: string;
  requestTimeoutMs?: number;
  credentialsFile?: string;
  cookies?: string;
  bearerToken?: string;
}

export interface GrokCredRaw {
  cookies: string;
  bearerToken: string | null;
  csrfToken: string | null;
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

export class GrokService {
  private cookies: string | null = null;
  private bearerToken: string | null = null;
  private csrfToken: string | null = null;
  private extraHeaders: Record<string, string> | null = null;
  private acquiredAt: number | null = null;
  private lastCallAt: number | null = null;
  private lastCallOk: boolean | null = null;
  private lastCallError: string | null = null;

  constructor(private readonly cfg: GrokConfig) {
    if (cfg.cookies) {
      this.setCredentials({ cookies: cfg.cookies, bearerToken: cfg.bearerToken });
    }
  }

  setCredentials(input: Record<string, unknown>): Record<string, unknown> {
    const cookies = typeof input.cookies === 'string' ? input.cookies.trim() : '';
    const bearer = typeof input.bearerToken === 'string' ? input.bearerToken.trim() : '';
    const csrf = typeof input.csrfToken === 'string' ? input.csrfToken.trim() : '';
    const extra = input.extraHeaders && typeof input.extraHeaders === 'object'
      ? (input.extraHeaders as Record<string, string>)
      : null;
    if (cookies) this.cookies = cookies;
    if (bearer) this.bearerToken = bearer;
    if (csrf) this.csrfToken = csrf;
    if (extra) this.extraHeaders = extra;
    this.acquiredAt = Date.now();
    return {
      cookiesLength: this.cookies?.length ?? 0,
      hasBearer: this.bearerToken !== null,
      hasCsrf: this.csrfToken !== null,
      hasExtraHeaders: this.extraHeaders !== null,
      acquiredAt: this.acquiredAt,
    };
  }

  clearCredentials(): void {
    this.cookies = null;
    this.bearerToken = null;
    this.csrfToken = null;
    this.extraHeaders = null;
    this.acquiredAt = null;
  }

  hasCredentials(): boolean {
    // grok.com web auth is cookie-only (sso cookie). Bearer is optional
    // and only sent if present — sending it can be rejected as a bogus
    // management key by the grpc-gateway.
    return this.cookies !== null && this.cookies.length > 0;
  }

  getCredentialsRedacted(): GrokCredRaw {
    return {
      cookies: this.cookies ? this.cookies.slice(0, 40) + '…' : '',
      bearerToken: this.bearerToken ? this.bearerToken.slice(0, 20) + '…' : null,
      csrfToken: this.csrfToken ? this.csrfToken.slice(0, 12) + '…' : null,
      extraHeaders: this.extraHeaders,
      acquiredAt: this.acquiredAt,
    };
  }

  getCredentialsFull(): GrokCredRaw {
    return {
      cookies: this.cookies ?? '',
      bearerToken: this.bearerToken,
      csrfToken: this.csrfToken,
      extraHeaders: this.extraHeaders,
      acquiredAt: this.acquiredAt,
    };
  }

  private buildHeaders(): Record<string, string> {
    const h: Record<string, string> = {
      'content-type': 'application/json',
      accept: '*/*',
      origin: this.cfg.baseUrl,
      referer: this.cfg.baseUrl + '/',
    };
    if (this.cookies) h.cookie = this.cookies;
    // Only attach authorization if the token is a real JWT (three dot-separated
    // segments). Placeholder strings and API-key-shaped values break the
    // grpc-gateway with "Invalid bearer token — management key".
    const looksJwt = this.bearerToken && this.bearerToken.split('.').length === 3;
    if (looksJwt) h.authorization = 'Bearer ' + this.bearerToken;
    if (this.csrfToken) h['x-csrf-token'] = this.csrfToken;
    if (this.extraHeaders) Object.assign(h, this.extraHeaders);
    return h;
  }

  async call(
    input: string | Array<{ role: string; content: string }>,
    options: LlmCallOptions = {},
  ): Promise<LlmResponse> {
    if (!this.hasCredentials()) {
      throw new Error(
        'Grok credentials not configured. POST /grok/credentials with {cookies, bearerToken}.',
      );
    }
    const messages = normalizeInput(input);
    // Grok web takes a single message + history; simplest form: concatenate
    // system into the first user message, pass full history.
    const first = messages[0];
    // grok.com web API as of mid-2026:
    //  - field is `modeId` (top-level). `modelName` and `modelMode` are dead.
    //  - valid modes: fast | expert | heavy | grok-420-computer-use-sa.
    //    `auto` was REMOVED and returns 403 "Model is not found".
    //  - payload now requires UI state fields (deviceEnvInfo, isAsyncChat,
    //    disableMemory, disableSelfHarmShortCircuit, disableTextFollowUps).
    const rawMode = String((options as any).modeId || (options as any).model || this.cfg.defaultModel || 'fast');
    const VALID_MODES = new Set(['fast', 'expert', 'heavy', 'grok-420-computer-use-sa']);
    const modeId = VALID_MODES.has(rawMode) ? rawMode : 'fast';
    const body: Record<string, unknown> = {
      deviceEnvInfo: {
        darkModeEnabled: false,
        devicePixelRatio: 2,
        screenWidth: 2056,
        screenHeight: 1329,
        viewportWidth: 2056,
        viewportHeight: 1083,
      },
      disableMemory: false,
      disableSearch: false,
      disableSelfHarmShortCircuit: false,
      disableTextFollowUps: false,
      enableImageGeneration: false,
      enableImageStreaming: false,
      enableSideBySide: true,
      fileAttachments: [],
      forceConcise: false,
      forceSideBySide: false,
      imageAttachments: [],
      imageGenerationCount: 2,
      isAsyncChat: false,
      isReasoning: modeId === 'expert' || modeId === 'heavy',
      message: first.content,
      modeId,
      responseMetadata: {
        requestModelDetails: { modelId: modeId },
      },
      returnImageBytes: false,
      returnRawGrokInXaiRequest: false,
      sendFinalMetadata: true,
      temporary: false,
      toolOverrides: {},
    };

    this.lastCallAt = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.cfg.requestTimeoutMs ?? 120_000);

    try {
      const res = await fetch(this.cfg.baseUrl + '/rest/app-chat/conversations/new', {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
        signal: options.signal ?? ctrl.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Grok HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      // Grok web streams newline-delimited JSON. Collect modelResponse chunks.
      const reader = res.body?.getReader();
      let content = '';
      let convId: string | null = null;
      if (reader) {
        const dec = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const raw of lines) {
            const t = raw.trim();
            if (!t) continue;
            let j: any;
            try { j = JSON.parse(t); } catch { continue; }
            const mr = j?.result?.response?.modelResponse;
            if (mr?.message) content += mr.message;
            if (j?.result?.conversation?.conversationId) {
              convId = j.result.conversation.conversationId;
            }
          }
        }
      }
      this.lastCallOk = true;
      this.lastCallError = null;
      return {
        code: 0,
        msg: '',
        data: {
          content,
          chat_session_id: convId,
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
      engineId: 'engine_grok',
      configured: this.hasCredentials(),
      healthy: this.hasCredentials(),
      cookiesLength: this.cookies?.length ?? 0,
      hasBearer: this.bearerToken !== null,
      hasCsrf: this.csrfToken !== null,
      hasExtraHeaders: this.extraHeaders !== null,
      acquiredAt: this.acquiredAt,
      lastCallAt: this.lastCallAt,
      lastCallOk: this.lastCallOk,
      lastCallError: this.lastCallError,
      provider: 'grok.com',
      model: this.cfg.defaultModel,
    };
  }
}
