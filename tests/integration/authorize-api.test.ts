import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { generateKeyPair, SignJWT } from 'jose';
import { createApp } from '../../src/app';
import { PermissionRepository } from '../../src/repositories/permission.repository';
import { AuthorizationService } from '../../src/services/authorization.service';
import { TokenService, KeySource, UpstreamServiceError } from '../../src/services/token.service';
import { AuthorizeController } from '../../src/controllers/authorize.controller';
import { initDatabaseSchema } from '../../src/config/database';

type KeyType = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

describe('HTTP API Integration Tests (POST /authorize & GET /health)', () => {
  let db: Database.Database;
  let repo: PermissionRepository;
  let authService: AuthorizationService;
  let tokenService: TokenService;
  let app: ReturnType<typeof createApp>;

  let privateKey: KeyType;
  let publicKey: KeyType;

  const issuer = 'https://auth.openfabric.test/';
  const audience = 'https://api.openfabric.test';

  beforeAll(async () => {
    // Generate RSA key pair for integration tests
    const keyPair = await generateKeyPair('RS256');
    privateKey = keyPair.privateKey;
    publicKey = keyPair.publicKey;

    // In-memory SQLite initialized with seed data
    db = new Database(':memory:');
    initDatabaseSchema(db);

    repo = new PermissionRepository(db);
    authService = new AuthorizationService(repo);
    tokenService = new TokenService({
      issuerUrl: issuer,
      audience: audience,
      keySource: publicKey as KeySource,
    });

    const controller = new AuthorizeController(tokenService, authService);
    app = createApp({ authorizeController: controller });
  });

  afterAll(() => {
    db.close();
  });

  const generateToken = async (sub = 'user123', expiresIn = '1h') => {
    return new SignJWT({ sub })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setExpirationTime(expiresIn)
      .sign(privateKey);
  };

  describe('GET /health', () => {
    it('returns 200 with status healthy and does not expose secrets', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(typeof res.body.uptime).toBe('number');
      expect(typeof res.body.timestamp).toBe('string');
      // Ensure no sensitive config keys are exposed
      expect(res.body.DATABASE_PATH).toBeUndefined();
      expect(res.body.AUTH0_ISSUER_URL).toBeUndefined();
    });
  });

  describe('CORS and Preflight Handling', () => {
    it('returns 204 for OPTIONS preflight request from allowed origin', async () => {
      const res = await request(app)
        .options('/authorize')
        .set('Origin', 'http://localhost:5174');

      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5174');
      expect(res.headers['access-control-allow-methods']).toContain('POST');
    });

    it('sets CORS headers for GET /health from allowed origin', async () => {
      const res = await request(app)
        .get('/health')
        .set('Origin', 'http://localhost:5174');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5174');
    });
  });

  describe('Verbatim Assignment Scenarios (POST /authorize)', () => {
    // Scenario 1: user123 GET /transactions -> ALLOW
    it('Scenario 1: user123 GET /transactions -> ALLOW', async () => {
      const token = await generateToken('user123');

      const res = await request(app).post('/authorize').send({
        access_token: token,
        method: 'GET',
        path: '/transactions',
      });

      expect(res.status).toBe(200);
      expect(res.body.decision).toBe('ALLOW');
      expect(res.body.user_id).toBe('user123');
      expect(res.body.matched_permissions).toEqual([
        { action: 'read', resource: 'transactions', effect: 'allow' },
      ]);
    });

    // Scenario 2: user123 DELETE /transactions/txn-456 -> DENY
    it('Scenario 2: user123 DELETE /transactions/txn-456 -> DENY (explicit delete deny on transactions)', async () => {
      const token = await generateToken('user123');

      const res = await request(app).post('/authorize').send({
        access_token: token,
        method: 'DELETE',
        path: '/transactions/txn-456',
      });

      expect(res.status).toBe(200);
      expect(res.body.decision).toBe('DENY');
      expect(res.body.user_id).toBe('user123');
      expect(res.body.reason).toContain('Explicit deny permission takes precedence');
      expect(res.body.matched_permissions).toEqual([
        { action: 'delete', resource: 'transactions', effect: 'deny' },
      ]);
    });

    // Inherited read: user123 GET /transactions/txn-123 -> ALLOW
    it('user123 GET /transactions/txn-123 -> ALLOW (applicable read permission on transactions)', async () => {
      const token = await generateToken('user123');

      const res = await request(app).post('/authorize').send({
        access_token: token,
        method: 'GET',
        path: '/transactions/txn-123',
      });

      expect(res.status).toBe(200);
      expect(res.body.decision).toBe('ALLOW');
      expect(res.body.user_id).toBe('user123');
      expect(res.body.matched_permissions).toEqual([
        { action: 'read', resource: 'transactions', effect: 'allow' },
      ]);
    });

    // Scenario 3: user456 GET /wallets/wallet-789/transactions -> ALLOW
    it('Scenario 3: user456 GET /wallets/wallet-789/transactions -> ALLOW', async () => {
      const token = await generateToken('user456');

      const res = await request(app).post('/authorize').send({
        access_token: token,
        method: 'GET',
        path: '/wallets/wallet-789/transactions',
      });

      expect(res.status).toBe(200);
      expect(res.body.decision).toBe('ALLOW');
      expect(res.body.user_id).toBe('user456');
      expect(res.body.reason).toContain('wallets/wallet-789/transactions');
      expect(res.body.matched_permissions).toEqual([
        {
          action: 'read',
          resource: 'wallets/wallet-789/transactions',
          effect: 'allow',
        },
      ]);
    });

    // Scenario 4a: user789 POST /wallets/wallet-456/transactions/txn-999 -> ALLOW
    it('Scenario 4a: user789 POST /wallets/wallet-456/transactions/txn-999 -> ALLOW', async () => {
      const token = await generateToken('user789');

      const res = await request(app).post('/authorize').send({
        access_token: token,
        method: 'POST',
        path: '/wallets/wallet-456/transactions/txn-999',
      });

      expect(res.status).toBe(200);
      expect(res.body.decision).toBe('ALLOW');
      expect(res.body.user_id).toBe('user789');
      expect(res.body.matched_permissions).toEqual([
        {
          action: 'write',
          resource: 'wallets/*/transactions/*',
          effect: 'allow',
        },
      ]);
    });

    // Scenario 4b: user789 POST /wallets/wallet-789/transactions -> ALLOW
    it('Scenario 4b: user789 POST /wallets/wallet-789/transactions -> ALLOW (wildcard collection write)', async () => {
      const token = await generateToken('user789');

      const res = await request(app).post('/authorize').send({
        access_token: token,
        method: 'POST',
        path: '/wallets/wallet-789/transactions',
      });

      expect(res.status).toBe(200);
      expect(res.body.decision).toBe('ALLOW');
      expect(res.body.user_id).toBe('user789');
      expect(res.body.matched_permissions).toEqual([
        {
          action: 'write',
          resource: 'wallets/*/transactions/*',
          effect: 'allow',
        },
      ]);
    });

    // Scenario 5: user456 POST /wallets/wallet-789/transactions -> DENY
    it('Scenario 5: user456 POST /wallets/wallet-789/transactions -> DENY (user456 only has read access to transactions)', async () => {
      const token = await generateToken('user456');

      const res = await request(app).post('/authorize').send({
        access_token: token,
        method: 'POST',
        path: '/wallets/wallet-789/transactions',
      });

      expect(res.status).toBe(200);
      expect(res.body.decision).toBe('DENY');
      expect(res.body.user_id).toBe('user456');
      expect(res.body.matched_permissions).toEqual([]);
    });

    // Scenario 6: admin789 DELETE /accounts/acc-123/settings -> ALLOW
    it('Scenario 6: admin789 DELETE /accounts/acc-123/settings -> ALLOW (global wildcard *)', async () => {
      const token = await generateToken('admin789');

      const res = await request(app).post('/authorize').send({
        access_token: token,
        method: 'DELETE',
        path: '/accounts/acc-123/settings',
      });

      expect(res.status).toBe(200);
      expect(res.body.decision).toBe('ALLOW');
      expect(res.body.user_id).toBe('admin789');
      expect(res.body.matched_permissions).toEqual([
        {
          action: 'delete',
          resource: '*',
          effect: 'allow',
        },
      ]);
    });

    // Scenario 7: user456 GET /wallets/wallet-999 -> ALLOW
    it('Scenario 7: user456 GET /wallets/wallet-999 -> ALLOW (segment wildcard wallets/*)', async () => {
      const token = await generateToken('user456');

      const res = await request(app).post('/authorize').send({
        access_token: token,
        method: 'GET',
        path: '/wallets/wallet-999',
      });

      expect(res.status).toBe(200);
      expect(res.body.decision).toBe('ALLOW');
      expect(res.body.user_id).toBe('user456');
      expect(res.body.matched_permissions).toEqual([
        {
          action: 'read',
          resource: 'wallets/*',
          effect: 'allow',
        },
      ]);
    });

    it('handles Auth0 formatted subject prefix (auth0|user123)', async () => {
      const token = await generateToken('auth0|user123');

      const res = await request(app).post('/authorize').send({
        access_token: token,
        method: 'GET',
        path: '/transactions',
      });

      expect(res.status).toBe(200);
      expect(res.body.decision).toBe('ALLOW');
      expect(res.body.user_id).toBe('user123');
    });

    it('returns 200 with DENY decision when no permission exists for requested resource', async () => {
      const token = await generateToken('user123');

      const res = await request(app).post('/authorize').send({
        access_token: token,
        method: 'GET',
        path: '/unauthorized/path',
      });

      expect(res.status).toBe(200);
      expect(res.body.decision).toBe('DENY');
      expect(res.body.user_id).toBe('user123');
      expect(res.body.matched_permissions).toEqual([]);
    });
  });

  describe('POST /authorize - Authentication Failures (401)', () => {
    it('returns 401 when token is expired', async () => {
      const expiredToken = await generateToken('user123', '-5s');

      const res = await request(app).post('/authorize').send({
        access_token: expiredToken,
        method: 'GET',
        path: '/transactions',
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
      expect(res.body.message).toContain('expired');
    });

    it('returns 401 when token signature is invalid', async () => {
      const invalidToken =
        'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMTIzIn0.invalid-signature';

      const res = await request(app).post('/authorize').send({
        access_token: invalidToken,
        method: 'GET',
        path: '/transactions',
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });
  });

  describe('POST /authorize - Upstream JWKS Errors (503)', () => {
    it('returns 503 Service Unavailable when trusted JWKS service is unreachable', async () => {
      const upstreamFailingTokenService = {
        verifyToken: async () => {
          throw new UpstreamServiceError(
            'Authentication provider key service is temporarily unavailable',
            503,
          );
        },
      } as unknown as TokenService;

      const upstreamFailingController = new AuthorizeController(
        upstreamFailingTokenService,
        authService,
      );
      const upstreamApp = createApp({ authorizeController: upstreamFailingController });

      const res = await request(upstreamApp).post('/authorize').send({
        access_token: 'some.valid.token',
        method: 'GET',
        path: '/transactions',
      });

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Service Unavailable');
      expect(res.body.message).toBe(
        'Authentication provider key service is temporarily unavailable',
      );
      expect(res.body.statusCode).toBe(503);
    });
  });

  describe('POST /authorize - Request Body Validation Errors (400)', () => {
    it('returns 400 when required fields are missing', async () => {
      const res = await request(app).post('/authorize').send({
        method: 'GET',
        path: '/transactions',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Bad Request');
      expect(res.body.details).toBeDefined();
    });

    it('returns 400 when HTTP method is unsupported', async () => {
      const token = await generateToken('user123');

      const res = await request(app).post('/authorize').send({
        access_token: token,
        method: 'HEAD',
        path: '/transactions',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Bad Request');
    });

    it('returns 400 when path is empty or contains traversal', async () => {
      const token = await generateToken('user123');

      const res = await request(app).post('/authorize').send({
        access_token: token,
        method: 'GET',
        path: '/wallets/../secret',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Bad Request');
      expect(res.body.message).toContain('Directory traversal');
    });

    it('returns 400 when unexpected extra fields are provided', async () => {
      const token = await generateToken('user123');

      const res = await request(app).post('/authorize').send({
        access_token: token,
        method: 'GET',
        path: '/transactions',
        unexpected_extra_field: true,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Bad Request');
    });

    it('returns 400 when JSON syntax is malformed', async () => {
      const res = await request(app)
        .post('/authorize')
        .set('Content-Type', 'application/json')
        .send('{"access_token": "broken-json');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Bad Request');
    });
  });

  describe('Route Not Found (404)', () => {
    it('returns 404 for unknown route', async () => {
      const res = await request(app).get('/unknown-api-route');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Not Found');
    });
  });

  describe('Internal Server Error (500)', () => {
    it('returns 500 when an unexpected internal error occurs without exposing stack trace', async () => {
      // Mock authorization service to throw an unexpected error
      const buggyAuthService = {
        authorize: async () => {
          throw new Error('Database connection crashed unexpectedly');
        },
      } as unknown as AuthorizationService;

      const buggyController = new AuthorizeController(tokenService, buggyAuthService);
      const brokenApp = createApp({ authorizeController: buggyController });

      const token = await generateToken('user123');

      const res = await request(brokenApp).post('/authorize').send({
        access_token: token,
        method: 'GET',
        path: '/transactions',
      });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal Server Error');
      expect(res.body.message).toBe('An unexpected internal error occurred');
      // Ensure stack trace and error internals are NOT leaked
      expect(res.body.stack).toBeUndefined();
      expect(res.body.details).toBeUndefined();
    });
  });
});
