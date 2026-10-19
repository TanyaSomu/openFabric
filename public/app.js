/**
 * OpenFabric PDP Frontend Logic
 * Full interactive PDP client with token minting, live evaluation,
 * visual precedence scoring, and policy rule management.
 */

// Application State
const state = {
  personas: [],
  scenarios: [],
  permissions: [],
  selectedPersona: 'user123',
  selectedMethod: 'GET',
  selectedPath: '/transactions',
  tokenMode: 'valid',
  activeToken: '',
  activeDecodedToken: null,
  activeEvaluation: null,
};

// Method to Domain Action Mapping
const METHOD_ACTION_MAP = {
  GET: 'read',
  POST: 'write',
  PUT: 'write',
  PATCH: 'write',
  DELETE: 'delete',
};

// Initialize Application on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initMethodSelector();
  initPathPresets();
  initTokenModes();
  initEvaluationHandlers();
  initPermissionsManager();
  initAuditor();
  initClipboardHelpers();
  
  // Initial Data Fetch
  loadHealth();
  loadStats();
  loadPersonas();
  loadScenarios();
  loadPermissions();

  // Mint initial token for user123
  refreshActiveToken();

  // Periodic Health Polling
  setInterval(loadHealth, 10000);
});

/* ==========================================================================
   Navigation Tabs
   ========================================================================== */

function initTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.dataset.tab;
      
      // Update Tab Styles
      tabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      // Update Panels
      document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.remove('active');
      });
      const activePanel = document.getElementById(`panel-${targetId}`);
      if (activePanel) {
        activePanel.classList.add('active');
      }

      // If switching to Rules or Auditor, trigger a fresh fetch
      if (targetId === 'rules') {
        loadPermissions();
      }
    });
  });
}

/* ==========================================================================
   Health & Stats
   ========================================================================== */

async function loadHealth() {
  try {
    const res = await fetch('/health');
    if (res.ok) {
      const data = await res.json();
      const statusPill = document.getElementById('server-status-pill');
      const statusText = document.getElementById('server-status-text');
      if (statusPill && statusText) {
        statusPill.className = 'status-pill status-healthy';
        statusText.textContent = `PDP Online (${Math.round(data.uptime)}s)`;
      }
    }
  } catch (err) {
    const statusPill = document.getElementById('server-status-pill');
    const statusText = document.getElementById('server-status-text');
    if (statusPill && statusText) {
      statusPill.className = 'status-pill status-error';
      statusText.textContent = 'PDP Offline';
    }
  }
}

async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    if (res.ok) {
      const data = await res.json();
      const dbText = document.getElementById('db-status-text');
      if (dbText) {
        dbText.textContent = `SQLite WAL (${data.totalPermissions} rules)`;
      }
    }
  } catch (err) {
    console.warn('Failed to load stats', err);
  }
}

/* ==========================================================================
   Personas & Scenarios Loading
   ========================================================================== */

async function loadPersonas() {
  try {
    const res = await fetch('/api/personas');
    if (!res.ok) return;
    const data = await res.json();
    state.personas = data.personas;
    renderPersonas();
  } catch (err) {
    console.error('Failed to load personas', err);
  }
}

