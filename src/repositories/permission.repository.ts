import Database from 'better-sqlite3';
import { Action, UserPermission } from '../types/authorization.types';
import { getDatabase } from '../config/database';

export class PermissionRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
  }

  /**
   * Retrieves permissions for a specific user and action using parameterized query.
   */
  getUserPermissions(userId: string, action: Action): UserPermission[] {
    const stmt = this.db.prepare<[string, string], UserPermission>(`
      SELECT id, user_id, action, resource, effect
      FROM user_permissions
      WHERE user_id = ? AND action = ?
    `);

    return stmt.all(userId, action);
  }

  /**
   * Retrieves all permissions for a user across all actions.
   */
  getAllUserPermissions(userId: string): UserPermission[] {
    const stmt = this.db.prepare<[string], UserPermission>(`
      SELECT id, user_id, action, resource, effect
      FROM user_permissions
      WHERE user_id = ?
    `);

    return stmt.all(userId);
  }

  /**
   * Inserts a new user permission record.
   */
  insertPermission(permission: Omit<UserPermission, 'id'>): number {
    const stmt = this.db.prepare<[string, string, string, string]>(`
      INSERT INTO user_permissions (user_id, action, resource, effect)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(
      permission.user_id,
      permission.action,
      permission.resource,
      permission.effect,
    );

    return Number(result.lastInsertRowid);
  }
}
