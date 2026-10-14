/**
 * Application Error Hierarchy
 *
 * Provides strongly typed errors for consistent status code mapping,
 * error categorization, and safe client sanitization.
 */

export class AppError extends Error {
  public statusCode: number;
  public errorType: string;

  constructor(message: string, statusCode = 500, errorType = 'Internal Server Error') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorType = errorType;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/**
 * 400 Bad Request - Client supplied invalid input, malformed JSON,
 * unsupported HTTP method, or forbidden path traversal pattern.
 */
export class BadRequestError extends AppError {
  constructor(message: string) {
    super(message, 400, 'Bad Request');
  }
}

/**
 * 401 Unauthorized or 500 Configuration Error - Token validation failure,
 * missing identity claims, or missing service configuration.
 */
export class AuthenticationError extends AppError {
  constructor(message: string, statusCode = 401) {
    super(
      message,
      statusCode,
      statusCode === 401 ? 'Unauthorized' : 'Configuration Error',
    );
  }
}

/**
 * 502 Bad Gateway / 503 Service Unavailable - Remote upstream identity
 * provider or JWKS endpoint failure (timeout, network unreachable, DNS failure).
 */
export class UpstreamServiceError extends AppError {
  constructor(
    message = 'Authentication provider service is temporarily unavailable',
    statusCode = 503,
  ) {
    super(
      message,
      statusCode,
      statusCode === 502 ? 'Bad Gateway' : 'Service Unavailable',
    );
  }
}
