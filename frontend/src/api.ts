import { AuthorizeRequestBody, AuthorizeResponse, HealthResponse, ApiError } from './types';

// Use environment variable if set, otherwise relative path for Vite dev proxy
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

/**
 * Checks backend health status via GET /health
 */
export async function fetchHealth(): Promise<HealthResponse> {
  const url = `${API_BASE_URL}/health`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Health check returned HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Sends authorization evaluation request to POST /authorize
 */
export async function authorizeRequest(
  payload: AuthorizeRequestBody,
): Promise<AuthorizeResponse> {
  const url = `${API_BASE_URL}/authorize`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Unable to connect to authorization backend';
    const networkError: ApiError = {
      error: 'Connection Error',
      message: `Failed to reach backend at ${API_BASE_URL || 'http://localhost:8080'}. Ensure the backend server is running (${message}).`,
      statusCode: 0,
    };
    throw networkError;
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    const parseError: ApiError = {
      error: 'Invalid Response',
      message: 'Server returned a response that could not be parsed as JSON',
      statusCode: response.status,
    };
    throw parseError;
  }

  // 200 OK indicates successful authorization evaluation (decision is ALLOW or DENY)
  if (response.ok) {
    return data as AuthorizeResponse;
  }

  // Non-200 responses represent HTTP client or server errors (400, 401, 500, 503)
  const apiError = data as Partial<ApiError>;
  const errorResult: ApiError = {
    error: apiError.error || `HTTP ${response.status}`,
    message: apiError.message || 'An error occurred during authorization evaluation',
    details: apiError.details,
    statusCode: response.status,
  };

  throw errorResult;
}
