import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/app-error';
import { logger } from '../utils/logger';

/**
 * Central Error Handler Middleware
 *
 * Replaces fragile error-message string matching with typed application errors.
 * Guarantees that:
 * 1. Zod schema validation errors return structured 400 Bad Request.
 * 2. Malformed JSON payloads return 400 Bad Request.
 * 3. Typed AppErrors (BadRequestError, AuthenticationError, UpstreamServiceError)
 *    map deterministically to their status codes without exposing internals.
 * 4. Unexpected server failures return sanitized 500 responses without leaking stack traces.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  // 1. Handle Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Validation failed for request body',
      details: err.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
      statusCode: 400,
    });
    return;
  }

  // 2. Handle syntax error for malformed JSON bodies
  if (err instanceof SyntaxError && 'status' in err && (err as { status: number }).status === 400) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Malformed JSON payload',
      statusCode: 400,
    });
    return;
  }

  // 3. Handle typed application errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.errorType,
      message: err.message,
      statusCode: err.statusCode,
    });
    return;
  }

  // 4. Unhandled / Internal Server Errors (500) - Sanitized
  logger.error({ err }, 'Unhandled application error');

  res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected internal error occurred',
    statusCode: 500,
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
    statusCode: 404,
  });
}
