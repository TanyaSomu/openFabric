import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../config/env';
import { AuthenticatedUser } from '../types/authorization.types';
import { logger } from '../utils/logger';

export type KeySource = Parameters<typeof jwtVerify>[1];

export interface TokenServiceOptions {
  issuerUrl?: string;
  audience?: string;
  keySource?: KeySource;
}

export class AuthenticationError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = 'AuthenticationError';
    this.statusCode = statusCode;
  }
}

export class TokenService {
  private issuerUrl?: string;
  private audience?: string;
  private keySource?: KeySource;

  constructor(options?: TokenServiceOptions) {
    this.issuerUrl = options?.issuerUrl ?? env.AUTH0_ISSUER_URL;
    this.audience = options?.audience ?? env.AUTH0_AUDIENCE;
    this.keySource = options?.keySource;

    // If no custom keySource provided and issuerUrl is configured, initialize remote JWKS
    if (!this.keySource && this.issuerUrl) {
      try {
        const normalizedIssuer = this.issuerUrl.endsWith('/')
          ? this.issuerUrl
          : `${this.issuerUrl}/`;
        const jwksUri = new URL('.well-known/jwks.json', normalizedIssuer);
        this.keySource = createRemoteJWKSet(jwksUri);
      } catch (err) {
        logger.warn({ err }, 'Failed to initialize Auth0 JWKS endpoint');
      }
    }
  }

  /**
   * Maps Auth0 JWT subject/claims to the application user_id.
   *
   * Strategy:
   * 1. Check for custom claim 'https://openfabric.com/user_id' or 'user_id'.
   * 2. If 'sub' claim has Auth0 provider prefix (e.g. 'auth0|user123'), extract the identifier after '|'.
   * 3. Otherwise, use 'sub' directly (e.g. 'user123').
   */
  public extractUserId(payload: Record<string, unknown>): string {
    if (typeof payload['https://openfabric.com/user_id'] === 'string') {
      return payload['https://openfabric.com/user_id'];
    }
    if (typeof payload['user_id'] === 'string') {
      return payload['user_id'];
    }

    if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.trim().length === 0) {
      throw new AuthenticationError('Token is missing required identity claim: sub');
    }

    const sub = payload.sub.trim();
    if (sub.includes('|')) {
      const parts = sub.split('|');
      const suffix = parts.slice(1).join('|');
      if (suffix.length > 0) {
        return suffix;
      }
    }

    return sub;
  }

  /**
   * Verifies an OAuth2 JWT access token using jose.
   * Enforces signature verification, expiration, issuer, audience, and required claims.
   */
  public async verifyToken(token: string): Promise<AuthenticatedUser> {
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      throw new AuthenticationError('Access token is missing or empty');
    }

    if (!this.keySource) {
      throw new AuthenticationError(
        'Auth0 is not configured. Set AUTH0_ISSUER_URL and AUTH0_AUDIENCE in your environment variables.',
        500,
      );
    }

    try {
      const normalizedIssuer = this.issuerUrl
        ? this.issuerUrl.endsWith('/')
          ? this.issuerUrl
          : `${this.issuerUrl}/`
        : undefined;

      const { payload } = await jwtVerify(token, this.keySource, {
        issuer: normalizedIssuer,
        audience: this.audience,
        algorithms: ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512'],
      });

      const userId = this.extractUserId(payload as Record<string, unknown>);

      return {
        userId,
        sub: String(payload.sub),
        claims: payload as Record<string, unknown>,
      };
    } catch (err: unknown) {
      if (err instanceof AuthenticationError) {
        throw err;
      }

      const error = err as { code?: string; message?: string };
      logger.debug({ errorCode: error.code, message: error.message }, 'JWT verification failed');

      if (error.code === 'ERR_JWT_EXPIRED') {
        throw new AuthenticationError('Access token has expired');
      }
      if (error.code === 'ERR_JWT_CLAIM_VALIDATION_FAILED') {
        throw new AuthenticationError('Access token claim validation failed (issuer or audience)');
      }
      if (error.code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED') {
        throw new AuthenticationError('Invalid access token signature');
      }
      if (error.code === 'ERR_JWS_INVALID') {
        throw new AuthenticationError('Malformed access token');
      }

      throw new AuthenticationError('Invalid or unauthorized access token');
    }
  }
}
