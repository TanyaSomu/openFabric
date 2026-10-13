import { app } from './app';
import { env } from './config/env';
import { getDatabase, closeDatabase } from './config/database';
import { logger } from './utils/logger';

// Initialize and verify database
getDatabase();

const server = app.listen(env.PORT, () => {
  logger.info(`Authentication & Authorization Service listening on port ${env.PORT}`);
  logger.info(`Environment: ${env.NODE_ENV}`);
});

function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    closeDatabase();
    logger.info('HTTP server closed and database connection terminated');
    process.exit(0);
  });

  // Force shutdown after timeout if pending connections hang
  setTimeout(() => {
    logger.error('Forceful shutdown triggered after timeout');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
