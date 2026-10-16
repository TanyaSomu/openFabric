import React from 'react';
import { AuthorizeResponse, HttpMethod } from '../types';

interface ResultPanelProps {
  result: AuthorizeResponse;
  requestedMethod: HttpMethod;
  requestedPath: string;
}

export const ResultPanel: React.FC<ResultPanelProps> = ({
  result,
  requestedMethod,
  requestedPath,
}) => {
  const isAllow = result.decision === 'ALLOW';

  return (
    <div
      className="card"
      role="region"
      aria-label="Authorization Decision Result"
      data-testid="authorization-result-panel"
    >
      <div className="card-header">
        <h3 className="card-title">
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
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          Decision Result
        </h3>
        <p className="card-subtitle">
          Evaluated live by the Policy Decision Point against SQLite permissions.
        </p>
      </div>

      {/* Decision Banner */}
      <div
        className={`result-banner ${isAllow ? 'banner-allow' : 'banner-deny'}`}
        data-testid={`decision-banner-${result.decision.toLowerCase()}`}
      >
        <span
          className={`decision-badge ${isAllow ? 'decision-allow' : 'decision-deny'}`}
          data-testid="decision-value"
        >
          {result.decision}
        </span>
        <div className="decision-meta">
          <span className="decision-title">
            {isAllow ? 'Access Granted' : 'Access Denied'}
          </span>
          <span className="decision-user">Principal: {result.user_id}</span>
        </div>
      </div>

      {/* Metadata Grid */}
      <div className="meta-grid">
        <div className="meta-item">
          <span className="meta-key">Verified User ID</span>
          <span className="meta-val" data-testid="verified-user-id">
            {result.user_id}
          </span>
        </div>
        <div className="meta-item">
          <span className="meta-key">HTTP Status</span>
          <span className="meta-val">200 OK</span>
        </div>
        <div className="meta-item">
          <span className="meta-key">HTTP Method</span>
          <span className="meta-val">{requestedMethod}</span>
        </div>
        <div className="meta-item">
          <span className="meta-key">Resource Path</span>
          <span className="meta-val">{requestedPath}</span>
        </div>
      </div>

      {/* Decision Reason */}
      <div className="reason-wrapper">
        <span className="form-label">PDP Evaluation Reason</span>
        <div className="reason-box" data-testid="decision-reason">
          {result.reason}
        </div>
      </div>

      {/* Matched Permissions Table */}
      <div className="permissions-wrapper">
        <span className="form-label">Matched Database Permissions</span>
        {result.matched_permissions.length > 0 ? (
          <div className="table-wrapper">
            <table className="permissions-table" aria-label="Matched permissions table">
              <thead>
                <tr>
                  <th scope="col">Action</th>
                  <th scope="col">Resource Pattern</th>
                  <th scope="col">Effect</th>
                </tr>
              </thead>
              <tbody>
                {result.matched_permissions.map((perm, idx) => (
                  <tr key={`${perm.action}-${perm.resource}-${idx}`}>
                    <td>
                      <code>{perm.action}</code>
                    </td>
                    <td>
                      <code>{perm.resource}</code>
                    </td>
                    <td>
                      <span
                        className={`effect-tag ${
                          perm.effect === 'allow' ? 'badge-allow' : 'badge-deny'
                        }`}
                      >
                        {perm.effect}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-permissions" data-testid="empty-permissions-msg">
            No specific database permissions matched. Request denied under default-deny policy.
          </div>
        )}
      </div>
    </div>
  );
};
