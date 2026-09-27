// Kimi engine types. Mirrors QwenTypes structure.
// TODO: REPLACE endpoint/body shapes once we capture a real request
// from kimi.ai / kimi.moonshot.cn browser session.

export interface KimiCredentials {
  cookies: string;
  bearerToken?: string;
  csrfToken?: string;
  extraHeaders?: Record<string, string>;
  acquiredAt: number;
}

export interface KimiCredentialsFileShape {
  cookies: string;
  bearerToken?: string;
  csrfToken?: string;
  extraHeaders?: Record<string, string>;
  acquiredAt?: number;
}

export interface KimiCallOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
  thinkingEnabled?: boolean;
  searchEnabled?: boolean;
  chatSessionId?: string;
  targetPath?: string;
  signal?: AbortSignal;
  [key: string]: unknown;
}

export interface KimiResponse {
  code: number;
  msg: string;
  data: {
    content: string;
    chat_session_id: string | null;
    message_id: number | string | null;
  };
}

export interface KimiServiceOptions {
  baseUrl: string;
  defaultTargetPath: string;
  defaultModel: string;
  requestTimeoutMs: number;
  credentialsFile: string;
  // Invisible Man policy knobs — all respected by KimiThrottle.
  minRequestGapSeconds: number;
  maxRequestsPerDay: number;
  concurrencyLimit: number;
}
