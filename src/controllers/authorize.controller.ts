import { NextFunction, Request, Response } from 'express';
import { authorizeSchema } from '../schemas/authorize.schema';
import { TokenService } from '../services/token.service';
import { AuthorizationService } from '../services/authorization.service';

export class AuthorizeController {
  private tokenService: TokenService;
  private authorizationService: AuthorizationService;

  constructor(tokenService?: TokenService, authorizationService?: AuthorizationService) {
    this.tokenService = tokenService || new TokenService();
    this.authorizationService = authorizationService || new AuthorizationService();
  }

  public authorize = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // 1. Validate request body schema
      const validatedBody = authorizeSchema.parse(req.body);

      // 2. Authenticate and extract verified user identity from token
      const user = await this.tokenService.verifyToken(validatedBody.access_token);

      // 3. Resolve authorization against SQLite permissions
      const decisionResult = await this.authorizationService.authorize(
        user.userId,
        validatedBody.method,
        validatedBody.path,
      );

      // 4. Return decision response
      res.status(200).json(decisionResult);
    } catch (err) {
      next(err);
    }
  };
}
