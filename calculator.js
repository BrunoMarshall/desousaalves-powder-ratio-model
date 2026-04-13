/**
 * Interactive Calculator Interface v2.0
 * Adds: operator login, history recording, data-driven π(0)
 */

const API_BASE = 'https://api.desousaalves-powder-ratio-model.com';

const machineConfigs = {
    'formlabs-fuse1-30w': { name: 'Formlabs Fuse 1+ 30W', chamberVolume: 8.17,  packingDensity: 29, type: 'Desktop'    },
    'eos-p770':           { name: 'EOS P770',               chamberVolume: 154,   packingDensity: 10, type: 'Industrial' },
    'eos-p396':           { name: 'EOS P396',               chamberVolume: 89,    packingDensity: 11, type: 'Industrial' },
    '3dsystems-spro60':   { name: '3D Systems sPro 60',     chamberVolume: 68,    packingDensity: 12, type: 'Industrial' },
    'hp-mjf5200':         { name: 'HP Multi Jet Fusion 5200', chamberVolume: 116, packingDensity: 13, type: 'Industrial' },
};

const model = new MarkovPowderModel();

// ── State ─────────────────────────────────────────────────────────────────────
let authToken   = localStorage.getItem('sls_token')  || null;
let operatorInfo = JSON.parse(localStorage.getItem('sls_operator') || 'null');
let lastResults  = null;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const machineSelect        = document.getElementById('machine-select');
const packingDensityInput  = document.getElementById('packing-density');
const chamberVolumeInput   = document.getElementById('chamber-volume');
const qualityThresholdInput = document.getElementById('quality-threshold');
const degradedLimitInput   = document.getElementById('degraded-limit');
const powderCostInput      = document.getElementById('powder-cost');
const buildsPerYearInput   = document.getElementById('builds-per-year');
const calculateBtn         = document.getElementById('calculate-btn');
const resultsContent       = document.getElementById('results-content');

// Auth panel elements (injected below)
let authPanel, loginStatus;

