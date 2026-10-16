import React, { useEffect, useState, useCallback } from 'react';
import { fetchHealth } from '../api';
import { BackendStatus } from '../types';

interface HeaderProps {
  onStatusChange?: (status: BackendStatus) => void;
}

export const Header: React.FC<HeaderProps> = ({ onStatusChange }) => {
  const [status, setStatus] = useState<BackendStatus>('checking');
  const [uptime, setUptime] = useState<number | null>(null);

  const checkConnection = useCallback(async () => {
    setStatus('checking');
    onStatusChange?.('checking');
    try {
      const data = await fetchHealth();
      setStatus('connected');
      setUptime(data.uptime);
      onStatusChange?.('connected');
    } catch {
      setStatus('disconnected');
      setUptime(null);
      onStatusChange?.('disconnected');
    }
  }, [onStatusChange]);

  useEffect(() => {
    checkConnection();
    // Re-check health every 15 seconds
    const interval = setInterval(checkConnection, 15000);
    return () => clearInterval(interval);
  }, [checkConnection]);

  return (
    <header className="header-card" role="banner">
      <div className="brand-wrapper">
        <div className="brand-icon" aria-hidden="true">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <div className="brand-titles">
          <h1>OpenFabric</h1>
          <p>Authentication &amp; Authorization Service</p>
        </div>
      </div>

      <div className="status-wrapper">
        <div
          className={`status-badge status-${status}`}
          data-testid="backend-status-badge"
          aria-live="polite"
        >
          <span className="status-dot" aria-hidden="true" />
          <span>
            {status === 'connected' && `Connected ${uptime !== null ? `(${Math.floor(uptime)}s)` : ''}`}
            {status === 'checking' && 'Checking Connection...'}
            {status === 'disconnected' && 'Disconnected'}
          </span>
          {status === 'disconnected' && (
            <button
              type="button"
              className="refresh-btn"
              onClick={checkConnection}
              aria-label="Retry connection to backend"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
