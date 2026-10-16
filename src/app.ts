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

  // Safe CORS for local development frontend
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
    ];

    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }

    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }

    next();
  });

  // Routes
  app.use('/', healthRouter);
  app.use('/', createAuthorizeRouter(options?.authorizeController));

  // Error Handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