// ── Auth panel injection ──────────────────────────────────────────────────────
function injectAuthPanel() {
    const calcSection = document.getElementById('calculator');
    const panel = document.createElement('div');
    panel.id = 'auth-panel';
    panel.style.cssText = 'background:#f8f9fa;border:1px solid #dee2e6;border-radius:6px;padding:1.2rem 1.5rem;margin-bottom:1.5rem;';
    panel.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
          <div>
            <strong style="color:#1a4d7a;">Data-Driven Mode</strong>
            <p style="margin:0.25rem 0 0;font-size:0.9rem;color:#555;">
              Log in to use your build history for a data-driven initial state π(0)
              rather than the standard virgin assumption.
            </p>
          </div>
          <div id="auth-controls" style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;"></div>
        </div>
        <div id="login-status" style="margin-top:0.75rem;font-size:0.9rem;"></div>
        <div id="login-form" style="display:none;margin-top:1rem;display:none;">
          <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:0.5rem;align-items:end;">
            <div>
              <label style="font-size:0.85rem;font-weight:600;display:block;margin-bottom:0.25rem;">Username</label>
              <input id="login-username" type="text" placeholder="username" style="width:100%;padding:0.5rem;border:1px solid #dee2e6;border-radius:4px;">
            </div>
            <div>
              <label style="font-size:0.85rem;font-weight:600;display:block;margin-bottom:0.25rem;">Password</label>
              <input id="login-password" type="password" placeholder="password" style="width:100%;padding:0.5rem;border:1px solid #dee2e6;border-radius:4px;">
            </div>
            <button id="do-login-btn" style="padding:0.5rem 1rem;background:#1a4d7a;color:white;border:none;border-radius:4px;cursor:pointer;">Sign in</button>
          </div>
          <p id="login-error" style="color:#e74c3c;font-size:0.85rem;margin-top:0.5rem;display:none;"></p>
        </div>
    `;
    const h2 = calcSection.querySelector('h2');
    calcSection.insertBefore(panel, h2.nextSibling);

    authPanel    = panel;
    loginStatus  = document.getElementById('login-status');

    document.getElementById('do-login-btn').addEventListener('click', doLogin);
    document.getElementById('login-password').addEventListener('keydown', e => {
        if (e.key === 'Enter') doLogin();
    });

    renderAuthState();
}

function renderAuthState() {
    const controls = document.getElementById('auth-controls');
    const form     = document.getElementById('login-form');

    if (authToken && operatorInfo) {
        controls.innerHTML = `
            <span style="font-size:0.9rem;color:#27ae60;">● Logged in as <strong>${operatorInfo.username}</strong></span>
            <button onclick="doLogout()" style="padding:0.4rem 0.8rem;font-size:0.85rem;border:1px solid #dee2e6;border-radius:4px;cursor:pointer;background:white;">Sign out</button>
        `;
        form.style.display = 'none';
        loadHistoryBadge();
    } else {
        controls.innerHTML = `
            <button onclick="toggleLoginForm()" style="padding:0.4rem 0.9rem;font-size:0.9rem;background:#1a4d7a;color:white;border:none;border-radius:4px;cursor:pointer;">Sign in / Register</button>
        `;
        form.style.display = 'none';
        if (loginStatus) loginStatus.textContent = '';
    }
}

function toggleLoginForm() {
    const form = document.getElementById('login-form');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

async function doLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl    = document.getElementById('login-error');
    errEl.style.display = 'none';

    if (!username || !password) {
        errEl.textContent = 'Please enter username and password.';
        errEl.style.display = 'block';
        return;
    }

    try {
        // Try login first; if 401, auto-register new operator
        let res = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });

        if (res.status === 401) {
            // New user — register automatically
            const regRes = await fetch(`${API_BASE}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            if (!regRes.ok) {
                const d = await regRes.json();
                throw new Error(d.error || 'Registration failed');
            }
            // Now login
            res = await fetch(`${API_BASE}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
        }

        if (!res.ok) {
            const d = await res.json();
            throw new Error(d.error || 'Login failed');
        }

        const data = await res.json();
        authToken    = data.token;
        operatorInfo = data.operator;
        localStorage.setItem('sls_token',    authToken);
        localStorage.setItem('sls_operator', JSON.stringify(operatorInfo));
        renderAuthState();

    } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
    }
}

function doLogout() {
    authToken    = null;
    operatorInfo = null;
    localStorage.removeItem('sls_token');
    localStorage.removeItem('sls_operator');
    model.pi0       = [1.0, 0.0, 0.0, 0.0, 0.0];
    model.pi0Source = 'assumed_virgin';
    renderAuthState();
}

async function loadHistoryBadge() {
    if (!authToken || !operatorInfo) return;
    const mid = operatorInfo.machine_id;
    if (!mid) {
        loginStatus.innerHTML = `<span style="color:#f39c12;">⚠ No machine linked to your account yet. Results will use virgin initial state assumption.</span>`;
        return;
    }

    loginStatus.textContent = 'Loading build history…';
    const data = await model.loadHistoricalState(API_BASE, authToken, mid);

    if (data && data.source === 'empirical_history') {
        const pct = data.pi0.map((v, i) => `${['S₀','S₁','S₂','S₃','S₄'][i]}:${(v*100).toFixed(1)}%`).join(' · ');
        loginStatus.innerHTML = `
            <span style="color:#27ae60;">✓ Initial state π(0) loaded from <strong>${data.runs_used} recorded builds</strong>.</span>
            <span style="color:#555;margin-left:0.75rem;font-size:0.85rem;">${pct}</span>
        `;
    } else {
        loginStatus.innerHTML = `<span style="color:#555;">No build history yet — using virgin initial state assumption for first run.</span>`;
    }
}

// ── Machine selection ─────────────────────────────────────────────────────────
machineSelect.addEventListener('change', () => {
    const cfg = machineConfigs[machineSelect.value];
    if (cfg) {
        packingDensityInput.value = cfg.packingDensity;
        chamberVolumeInput.value  = cfg.chamberVolume;
    }
});

// ── Calculate ─────────────────────────────────────────────────────────────────
calculateBtn.addEventListener('click', runOptimization);

async function runOptimization() {
    const packingDensity    = parseFloat(packingDensityInput.value)    / 100;
    const chamberVolume     = parseFloat(chamberVolumeInput.value);
    const qualityThreshold  = parseFloat(qualityThresholdInput.value)  / 100;
    const degradedLimit     = parseFloat(degradedLimitInput.value)     / 100;
    const powderCost        = parseFloat(powderCostInput.value);
    const buildsPerYear     = parseInt(buildsPerYearInput.value);

    const errors = model.validateParameters(packingDensity, qualityThreshold, degradedLimit);
    if (errors.length > 0) { displayErrors(errors); return; }

    calculateBtn.disabled    = true;
    calculateBtn.textContent = 'Calculating…';

    setTimeout(async () => {
        try {
            const results   = model.optimizeVirginRatio(packingDensity, qualityThreshold, degradedLimit);
            const economics = model.calculateEconomics(chamberVolume, packingDensity, buildsPerYear, powderCost, results.alphaOptimal);
            lastResults = { results, economics, packingDensity, chamberVolume, qualityThreshold, degradedLimit, powderCost, buildsPerYear };
            displayResults(results, economics, lastResults);

            // Auto-save run to server if logged in
            if (authToken) {
                await saveRun(packingDensity, results.alphaOptimal, chamberVolume, results.quality, results.degradedFraction);
            }
        } catch (err) {
            displayError('Calculation error: ' + err.message);
        } finally {
            calculateBtn.disabled    = false;
            calculateBtn.textContent = 'Calculate Optimal Ratio';
        }
    }, 80);
}

async function saveRun(packingDensity, alphaOptimal, chamberVol, qualityResult, degradedFrac) {
    try {
        await fetch(`${API_BASE}/api/runs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({
                packing_density: packingDensity,
                alpha_optimal:   alphaOptimal,
                chamber_vol:     chamberVol,
                quality_result:  qualityResult,
                degraded_frac:   degradedFrac,
                machine_id:      operatorInfo?.machine_id,
            }),
        });
        // Refresh pi0 badge after saving
        setTimeout(() => loadHistoryBadge(), 500);
    } catch (e) {
        console.warn('Could not save run to server:', e.message);
    }
}

