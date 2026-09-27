// Qwen error classes. Mirror DeepSeekErrors so upstream code can
// catch generic errors OR engine-specific ones without branching.

export class QwenError extends Error {
  constructor(message: string, public readonly qwenCode?: number | string) {
    super(message);
    this.name = 'QwenError';
  }
}

export class QwenNoCredentialsError extends QwenError {
  constructor() {
    super('Qwen credentials not configured. POST /qwen/credentials to set them.');
    this.name = 'QwenNoCredentialsError';
  }
}

export class QwenAuthError extends QwenError {
  constructor(code: number | string, message?: string) {
    super('Qwen auth failed: ' + (message || 'HTTP ' + code), code);
    this.name = 'QwenAuthError';
  }
}

export class QwenApiError extends QwenError {
  constructor(code: number | string, message: string, public readonly httpStatus: number) {
    super('Qwen API error ' + code + ': ' + message + ' (HTTP ' + httpStatus + ')', code);
    this.name = 'QwenApiError';
  }
}

export class QwenPowError extends QwenError {
  constructor(message: string) {
    super('Qwen POW error: ' + message);
    this.name = 'QwenPowError';
  }
}
