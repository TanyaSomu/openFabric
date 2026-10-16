import { ScenarioExample } from '../types';

interface ExampleScenariosProps {
  onSelectScenario: (scenario: ScenarioExample) => void;
  activeScenarioId?: string;
}

export const SCENARIOS: ScenarioExample[] = [
  {
    id: 'scenario-1',
    name: 'Scenario 1: user123 — View Transactions',
    user: 'user123',
    method: 'GET',
    path: '/transactions',
    expectedDecision: 'ALLOW',
    description: 'Exact permission on transactions collection grants read access.',
  },
  {
    id: 'scenario-2',
    name: 'Scenario 2: user123 — Delete Transaction',
    user: 'user123',
    method: 'DELETE',
    path: '/transactions/txn-456',
    expectedDecision: 'DENY',
    description: 'Explicit delete deny on transactions collection inherits to child items.',
  },
  {
    id: 'scenario-3',
    name: 'Scenario 3: user456 — Specific Wallet Transactions',
    user: 'user456',
    method: 'GET',
    path: '/wallets/wallet-789/transactions',
    expectedDecision: 'ALLOW',
    description: 'Direct permission on wallet-789 sub-collection grants read access.',
  },
  {
    id: 'scenario-4',
    name: 'Scenario 4: user789 — Write to Transaction Collection',
    user: 'user789',
    method: 'POST',
    path: '/wallets/wallet-789/transactions',
    expectedDecision: 'ALLOW',
    description: 'Wildcard pattern wallets/*/transactions/* matches collection-write.',
  },
  {
    id: 'scenario-5',
    name: 'Scenario 5: user456 — Write to Wallet Transactions',
    user: 'user456',
    method: 'POST',
    path: '/wallets/wallet-789/transactions',
    expectedDecision: 'DENY',
    description: 'user456 only has read access on transactions; write is denied.',
  },
];

export const ExampleScenarios: React.FC<ExampleScenariosProps> = ({
  onSelectScenario,
  activeScenarioId,
}) => {
  return (
    <div className="card" role="region" aria-label="Example Authorization Scenarios">
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
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          Assignment Scenarios
        </h3>
        <p className="card-subtitle">
          Click an example to prefill the HTTP method and resource path in the tester form.
        </p>
      </div>

      <div className="scenarios-container">
        {SCENARIOS.map((sc) => {
          const isSelected = activeScenarioId === sc.id;
          return (
            <button
              key={sc.id}
              type="button"
              className={`scenario-btn ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectScenario(sc)}
              aria-label={`Select ${sc.name}`}
            >
              <div className="scenario-left">
                <span className="scenario-tag">
                  {sc.user} &bull; {sc.method} {sc.path}
                </span>
                <span className="scenario-details">{sc.description}</span>
              </div>
              <span
                className={`expected-badge ${
                  sc.expectedDecision === 'ALLOW' ? 'badge-allow' : 'badge-deny'
                }`}
              >
                Expected: {sc.expectedDecision}
              </span>
            </button>
          );
        })}
      </div>

      <p className="scenarios-note">
        <strong>Note:</strong> Selecting an example prefills the request parameters. The real
        request is evaluated live by the backend, which requires a valid OAuth2 JWT corresponding to
        the specified user identity.
      </p>
    </div>
  );
};
