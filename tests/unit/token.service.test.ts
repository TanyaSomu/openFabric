import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, SignJWT } from 'jose';
import {
  AuthenticationError,
  UpstreamServiceError,
  TokenService,
  KeySource,
} from '../../src/services/token.service';

type KeyType = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

describe('TokenService Unit Tests', () => {
  let privateKey: KeyType;
  let publicKey: KeyType;
  let wrongPrivateKey: KeyType;

  const validIssuer = 'https://auth.example.com/';
  const validAudience = 'https://api.example.com';

  beforeAll(async () => {
    // Generate asymmetric RS256 key pairs for testing
    const keyPair = await generateKeyPair('RS256');
    privateKey = keyPair.privateKey;
    publicKey = keyPair.publicKey;

    const wrongKeyPair = await generateKeyPair('RS256');
    wrongPrivateKey = wrongKeyPair.privateKey;
  });

  const createToken = async (options: {
    sub?: string;
    customClaims?: Record<string, unknown>;
    issuer?: string;
    audience?: string;
    expiresIn?: string;
    key?: KeyType;
  }) => {
    let builder = new SignJWT({
      ...(options.customClaims || {}),
      sub: options.sub ?? 'user123',
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt();

    if (options.issuer !== undefined) {
      builder = builder.setIssuer(options.issuer);
    } else {
      builder = builder.setIssuer(validIssuer);
    }

    if (options.audience !== undefined) {
      builder = builder.setAudience(options.audience);
    } else {
      builder = builder.setAudience(validAudience);
    }

    if (options.expiresIn) {
      builder = builder.setExpirationTime(options.expiresIn);
    } else {
      builder = builder.setExpirationTime('1h');
    }

    return builder.sign(options.key || privateKey);
  };

  it('validates a correct token and extracts user identity', async () => {
    const tokenService = new TokenService({
      issuerUrl: validIssuer,
      audience: validAudience,
      keySource: publicKey as KeySource,
    });

    const token = await createToken({ sub: 'user123' });
    const user = await tokenService.verifyToken(token);

    expect(user.userId).toBe('user123');
    expect(user.sub).toBe('user123');
  });

  it('extracts user identity from Auth0 prefixed subject (auth0|user456)', async () => {
    const tokenService = new TokenService({
      issuerUrl: validIssuer,
      audience: validAudience,
      keySource: publicKey as KeySource,
    });

    const token = await createToken({ sub: 'auth0|user456' });
    const user = await tokenService.verifyToken(token);

    expect(user.userId).toBe('user456');
  });

  it('prioritizes custom user_id claim when present', async () => {
    const tokenService = new TokenService({
      issuerUrl: validIssuer,
      audience: validAudience,
      keySource: publicKey as KeySource,
    });

    const token = await createToken({
      sub: 'auth0|different-id',
      customClaims: { 'https://openfabric.com/user_id': 'admin789' },
    });
    const user = await tokenService.verifyToken(token);

    expect(user.userId).toBe('admin789');
  });

  it('rejects an expired token with 401 AuthenticationError', async () => {
    const tokenService = new TokenService({
      issuerUrl: validIssuer,
      audience: validAudience,
      keySource: publicKey as KeySource,
    });

    const token = await createToken({ expiresIn: '-10s' });

    try {
      await tokenService.verifyToken(token);
      expect.fail('Expected token verification to fail');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthenticationError);
      expect((err as AuthenticationError).statusCode).toBe(401);
      expect((err as AuthenticationError).message).toMatch(/expired/);
    }
  });

  it('rejects token signed with an invalid signature with 401', async () => {
    const tokenService = new TokenService({
      issuerUrl: validIssuer,
      audience: validAudience,
      keySource: publicKey as KeySource,
    });

    const token = await createToken({ key: wrongPrivateKey });

    try {
      await tokenService.verifyToken(token);
      expect.fail('Expected token verification to fail');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthenticationError);
      expect((err as AuthenticationError).statusCode).toBe(401);
      expect((err as AuthenticationError).message).toMatch(/signature/);
    }
  });

  it('rejects token with wrong issuer with 401', async () => {
    const tokenService = new TokenService({
      issuerUrl: validIssuer,
      audience: validAudience,
      keySource: publicKey as KeySource,
    });

    const token = await createToken({ issuer: 'https://malicious-issuer.com/' });

    try {
      await tokenService.verifyToken(token);
      expect.fail('Expected token verification to fail');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthenticationError);
      expect((err as AuthenticationError).statusCode).toBe(401);
      expect((err as AuthenticationError).message).toMatch(/claim validation/);
    }
  });

  it('rejects token with wrong audience with 401', async () => {
    const tokenService = new TokenService({
      issuerUrl: validIssuer,
      audience: validAudience,
      keySource: publicKey as KeySource,
    });

    const token = await createToken({ audience: 'https://wrong-audience.com' });

    try {
      await tokenService.verifyToken(token);
      expect.fail('Expected token verification to fail');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthenticationError);
      expect((err as AuthenticationError).statusCode).toBe(401);
      expect((err as AuthenticationError).message).toMatch(/claim validation/);
    }
  });

  it('rejects token missing sub claim with 401', async () => {
    const tokenService = new TokenService({
      issuerUrl: validIssuer,
      audience: validAudience,
      keySource: publicKey as KeySource,
    });

    const token = new SignJWT({})
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(validIssuer)
      .setAudience(validAudience)
      .setExpirationTime('1h')
      .sign(privateKey);

    try {
      await tokenService.verifyToken(await token);
      expect.fail('Expected token verification to fail');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthenticationError);
      expect((err as AuthenticationError).statusCode).toBe(401);
      expect((err as AuthenticationError).message).toMatch(/missing required identity claim/);
    }
  });

  it('rejects malformed token string with 401', async () => {
    const tokenService = new TokenService({
      issuerUrl: validIssuer,
      audience: validAudience,
      keySource: publicKey as KeySource,
    });

    await expect(tokenService.verifyToken('not.a.valid.jwt.string')).rejects.toThrow(
      AuthenticationError,
    );
    await expect(tokenService.verifyToken('')).rejects.toThrow(/missing or empty/);
  });

  it('rejects unsupported or disallowed signing algorithm (e.g. HS256) with 401', async () => {
    const tokenService = new TokenService({
      issuerUrl: validIssuer,
      audience: validAudience,
      keySource: publicKey as KeySource,
    });

    const secret = new TextEncoder().encode('some-symmetric-secret-key-32bytes!');
    const hs256Token = await new SignJWT({ sub: 'user123' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(validIssuer)
      .setAudience(validAudience)
      .setExpirationTime('1h')
      .sign(secret);

    try {
      await tokenService.verifyToken(hs256Token);
      expect.fail('Expected token verification to fail for unsupported algorithm');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthenticationError);
      expect((err as AuthenticationError).statusCode).toBe(401);
      expect((err as AuthenticationError).message).toMatch(/disallowed signing algorithm/i);
    }
  });

  it('throws 500 when Auth0 is not configured', async () => {
    const unconfiguredService = new TokenService({
      issuerUrl: undefined,
      audience: undefined,
      keySource: undefined,
    });

    try {
      await unconfiguredService.verifyToken('some.valid.looking.token');
      expect.fail('Expected verifyToken to fail');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthenticationError);
      expect((err as AuthenticationError).statusCode).toBe(500);
      expect((err as AuthenticationError).message).toContain('Auth0 is not configured');
    }
  });

  describe('Upstream JWKS Error Handling', () => {
    it('maps JWKS network timeout to 503 UpstreamServiceError', async () => {
      // Mock a KeySource function that throws a JWKS timeout error
      const mockKeySource: KeySource = async () => {
        const timeoutErr = new Error('JWKS connection timed out') as Error & { code?: string };
        timeoutErr.code = 'ERR_JWKS_TIMEOUT';
        throw timeoutErr;
      };

      const tokenService = new TokenService({
        issuerUrl: validIssuer,
        audience: validAudience,
        keySource: mockKeySource,
      });

      const token = await createToken({ sub: 'user123' });

      try {
        await tokenService.verifyToken(token);
        expect.fail('Expected verifyToken to throw UpstreamServiceError');
      } catch (err) {
        expect(err).toBeInstanceOf(UpstreamServiceError);
        expect((err as UpstreamServiceError).statusCode).toBe(503);
        expect((err as UpstreamServiceError).message).toContain(
          'Authentication provider key service is temporarily unavailable',
        );
      }
    });

    it('maps non-200 JWKS HTTP response (server unavailable) to 503 UpstreamServiceError', async () => {
      const mockKeySource: KeySource = async () => {
        const jwksErr = new Error('Expected 200 OK from the JSON Web Key Set HTTP response');
        throw jwksErr;
      };

      const tokenService = new TokenService({
        issuerUrl: validIssuer,
        audience: validAudience,
        keySource: mockKeySource,
      });

      const token = await createToken({ sub: 'user123' });

      try {
        await tokenService.verifyToken(token);
        expect.fail('Expected verifyToken to throw UpstreamServiceError');
      } catch (err) {
        expect(err).toBeInstanceOf(UpstreamServiceError);
        expect((err as UpstreamServiceError).statusCode).toBe(503);
        expect((err as UpstreamServiceError).message).toContain(
          'Authentication provider key service is temporarily unavailable',
        );
      }
    });

    it('maps network connection failure (ECONNREFUSED) to 503 UpstreamServiceError', async () => {
      const mockKeySource: KeySource = async () => {
        const netErr = new Error('connect ECONNREFUSED 127.0.0.1:443') as Error & {
          code?: string;
        };
        netErr.code = 'ECONNREFUSED';
        throw netErr;
      };

      const tokenService = new TokenService({
        issuerUrl: validIssuer,
        audience: validAudience,
        keySource: mockKeySource,
      });

      const token = await createToken({ sub: 'user123' });

      try {
        await tokenService.verifyToken(token);
        expect.fail('Expected verifyToken to throw UpstreamServiceError');
      } catch (err) {
        expect(err).toBeInstanceOf(UpstreamServiceError);
        expect((err as UpstreamServiceError).statusCode).toBe(503);
      }
    });

    it('maps fetch failure to 503 UpstreamServiceError', async () => {
      const mockKeySource: KeySource = async () => {
        const fetchErr = new TypeError('fetch failed');
        (fetchErr as unknown as { cause: Error }).cause = new Error('getaddrinfo ENOTFOUND auth0.com');
        throw fetchErr;
      };

      const tokenService = new TokenService({
        issuerUrl: validIssuer,
        audience: validAudience,
        keySource: mockKeySource,
      });

      const token = await createToken({ sub: 'user123' });

      try {
        await tokenService.verifyToken(token);
        expect.fail('Expected verifyToken to throw UpstreamServiceError');
      } catch (err) {
        expect(err).toBeInstanceOf(UpstreamServiceError);
        expect((err as UpstreamServiceError).statusCode).toBe(503);
      }
    });

    it('maps no matching JWKS key to 401 AuthenticationError (client token error, not upstream error)', async () => {
      const mockKeySource: KeySource = async () => {
        const noKeyErr = new Error('No matching key found in JWKS') as Error & { code?: string };
        noKeyErr.code = 'ERR_JWKS_NO_MATCHING_KEY';
        throw noKeyErr;
      };

      const tokenService = new TokenService({
        issuerUrl: validIssuer,
        audience: validAudience,
        keySource: mockKeySource,
      });

      const token = await createToken({ sub: 'user123' });

      try {
        await tokenService.verifyToken(token);
        expect.fail('Expected verifyToken to throw 401 AuthenticationError');
      } catch (err) {
        expect(err).toBeInstanceOf(AuthenticationError);
        expect((err as AuthenticationError).statusCode).toBe(401);
        expect((err as AuthenticationError).message).toContain('Invalid access token signature');
      }
    });
  });
});
