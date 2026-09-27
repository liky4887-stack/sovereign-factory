// Kimi error classes. Mirrors QwenErrors so upstream code can catch
// either engine's errors with the same patterns.

export class KimiError extends Error {
  constructor(message: string, public readonly kimiCode?: number | string) {
    super(message);
    this.name = 'KimiError';
  }
}

export class KimiNoCredentialsError extends KimiError {
  constructor() {
    super('Kimi credentials not configured. POST /kimi/credentials to set them.');
    this.name = 'KimiNoCredentialsError';
  }
}

export class KimiAuthError extends KimiError {
  constructor(code: number | string, message?: string) {
    super('Kimi auth failed: ' + (message || 'HTTP ' + code), code);
    this.name = 'KimiAuthError';
  }
}

export class KimiApiError extends KimiError {
  constructor(code: number | string, message: string, public readonly httpStatus: number) {
    super('Kimi API error ' + code + ': ' + message + ' (HTTP ' + httpStatus + ')', code);
    this.name = 'KimiApiError';
  }
}

// Raised by the throttle when the client should wait rather than call.
export class KimiThrottledError extends KimiError {
  readonly code = 'THROTTLED';
  constructor(message: string, public readonly retryAfterMs: number) {
    super(message);
    this.name = 'KimiThrottledError';
  }
}

// Raised by the WAF breaker after detecting a punishment signal.
export class KimiWafBlockedError extends KimiError {
  readonly code = 'WAF_COOLDOWN';
  constructor(message: string, public readonly cooldownRemainingMs: number) {
    super(message);
    this.name = 'KimiWafBlockedError';
  }
}

// Raised when cookies have been rejected and need re-capture.
export class KimiExpiredSessionError extends KimiError {
  readonly code = 'EXPIRED_SESSION';
  constructor(message: string = 'Kimi session expired — re-capture cookies from browser') {
    super(message);
    this.name = 'KimiExpiredSessionError';
  }
}
