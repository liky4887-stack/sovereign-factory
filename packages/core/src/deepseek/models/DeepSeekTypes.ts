export interface DeepSeekCredentials {
  bearerToken: string;
  cookies: string;
  hifLeim?: string;
  hifDliq?: string;
  deviceId?: string;
  acquiredAt: number;
}

export interface DeepSeekMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface CallDeepSeekOptions {
  modelType?: string | null;
  temperature?: number;
  maxTokens?: number;
  targetPath?: string;
  signal?: AbortSignal;
  thinkingEnabled?: boolean;
  searchEnabled?: boolean;
  chatSessionId?: string | null;
  parentMessageId?: number | null;
}

export interface DeepSeekApiResponse<T = unknown> {
  code: number;
  msg: string;
  data: T | null;
}

export interface PathToken {
  targetPath: string;
  token: string;
  expiresAt: number;
}

export interface StreamChunk {
  type: 'chunk' | 'done' | 'error';
  content?: string;
  raw?: string;
  error?: string;
}

export interface CredentialsFileShape {
  bearerToken: string;
  cookies: string;
  hifLeim?: string;
  hifDliq?: string;
  deviceId?: string;
}

export interface DeepSeekServiceOptions {
  baseUrl: string;
  defaultTargetPath: string;
  defaultModel: string;
  requestTimeoutMs: number;
  pathTokenTtlSafetyMs?: number;
}

export interface PowChallenge {
  challenge: string;
  salt: string;
  expireAt: number;
  difficulty: number;
  signature: string;
  algorithm: string;
}
