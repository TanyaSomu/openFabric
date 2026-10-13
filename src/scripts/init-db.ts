import { getDatabase } from '../config/database';
import { logger } from '../utils/logger';

function main() {
  logger.info('Initializing SQLite database schema and seed data...');
  const db = getDatabase();

  const countStmt = db.prepare('SELECT COUNT(*) as count FROM user_permissions');
  const result = countStmt.get() as { count: number };

  logger.info(`Database successfully initialized. Total permissions: ${result.count}`);
}

main();
