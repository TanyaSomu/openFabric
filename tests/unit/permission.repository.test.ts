import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { PermissionRepository } from '../../src/repositories/permission.repository';
import { initDatabaseSchema } from '../../src/config/database';

describe('PermissionRepository Unit Tests', () => {
  let db: Database.Database;
  let repo: PermissionRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    initDatabaseSchema(db);
    repo = new PermissionRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('retrieves user permissions filtered by user_id and action', () => {
    const permissions = repo.getUserPermissions('user123', 'read');

    expect(permissions.length).toBeGreaterThan(0);
    for (const perm of permissions) {
      expect(perm.user_id).toBe('user123');
      expect(perm.action).toBe('read');
    }
  });

  it('returns an empty array when no matching user_id or action exists', () => {
    const permissions = repo.getUserPermissions('nonexistent_user', 'read');
    expect(permissions).toEqual([]);

    const noAction = repo.getUserPermissions(
      'user123',
      'unknown' as unknown as import('../../src/types/authorization.types').Action,
    );
    expect(noAction).toEqual([]);
  });

  it('retrieves all permissions for a user across all actions', () => {
    const permissions = repo.getAllUserPermissions('user123');

    expect(permissions.length).toBe(4); // 2 read, 1 write, 1 delete
    const actions = permissions.map((p) => p.action);
    expect(actions).toContain('read');
    expect(actions).toContain('write');
    expect(actions).toContain('delete');
  });

  it('inserts a new permission and returns its auto-increment ID', () => {
    const id = repo.insertPermission({
      user_id: 'newUser',
      action: 'write',
      resource: 'wallets/new-wallet',
      effect: 'allow',
    });

    expect(id).toBeGreaterThan(0);

    const userPerms = repo.getUserPermissions('newUser', 'write');
    expect(userPerms).toHaveLength(1);
    expect(userPerms[0].resource).toBe('wallets/new-wallet');
    expect(userPerms[0].effect).toBe('allow');
  });

  it('throws an error when querying a closed database', () => {
    db.close();
    expect(() => repo.getUserPermissions('user123', 'read')).toThrow();
  });
});
