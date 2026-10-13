import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, SignJWT } from 'jose';
import { AuthenticationError, TokenService, KeySource } from '../../src/services/token.service';

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

  it('rejects an expired token', async () => {
    const tokenService = new TokenService({
      issuerUrl: validIssuer,
      audience: validAudience,
      keySource: publicKey as KeySource,
    });

    // Token expired in the past
    const token = await createToken({ expiresIn: '-10s' });

    await expect(tokenService.verifyToken(token)).rejects.toThrow(AuthenticationError);
    await expect(tokenService.verifyToken(token)).rejects.toThrow(/expired/);
  });

  it('rejects token signed with an invalid signature', async () => {
    const tokenService = new TokenService({
      issuerUrl: validIssuer,
      audience: validAudience,
      keySource: publicKey as KeySource,
    });

    const token = await createToken({ key: wrongPrivateKey });

    await expect(tokenService.verifyToken(token)).rejects.toThrow(AuthenticationError);
    await expect(tokenService.verifyToken(token)).rejects.toThrow(/signature/);
  });

  it('rejects token with wrong issuer', async () => {
    const tokenService = new TokenService({
      issuerUrl: validIssuer,
      audience: validAudience,
      keySource: publicKey as KeySource,
    });

    const token = await createToken({ issuer: 'https://malicious-issuer.com/' });

    await expect(tokenService.verifyToken(token)).rejects.toThrow(AuthenticationError);
    await expect(tokenService.verifyToken(token)).rejects.toThrow(/claim validation/);
  });

  it('rejects token with wrong audience', async () => {
    const tokenService = new TokenService({
      issuerUrl: validIssuer,
      audience: validAudience,
      keySource: publicKey as KeySource,
    });

    const token = await createToken({ audience: 'https://wrong-audience.com' });

    await expect(tokenService.verifyToken(token)).rejects.toThrow(AuthenticationError);
    await expect(tokenService.verifyToken(token)).rejects.toThrow(/claim validation/);
  });

  it('rejects token missing sub claim', async () => {
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

    await expect(tokenService.verifyToken(await token)).rejects.toThrow(
      /missing required identity claim/,
    );
  });

  it('rejects malformed token string', async () => {
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
});
