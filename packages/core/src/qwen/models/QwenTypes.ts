// Qwen engine types. Mirrors DeepSeekTypes where sensible.
// Auth model (from captured browser traffic):
//   - accessToken: short-lived JWT (~15 min), sent as `Authorization: Bearer`
//   - cookies: full jar for WAF/session continuity
//   - refresh_token cookie: long-lived (~30 days), used to mint access tokens
//   - bx-ua / bx-umidtoken / bx-v: Alibaba WAF fingerprints (required)

export interface QwenCredentials {
  cookies: string;
  accessToken?: string;
  refreshToken?: string;
  bxUa?: string;               // Alibaba WAF browser fingerprint (~2KB)
  bxUmidToken?: string;        // Alibaba UMID device token
  bxV?: string;                // Alibaba bx SDK version, e.g. "2.5.37"
  timezone?: string;           // e.g. "Sun Sep 27 2026 02:15:48 GMT+0200"
  extraHeaders?: Record<string, string>;
  acquiredAt: number;
}

export interface QwenCredentialsFileShape {
  cookies: string;
  accessToken?: string;
  refreshToken?: string;
  bxUa?: string;
  bxUmidToken?: string;
  bxV?: string;
  timezone?: string;
  extraHeaders?: Record<string, string>;
  acquiredAt?: number;
}

export interface QwenCallOptions {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  model?: string;
  thinkingEnabled?: boolean;
  searchEnabled?: boolean;
  chatSessionId?: string;
  parentMessageId?: string | null;
  targetPath?: string;
  signal?: AbortSignal;
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
  baseUrl: string;             // https://chat.qwen.ai
  defaultTargetPath: string;   // /api/v2/chat/completions
  defaultModel: string;        // qwen3.7-plus
  requestTimeoutMs: number;
  credentialsFile: string;
}