function renderPersonas() {
  const container = document.getElementById('personas-container');
  if (!container) return;
  container.innerHTML = '';

  state.personas.forEach(p => {
    const btn = document.createElement('div');
    btn.className = `persona-btn ${p.id === state.selectedPersona ? 'active' : ''}`;
    btn.id = `persona-btn-${p.id}`;
    btn.innerHTML = `
      <div class="persona-avatar">${p.avatar}</div>
      <div class="persona-name">${p.name.split(' ')[0]}</div>
      <div class="persona-role">${p.role}</div>
    `;

    btn.addEventListener('click', () => {
      document.querySelectorAll('.persona-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedPersona = p.id;
      
      const customUserInput = document.getElementById('custom-user-input');
      if (customUserInput) {
        customUserInput.value = p.id;
      }

      refreshActiveToken();
    });

    container.appendChild(btn);
  });
}

async function loadScenarios() {
  try {
    const res = await fetch('/api/scenarios');
    if (!res.ok) return;
    const data = await res.json();
    state.scenarios = data.scenarios;
    renderScenarios();
  } catch (err) {
    console.error('Failed to load scenarios', err);
  }
}

function renderScenarios() {
  const container = document.getElementById('scenarios-carousel');
  if (!container) return;
  container.innerHTML = '';

  state.scenarios.forEach(s => {
    const chip = document.createElement('div');
    chip.className = 'scenario-chip';
    chip.id = `scenario-chip-${s.id}`;
    
    const isAllow = s.expectedDecision === 'ALLOW';
    const badgeClass = isAllow ? 'badge-allow' : 'badge-deny';

    chip.innerHTML = `
      <div class="scenario-chip-top">
        <span class="scenario-tag">${s.scenarioNumber}</span>
        <span class="badge ${badgeClass}">${s.expectedDecision}</span>
      </div>
      <div class="scenario-req">${s.method} ${s.path}</div>
      <div class="scenario-expected text-muted">User: <code>${s.personaId}</code></div>
    `;

    chip.addEventListener('click', () => {
      document.querySelectorAll('.scenario-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      applyScenario(s);
    });

    container.appendChild(chip);
  });
}

function applyScenario(scenario) {
  // Set persona
  state.selectedPersona = scenario.personaId;
  const customUserInput = document.getElementById('custom-user-input');
  if (customUserInput) customUserInput.value = scenario.personaId;
  renderPersonas();

  // Set method
  selectMethod(scenario.method);

  // Set path
  const pathInput = document.getElementById('resource-path-input');
  if (pathInput) pathInput.value = scenario.path;
  state.selectedPath = scenario.path;

  // Set valid token mode
  const validRadio = document.getElementById('token-mode-valid');
  if (validRadio) validRadio.checked = true;
  state.tokenMode = 'valid';
  document.getElementById('custom-token-group').style.display = 'none';

  // Mint token and evaluate immediately
  refreshActiveToken().then(() => {
    evaluateAuthorization();
  });
}

/* ==========================================================================
   Method & Path Controls
   ========================================================================== */

function initMethodSelector() {
  const buttons = document.querySelectorAll('.method-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      selectMethod(btn.dataset.method);
    });
  });
}

function selectMethod(method) {
  state.selectedMethod = method;
  const buttons = document.querySelectorAll('.method-btn');
  buttons.forEach(btn => {
    if (btn.dataset.method === method) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  const actionLabel = document.getElementById('action-mapping-label');
  const action = METHOD_ACTION_MAP[method] || 'unknown';
  if (actionLabel) {
    actionLabel.innerHTML = `Maps to: <strong>${action}</strong>`;
  }

  updateCurlPreview();
}

function initPathPresets() {
  const chips = document.querySelectorAll('.preset-chip');
  const pathInput = document.getElementById('resource-path-input');

  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      if (pathInput) {
        pathInput.value = chip.dataset.path;
        state.selectedPath = chip.dataset.path;
        updateCurlPreview();
      }
    });
  });

  if (pathInput) {
    pathInput.addEventListener('input', (e) => {
      state.selectedPath = e.target.value;
      updateCurlPreview();
    });
  }

  const customUserInput = document.getElementById('custom-user-input');
  if (customUserInput) {
    customUserInput.addEventListener('input', (e) => {
      state.selectedPersona = e.target.value.trim();
      refreshActiveToken();
    });
  }
}

function initTokenModes() {
  const radios = document.querySelectorAll('input[name="token-mode"]');
  const customGroup = document.getElementById('custom-token-group');

  radios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      state.tokenMode = e.target.value;
      if (state.tokenMode === 'custom') {
        customGroup.style.display = 'block';
      } else {
        customGroup.style.display = 'none';
        refreshActiveToken();
      }
    });
  });

  const customTokenInput = document.getElementById('custom-token-input');
  if (customTokenInput) {
    customTokenInput.addEventListener('input', (e) => {
      state.activeToken = e.target.value.trim();
      updateCurlPreview();
      updateJwtInspector(state.activeToken);
    });
  }
}

/* ==========================================================================
   Token Minting & Management
   ========================================================================== */

