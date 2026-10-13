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

  describe('Sample Permissions Verification', () => {
    it('grants exact ALLOW: user123 read transactions', async () => {
      const res = await service.authorize('user123', 'GET', '/transactions');
      expect(res.decision).toBe('ALLOW');
      expect(res.user_id).toBe('user123');
      expect(res.matched_permissions).toEqual([
        { action: 'read', resource: 'transactions', effect: 'allow' },
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

    it('grants segment wildcard: user456 read wallets/wallet-123', async () => {
      const res = await service.authorize('user456', 'GET', '/wallets/wallet-123');
      expect(res.decision).toBe('ALLOW');
      expect(res.matched_permissions).toEqual([
        { action: 'read', resource: 'wallets/*', effect: 'allow' },
      ]);
    });

    it('grants exact nested resource: user456 read wallets/wallet-789/transactions', async () => {
      const res = await service.authorize('user456', 'GET', '/wallets/wallet-789/transactions');
      expect(res.decision).toBe('ALLOW');
      expect(res.matched_permissions).toEqual([
        { action: 'read', resource: 'wallets/wallet-789/transactions', effect: 'allow' },
      ]);
    });

    it('grants multi-segment wildcard: user789 write wallets/w-1/transactions/tx-2', async () => {
      const res = await service.authorize(
        'user789',
        'POST',
        '/wallets/wallet-abc/transactions/tx-xyz',
      );
      expect(res.decision).toBe('ALLOW');
      expect(res.matched_permissions).toEqual([
        { action: 'write', resource: 'wallets/*/transactions/*', effect: 'allow' },
      ]);
    });

    it('grants global wildcard *: admin789 can read, write, delete anything', async () => {
      const readRes = await service.authorize('admin789', 'GET', '/any/random/path');
      expect(readRes.decision).toBe('ALLOW');

      const writeRes = await service.authorize('admin789', 'PUT', '/wallets/123/settings');
      expect(writeRes.decision).toBe('ALLOW');

      const deleteRes = await service.authorize('admin789', 'DELETE', '/users/999');
      expect(deleteRes.decision).toBe('ALLOW');
    });
  });

  describe('Precedence & Conflict Resolution', () => {
    it('prioritizes more specific DENY over general ALLOW', async () => {
      // General ALLOW on '*' and specific DENY on 'wallets/secret'
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

    it('prioritizes more specific ALLOW over general DENY', async () => {
      // General DENY on 'wallets/*' and specific ALLOW on 'wallets/wallet-vip'
      repo.insertPermission({
        user_id: 'testUser2',
        action: 'read',
        resource: 'wallets/*',
        effect: 'deny',
      });
      repo.insertPermission({
        user_id: 'testUser2',
        action: 'read',
        resource: 'wallets/wallet-vip',
        effect: 'allow',
      });

      const res = await service.authorize('testUser2', 'GET', '/wallets/wallet-vip');
      expect(res.decision).toBe('ALLOW');
      expect(res.matched_permissions).toEqual([
        { action: 'read', resource: 'wallets/wallet-vip', effect: 'allow' },
      ]);
    });

    it('resolves DENY when both ALLOW and DENY exist at the same specificity level', async () => {
      repo.insertPermission({
        user_id: 'conflictUser',
        action: 'read',
        resource: 'wallets/wallet-1',
        effect: 'allow',
      });
      repo.insertPermission({
        user_id: 'conflictUser',
        action: 'read',
        resource: 'wallets/wallet-1',
        effect: 'deny',
      });

      const res = await service.authorize('conflictUser', 'GET', '/wallets/wallet-1');
      expect(res.decision).toBe('DENY');
      expect(res.reason).toContain('Explicit deny permission takes precedence');
      expect(res.matched_permissions).toEqual([
        { action: 'read', resource: 'wallets/wallet-1', effect: 'deny' },
      ]);
    });

    it('defaults to DENY when no matching permission exists', async () => {
      const res = await service.authorize('user123', 'GET', '/wallets/wallet-999');
      expect(res.decision).toBe('DENY');
      expect(res.matched_permissions).toEqual([]);
      expect(res.reason).toContain('No matching permissions found');
    });

    it('denies access when user does not exist in database', async () => {
      const res = await service.authorize('unknown_user', 'GET', '/transactions');
      expect(res.decision).toBe('DENY');
      expect(res.matched_permissions).toHaveLength(0);
    });

    it('denies access when permission belongs to another user', async () => {
      // user123 has read on transactions; user789 does not
      const res = await service.authorize('user789', 'GET', '/transactions');
      expect(res.decision).toBe('DENY');
      expect(res.matched_permissions).toHaveLength(0);
    });

    it('denies access when user has permission for different action', async () => {
      // user123 has read/write on transactions, but NOT delete (delete is deny) and accounts only read
      const res = await service.authorize('user123', 'POST', '/accounts');
      expect(res.decision).toBe('DENY');
      expect(res.matched_permissions).toHaveLength(0);
    });

    it('retrieves all permissions for a user across actions via repository', () => {
      const perms = repo.getAllUserPermissions('user123');
      expect(perms.length).toBeGreaterThanOrEqual(4);
      expect(perms.map((p) => p.action)).toContain('read');
      expect(perms.map((p) => p.action)).toContain('write');
      expect(perms.map((p) => p.action)).toContain('delete');
    });

    it('does not accidentally match similar resource identifiers', async () => {
      // user456 has write on 'wallets/wallet-789'. Should NOT match 'wallets/wallet-7899'
      const res = await service.authorize('user456', 'POST', '/wallets/wallet-7899');
      expect(res.decision).toBe('DENY');
    });
  });

  describe('Validation & Error Scenarios', () => {
    it('throws error on unsupported HTTP method', async () => {
      await expect(service.authorize('user123', 'OPTIONS', '/transactions')).rejects.toThrow(
        /Unsupported HTTP method/,
      );
    });

    it('throws error on malformed or empty path', async () => {
      await expect(service.authorize('user123', 'GET', '')).rejects.toThrow(
        /Resource path cannot be empty/,
      );
      await expect(service.authorize('user123', 'GET', '/wallets/../etc')).rejects.toThrow(
        /Directory traversal pattern detected/,
      );
    });
  });
});
