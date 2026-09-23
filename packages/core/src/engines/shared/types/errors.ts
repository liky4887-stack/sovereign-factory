/**
 * Shared error types for the Sovereign Bridge.
 * Modules throw these; the express error handler serializes them.
 */

export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, statusCode = 500, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, 400, details);
    this.name = 'ValidationError';
  }
}

export class AuthError extends AppError {
  constructor(message = 'Unauthorized') {
    super('UNAUTHORIZED', message, 401);
    this.name = 'AuthError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super('NOT_FOUND', message, 404);
    this.name = 'NotFoundError';
  }
}

export class PolicyError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('POLICY_VIOLATION', message, 403, details);
    this.name = 'PolicyError';
  }
}

export class UpstreamError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('UPSTREAM_ERROR', message, 502, details);
    this.name = 'UpstreamError';
  }
}

export class TimeoutError extends AppError {
  constructor(message = 'Operation timed out') {
    super('TIMEOUT', message, 504);
    this.name = 'TimeoutError';
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