async function refreshActiveToken() {
  if (state.tokenMode === 'custom') {
    return;
  }

  try {
    const userId = state.selectedPersona || 'user123';
    const expiresIn = state.tokenMode === 'expired' ? 'expired' : '2h';

    const res = await fetch('/api/tokens/mint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, expiresIn }),
    });

    if (res.ok) {
      const data = await res.json();
      let token = data.access_token;

      if (state.tokenMode === 'forged') {
        // Tamper with signature by changing last 6 chars
        token = token.slice(0, -6) + 'ABCDEF';
      }

      state.activeToken = token;
      state.activeDecodedToken = data.decoded;
      updateJwtInspector(token, data.decoded);
      updateCurlPreview();
    }
  } catch (err) {
    console.error('Token minting error', err);
  }
}

function updateJwtInspector(rawToken, decodedPayload) {
  const rawDisplay = document.getElementById('jwt-raw-display');
  const headerDisplay = document.getElementById('jwt-header-display');
  const payloadDisplay = document.getElementById('jwt-payload-display');

  if (!rawToken || !rawDisplay) return;

  const parts = rawToken.split('.');
  if (parts.length === 3) {
    rawDisplay.innerHTML = `
      <span class="jwt-part-header">${parts[0]}</span>.<span class="jwt-part-payload">${parts[1]}</span>.<span class="jwt-part-signature">${parts[2]}</span>
    `;

    try {
      const headerObj = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
      headerDisplay.textContent = JSON.stringify(headerObj, null, 2);
    } catch {
      headerDisplay.textContent = '{"alg": "RS256"}';
    }

    try {
      const payloadObj = decodedPayload || JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      payloadDisplay.textContent = JSON.stringify(payloadObj, null, 2);
    } catch {
      payloadDisplay.textContent = '{"error": "Failed to parse JWT payload"}';
    }
  } else {
    rawDisplay.textContent = rawToken;
    headerDisplay.textContent = '{"error": "Malformed JWT"}';
    payloadDisplay.textContent = '{"error": "Malformed JWT"}';
  }
}

/* ==========================================================================
   Authorization Evaluation (POST /authorize)
   ========================================================================== */

function initEvaluationHandlers() {
  const evalBtn = document.getElementById('btn-evaluate');
  if (evalBtn) {
    evalBtn.addEventListener('click', () => {
      evaluateAuthorization();
    });
  }
}

async function evaluateAuthorization() {
  const evalBtn = document.getElementById('btn-evaluate');
  const spinner = document.getElementById('eval-spinner');
  
  if (evalBtn) evalBtn.disabled = true;
  if (spinner) spinner.style.display = 'inline-block';

  const startTime = performance.now();
  const path = (document.getElementById('resource-path-input')?.value || '/transactions').trim();
  const method = state.selectedMethod;
  const token = state.activeToken;

  try {
    const res = await fetch('/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: token,
        method: method,
        path: path,
      }),
    });

    const elapsed = Math.round(performance.now() - startTime);
    const json = await res.json();

    renderEvaluationResult(res.status, json, elapsed, method, path);
  } catch (err) {
    const elapsed = Math.round(performance.now() - startTime);
    renderEvaluationResult(500, { error: 'Network Error', message: String(err) }, elapsed, method, path);
  } finally {
    if (evalBtn) evalBtn.disabled = false;
    if (spinner) spinner.style.display = 'none';
  }
}

