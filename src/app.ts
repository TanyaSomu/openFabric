import express, { Express } from 'express';
import { healthRouter } from './routes/health.routes';
import { createAuthorizeRouter } from './routes/authorize.routes';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { AuthorizeController } from './controllers/authorize.controller';

export interface AppOptions {
  authorizeController?: AuthorizeController;
}

export function createApp(options?: AppOptions): Express {
  const app = express();

  // Basic security and parsing middleware
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  // Routes
  app.use('/', healthRouter);
  app.use('/', createAuthorizeRouter(options?.authorizeController));

  // Error Handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
