import React, { useState } from 'react';
import { Header } from './components/Header';
import { ProjectSummary } from './components/ProjectSummary';
import { ExampleScenarios } from './components/ExampleScenarios';
import { AuthorizationTester } from './components/AuthorizationTester';
import { ResultPanel } from './components/ResultPanel';
import { ErrorPanel } from './components/ErrorPanel';
import { authorizeRequest } from './api';
import {
  HttpMethod,
  AuthorizeRequestBody,
  AuthorizeResponse,
  ApiError,
  ScenarioExample,
  BackendStatus,
} from './types';

export const App: React.FC = () => {
  const [method, setMethod] = useState<HttpMethod>('GET');
  const [path, setPath] = useState<string>('/transactions');
  const [token, setToken] = useState<string>('');
  const [activeScenarioId, setActiveScenarioId] = useState<string | undefined>('scenario-1');

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [result, setResult] = useState<AuthorizeResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  // Snapshot of the requested method and path when submission occurs
  const [submittedMethod, setSubmittedMethod] = useState<HttpMethod>('GET');
  const [submittedPath, setSubmittedPath] = useState<string>('/transactions');

  const [, setBackendStatus] = useState<BackendStatus>('checking');

  const handleSelectScenario = (scenario: ScenarioExample) => {
    setActiveScenarioId(scenario.id);
    setMethod(scenario.method);
    setPath(scenario.path);
    // Clear previous results on scenario switch
    setResult(null);
    setError(null);
  };

  const handleAuthorize = async (payload: AuthorizeRequestBody) => {
    setIsLoading(true);
    setResult(null);
    setError(null);
    setSubmittedMethod(payload.method);
    setSubmittedPath(payload.path);

    try {
      const responseData = await authorizeRequest(payload);
      setResult(responseData);
    } catch (err: unknown) {
      setError(err as ApiError);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setMethod('GET');
    setPath('/transactions');
    setToken('');
    setActiveScenarioId(undefined);
    setResult(null);
    setError(null);
  };

  return (
    <div className="app-container">
      {/* Header with Live Health Indicator */}
      <Header onStatusChange={setBackendStatus} />

      {/* Project Implementation Summary Cards */}
      <ProjectSummary />

      {/* Main Two-Column Layout */}
      <main className="dashboard-grid">
        {/* Left Column: Preset Scenarios & Request Form */}
        <div className="grid-left">
          <ExampleScenarios
            onSelectScenario={handleSelectScenario}
            activeScenarioId={activeScenarioId}
          />

          <AuthorizationTester
            method={method}
            path={path}
            token={token}
            isLoading={isLoading}
            onMethodChange={(m) => {
              setMethod(m);
              setActiveScenarioId(undefined);
            }}
            onPathChange={(p) => {
              setPath(p);
              setActiveScenarioId(undefined);
            }}
            onTokenChange={setToken}
            onSubmit={handleAuthorize}
            onReset={handleReset}
          />
        </div>

        {/* Right Column: Real Decision Results & Error Feedback */}
        <div className="grid-right">
          {error && <ErrorPanel error={error} />}

          {result && (
            <ResultPanel
              result={result}
              requestedMethod={submittedMethod}
              requestedPath={submittedPath}
            />
          )}

          {!result && !error && (
            <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  margin: '0 auto 16px',
                  borderRadius: '50%',
                  background: 'var(--color-bg-app)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-text-subtle)',
                }}
              >
                <svg
                  width="24"
                  height="24"
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
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-navy)' }}>
                Awaiting Request Evaluation
              </h3>
              <p
                style={{
                  fontSize: '0.82rem',
                  color: 'var(--color-text-subtle)',
                  marginTop: '8px',
                  lineHeight: 1.5,
                }}
              >
                Select an assignment scenario or enter a custom HTTP method, path, and verified
                token, then click <strong>Authorize Request</strong> to see the backend Policy
                Decision Point in action.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
