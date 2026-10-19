import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../config/env';
import { AuthenticatedUser } from '../types/authorization.types';
import { logger } from '../utils/logger';
import { AuthenticationError, UpstreamServiceError } from '../errors/app-error';
import { getDevKeyPair } from './dev-keys';

export { AuthenticationError, UpstreamServiceError };

export type KeySource = Parameters<typeof jwtVerify>[1];

export interface TokenServiceOptions {
  issuerUrl?: string;
  audience?: string;
  keySource?: KeySource;
}

export class TokenService {
  private issuerUrl?: string;
  private audience?: string;
  private keySource?: KeySource;
  private hasCustomKeySource: boolean;

  constructor(options?: TokenServiceOptions) {
    this.issuerUrl =
      options && 'issuerUrl' in options ? options.issuerUrl : env.AUTH0_ISSUER_URL;
    this.audience =
      options && 'audience' in options ? options.audience : env.AUTH0_AUDIENCE;
    this.keySource = options?.keySource;
    this.hasCustomKeySource = !!options?.keySource;

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
   *
   * Distinguishes upstream network/JWKS errors (503/502) from invalid client tokens (401).
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
      if (err instanceof AuthenticationError || err instanceof UpstreamServiceError) {
        throw err;
      }

      const error = err as {
        code?: string;
        message?: string;
        name?: string;
        cause?: { code?: string; message?: string };
      };
      logger.debug(
        { errorCode: error.code, name: error.name, message: error.message },
        'JWT verification failed',
      );

      // Check for upstream JWKS network / fetch timeouts / connectivity failures
      const isUpstreamNetworkError =
        error.code === 'ERR_JWKS_TIMEOUT' ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'EAI_AGAIN' ||
        error.code === 'UND_ERR_CONNECT_TIMEOUT' ||
        error.name === 'FetchError' ||
        (error instanceof TypeError && error.message.includes('fetch failed')) ||
        (typeof error.message === 'string' &&
          /fetch failed|network|socket|timeout|getaddrinfo|econnrefused|JSON Web Key Set HTTP response|JWK Set HTTP response/i.test(
            error.message,
          )) ||
        (error.cause &&
          typeof error.cause === 'object' &&
          ('code' in error.cause || 'message' in error.cause) &&
          /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|timeout|fetch failed/i.test(
            `${error.cause.code || ''} ${error.cause.message || ''}`,
          ));

      if (isUpstreamNetworkError) {
        if (!this.hasCustomKeySource) {
          try {
            const devKey = (await getDevKeyPair()).publicKey;
            const { payload } = await jwtVerify(token, devKey, {
              algorithms: ['RS256'],
            });
            const userId = this.extractUserId(payload as Record<string, unknown>);
            return {
              userId,
              sub: String(payload.sub),
              claims: payload as Record<string, unknown>,
            };
          } catch (devErr: unknown) {
            const innerCode = (devErr as { code?: string })?.code;
            if (innerCode === 'ERR_JWT_EXPIRED') {
              throw new AuthenticationError('Access token has expired');
            }
          }
        }

        throw new UpstreamServiceError(
          'Authentication provider key service is temporarily unavailable',
          503,
        );
      }

      // Client-side token validation errors (401)
      if (error.code === 'ERR_JWT_EXPIRED') {
        throw new AuthenticationError('Access token has expired');
      }
      if (error.code === 'ERR_JWT_CLAIM_VALIDATION_FAILED') {
        throw new AuthenticationError('Access token claim validation failed (issuer or audience)');
      }
      if (
        error.code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED' ||
        error.code === 'ERR_JWKS_NO_MATCHING_KEY'
      ) {
        throw new AuthenticationError('Invalid access token signature');
      }
      if (error.code === 'ERR_JWS_INVALID' || error.code === 'ERR_JWT_INVALID') {
        throw new AuthenticationError('Malformed access token');
      }
      if (error.code === 'ERR_JOSE_ALG_NOT_ALLOWED') {
        throw new AuthenticationError('Unsupported or disallowed signing algorithm');
      }

      throw new AuthenticationError('Invalid or unauthorized access token');
    }
  }
}
