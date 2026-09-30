export interface DeepHatServiceOptions {
  baseUrl: string;
  gatewayUrl: string;
  gatewayKey: string;
  defaultModel: string;
  requestTimeoutMs: number;
}

export type DeepHatCallOptions = {
  model?: string;
  signal?: AbortSignal;
  [key: string]: unknown;
};
