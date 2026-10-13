import { Router } from 'express';
import { AuthorizeController } from '../controllers/authorize.controller';

export function createAuthorizeRouter(controller?: AuthorizeController): Router {
  const router = Router();
  const authController = controller || new AuthorizeController();

  router.post('/authorize', authController.authorize);

  return router;
}

export const authorizeRouter = createAuthorizeRouter();
