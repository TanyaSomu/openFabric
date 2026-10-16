import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import * as api from '../api';
import { AuthorizeResponse, ApiError } from '../types';

describe('OpenFabric Frontend Dashboard Component & Integration Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // 1. Dashboard renders successfully
  it('1. renders the dashboard layout, header, branding, and summary cards successfully', async () => {
    vi.spyOn(api, 'fetchHealth').mockResolvedValueOnce({
      status: 'healthy',
      uptime: 120,
      timestamp: '2026-10-16T12:00:00.000Z',
    });

    render(<App />);

    await screen.findByTestId('backend-status-badge');

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByText('OpenFabric')).toBeInTheDocument();
    expect(screen.getByText('Authentication & Authorization Service')).toBeInTheDocument();
    expect(screen.getByText('OAuth2 / JWT Verification')).toBeInTheDocument();
    expect(screen.getByText('Hierarchical PDP Engine')).toBeInTheDocument();
    expect(screen.getByText('SQLite (better-sqlite3)')).toBeInTheDocument();
    expect(screen.getByText('Evaluate Authorization')).toBeInTheDocument();
  });

  // 2. Backend health indicator handles success
  it('2. displays connected status when GET /health returns 200 healthy', async () => {
    vi.spyOn(api, 'fetchHealth').mockResolvedValueOnce({
      status: 'healthy',
      uptime: 45.2,
      timestamp: '2026-10-16T12:00:00.000Z',
    });

    render(<App />);

    const badge = await screen.findByTestId('backend-status-badge');
    expect(badge).toHaveClass('status-connected');
    expect(badge).toHaveTextContent(/Connected/);
  });

  // 3. Backend health indicator handles failure
  it('3. displays disconnected status with retry button when GET /health fails', async () => {
    vi.spyOn(api, 'fetchHealth').mockRejectedValueOnce(new Error('Network error'));

    render(<App />);

    const badge = await screen.findByTestId('backend-status-badge');
    expect(badge).toHaveClass('status-disconnected');
    expect(badge).toHaveTextContent('Disconnected');
    expect(screen.getByRole('button', { name: /Retry connection to backend/i })).toBeInTheDocument();
  });

  // 4. Empty token validation works
  it('4. shows client validation error when attempting to authorize without an access token', async () => {
    vi.spyOn(api, 'fetchHealth').mockResolvedValueOnce({
      status: 'healthy',
      uptime: 10,
      timestamp: '2026-10-16T12:00:00.000Z',
    });
    const authSpy = vi.spyOn(api, 'authorizeRequest');

    render(<App />);

    const submitBtn = screen.getByRole('button', { name: /Authorize Request/i });
    fireEvent.click(submitBtn);

    expect(
      await screen.findByText(/Access token is required to evaluate authorization/i),
    ).toBeInTheDocument();
    expect(authSpy).not.toHaveBeenCalled();
  });

  // 5. Method selection works
  it('5. allows selecting different HTTP methods (POST, PUT, PATCH, DELETE, GET)', async () => {
    vi.spyOn(api, 'fetchHealth').mockResolvedValueOnce({
      status: 'healthy',
      uptime: 10,
      timestamp: '2026-10-16T12:00:00.000Z',
    });

    render(<App />);
    await screen.findByTestId('backend-status-badge');

    const postBtn = screen.getByRole('radio', { name: 'POST' });
    fireEvent.click(postBtn);
    expect(postBtn).toHaveClass('selected');
    expect(screen.getByText(/Mapped action: write/i)).toBeInTheDocument();

    const deleteBtn = screen.getByRole('radio', { name: 'DELETE' });
    fireEvent.click(deleteBtn);
    expect(deleteBtn).toHaveClass('selected');
    expect(screen.getByText(/Mapped action: delete/i)).toBeInTheDocument();
  });

  // 6. Resource path input works
  it('6. updates resource path value as user types', async () => {
    vi.spyOn(api, 'fetchHealth').mockResolvedValueOnce({
      status: 'healthy',
      uptime: 10,
      timestamp: '2026-10-16T12:00:00.000Z',
    });

    render(<App />);
    await screen.findByTestId('backend-status-badge');

    const pathInput = screen.getByLabelText(/Resource Path/i);
    fireEvent.change(pathInput, { target: { value: '/wallets/wallet-123' } });
    expect(pathInput).toHaveValue('/wallets/wallet-123');
  });

  // 7. Authorize button sends the correct request
  it('7. sends the expected payload to POST /authorize when form is submitted', async () => {
    vi.spyOn(api, 'fetchHealth').mockResolvedValueOnce({
      status: 'healthy',
      uptime: 10,
      timestamp: '2026-10-16T12:00:00.000Z',
    });

    const mockResponse: AuthorizeResponse = {
      decision: 'ALLOW',
      user_id: 'user123',
      reason: 'User has read permission for transactions',
      matched_permissions: [{ action: 'read', resource: 'transactions', effect: 'allow' }],
    };
    const authSpy = vi.spyOn(api, 'authorizeRequest').mockResolvedValueOnce(mockResponse);

    render(<App />);

    const tokenInput = screen.getByLabelText(/OAuth2 Access Token/i);
    const pathInput = screen.getByLabelText(/Resource Path/i);
    const submitBtn = screen.getByRole('button', { name: /Authorize Request/i });

    fireEvent.change(pathInput, { target: { value: '/transactions' } });
    fireEvent.change(tokenInput, { target: { value: 'eyMockTokenUser123' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(authSpy).toHaveBeenCalledWith({
        access_token: 'eyMockTokenUser123',
        method: 'GET',
        path: '/transactions',
      });
    });
  });

  // 8. Valid ALLOW responses render correctly
  it('8. renders green visual treatment, ALLOW badge, verified user_id, and metadata on ALLOW', async () => {
    vi.spyOn(api, 'fetchHealth').mockResolvedValueOnce({
      status: 'healthy',
      uptime: 10,
      timestamp: '2026-10-16T12:00:00.000Z',
    });

    const mockResponse: AuthorizeResponse = {
      decision: 'ALLOW',
      user_id: 'user123',
      reason: 'User has read permission for transactions',
      matched_permissions: [{ action: 'read', resource: 'transactions', effect: 'allow' }],
    };
    vi.spyOn(api, 'authorizeRequest').mockResolvedValueOnce(mockResponse);

    render(<App />);

    const tokenInput = screen.getByLabelText(/OAuth2 Access Token/i);
    fireEvent.change(tokenInput, { target: { value: 'valid-token' } });
    fireEvent.click(screen.getByRole('button', { name: /Authorize Request/i }));

    const banner = await screen.findByTestId('decision-banner-allow');
    expect(banner).toBeInTheDocument();
    expect(screen.getByTestId('decision-value')).toHaveTextContent('ALLOW');
    expect(screen.getByTestId('verified-user-id')).toHaveTextContent('user123');
    expect(screen.getByTestId('decision-reason')).toHaveTextContent(
      'User has read permission for transactions',
    );
  });

  // 9. Valid DENY responses render correctly
  it('9. renders red visual treatment, DENY badge, and reason on legitimate DENY response', async () => {
    vi.spyOn(api, 'fetchHealth').mockResolvedValueOnce({
      status: 'healthy',
      uptime: 10,
      timestamp: '2026-10-16T12:00:00.000Z',
    });

    const mockResponse: AuthorizeResponse = {
      decision: 'DENY',
      user_id: 'user123',
      reason: 'Explicit deny permission takes precedence at specificity level 10',
      matched_permissions: [{ action: 'delete', resource: 'transactions', effect: 'deny' }],
    };
    vi.spyOn(api, 'authorizeRequest').mockResolvedValueOnce(mockResponse);

    render(<App />);

    const tokenInput = screen.getByLabelText(/OAuth2 Access Token/i);
    fireEvent.change(tokenInput, { target: { value: 'valid-token' } });
    fireEvent.click(screen.getByRole('button', { name: /Authorize Request/i }));

    const banner = await screen.findByTestId('decision-banner-deny');
    expect(banner).toBeInTheDocument();
    expect(screen.getByTestId('decision-value')).toHaveTextContent('DENY');
    expect(screen.getByTestId('verified-user-id')).toHaveTextContent('user123');
    expect(screen.getByTestId('decision-reason')).toHaveTextContent(/Explicit deny permission/);
  });

  // 10. Matched permissions render correctly
  it('10. renders matched permissions table with action, resource, and effect badges', async () => {
    vi.spyOn(api, 'fetchHealth').mockResolvedValueOnce({
      status: 'healthy',
      uptime: 10,
      timestamp: '2026-10-16T12:00:00.000Z',
    });

    const mockResponse: AuthorizeResponse = {
      decision: 'ALLOW',
      user_id: 'user456',
      reason: 'User has read permission for wallets/wallet-789/transactions',
      matched_permissions: [
        { action: 'read', resource: 'wallets/wallet-789/transactions', effect: 'allow' },
      ],
    };
    vi.spyOn(api, 'authorizeRequest').mockResolvedValueOnce(mockResponse);

    render(<App />);

    fireEvent.change(screen.getByLabelText(/OAuth2 Access Token/i), {
      target: { value: 'token-user456' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Authorize Request/i }));

    await screen.findByRole('table', { name: /Matched permissions table/i });
    expect(screen.getByText('wallets/wallet-789/transactions')).toBeInTheDocument();
    expect(screen.getByText('allow')).toBeInTheDocument();
  });

  // 11. HTTP 400 errors render correctly
  it('11. displays structured validation errors when backend returns HTTP 400 Bad Request', async () => {
    vi.spyOn(api, 'fetchHealth').mockResolvedValueOnce({
      status: 'healthy',
      uptime: 10,
      timestamp: '2026-10-16T12:00:00.000Z',
    });

    const badRequestError: ApiError = {
      error: 'Bad Request',
      message: 'Validation failed for request body',
      details: [
        { path: 'method', message: 'Unsupported HTTP method' },
        { path: 'path', message: 'Directory traversal pattern detected' },
      ],
      statusCode: 400,
    };
    vi.spyOn(api, 'authorizeRequest').mockRejectedValueOnce(badRequestError);

    render(<App />);

    fireEvent.change(screen.getByLabelText(/OAuth2 Access Token/i), {
      target: { value: 'some-token' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Authorize Request/i }));

    const errorPanel = await screen.findByTestId('error-panel');
    expect(errorPanel).toBeInTheDocument();
    expect(screen.getByTestId('error-status-badge')).toHaveTextContent('HTTP 400');
    expect(screen.getByTestId('error-message')).toHaveTextContent(
      'Validation failed for request body',
    );
    expect(screen.getByTestId('validation-detail-0')).toHaveTextContent(
      'method: Unsupported HTTP method',
    );
  });

  // 12. HTTP 401 errors render correctly
  it('12. displays authentication error when backend returns HTTP 401 Unauthorized', async () => {
    vi.spyOn(api, 'fetchHealth').mockResolvedValueOnce({
      status: 'healthy',
      uptime: 10,
      timestamp: '2026-10-16T12:00:00.000Z',
    });

    const authError: ApiError = {
      error: 'Unauthorized',
      message: 'Access token has expired',
      statusCode: 401,
    };
    vi.spyOn(api, 'authorizeRequest').mockRejectedValueOnce(authError);

    render(<App />);

    fireEvent.change(screen.getByLabelText(/OAuth2 Access Token/i), {
      target: { value: 'expired-token' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Authorize Request/i }));

    const errorPanel = await screen.findByTestId('error-panel');
    expect(errorPanel).toBeInTheDocument();
    expect(screen.getByTestId('error-status-badge')).toHaveTextContent('HTTP 401');
    expect(screen.getByTestId('error-message')).toHaveTextContent('Access token has expired');
  });

  // 13. HTTP 503 errors render correctly
  it('13. displays upstream service error when backend returns HTTP 503 Service Unavailable', async () => {
    vi.spyOn(api, 'fetchHealth').mockResolvedValueOnce({
      status: 'healthy',
      uptime: 10,
      timestamp: '2026-10-16T12:00:00.000Z',
    });

    const upstreamError: ApiError = {
      error: 'Service Unavailable',
      message: 'Authentication provider key service is temporarily unavailable',
      statusCode: 503,
    };
    vi.spyOn(api, 'authorizeRequest').mockRejectedValueOnce(upstreamError);

    render(<App />);

    fireEvent.change(screen.getByLabelText(/OAuth2 Access Token/i), {
      target: { value: 'some-token' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Authorize Request/i }));

    const errorPanel = await screen.findByTestId('error-panel');
    expect(errorPanel).toBeInTheDocument();
    expect(screen.getByTestId('error-status-badge')).toHaveTextContent('HTTP 503');
    expect(screen.getByTestId('error-message')).toHaveTextContent(
      'Authentication provider key service is temporarily unavailable',
    );
  });

  // 14. Network failures render correctly
  it('14. displays connection failure banner when fetch throws a network exception', async () => {
    vi.spyOn(api, 'fetchHealth').mockResolvedValueOnce({
      status: 'healthy',
      uptime: 10,
      timestamp: '2026-10-16T12:00:00.000Z',
    });

    const networkError: ApiError = {
      error: 'Connection Error',
      message: 'Failed to reach backend at http://localhost:8080 (Failed to fetch).',
      statusCode: 0,
    };
    vi.spyOn(api, 'authorizeRequest').mockRejectedValueOnce(networkError);

    render(<App />);

    fireEvent.change(screen.getByLabelText(/OAuth2 Access Token/i), {
      target: { value: 'some-token' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Authorize Request/i }));

    const errorPanel = await screen.findByTestId('error-panel');
    expect(errorPanel).toBeInTheDocument();
    expect(screen.getByTestId('error-status-badge')).toHaveTextContent('Network Error');
    expect(screen.getByTestId('error-message')).toHaveTextContent(/Failed to reach backend/);
  });

  // 15. Loading state prevents accidental duplicate submissions
  it('15. disables the authorize button while an evaluation request is in-flight', async () => {
    vi.spyOn(api, 'fetchHealth').mockResolvedValueOnce({
      status: 'healthy',
      uptime: 10,
      timestamp: '2026-10-16T12:00:00.000Z',
    });

    let resolvePromise!: (val: AuthorizeResponse) => void;
    const pendingPromise = new Promise<AuthorizeResponse>((resolve) => {
      resolvePromise = resolve;
    });
    vi.spyOn(api, 'authorizeRequest').mockReturnValueOnce(pendingPromise);

    render(<App />);

    fireEvent.change(screen.getByLabelText(/OAuth2 Access Token/i), {
      target: { value: 'valid-token' },
    });

    const submitBtn = screen.getByRole('button', { name: /Authorize Request/i });
    fireEvent.click(submitBtn);

    expect(submitBtn).toBeDisabled();
    expect(screen.getByText('Evaluating...')).toBeInTheDocument();

    // Resolve the promise
    resolvePromise({
      decision: 'ALLOW',
      user_id: 'user123',
      reason: 'Allowed',
      matched_permissions: [],
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Authorize Request/i })).not.toBeDisabled();
    });
  });

  // 16. Reset clears the form and displayed results
  it('16. resets all inputs and clears result and error panels when Reset button is clicked', async () => {
    vi.spyOn(api, 'fetchHealth').mockResolvedValueOnce({
      status: 'healthy',
      uptime: 10,
      timestamp: '2026-10-16T12:00:00.000Z',
    });

    const mockResponse: AuthorizeResponse = {
      decision: 'ALLOW',
      user_id: 'user123',
      reason: 'Allowed',
      matched_permissions: [],
    };
    vi.spyOn(api, 'authorizeRequest').mockResolvedValueOnce(mockResponse);

    render(<App />);

    const tokenInput = screen.getByLabelText(/OAuth2 Access Token/i);
    const pathInput = screen.getByLabelText(/Resource Path/i);

    fireEvent.change(pathInput, { target: { value: '/custom/path' } });
    fireEvent.change(tokenInput, { target: { value: 'my-token' } });
    fireEvent.click(screen.getByRole('button', { name: /Authorize Request/i }));

    expect(await screen.findByTestId('authorization-result-panel')).toBeInTheDocument();

    // Click Reset
    fireEvent.click(screen.getByRole('button', { name: /Reset/i }));

    expect(screen.queryByTestId('authorization-result-panel')).not.toBeInTheDocument();
    expect(tokenInput).toHaveValue('');
    expect(pathInput).toHaveValue('/transactions');
  });

  // 17. Access tokens are not persisted in browser storage
  it('17. never persists access tokens into localStorage or sessionStorage', async () => {
    vi.spyOn(api, 'fetchHealth').mockResolvedValueOnce({
      status: 'healthy',
      uptime: 10,
      timestamp: '2026-10-16T12:00:00.000Z',
    });

    const user = userEvent.setup();
    render(<App />);

    const tokenInput = screen.getByLabelText(/OAuth2 Access Token/i);
    await user.type(tokenInput, 'super-sensitive-jwt-token-xyz');

    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
    expect(sessionStorage.getItem('access_token')).toBeNull();
    expect(sessionStorage.getItem('token')).toBeNull();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
