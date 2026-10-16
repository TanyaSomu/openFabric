export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type Action = 'read' | 'write' | 'delete';

export type Effect = 'allow' | 'deny';

export type Decision = 'ALLOW' | 'DENY';

export interface MatchedPermission {
  action: Action;
  resource: string;
  effect: Effect;
}

export interface AuthorizeRequestBody {
  access_token: string;
  method: HttpMethod;
  path: string;
}

export interface AuthorizeResponse {
  decision: Decision;
  user_id: string;
  reason: string;
  matched_permissions: MatchedPermission[];
}

export interface HealthResponse {
  status: string;
  uptime: number;
  timestamp: string;
}

export interface ValidationErrorDetail {
  path: string;
  message: string;
}

export interface ApiError {
  error: string;
  message: string;
  details?: ValidationErrorDetail[];
  statusCode: number;
}

export type BackendStatus = 'checking' | 'connected' | 'disconnected';

export interface ScenarioExample {
  id: string;
  name: string;
  user: string;
  method: HttpMethod;
  path: string;
  expectedDecision: Decision;
  description: string;
}
