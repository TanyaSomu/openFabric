import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AuthenticationError } from '../services/token.service';
import { logger } from '../utils/logger';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  // Handle Zod validation errors
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

  // Handle Authentication errors (401)
  if (err instanceof AuthenticationError) {
    res.status(err.statusCode).json({
      error: err.statusCode === 401 ? 'Unauthorized' : 'Configuration Error',
      message: err.message,
      statusCode: err.statusCode,
    });
    return;
  }

  // Handle resource path and method validation errors
  if (err instanceof Error) {
    if (
      err.message.includes('Unsupported HTTP method') ||
      err.message.includes('Resource path') ||
      err.message.includes('Directory traversal') ||
      err.message.includes('Malformed URL-encoded')
    ) {
      res.status(400).json({
        error: 'Bad Request',
        message: err.message,
        statusCode: 400,
      });
      return;
    }
  }

  // Handle syntax error for malformed JSON bodies
  if (err instanceof SyntaxError && 'status' in err && (err as { status: number }).status === 400) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Malformed JSON payload',
      statusCode: 400,
    });
    return;
  }

  // Unhandled / Internal Server Errors (500)
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