// ── Display ───────────────────────────────────────────────────────────────────
function displayResults(results, economics, inputs) {
    const { alphaOptimal, piStock, quality, degradedFraction, pi0Source, pi0RunsUsed } = results;

    // Data-driven badge
    const sourceBadge = pi0Source === 'empirical_history'
        ? `<span style="display:inline-block;background:#e8f5e9;color:#27ae60;border-radius:4px;padding:2px 8px;font-size:0.8rem;font-weight:600;margin-left:0.5rem;">Data-driven (${pi0RunsUsed} builds)</span>`
        : `<span style="display:inline-block;background:#fff3cd;color:#856404;border-radius:4px;padding:2px 8px;font-size:0.8rem;">Virgin assumption</span>`;

    let html = `
        <div class="result-item">
            <h4>Optimal Virgin Powder Ratio ${sourceBadge}</h4>
            <div class="result-value">${(alphaOptimal * 100).toFixed(1)}%</div>
            <div class="result-label">Virgin : ${((1 - alphaOptimal) * 100).toFixed(1)}% Aged</div>
        </div>

        <div class="result-item">
            <h4>Quality Index</h4>
            <div class="result-value">${quality.toFixed(3)}</div>
            <div class="result-label">
                Threshold: ${inputs.qualityThreshold.toFixed(2)}
                <span style="color:${quality >= inputs.qualityThreshold ? '#27ae60' : '#e74c3c'}">
                    (${quality >= inputs.qualityThreshold ? '✓ Pass' : '✗ Fail'})
                </span>
            </div>
        </div>

        <div class="result-item">
            <h4>Degraded Powder Fraction (S₄)</h4>
            <div class="result-value">${(degradedFraction * 100).toFixed(1)}%</div>
            <div class="result-label">
                Limit: ${(inputs.degradedLimit * 100).toFixed(0)}%
                <span style="color:${degradedFraction <= inputs.degradedLimit ? '#27ae60' : '#e74c3c'}">
                    (${degradedFraction <= inputs.degradedLimit ? '✓ Pass' : '✗ Fail'})
                </span>
            </div>
        </div>

        <div class="state-distribution">
            <h4>Steady-State Powder Distribution</h4>
    `;

    piStock.forEach((frac, i) => {
        const pct = (frac * 100).toFixed(1);
        html += `
            <div class="state-bar">
                <div class="state-label">
                    <span>${model.stateNames[i]}</span><span>${pct}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width:${pct}%"></div>
                </div>
            </div>
        `;
    });

    html += `</div>
        <div class="result-item" style="margin-top:1.5rem;">
            <h4>Economic Analysis</h4>
            <table class="comparison-table">
                <thead><tr><th>Strategy</th><th>Virgin Ratio</th><th>Annual Cost</th><th>Savings</th></tr></thead>
                <tbody>
                    <tr style="background:#f0fff4;">
                        <td><strong>Optimized (This Model)</strong></td>
                        <td>${(economics.optimal.alpha * 100).toFixed(1)}%</td>
                        <td>€${economics.optimal.annualCost.toFixed(0)}</td>
                        <td>—</td>
                    </tr>
                    <tr>
                        <td>Formlabs Guideline (30:70)</td>
                        <td>30.0%</td>
                        <td>€${economics.formlabs30.annualCost.toFixed(0)}</td>
                        <td class="savings-highlight">${economics.savingsVsFormlabs.cost >= 0 ? '+' : ''}€${economics.savingsVsFormlabs.cost.toFixed(0)} (${economics.savingsVsFormlabs.percentage.toFixed(1)}%)</td>
                    </tr>
                    <tr>
                        <td>Industrial Practice (50:50)</td>
                        <td>50.0%</td>
                        <td>€${economics.industrial50.annualCost.toFixed(0)}</td>
                        <td class="savings-highlight">+€${economics.savingsVsIndustrial.cost.toFixed(0)} (${economics.savingsVsIndustrial.percentage.toFixed(1)}%)</td>
                    </tr>
                </tbody>
            </table>
            <p style="margin-top:1rem;font-size:0.9rem;color:#555;">
                <strong>Annual Virgin Consumption:</strong> ${economics.optimal.annualMass.toFixed(0)} kg
                (${inputs.buildsPerYear} builds/year × ${inputs.chamberVolume} L chamber)
            </p>
        </div>
    `;

    if (Math.abs(alphaOptimal - inputs.packingDensity) < 0.02) {
        html += `
            <div class="result-item" style="background:#f0f7ff;border-left-color:#1a4d7a;">
                <h4>⚠ Sustainability Constraint Active</h4>
                <p style="margin:0;font-size:0.95rem;">
                    The optimal ratio equals the packing density (α<sub>opt</sub> = ρ<sub>pack</sub>),
                    confirming <strong>Theorem 1</strong>. This is the minimum sustainable virgin ratio
                    for continuous operation. Quality requirements are satisfied at this minimum threshold.
                </p>
            </div>
        `;
    }

    resultsContent.innerHTML = html;
}

function displayErrors(errors) {
    resultsContent.innerHTML = `<div style="color:#e74c3c;padding:1rem;background:#fee;border-radius:4px;"><h4 style="margin-top:0;">Input Validation Errors:</h4><ul>${errors.map(e => `<li>${e}</li>`).join('')}</ul></div>`;
}

function displayError(msg) {
    resultsContent.innerHTML = `<div style="color:#e74c3c;padding:1rem;background:#fee;border-radius:4px;"><strong>Error:</strong> ${msg}</div>`;
}

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('load', () => {
    injectAuthPanel();
});
