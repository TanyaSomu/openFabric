import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { env } from './env';
import { logger } from '../utils/logger';

let dbInstance: Database.Database | null = null;

export function getDatabase(dbPath?: string): Database.Database {
  if (dbInstance && !dbPath) {
    return dbInstance;
  }

  const targetPath = dbPath || env.DATABASE_PATH;

  // If file-based database, ensure directory exists
  if (targetPath !== ':memory:') {
    const resolvedPath = path.resolve(targetPath);
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(targetPath);

  // Performance and safety pragmas
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  // Initialize schema if not already initialized
  initDatabaseSchema(db);

  if (!dbPath) {
    dbInstance = db;
  }

  return db;
}

export function initDatabaseSchema(db: Database.Database): void {
  const initSqlPath = path.resolve(__dirname, '../../database/init.sql');
  if (fs.existsSync(initSqlPath)) {
    const sql = fs.readFileSync(initSqlPath, 'utf8');
    db.exec(sql);
  } else {
    // Fallback schema if init.sql file is not found
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        resource TEXT NOT NULL,
        effect TEXT NOT NULL CHECK (effect IN ('allow', 'deny'))
      );
      CREATE INDEX IF NOT EXISTS idx_user_permissions_user_action
      ON user_permissions(user_id, action);
    `);
  }
}

export function closeDatabase(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch (err) {
      logger.error({ err }, 'Error closing database');
    }
    dbInstance = null;
  }
}
