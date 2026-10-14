import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { PermissionRepository } from '../../src/repositories/permission.repository';
import { AuthorizationService } from '../../src/services/authorization.service';
import { initDatabaseSchema } from '../../src/config/database';

describe('AuthorizationService Unit Tests', () => {
  let db: Database.Database;
  let repo: PermissionRepository;
  let service: AuthorizationService;

  beforeEach(() => {
    // Create an isolated in-memory SQLite database for each test
    db = new Database(':memory:');
    initDatabaseSchema(db);
    repo = new PermissionRepository(db);
    service = new AuthorizationService(repo);
  });

  afterEach(() => {
    db.close();
  });

  describe('Assignment Sample Scenarios Verification', () => {
    // Scenario 1: user123 GET /transactions -> ALLOW
    it('Scenario 1: user123 GET /transactions -> ALLOW', async () => {
      const res = await service.authorize('user123', 'GET', '/transactions');
      expect(res.decision).toBe('ALLOW');
      expect(res.user_id).toBe('user123');
      expect(res.reason).toContain('transactions');
      expect(res.matched_permissions).toEqual([
        { action: 'read', resource: 'transactions', effect: 'allow' },
      ]);
    });

    // Scenario 2: user123 DELETE /transactions/txn-456 -> DENY
    it('Scenario 2: user123 DELETE /transactions/txn-456 -> DENY (explicit deny permission inherits)', async () => {
      const res = await service.authorize('user123', 'DELETE', '/transactions/txn-456');
      expect(res.decision).toBe('DENY');
      expect(res.user_id).toBe('user123');
      expect(res.reason).toContain('Explicit deny permission takes precedence');
      expect(res.matched_permissions).toEqual([
        { action: 'delete', resource: 'transactions', effect: 'deny' },
      ]);
    });

    // Parent inheritance read: user123 GET /transactions/txn-123 -> ALLOW
    it('user123 GET /transactions/txn-123 -> ALLOW (inherits read from transactions collection)', async () => {
      const res = await service.authorize('user123', 'GET', '/transactions/txn-123');
      expect(res.decision).toBe('ALLOW');
      expect(res.user_id).toBe('user123');
      expect(res.matched_permissions).toEqual([
        { action: 'read', resource: 'transactions', effect: 'allow' },
      ]);
    });

    // Parent inheritance read: user123 GET /accounts/acc-456 -> ALLOW
    it('user123 GET /accounts/acc-456 -> ALLOW (inherits read from accounts collection)', async () => {
      const res = await service.authorize('user123', 'GET', '/accounts/acc-456');
      expect(res.decision).toBe('ALLOW');
      expect(res.user_id).toBe('user123');
      expect(res.matched_permissions).toEqual([
        { action: 'read', resource: 'accounts', effect: 'allow' },
      ]);
    });

    // Scenario 3: user456 GET /wallets/wallet-789/transactions -> ALLOW
    it('Scenario 3: user456 GET /wallets/wallet-789/transactions -> ALLOW', async () => {
      const res = await service.authorize('user456', 'GET', '/wallets/wallet-789/transactions');
      expect(res.decision).toBe('ALLOW');
      expect(res.user_id).toBe('user456');
      expect(res.matched_permissions).toEqual([
        { action: 'read', resource: 'wallets/wallet-789/transactions', effect: 'allow' },
      ]);
    });

    // Scenario 4a: user789 POST /wallets/wallet-456/transactions/txn-999 -> ALLOW
    it('Scenario 4a: user789 POST /wallets/wallet-456/transactions/txn-999 -> ALLOW', async () => {
      const res = await service.authorize(
        'user789',
        'POST',
        '/wallets/wallet-456/transactions/txn-999',
      );
      expect(res.decision).toBe('ALLOW');
      expect(res.user_id).toBe('user789');
      expect(res.matched_permissions).toEqual([
        { action: 'write', resource: 'wallets/*/transactions/*', effect: 'allow' },
      ]);
    });

    // Scenario 4b: user789 POST /wallets/wallet-789/transactions -> ALLOW
    it('Scenario 4b: user789 POST /wallets/wallet-789/transactions -> ALLOW (collection-write wildcard)', async () => {
      const res = await service.authorize(
        'user789',
        'POST',
        '/wallets/wallet-789/transactions',
      );
      expect(res.decision).toBe('ALLOW');
      expect(res.user_id).toBe('user789');
      expect(res.matched_permissions).toEqual([
        { action: 'write', resource: 'wallets/*/transactions/*', effect: 'allow' },
      ]);
    });

    // Scenario 5: user456 POST /wallets/wallet-789/transactions -> DENY
    it('Scenario 5: user456 POST /wallets/wallet-789/transactions -> DENY (no write permission on transactions)', async () => {
      const res = await service.authorize(
        'user456',
        'POST',
        '/wallets/wallet-789/transactions',
      );
      expect(res.decision).toBe('DENY');
      expect(res.user_id).toBe('user456');
      expect(res.matched_permissions).toEqual([]);
    });

    // Scenario 6: admin789 DELETE /accounts/acc-123/settings -> ALLOW
    it('Scenario 6: admin789 DELETE /accounts/acc-123/settings -> ALLOW (global wildcard *)', async () => {
      const res = await service.authorize(
        'admin789',
        'DELETE',
        '/accounts/acc-123/settings',
      );
      expect(res.decision).toBe('ALLOW');
      expect(res.user_id).toBe('admin789');
      expect(res.matched_permissions).toEqual([
        { action: 'delete', resource: '*', effect: 'allow' },
      ]);
    });

    // Scenario 7: user456 GET /wallets/wallet-999 -> ALLOW
    it('Scenario 7: user456 GET /wallets/wallet-999 -> ALLOW (segment wildcard wallets/*)', async () => {
      const res = await service.authorize('user456', 'GET', '/wallets/wallet-999');
      expect(res.decision).toBe('ALLOW');
      expect(res.user_id).toBe('user456');
      expect(res.matched_permissions).toEqual([
        { action: 'read', resource: 'wallets/*', effect: 'allow' },
      ]);
    });

    it('grants exact ALLOW: user123 write transactions', async () => {
      const res = await service.authorize('user123', 'POST', '/transactions');
      expect(res.decision).toBe('ALLOW');
      expect(res.matched_permissions).toEqual([
        { action: 'write', resource: 'transactions', effect: 'allow' },
      ]);
    });

    it('enforces exact DENY: user123 delete transactions', async () => {
      const res = await service.authorize('user123', 'DELETE', '/transactions');
      expect(res.decision).toBe('DENY');
      expect(res.user_id).toBe('user123');
      expect(res.matched_permissions).toEqual([
        { action: 'delete', resource: 'transactions', effect: 'deny' },
      ]);
    });
  });

  describe('Precedence & Conflict Resolution', () => {
    it('prioritizes specific child DENY over parent collection ALLOW', async () => {
      // Parent collection ALLOW on 'transactions', specific DENY on 'transactions/txn-locked'
      repo.insertPermission({
        user_id: 'userCustom',
        action: 'read',
        resource: 'transactions',
        effect: 'allow',
      });
      repo.insertPermission({
        user_id: 'userCustom',
        action: 'read',
        resource: 'transactions/txn-locked',
        effect: 'deny',
      });

      const res = await service.authorize('userCustom', 'GET', '/transactions/txn-locked');
      expect(res.decision).toBe('DENY');
      expect(res.matched_permissions).toEqual([
        { action: 'read', resource: 'transactions/txn-locked', effect: 'deny' },
      ]);
    });

    it('prioritizes specific child ALLOW over parent collection DENY', async () => {
      // Parent collection DENY on 'transactions', specific ALLOW on 'transactions/txn-public'
      repo.insertPermission({
        user_id: 'userCustom2',
        action: 'read',
        resource: 'transactions',
        effect: 'deny',
      });
      repo.insertPermission({
        user_id: 'userCustom2',
        action: 'read',
        resource: 'transactions/txn-public',
        effect: 'allow',
      });

      const res = await service.authorize('userCustom2', 'GET', '/transactions/txn-public');
      expect(res.decision).toBe('ALLOW');
      expect(res.matched_permissions).toEqual([
        { action: 'read', resource: 'transactions/txn-public', effect: 'allow' },
      ]);
    });

    it('prioritizes more specific DENY over general global ALLOW', async () => {
      repo.insertPermission({
        user_id: 'testUser',
        action: 'read',
        resource: '*',
        effect: 'allow',
      });
      repo.insertPermission({
        user_id: 'testUser',
        action: 'read',
        resource: 'wallets/secret',
        effect: 'deny',
      });

      const res = await service.authorize('testUser', 'GET', '/wallets/secret');
      expect(res.decision).toBe('DENY');
      expect(res.matched_permissions).toEqual([
        { action: 'read', resource: 'wallets/secret', effect: 'deny' },
      ]);
    });

    it('prioritizes more specific ALLOW over general global DENY', async () => {
      repo.insertPermission({
        user_id: 'testUser2',
        action: 'read',
        resource: '*',
        effect: 'deny',
      });
      repo.insertPermission({
        user_id: 'testUser2',
        action: 'read',
        resource: 'wallets/public',
        effect: 'allow',
      });

      const res = await service.authorize('testUser2', 'GET', '/wallets/public');
      expect(res.decision).toBe('ALLOW');
      expect(res.matched_permissions).toEqual([
        { action: 'read', resource: 'wallets/public', effect: 'allow' },
      ]);
    });

    it('resolves conflicting ALLOW and DENY at the same specificity in favor of DENY', async () => {
      repo.insertPermission({
        user_id: 'conflictUser',
        action: 'read',
        resource: 'wallets/conflicted',
        effect: 'allow',
      });
      repo.insertPermission({
        user_id: 'conflictUser',
        action: 'read',
        resource: 'wallets/conflicted',
        effect: 'deny',
      });

      const res = await service.authorize('conflictUser', 'GET', '/wallets/conflicted');
      expect(res.decision).toBe('DENY');
      expect(res.reason).toContain('Explicit deny permission takes precedence');
      expect(res.matched_permissions).toEqual([
        { action: 'read', resource: 'wallets/conflicted', effect: 'deny' },
      ]);
    });

    it('defaults to DENY when no matching permissions exist', async () => {
      const res = await service.authorize('user123', 'GET', '/nonexistent/resource');
      expect(res.decision).toBe('DENY');
      expect(res.user_id).toBe('user123');
      expect(res.reason).toContain('No matching permissions found');
      expect(res.matched_permissions).toEqual([]);
    });

    it('defaults to DENY when user has no permissions for the requested action', async () => {
      const res = await service.authorize('user123', 'DELETE', '/accounts/acc-123');
      expect(res.decision).toBe('DENY');
      expect(res.matched_permissions).toEqual([]);
    });
  });
});