function renderEvaluationResult(statusCode, data, elapsed, method, path) {
  const badge = document.getElementById('decision-badge');
  const icon = document.getElementById('decision-icon');
  const text = document.getElementById('decision-text');
  const userIdMeta = document.getElementById('result-user-id');
  const actionMeta = document.getElementById('result-action');
  const pathMeta = document.getElementById('result-path');
  const latencyMeta = document.getElementById('result-latency');
  const reasonText = document.getElementById('decision-reason-text');
  const jsonOutput = document.getElementById('json-output');

  if (latencyMeta) latencyMeta.textContent = `${elapsed} ms`;
  if (pathMeta) pathMeta.textContent = path.replace(/^\/+|\/+$/g, '') || '/';
  if (actionMeta) actionMeta.textContent = METHOD_ACTION_MAP[method] || method;

  // JSON block
  if (jsonOutput) jsonOutput.textContent = JSON.stringify(data, null, 2);

  if (statusCode === 200 && data.decision) {
    userIdMeta.textContent = data.user_id || state.selectedPersona;
    reasonText.textContent = data.reason || 'Decision computed by policy engine.';

    badge.className = 'decision-badge';
    if (data.decision === 'ALLOW') {
      badge.classList.add('decision-allow');
      icon.textContent = '✅';
      text.textContent = 'ALLOW';
    } else {
      badge.classList.add('decision-deny');
      icon.textContent = '⛔';
      text.textContent = 'DENY';
    }

    renderPrecedenceBreakdown(data, path, method);
  } else {
    // Error Response (400, 401, 500, 503)
    badge.className = 'decision-badge decision-error';
    icon.textContent = '⚠️';
    text.textContent = `HTTP ${statusCode}`;
    userIdMeta.textContent = 'N/A';
    reasonText.textContent = data.message || data.error || 'Request evaluation failed';
    
    const tbody = document.getElementById('matched-rules-tbody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center text-muted" style="color: var(--deny-red);">
            Evaluation aborted: HTTP ${statusCode} - ${data.message || data.error}
          </td>
        </tr>
      `;
    }
  }
}

/* ==========================================================================
   Precedence & Specificity Breakdown
   ========================================================================== */

function calculateSpecificity(pattern) {
  if (pattern === '*') return 0;
  const segments = pattern.split('/');
  let score = 0;
  for (const seg of segments) {
    if (seg === '*') score += 1;
    else score += 10;
  }
  return score;
}

function renderPrecedenceBreakdown(data, path, method) {
  const tbody = document.getElementById('matched-rules-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const matched = data.matched_permissions || [];
  if (matched.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td><span class="badge badge-deny">NO MATCH</span></td>
        <td class="font-mono">--</td>
        <td>${METHOD_ACTION_MAP[method] || method}</td>
        <td>--</td>
        <td class="font-mono">--</td>
        <td><strong>Default-Deny Posture:</strong> No rules matched target path. Closed boundary enforced.</td>
      </tr>
    `;
    return;
  }

  // Calculate scores
  const scoredRules = matched.map(m => {
    return {
      ...m,
      score: calculateSpecificity(m.resource),
    };
  });

  const maxScore = Math.max(...scoredRules.map(r => r.score));

  scoredRules.forEach(rule => {
    const isWinner = rule.score === maxScore && (data.decision === 'DENY' ? rule.effect === 'deny' : true);
    const row = document.createElement('tr');

    let statusHtml = isWinner
      ? `<span class="badge badge-winner">WINNER</span>`
      : `<span class="badge badge-indigo">EVALUATED</span>`;

    let precedenceExplanation = '';
    if (rule.score === maxScore) {
      if (rule.effect === 'deny' && data.decision === 'DENY') {
        precedenceExplanation = 'Highest specificity rule with DENY effect (Deny beats Allow).';
      } else if (rule.effect === 'allow' && data.decision === 'ALLOW') {
        precedenceExplanation = 'Highest specificity rule with ALLOW effect.';
      }
    } else {
      precedenceExplanation = `Overridden by more specific rule (Score ${maxScore} > ${rule.score}).`;
    }

    row.innerHTML = `
      <td>${statusHtml}</td>
      <td><code>${rule.resource}</code></td>
      <td><code>${rule.action}</code></td>
      <td><span class="badge ${rule.effect === 'allow' ? 'badge-allow' : 'badge-deny'}">${rule.effect.toUpperCase()}</span></td>
      <td><strong class="font-mono">${rule.score} pts</strong></td>
      <td>${precedenceExplanation}</td>
    `;

    tbody.appendChild(row);
  });
}

function updateCurlPreview() {
  const curlBox = document.getElementById('curl-output');
  if (!curlBox) return;

  const path = (document.getElementById('resource-path-input')?.value || '/transactions').trim();
  const method = state.selectedMethod;
  const token = state.activeToken || 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...';

  curlBox.textContent = `curl -i -X POST http://localhost:8080/authorize \\
  -H "Content-Type: application/json" \\
  -d '{
    "access_token": "${token}",
    "method": "${method}",
    "path": "${path}"
  }'`;
}

/* ==========================================================================
   Permissions Policy Manager
   ========================================================================== */

function initPermissionsManager() {
  const addBtn = document.getElementById('btn-open-add-rule');
  const modal = document.getElementById('add-rule-modal');
  const closeBtn = document.getElementById('modal-close-btn');
  const cancelBtn = document.getElementById('modal-cancel-btn');
  const form = document.getElementById('add-rule-form');
  const resetBtn = document.getElementById('btn-reset-rules');

  const filterUser = document.getElementById('filter-user-input');
  const filterAction = document.getElementById('filter-action-select');
  const filterEffect = document.getElementById('filter-effect-select');
  const clearFilters = document.getElementById('btn-clear-filters');

  if (addBtn && modal) {
    addBtn.addEventListener('click', () => { modal.style.display = 'flex'; });
  }
  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
  }
  if (cancelBtn && modal) {
    cancelBtn.addEventListener('click', () => { modal.style.display = 'none'; });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const user_id = document.getElementById('new-rule-user')?.value;
      const action = document.getElementById('new-rule-action')?.value;
      const resource = document.getElementById('new-rule-resource')?.value;
      const effect = document.getElementById('new-rule-effect')?.value;

      try {
        const res = await fetch('/api/permissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id, action, resource, effect }),
        });

        if (res.ok) {
          showToast('Permission rule created successfully!');
          modal.style.display = 'none';
          form.reset();
          loadPermissions();
          loadStats();
        } else {
          const err = await res.json();
          alert(`Failed: ${err.error || 'Unknown error'}`);
        }
      } catch (err) {
        alert(`Error: ${err}`);
      }
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      if (confirm('Reset SQLite permissions to default assignment seed data?')) {
        try {
          const res = await fetch('/api/permissions/reset', { method: 'POST' });
          if (res.ok) {
            showToast('Permissions reset to 11 seed rules.');
            loadPermissions();
            loadStats();
          }
        } catch (err) {
          console.error(err);
        }
      }
    });
  }

  const applyFilters = () => renderPermissionsTable();
  if (filterUser) filterUser.addEventListener('input', applyFilters);
  if (filterAction) filterAction.addEventListener('change', applyFilters);
  if (filterEffect) filterEffect.addEventListener('change', applyFilters);
  if (clearFilters) {
    clearFilters.addEventListener('click', () => {
      if (filterUser) filterUser.value = '';
      if (filterAction) filterAction.value = '';
      if (filterEffect) filterEffect.value = '';
      renderPermissionsTable();
    });
  }
}

