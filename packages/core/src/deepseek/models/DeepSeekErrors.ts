/**
 * DeepSeek bridge - typed errors.
 */

export class DeepSeekAuthError extends Error {
  public readonly deepseekCode: number;
  constructor(deepseekCode: number, msg: string) {
    super(`DeepSeek auth error ${deepseekCode}: ${msg}`);
    this.name = 'DeepSeekAuthError';
    this.deepseekCode = deepseekCode;
  }
}

export class DeepSeekApiError extends Error {
  public readonly deepseekCode: number;
  public readonly httpStatus: number;
  constructor(deepseekCode: number, msg: string, httpStatus: number) {
    super(`DeepSeek API error ${deepseekCode}: ${msg}`);
    this.name = 'DeepSeekApiError';
    this.deepseekCode = deepseekCode;
    this.httpStatus = httpStatus;
  }
}

export class DeepSeekPowError extends Error {
  constructor(msg: string) {
    super(`DeepSeek POW error: ${msg}`);
    this.name = 'DeepSeekPowError';
  }
}

export class DeepSeekNoCredentialsError extends Error {
  constructor() {
    super('DeepSeek credentials not configured. POST /deepseek/credentials to set them.');
    this.name = 'DeepSeekNoCredentialsError';
  }
}
