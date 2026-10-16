import React from 'react';
import { ApiError } from '../types';

interface ErrorPanelProps {
  error: ApiError;
}

export const ErrorPanel: React.FC<ErrorPanelProps> = ({ error }) => {
  const getBadgeText = () => {
    if (error.statusCode === 0) return 'Network Error';
    return `HTTP ${error.statusCode}`;
  };

  const getHelpfulNote = () => {
    switch (error.statusCode) {
      case 400:
        return 'The request body did not satisfy schema requirements (invalid method, missing fields, or forbidden path characters).';
      case 401:
        return 'The provided OAuth2 JWT failed cryptographic verification (invalid signature, expired token, or untrusted issuer).';
      case 503:
        return 'The backend could not reach the trusted Auth0 JWKS endpoint to retrieve signing keys.';
      case 500:
        return 'An internal backend error occurred. Details have been sanitized for security.';
      case 0:
        return 'The browser was unable to connect to the backend server. Verify the server is running on port 8080.';
      default:
        return null;
    }
  };

  return (
    <div
      className="card error-card"
      role="alert"
      aria-live="assertive"
      data-testid="error-panel"
    >
      <div className="error-title-bar">
        <span className="error-code-badge" data-testid="error-status-badge">
          {getBadgeText()}
        </span>
        <h3 className="error-heading">{error.error}</h3>
      </div>

      <p className="error-msg" data-testid="error-message">
        {error.message}
      </p>

      {error.details && error.details.length > 0 && (
        <ul className="error-details-list" aria-label="Validation error details">
          {error.details.map((item, idx) => (
            <li key={idx} data-testid={`validation-detail-${idx}`}>
              <strong>{item.path}:</strong> {item.message}
            </li>
          ))}
        </ul>
      )}

      {getHelpfulNote() && (
        <p
          style={{
            marginTop: '12px',
            fontSize: '0.78rem',
            color: 'var(--color-navy-muted)',
            lineHeight: 1.4,
          }}
        >
          <strong>Diagnosis:</strong> {getHelpfulNote()}
        </p>
      )}
    </div>
  );
};
