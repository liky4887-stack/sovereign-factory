// Universal LLM engine interface. Both DeepSeek and Qwen implement this.
// Higher layers (ProjectBuilder, TwinOrchestrator, HTTP routers) depend
// on this interface, not on any specific engine's implementation.
// Sovereign DNA injection lives ABOVE this layer — engines are pure
// transport + auth. They do NOT know about identity layers.

export interface LlmResponse {
  code: number;
  msg: string;
  data: {
    content: string;
    chat_session_id: string | null;
    message_id: string | number | null;
  };
}

export interface LlmStreamChunk {
  type: 'chunk' | 'done' | 'error';
  content?: string;
  error?: string;
  raw?: string;
}

export interface LlmCallOptions {
  temperature?: number;
  maxTokens?: number;
  thinkingEnabled?: boolean;
  searchEnabled?: boolean;
  chatSessionId?: string;
  targetPath?: string;
  signal?: AbortSignal;
  [key: string]: unknown;
}

export interface LlmCredentialsRedacted {
  configured: boolean;
  hasCookies: boolean;
  hasBearer: boolean;
  hasExtraHeaders: boolean;
  acquiredAt: number | null;
}

export interface LlmHealth {
  engineId: string;
  configured: boolean;
  healthy: boolean;
  lastError?: string;
  lastCallAt?: number | null;
  lastCallOk?: boolean | null;
  lastCallError?: string | null;
  [key: string]: unknown;
}

export interface LlmEngine {
  readonly id: string;         // stable engine id, e.g. 'engine_deepseek'
  readonly label: string;      // human-readable, e.g. 'DeepSeek'

  call(
    input: string | Array<{ role: string; content: string }>,
    options?: LlmCallOptions,
  ): Promise<LlmResponse>;

  stream(
    input: string | Array<{ role: string; content: string }>,
    options?: LlmCallOptions,
  ): AsyncGenerator<LlmStreamChunk, void, unknown>;

  setCredentials(input: Record<string, unknown>): Record<string, unknown>;
  clearCredentials(): void;
  hasCredentials(): boolean;
  getCredentialsRedacted(): LlmCredentialsRedacted;

  healthCheck(): Promise<LlmHealth>;

  /** Optional: false when the engine is blocked by a circuit breaker. */
  isHealthy?(): boolean;
}

export const ENGINE_IDS = {
  DEEPSEEK: 'engine_deepseek',
  QWEN: 'engine_qwen',
  KIMI: 'engine_kimi',
  DEEPHAT: 'engine_deephat',
  GROK: 'engine_grok',
  GEMINI: 'engine_gemini',
  CHATGPT: 'engine_chatgpt',
} as const;

export type EngineId = typeof ENGINE_IDS[keyof typeof ENGINE_IDS];
