export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type Action = 'read' | 'write' | 'delete';

export type Effect = 'allow' | 'deny';

export type Decision = 'ALLOW' | 'DENY';

export interface UserPermission {
  id?: number;
  user_id: string;
  action: Action;
  resource: string;
  effect: Effect;
}

export interface MatchedPermission {
  action: Action;
  resource: string;
  effect: Effect;
}

export interface AuthorizeRequestBody {
  access_token: string;
  method: string;
  path: string;
}

export interface AuthorizeResponse {
  decision: Decision;
  user_id: string;
  reason: string;
  matched_permissions: MatchedPermission[];
}

export interface AuthenticatedUser {
  userId: string;
  sub: string;
  claims: Record<string, unknown>;
}

export interface ResolutionResult {
  decision: Decision;
  reason: string;
  matchedPermissions: MatchedPermission[];
}