async function loadPermissions() {
  try {
    const res = await fetch('/api/permissions');
    if (res.ok) {
      const data = await res.json();
      state.permissions = data.permissions;
      renderPermissionsTable();
    }
  } catch (err) {
    console.error('Failed to load permissions', err);
  }
}

function renderPermissionsTable() {
  const tbody = document.getElementById('permissions-table-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const filterUser = (document.getElementById('filter-user-input')?.value || '').toLowerCase().trim();
  const filterAction = document.getElementById('filter-action-select')?.value || '';
  const filterEffect = document.getElementById('filter-effect-select')?.value || '';

  const filtered = state.permissions.filter(p => {
    if (filterUser && !p.user_id.toLowerCase().includes(filterUser)) return false;
    if (filterAction && p.action !== filterAction) return false;
    if (filterEffect && p.effect !== filterEffect) return false;
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No permission rules match criteria</td></tr>`;
    return;
  }

  filtered.forEach(p => {
    const tr = document.createElement('tr');
    const score = calculateSpecificity(p.resource);
    tr.innerHTML = `
      <td class="font-mono text-muted">#${p.id}</td>
      <td><strong>${p.user_id}</strong></td>
      <td><code>${p.action}</code></td>
      <td><code>${p.resource}</code></td>
      <td><span class="badge ${p.effect === 'allow' ? 'badge-allow' : 'badge-deny'}">${p.effect.toUpperCase()}</span></td>
      <td class="font-mono">${score} pts</td>
      <td>
        <button type="button" class="btn btn-sm btn-ghost" style="color: var(--deny-red);" onclick="deletePermission(${p.id})">
          ✕ Delete
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.deletePermission = async function(id) {
  if (confirm(`Delete permission rule #${id}?`)) {
    try {
      const res = await fetch(`/api/permissions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast(`Rule #${id} deleted`);
        loadPermissions();
        loadStats();
      }
    } catch (err) {
      alert(`Error deleting rule: ${err}`);
    }
  }
};

/* ==========================================================================
   Automated Scenario Auditor
   ========================================================================== */

function initAuditor() {
  const runBtn = document.getElementById('btn-run-audit');
  if (runBtn) {
    runBtn.addEventListener('click', runAudit);
  }
}

async function runAudit() {
  const runBtn = document.getElementById('btn-run-audit');
  const tbody = document.getElementById('auditor-table-tbody');
  const statusBadge = document.getElementById('audit-status-badge');
  const passCount = document.getElementById('audit-pass-count');
  const totalTime = document.getElementById('audit-total-time');

  if (runBtn) runBtn.disabled = true;
  if (statusBadge) {
    statusBadge.textContent = 'RUNNING...';
    statusBadge.className = 'summary-value text-indigo';
  }
  if (tbody) tbody.innerHTML = '';

  let passed = 0;
  const auditStart = performance.now();

  for (let i = 0; i < state.scenarios.length; i++) {
    const sc = state.scenarios[i];
    const itemStart = performance.now();

    // Mint token for this persona
    const tokenRes = await fetch('/api/tokens/mint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: sc.personaId }),
    });
    const tokenData = await tokenRes.json();

    // Call authorize
    const authRes = await fetch('/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: tokenData.access_token,
        method: sc.method,
        path: sc.path,
      }),
    });

    const elapsed = Math.round(performance.now() - itemStart);
    const authData = await authRes.json();
    const actualDecision = authData.decision || 'ERROR';
    const isPass = actualDecision === sc.expectedDecision;

    if (isPass) passed++;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${sc.scenarioNumber}</strong></td>
      <td class="font-mono"><code>${sc.personaId}</code> ${sc.method} ${sc.path}</td>
      <td><span class="badge ${sc.expectedDecision === 'ALLOW' ? 'badge-allow' : 'badge-deny'}">${sc.expectedDecision}</span></td>
      <td><span class="badge ${actualDecision === 'ALLOW' ? 'badge-allow' : 'badge-deny'}">${actualDecision}</span></td>
      <td class="font-mono">${elapsed} ms</td>
      <td>${sc.rationale}</td>
      <td>
        <span class="badge ${isPass ? 'badge-allow' : 'badge-deny'}">
          ${isPass ? '✓ PASS' : '✗ FAIL'}
        </span>
      </td>
    `;
    if (tbody) tbody.appendChild(tr);

    if (passCount) passCount.textContent = `${passed} / ${state.scenarios.length}`;
  }

  const auditElapsed = Math.round(performance.now() - auditStart);
  if (totalTime) totalTime.textContent = `${auditElapsed} ms`;

  if (statusBadge) {
    if (passed === state.scenarios.length) {
      statusBadge.textContent = 'ALL PASSED';
      statusBadge.style.color = 'var(--allow-green)';
    } else {
      statusBadge.textContent = 'FAILURES';
      statusBadge.style.color = 'var(--deny-red)';
    }
  }

  if (runBtn) runBtn.disabled = false;
  showToast(`Compliance Audit completed: ${passed}/${state.scenarios.length} passed.`);
}

/* ==========================================================================
   Clipboard Helpers & Toasts
   ========================================================================== */

function initClipboardHelpers() {
  const copyCurl = document.getElementById('btn-copy-curl');
  const copyJson = document.getElementById('btn-copy-json');
  const copyToken = document.getElementById('btn-copy-token');

  if (copyCurl) {
    copyCurl.addEventListener('click', () => {
      const text = document.getElementById('curl-output')?.textContent || '';
      navigator.clipboard.writeText(text);
      showToast('cURL command copied to clipboard!');
    });
  }

  if (copyJson) {
    copyJson.addEventListener('click', () => {
      const text = document.getElementById('json-output')?.textContent || '';
      navigator.clipboard.writeText(text);
      showToast('JSON response copied to clipboard!');
    });
  }

  if (copyToken) {
    copyToken.addEventListener('click', () => {
      navigator.clipboard.writeText(state.activeToken);
      showToast('Active access token copied!');
    });
  }
}

function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>ℹ️</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}
