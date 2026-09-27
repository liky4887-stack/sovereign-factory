// Qwen engine types. Mirrors DeepSeekTypes where sensible; extends
// where Qwen requires different shapes (e.g. OpenAI-compatible body).

export interface QwenCredentials {
  cookies: string;                 // full joined cookie string
  bearerToken?: string;            // optional Authorization bearer
  hifLeim?: string;                // fingerprint-style header if Qwen has one
  hifDliq?: string;                // same
  deviceId?: string;
  extraHeaders?: Record<string, string>;  // any other static headers Qwen needs
  acquiredAt: number;
}

export interface QwenCredentialsFileShape {
  cookies: string;
  bearerToken?: string;
  hifLeim?: string;
  hifDliq?: string;
  deviceId?: string;
  extraHeaders?: Record<string, string>;
  acquiredAt?: number;
}

export interface QwenChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface QwenCallOptions {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  model?: string;
  thinkingEnabled?: boolean;
  searchEnabled?: boolean;
  chatSessionId?: string;
  targetPath?: string;
  signal?: AbortSignal;
  parentMessageId?: string | null;
  [key: string]: unknown;
}

export interface QwenResponse {
  code: number;
  msg: string;
  data: {
    content: string;
    chat_session_id: string | null;
    message_id: number | string | null;
  };
}

export interface QwenPathToken {
  targetPath: string;
  token: string;
  expiresAt: number;
}

export interface QwenServiceOptions {
  // Base URL of the Qwen web product (chat.qwen.ai or equivalent).
  // TODO: REPLACE with confirmed base URL from captured request.
  baseUrl: string;

  // Default target path for chat completions.
  // TODO: REPLACE with confirmed endpoint from captured request.
  defaultTargetPath: string;

  // Default model name.
  defaultModel: string;

  requestTimeoutMs: number;

  // Path where credentials are persisted.
  credentialsFile: string;
}
