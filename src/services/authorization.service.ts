import { PermissionRepository } from '../repositories/permission.repository';
import {
  Action,
  AuthorizeResponse,
  MatchedPermission,
  UserPermission,
} from '../types/authorization.types';
import { mapMethodToAction, normalizeResourcePath } from '../utils/resource-path';
import { evaluatePermissions } from '../utils/permission-matcher';

export class AuthorizationService {
  private permissionRepository: PermissionRepository;

  constructor(permissionRepository?: PermissionRepository) {
    this.permissionRepository = permissionRepository || new PermissionRepository();
  }

  /**
   * Evaluates authorization for a verified user, HTTP method, and resource path.
   *
   * Precedence & Resolution Algorithm:
   * 1. Map HTTP method to action (read, write, delete).
   * 2. Normalize resource path canonicalizing slashes and URL encoding.
   * 3. Fetch permissions for the specific user and action from the database.
   * 4. Identify all permissions whose resource pattern matches the requested resource.
   * 5. If no permissions match, default to DENY.
   * 6. Calculate specificity for each matching permission.
   * 7. Isolate permissions at the highest specificity level.
   * 8. At highest specificity: if any DENY exists, DENY wins.
   * 9. If only ALLOW exists at highest specificity, ALLOW access.
   */
  public async authorize(
    userId: string,
    method: string,
    rawPath: string,
  ): Promise<AuthorizeResponse> {
    const action: Action = mapMethodToAction(method);
    const normalizedPath: string = normalizeResourcePath(rawPath);

    // Retrieve user permissions for this action
    const userPermissions: UserPermission[] = this.permissionRepository.getUserPermissions(
      userId,
      action,
    );

    if (userPermissions.length === 0) {
      return {
        decision: 'DENY',
        user_id: userId,
        reason: `No applicable permissions found for user '${userId}' with action '${action}'`,
        matched_permissions: [],
      };
    }

    // Evaluate matches and compute specificity
    const matches = evaluatePermissions(userPermissions, normalizedPath);

    if (matches.length === 0) {
      return {
        decision: 'DENY',
        user_id: userId,
        reason: `No matching permissions found for resource '${normalizedPath}'`,
        matched_permissions: [],
      };
    }

    // Find maximum specificity score among matches
    const maxSpecificity = Math.max(...matches.map((m) => m.specificity));
    const highestLevelMatches = matches.filter((m) => m.specificity === maxSpecificity);

    // Conflict resolution at the highest specificity: Deny beats Allow
    const denyMatches = highestLevelMatches.filter((m) => m.permission.effect === 'deny');
    const allowMatches = highestLevelMatches.filter((m) => m.permission.effect === 'allow');

    if (denyMatches.length > 0) {
      const matched_permissions: MatchedPermission[] = denyMatches.map((m) => ({
        action: m.permission.action,
        resource: m.permission.resource,
        effect: m.permission.effect,
      }));

      return {
        decision: 'DENY',
        user_id: userId,
        reason: `Explicit deny permission takes precedence at specificity level ${maxSpecificity} for resource '${normalizedPath}'`,
        matched_permissions,
      };
    }

    const matched_permissions: MatchedPermission[] = allowMatches.map((m) => ({
      action: m.permission.action,
      resource: m.permission.resource,
      effect: m.permission.effect,
    }));

    return {
      decision: 'ALLOW',
      user_id: userId,
      reason: `User has ${action} permission for ${normalizedPath}`,
      matched_permissions,
    };
  }
}
