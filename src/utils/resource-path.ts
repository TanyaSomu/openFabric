import { Action, HttpMethod } from '../types/authorization.types';
import { BadRequestError } from '../errors/app-error';

const METHOD_ACTION_MAP: Record<HttpMethod, Action> = {
  GET: 'read',
  POST: 'write',
  PUT: 'write',
  PATCH: 'write',
  DELETE: 'delete',
};

/**
 * Maps an HTTP method string to its corresponding authorization Action.
 * Case-insensitive. Rejects unknown or unsupported methods with BadRequestError.
 */
export function mapMethodToAction(rawMethod: string): Action {
  if (!rawMethod || typeof rawMethod !== 'string') {
    throw new BadRequestError('HTTP method must be a non-empty string');
  }

  const method = rawMethod.trim().toUpperCase() as HttpMethod;
  const action = METHOD_ACTION_MAP[method];

  if (!action) {
    throw new BadRequestError(
      `Unsupported HTTP method '${rawMethod}'. Allowed methods: GET, POST, PUT, PATCH, DELETE`,
    );
  }

  return action;
}

/**
 * Normalizes an API request path into a canonical permission resource identifier.
 *
 * Rules:
 * 1. Strips query strings (?key=val) and URL fragments (#anchor).
 * 2. Rejects null bytes and path traversal patterns ('..', '.').
 * 3. Collapses consecutive slashes and strips leading/trailing slashes.
 * 4. Decodes percent-encoded characters per segment safely.
 * 5. Requires at least one valid resource segment.
 */
export function normalizeResourcePath(rawPath: string): string {
  if (rawPath === undefined || rawPath === null || typeof rawPath !== 'string') {
    throw new BadRequestError('Resource path must be a string');
  }

  const trimmed = rawPath.trim();
  if (trimmed.length === 0) {
    throw new BadRequestError('Resource path cannot be empty');
  }

  // Prevent null-byte injection
  if (trimmed.includes('\0')) {
    throw new BadRequestError('Resource path contains forbidden null byte characters');
  }

  // Strip query string and hash fragment
  const pathWithoutQuery = trimmed.split('?')[0].split('#')[0];

  // Split into raw segments, ignoring multiple consecutive slashes and leading/trailing slashes
  const rawSegments = pathWithoutQuery.split('/').filter((seg) => seg.length > 0);

  if (rawSegments.length === 0) {
    throw new BadRequestError('Resource path must contain at least one valid resource identifier');
  }

  const normalizedSegments: string[] = [];

  for (const seg of rawSegments) {
    let decodedSeg: string;
    try {
      decodedSeg = decodeURIComponent(seg);
    } catch {
      throw new BadRequestError(`Malformed URL-encoded segment in path: '${seg}'`);
    }

    // Security check: Directory traversal
    if (
      decodedSeg === '.' ||
      decodedSeg === '..' ||
      decodedSeg.includes('/') ||
      decodedSeg.includes('\\')
    ) {
      throw new BadRequestError(
        `Directory traversal pattern detected in path segment: '${decodedSeg}'`,
      );
    }

    normalizedSegments.push(decodedSeg);
  }

  return normalizedSegments.join('/');
}
