// GeminiService — thin wrapper around Freebie (port 8001).
// Replaces the hand-rolled 102-element payload + bl/f.sid refresh with a
// single forward to Freebie. Freebie handles TLS impersonation, auth,
// retries, and SSE parsing internally.
//
// Reference: RABNEER/freebie-api

import { callLocalProxy } from '../../shared/localProxy';
import {
  LlmEngine,
  LlmCallOptions,
  LlmResponse,
  LlmStreamChunk,
  LlmCredentialsRedacted,
  LlmHealth,
  ENGINE_IDS,
} from '../LlmEngine';

export interface GeminiConfig {
  // Legacy fields kept for backward-compat with apps/backend/src/index.ts
  baseUrl?: string;
  defaultModel?: string;
  requestTimeoutMs?: number;
  credentialsFile?: string;
  cookies?: string;
  atToken?: string;
  // New
  freebiePort?: number;
}

export class GeminiService implements LlmEngine {
  readonly id = ENGINE_IDS.GEMINI;
  readonly label = 'Gemini';
  private lastCallAt: number | null = null;
  private lastCallOk: boolean | null = null;
  private lastCallError: string | null = null;

  constructor(private readonly cfg: GeminiConfig = {}) {}

  private get port(): number {
    return this.cfg.freebiePort ?? Number(process.env.FREEBIE_PORT ?? 8001);
  }

  private get model(): string {
    return this.cfg.defaultModel || 'gemini-3.6-flash';
  }

  async call(
    input: string | Array<{ role: string; content: string }>,
    options: LlmCallOptions = {},
  ): Promise<LlmResponse> {
    const messages = typeof input === 'string'
      ? [{ role: 'user', content: input }]
      : input.map((m) => ({ role: m.role, content: String(m.content ?? '') }));

    try {
      const r = await callLocalProxy({
        port: this.port,
        model: (options as any).model || this.model,
        messages,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        timeoutMs: this.cfg.requestTimeoutMs ?? 120_000,
        signal: options.signal,
      });
      this.lastCallAt = Date.now();
      this.lastCallOk = true;
      this.lastCallError = null;
      return {
        code: 0,
        msg: '',
        data: { content: r.content, chat_session_id: null, message_id: null },
      };
    } catch (e) {
      this.lastCallAt = Date.now();
      this.lastCallOk = false;
      this.lastCallError = e instanceof Error ? e.message : String(e);
      throw e;
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

  setCredentials(_input: Record<string, unknown>): Record<string, unknown> {
    return { stored: false, note: 'Gemini credentials managed by Freebie' };
  }
  clearCredentials(): void {}
  hasCredentials(): boolean { return true; }

  getCredentialsRedacted(): LlmCredentialsRedacted {
    return {
      configured: true,
      hasCookies: false,
      hasBearer: false,
      hasExtraHeaders: false,
      acquiredAt: null,
    };
  }

  async healthCheck(): Promise<LlmHealth> {
    return {
      engineId: this.id,
      configured: true,
      healthy: this.lastCallOk !== false,
      lastCallAt: this.lastCallAt,
      lastCallOk: this.lastCallOk,
      lastCallError: this.lastCallError,
      provider: 'freebie',
      model: this.model,
      freebiePort: this.port,
    };
  }
}
