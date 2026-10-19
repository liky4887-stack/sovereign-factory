// ChatGptService — thin wrapper around Freebie (port 8001).
// Replaces the hand-rolled Sentinel PoW + SSE delta parser with a single
// forward to Freebie. Freebie handles everything.
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

export interface ChatGptConfig {
  // Legacy fields kept for backward-compat with apps/backend/src/index.ts
  baseUrl?: string;
  defaultModel?: string;
  requestTimeoutMs?: number;
  credentialsFile?: string;
  cookies?: string;
  // New
  freebiePort?: number;
}

export class ChatGptService implements LlmEngine {
  readonly id = ENGINE_IDS.CHATGPT;
  readonly label = 'ChatGPT';
  private lastCallAt: number | null = null;
  private lastCallOk: boolean | null = null;
  private lastCallError: string | null = null;

  constructor(private readonly cfg: ChatGptConfig = {}) {}

  private get port(): number {
    return this.cfg.freebiePort ?? Number(process.env.FREEBIE_PORT ?? 8001);
  }

  private get model(): string {
    return this.cfg.defaultModel || 'gpt-4o';
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
    return { stored: false, note: 'ChatGPT credentials managed by Freebie' };
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
