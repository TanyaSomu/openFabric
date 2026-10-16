import React, { useState } from 'react';
import { HttpMethod, AuthorizeRequestBody } from '../types';

interface AuthorizationTesterProps {
  method: HttpMethod;
  path: string;
  token: string;
  isLoading: boolean;
  onMethodChange: (method: HttpMethod) => void;
  onPathChange: (path: string) => void;
  onTokenChange: (token: string) => void;
  onSubmit: (payload: AuthorizeRequestBody) => void;
  onReset: () => void;
}

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export const AuthorizationTester: React.FC<AuthorizationTesterProps> = ({
  method,
  path,
  token,
  isLoading,
  onMethodChange,
  onPathChange,
  onTokenChange,
  onSubmit,
  onReset,
}) => {
  const [showToken, setShowToken] = useState(false);
  const [clientValidationError, setClientValidationError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setClientValidationError(null);

    const trimmedPath = path.trim();
    const trimmedToken = token.trim();

    if (!trimmedToken) {
      setClientValidationError('Access token is required to evaluate authorization.');
      return;
    }

    if (!trimmedPath) {
      setClientValidationError('Resource path cannot be empty.');
      return;
    }

    onSubmit({
      access_token: trimmedToken,
      method,
      path: trimmedPath,
    });
  };

  const handleResetClick = () => {
    setClientValidationError(null);
    onReset();
  };

  return (
    <div className="card" role="region" aria-label="Authorization Request Form">
      <div className="card-header">
        <h2 className="card-title">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Evaluate Authorization
        </h2>
        <p className="card-subtitle">
          Submit an HTTP method, resource path, and verified access token to evaluate permissions.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        {clientValidationError && (
          <div
            className="error-card"
            style={{ marginBottom: '16px', padding: '10px 14px' }}
            role="alert"
          >
            <span className="error-msg">{clientValidationError}</span>
          </div>
        )}

        {/* HTTP Method Selector */}
        <div className="form-group">
          <label className="form-label" id="method-selector-label">
            HTTP Method
          </label>
          <div
            className="method-selector"
            role="radiogroup"
            aria-labelledby="method-selector-label"
          >
            {METHODS.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={method === m}
                className={`method-btn ${method === m ? 'selected' : ''}`}
                onClick={() => onMethodChange(m)}
              >
                {m}
              </button>
            ))}
          </div>
          <p className="input-helper">
            Mapped action: {method === 'GET' ? 'read' : method === 'DELETE' ? 'delete' : 'write'}
          </p>
        </div>

        {/* Resource Path Input */}
        <div className="form-group">
          <label className="form-label" htmlFor="resource-path-input">
            Resource Path
          </label>
          <input
            id="resource-path-input"
            type="text"
            className="form-input form-input-mono"
            placeholder="/transactions"
            value={path}
            onChange={(e) => onPathChange(e.target.value)}
            required
            autoComplete="off"
            spellCheck={false}
          />
          <p className="input-helper">
            Canonicalized automatically by backend (e.g. /wallets/wallet-789/transactions).
          </p>
        </div>

        {/* Access Token Input */}
        <div className="form-group">
          <label className="form-label" htmlFor="access-token-input">
            OAuth2 Access Token (JWT)
          </label>
          <div className="token-input-wrapper">
            <input
              id="access-token-input"
              type={showToken ? 'text' : 'password'}
              className="form-input form-input-mono"
              placeholder="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
              value={token}
              onChange={(e) => onTokenChange(e.target.value)}
              required
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              className="token-toggle-btn"
              onClick={() => setShowToken(!showToken)}
              aria-label={showToken ? 'Hide access token' : 'Show access token'}
            >
              {showToken ? 'Hide' : 'Show'}
            </button>
          </div>
          <p className="input-helper">
            Masked by default. Never logged or persisted to browser storage.
          </p>
        </div>

        {/* Form Actions */}
        <div className="form-actions">
          <button
            type="submit"
            className="btn-primary"
            disabled={isLoading}
            aria-busy={isLoading}
          >
            {isLoading ? (
              <>
                <span className="spinner" aria-hidden="true" />
                <span>Evaluating...</span>
              </>
            ) : (
              <span>Authorize Request</span>
            )}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleResetClick}
            disabled={isLoading}
          >
            Reset
          </button>
        </div>
      </form>
    </div>
  );
};
