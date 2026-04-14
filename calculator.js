/**
 * Interactive Calculator Interface v3.1
 * - Machine-isolated powder history (Fuse runs never mix with EOS runs)
 * - Machine selector in login/register modal
 * - History panel shows only the logged-in operator's machine runs
 * - π(0) computed exclusively from the current machine's history
 */

const API_BASE = 'https://api.desousaalves-powder-ratio-model.com';

// Machine list — order matches DB ids (1-5)
const MACHINES = [
    { id: 1, key: 'formlabs-fuse1-30w', name: 'Formlabs Fuse 1+ 30W',      chamberVolume: 8.17,  packingDensity: 29 },
    { id: 2, key: 'eos-p770',           name: 'EOS P770',                   chamberVolume: 154,   packingDensity: 10 },
    { id: 3, key: 'eos-p396',           name: 'EOS P396',                   chamberVolume: 89,    packingDensity: 11 },
    { id: 4, key: '3dsystems-spro60',   name: '3D Systems sPro 60',         chamberVolume: 68,    packingDensity: 12 },
    { id: 5, key: 'hp-mjf5200',         name: 'HP Multi Jet Fusion 5200',   chamberVolume: 116,   packingDensity: 13 },
];

function getMachineById(id)  { return MACHINES.find(m => m.id  === parseInt(id)) || null; }
function getMachineByKey(key){ return MACHINES.find(m => m.key === key)           || null; }

const model = new MarkovPowderModel();

// ── State ─────────────────────────────────────────────────────────────────────
let authToken    = localStorage.getItem('sls_token')    || null;
let operatorInfo = JSON.parse(localStorage.getItem('sls_operator') || 'null');
let buildHistory = [];

// ── DOM refs ──────────────────────────────────────────────────────────────────
const machineSelect         = document.getElementById('machine-select');
const packingDensityInput   = document.getElementById('packing-density');
const chamberVolumeInput    = document.getElementById('chamber-volume');
const qualityThresholdInput = document.getElementById('quality-threshold');
const degradedLimitInput    = document.getElementById('degraded-limit');
const powderCostInput       = document.getElementById('powder-cost');
const buildsPerYearInput    = document.getElementById('builds-per-year');
const calculateBtn          = document.getElementById('calculate-btn');
const resultsContent        = document.getElementById('results-content');

// ── Helper: current machine from operator or UI selector ──────────────────────
function currentMachineId() {
    if (authToken && operatorInfo?.machine_id) return operatorInfo.machine_id;
    // Fall back to whatever is selected in the calculator UI
    const m = getMachineByKey(machineSelect.value);
    return m ? m.id : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN MODAL
// ═══════════════════════════════════════════════════════════════════════════════

function injectHeaderLogin() {
    const nav = document.querySelector('header nav');
    if (!nav) return;

    // Nav link
    const loginLink = document.createElement('a');
    loginLink.id = 'nav-login-btn';
    loginLink.href = '#';
    loginLink.style.cssText = 'font-weight:600;color:#f0a500;';
    loginLink.addEventListener('click', e => { e.preventDefault(); toggleLoginModal(); });
    nav.appendChild(loginLink);

    // Machine options HTML
    const machineOptions = MACHINES.map(m =>
        `<option value="${m.id}">${m.name}</option>`
    ).join('');

    // Modal
    const modal = document.createElement('div');
    modal.id = 'login-modal';
    modal.style.cssText = `
        display:none;position:fixed;top:0;left:0;width:100%;height:100%;
        background:rgba(0,0,0,0.55);z-index:9999;
        align-items:center;justify-content:center;
    `;
    modal.innerHTML = `
        <div style="background:#fff;border-radius:10px;padding:2rem;width:100%;max-width:400px;
                    box-shadow:0 20px 60px rgba(0,0,0,0.3);position:relative;">

            <button onclick="toggleLoginModal()" style="position:absolute;top:1rem;right:1rem;
                background:none;border:none;font-size:1.4rem;cursor:pointer;color:#888;line-height:1;">×</button>

            <h3 style="margin:0 0 0.2rem;color:#1a4d7a;font-size:1.3rem;">Data-Driven Mode</h3>
            <p style="margin:0 0 1.4rem;font-size:0.87rem;color:#666;">
                Each machine keeps its own powder history. π(0) is computed only
                from builds on <em>your</em> machine — never mixed with other machines.
            </p>

            <!-- ── Login / Register form ── -->
            <div id="login-form-inner">
                <div style="margin-bottom:0.7rem;">
                    <label style="font-size:0.84rem;font-weight:600;display:block;margin-bottom:0.3rem;color:#333;">Username</label>
                    <input id="login-username" type="text" placeholder="your username"
                        style="width:100%;box-sizing:border-box;padding:0.6rem 0.75rem;
                               border:1px solid #ddd;border-radius:6px;font-size:0.95rem;outline:none;">
                </div>
                <div style="margin-bottom:0.7rem;">
                    <label style="font-size:0.84rem;font-weight:600;display:block;margin-bottom:0.3rem;color:#333;">Password</label>
                    <input id="login-password" type="password" placeholder="password (min 8 chars)"
                        style="width:100%;box-sizing:border-box;padding:0.6rem 0.75rem;
                               border:1px solid #ddd;border-radius:6px;font-size:0.95rem;outline:none;">
                </div>
                <div style="margin-bottom:1rem;">
                    <label style="font-size:0.84rem;font-weight:600;display:block;margin-bottom:0.3rem;color:#333;">
                        Your SLS Machine
                        <span style="font-weight:400;color:#888;font-size:0.8rem;">(new users — choose your machine)</span>
                    </label>
                    <select id="login-machine"
                        style="width:100%;box-sizing:border-box;padding:0.6rem 0.75rem;
                               border:1px solid #ddd;border-radius:6px;font-size:0.92rem;outline:none;background:#fff;">
                        ${machineOptions}
                    </select>
                    <p style="margin:0.3rem 0 0;font-size:0.78rem;color:#aaa;">
                        Existing users: your machine is already stored — this field is ignored on login.
                    </p>
                </div>
                <p id="login-error" style="color:#e74c3c;font-size:0.85rem;margin:0 0 0.7rem;display:none;"></p>
                <button id="do-login-btn"
                    style="width:100%;padding:0.72rem;background:#1a4d7a;color:white;border:none;
                           border-radius:6px;font-size:1rem;font-weight:600;cursor:pointer;">
                    Sign In / Register
                </button>
                <p style="font-size:0.78rem;color:#aaa;text-align:center;margin:0.6rem 0 0;">
                    New users are registered automatically with the selected machine.
                </p>
            </div>

            <!-- ── Logged-in state ── -->
            <div id="logged-in-inner" style="display:none;text-align:center;">
                <div style="font-size:2.2rem;margin-bottom:0.4rem;">✓</div>
                <p id="modal-welcome"      style="color:#27ae60;font-weight:600;font-size:1.05rem;margin:0 0 0.2rem;"></p>
                <p id="modal-machine-name" style="color:#1a4d7a;font-size:0.92rem;font-weight:600;margin:0 0 0.2rem;"></p>
                <p id="modal-machine-note" style="color:#888;font-size:0.82rem;margin:0 0 1.4rem;">
                    History &amp; π(0) are isolated to this machine only.
                </p>
                <button onclick="doLogout()" style="padding:0.55rem 1.4rem;border:1px solid #ddd;
                    border-radius:6px;background:white;cursor:pointer;font-size:0.9rem;color:#555;">
                    Sign Out
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) toggleLoginModal(); });

    // Pre-select the machine that matches the calculator dropdown
    syncLoginMachineDropdown();
    machineSelect.addEventListener('change', syncLoginMachineDropdown);

    document.getElementById('do-login-btn').addEventListener('click', doLogin);
    document.getElementById('login-password').addEventListener('keydown', e => {
        if (e.key === 'Enter') doLogin();
    });

    updateNavLoginBtn();
}

function syncLoginMachineDropdown() {
    const sel = document.getElementById('login-machine');
    if (!sel) return;
    const m = getMachineByKey(machineSelect.value);
    if (m) sel.value = m.id;
}

function toggleLoginModal() {
    const modal = document.getElementById('login-modal');
    const isOpen = modal.style.display === 'flex';
    modal.style.display = isOpen ? 'none' : 'flex';
}

function updateNavLoginBtn() {
    const btn = document.getElementById('nav-login-btn');
    if (!btn) return;

    if (authToken && operatorInfo) {
        const machine = getMachineById(operatorInfo.machine_id);
        btn.textContent = `● ${operatorInfo.username}`;
        btn.style.color = '#27ae60';

        const formInner   = document.getElementById('login-form-inner');
        const loggedInner = document.getElementById('logged-in-inner');
        const welcome     = document.getElementById('modal-welcome');
        const machineName = document.getElementById('modal-machine-name');

        if (formInner)   formInner.style.display   = 'none';
        if (loggedInner) loggedInner.style.display  = 'block';
        if (welcome)     welcome.textContent     = `Logged in as ${operatorInfo.username}`;
        if (machineName) machineName.textContent = machine ? `Machine: ${machine.name}` : 'No machine linked';
    } else {
        btn.textContent = 'Sign In';
        btn.style.color = '#f0a500';
        const formInner   = document.getElementById('login-form-inner');
        const loggedInner = document.getElementById('logged-in-inner');
        if (formInner)   formInner.style.display   = 'block';
        if (loggedInner) loggedInner.style.display  = 'none';
    }
}

async function doLogin() {
    const username  = document.getElementById('login-username').value.trim();
    const password  = document.getElementById('login-password').value;
    const machineId = parseInt(document.getElementById('login-machine').value);
    const errEl     = document.getElementById('login-error');
    errEl.style.display = 'none';

    if (!username || !password) {
        errEl.textContent = 'Please enter username and password.';
        errEl.style.display = 'block'; return;
    }
    if (!machineId) {
        errEl.textContent = 'Please select your SLS machine.';
        errEl.style.display = 'block'; return;
    }

    const btn = document.getElementById('do-login-btn');
    btn.textContent = 'Signing in…'; btn.disabled = true;

    try {
        // Attempt login
        let res = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });

        if (res.status === 401) {
            // New user — register with chosen machine
            const regRes = await fetch(`${API_BASE}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, machine_id: machineId }),
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

        const data   = await res.json();
        authToken    = data.token;
        operatorInfo = data.operator;
        localStorage.setItem('sls_token',    authToken);
        localStorage.setItem('sls_operator', JSON.stringify(operatorInfo));

        // Sync the calculator machine dropdown to the logged-in machine
        const machine = getMachineById(operatorInfo.machine_id);
        if (machine) {
            machineSelect.value       = machine.key;
            packingDensityInput.value = machine.packingDensity;
            chamberVolumeInput.value  = machine.chamberVolume;
        }

        updateNavLoginBtn();
        updateCalculateBtn();
        await loadInitialState();
        await loadHistory();
        renderHistoryPanel();

        setTimeout(() => toggleLoginModal(), 700);

    } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
    } finally {
        btn.textContent = 'Sign In / Register'; btn.disabled = false;
    }
}

function doLogout() {
    authToken    = null;
    operatorInfo = null;
    buildHistory = [];
    localStorage.removeItem('sls_token');
    localStorage.removeItem('sls_operator');
    model.pi0       = [1.0, 0.0, 0.0, 0.0, 0.0];
    model.pi0Source = 'assumed_virgin';
    updateNavLoginBtn();
    updateCalculateBtn();
    renderHistoryPanel();
    updatePi0Badge(null);
    toggleLoginModal();
}

// ═══════════════════════════════════════════════════════════════════════════════
// CALCULATE BUTTON
// ═══════════════════════════════════════════════════════════════════════════════

function updateCalculateBtn() {
    if (authToken) {
        calculateBtn.textContent  = 'Calculate & Save to History';
        calculateBtn.style.background = '#1a6b3a';
    } else {
        calculateBtn.textContent  = 'Calculate Optimal Ratio';
        calculateBtn.style.background = '';
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// π(0) BADGE — always filtered to current machine
// ═══════════════════════════════════════════════════════════════════════════════

async function loadInitialState() {
    if (!authToken || !operatorInfo?.machine_id) return;
    const data = await model.loadHistoricalState(API_BASE, authToken, operatorInfo.machine_id);
    updatePi0Badge(data);
}

function updatePi0Badge(data) {
    const badge = document.getElementById('pi0-badge');
    if (!badge) return;

    if (data && data.source === 'empirical_history') {
        const machine = getMachineById(operatorInfo?.machine_id);
        const pct = data.pi0.map((v, i) =>
            `<span style="margin-right:6px"><strong>${['S₀','S₁','S₂','S₃','S₄'][i]}:</strong>${(v*100).toFixed(1)}%</span>`
        ).join('');
        badge.innerHTML = `
            <span style="color:#27ae60;font-weight:600;">
                ✓ Data-driven π(0) — ${data.runs_used} builds recorded
                ${machine ? `<span style="color:#1a4d7a;font-weight:400;font-size:0.85rem;margin-left:0.4rem;">(${machine.name} only)</span>` : ''}
            </span>
            <div style="margin-top:0.4rem;font-size:0.85rem;color:#555;">${pct}</div>
        `;
        badge.style.background  = '#f0fff4';
        badge.style.borderColor = '#b2dfdb';
    } else if (authToken) {
        badge.innerHTML = `<span style="color:#888;">No builds recorded yet for this machine — using virgin initial state.</span>`;
        badge.style.background  = '#fffef0';
        badge.style.borderColor = '#e0d89a';
    } else {
        badge.innerHTML = `<span style="color:#888;">Sign in to enable data-driven mode. Each machine has its own isolated powder history.</span>`;
        badge.style.background  = '#f8f9fa';
        badge.style.borderColor = '#dee2e6';
    }
}

function injectPi0Badge() {
    const calcSection = document.getElementById('calculator');
    const h2 = calcSection.querySelector('h2');
    const badge = document.createElement('div');
    badge.id = 'pi0-badge';
    badge.style.cssText = `
        padding:0.85rem 1.1rem;border-radius:7px;border:1px solid #dee2e6;
        margin-bottom:1.25rem;font-size:0.9rem;background:#f8f9fa;
        transition:background 0.3s,border-color 0.3s;
    `;
    badge.innerHTML = `<span style="color:#888;">Sign in to enable data-driven mode. Each machine has its own isolated powder history.</span>`;
    h2.insertAdjacentElement('afterend', badge);
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUILD HISTORY — machine-isolated
// ═══════════════════════════════════════════════════════════════════════════════

function injectHistoryPanel() {
    const calcSection = document.getElementById('calculator');
    const panel = document.createElement('div');
    panel.id = 'history-panel';
    panel.style.cssText = 'margin-top:2.5rem;';
    panel.innerHTML = `
        <h3 style="color:#1a4d7a;border-bottom:2px solid #e8a000;padding-bottom:0.5rem;margin-bottom:1rem;">
            Build History
        </h3>
        <div id="history-content">
            <p style="color:#888;font-style:italic;">Sign in to view your machine's build history.</p>
        </div>
    `;
    calcSection.appendChild(panel);
}

async function loadHistory() {
    if (!authToken || !operatorInfo?.machine_id) return;
    try {
        // Always filter by the operator's machine_id — never load other machines
        const res = await fetch(
            `${API_BASE}/api/runs?machine_id=${operatorInfo.machine_id}&limit=100`,
            { headers: { Authorization: `Bearer ${authToken}` } }
        );
        if (!res.ok) return;
        const data = await res.json();
        buildHistory = data.runs || [];
    } catch (e) {
        console.warn('Could not load history:', e.message);
    }
}

function renderHistoryPanel() {
    const content = document.getElementById('history-content');
    if (!content) return;

    if (!authToken) {
        content.innerHTML = `<p style="color:#888;font-style:italic;">Sign in to view your machine's build history.</p>`;
        return;
    }

    const machine = getMachineById(operatorInfo?.machine_id);
    const machineLabel = machine
        ? `<span style="display:inline-block;background:#e8f0fe;color:#1a4d7a;border-radius:4px;
                        padding:2px 10px;font-size:0.82rem;font-weight:600;margin-left:0.5rem;">
               ${machine.name}
           </span>`
        : '';

    if (buildHistory.length === 0) {
        content.innerHTML = `
            <p style="color:#888;margin-bottom:0.25rem;">
                No builds recorded yet for ${machineLabel}
            </p>
            <p style="color:#aaa;font-size:0.88rem;">
                Use "Calculate &amp; Save to History" to start building your powder history.
                Each machine's history is completely isolated.
            </p>`;
        return;
    }

    const rows = buildHistory.map(run => {
        const date    = new Date(run.created_at);
        const dateStr = date.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
        const timeStr = date.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
        const rho     = run.packing_density ? (parseFloat(run.packing_density) * 100).toFixed(1) + '%' : '—';
        const alpha   = run.alpha_optimal   ? (parseFloat(run.alpha_optimal)   * 100).toFixed(1) + '%' : '—';
        const q       = run.quality_result  ? parseFloat(run.quality_result).toFixed(3) : '—';
        const s4      = run.degraded_frac   ? (parseFloat(run.degraded_frac)  * 100).toFixed(1) + '%' : '—';
        const s4High  = run.degraded_frac && parseFloat(run.degraded_frac) > 0.12;

        return `
            <tr style="border-bottom:1px solid #f0f0f0;">
                <td style="padding:0.6rem 0.75rem;font-size:0.85rem;color:#555;white-space:nowrap;">
                    ${dateStr}<br>
                    <span style="color:#aaa;font-size:0.78rem;">${timeStr}</span>
                </td>
                <td style="padding:0.6rem 0.75rem;text-align:center;font-weight:600;">${rho}</td>
                <td style="padding:0.6rem 0.75rem;text-align:center;font-weight:600;color:#1a6b3a;">${alpha}</td>
                <td style="padding:0.6rem 0.75rem;text-align:center;">${q}</td>
                <td style="padding:0.6rem 0.75rem;text-align:center;color:${s4High ? '#e74c3c' : '#555'};">
                    ${s4}${s4High ? ' ⚠' : ''}
                </td>
                <td style="padding:0.6rem 0.75rem;text-align:center;">
                    <button onclick="deleteRun(${run.id})"
                        style="background:#fee;border:1px solid #f5c6cb;color:#e74c3c;
                               padding:0.25rem 0.6rem;border-radius:4px;cursor:pointer;font-size:0.8rem;"
                        onmouseover="this.style.background='#f5c6cb'"
                        onmouseout="this.style.background='#fee'">
                        Delete
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    content.innerHTML = `
        <div style="margin-bottom:0.75rem;font-size:0.88rem;color:#555;">
            Showing powder history for ${machineLabel}
            <span style="color:#aaa;margin-left:0.5rem;">
                — runs from other machines are excluded from π(0) calculation
            </span>
        </div>
        <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
                <thead>
                    <tr style="background:#f0f4f8;border-bottom:2px solid #dee2e6;">
                        <th style="padding:0.6rem 0.75rem;text-align:left;  font-weight:600;color:#1a4d7a;">Date / Time</th>
                        <th style="padding:0.6rem 0.75rem;text-align:center;font-weight:600;color:#1a4d7a;">ρ_pack</th>
                        <th style="padding:0.6rem 0.75rem;text-align:center;font-weight:600;color:#1a4d7a;">α_opt</th>
                        <th style="padding:0.6rem 0.75rem;text-align:center;font-weight:600;color:#1a4d7a;">Quality</th>
                        <th style="padding:0.6rem 0.75rem;text-align:center;font-weight:600;color:#1a4d7a;">S₄ Frac.</th>
                        <th style="padding:0.6rem 0.75rem;text-align:center;font-weight:600;color:#1a4d7a;">Action</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        <p style="margin-top:0.5rem;font-size:0.8rem;color:#aaa;">
            ${buildHistory.length} build${buildHistory.length !== 1 ? 's' : ''} recorded for this machine — newest first
        </p>
    `;
}

async function deleteRun(id) {
    if (!confirm('Delete this build record? This cannot be undone.')) return;
    try {
        const res = await fetch(`${API_BASE}/api/runs/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!res.ok) throw new Error('Delete failed');
        buildHistory = buildHistory.filter(r => r.id !== id);
        renderHistoryPanel();
        // Recompute π(0) without the deleted run
        await loadInitialState();
    } catch (e) {
        alert('Could not delete: ' + e.message);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MACHINE SELECTOR (calculator UI)
// ═══════════════════════════════════════════════════════════════════════════════

machineSelect.addEventListener('change', () => {
    // If logged in, don't let the dropdown override the linked machine
    if (authToken && operatorInfo?.machine_id) {
        const linked = getMachineById(operatorInfo.machine_id);
        if (linked && machineSelect.value !== linked.key) {
            machineSelect.value = linked.key; // snap back
            showMachineLockWarning(linked.name);
            return;
        }
    }
    const cfg = getMachineByKey(machineSelect.value);
    if (cfg) {
        packingDensityInput.value = cfg.packingDensity;
        chamberVolumeInput.value  = cfg.chamberVolume;
    }
});

function showMachineLockWarning(machineName) {
    let warn = document.getElementById('machine-lock-warn');
    if (!warn) {
        warn = document.createElement('div');
        warn.id = 'machine-lock-warn';
        warn.style.cssText = `
            font-size:0.82rem;color:#856404;background:#fff3cd;border:1px solid #ffc107;
            border-radius:5px;padding:0.4rem 0.75rem;margin-top:0.4rem;
            transition:opacity 0.5s;
        `;
        machineSelect.insertAdjacentElement('afterend', warn);
    }
    warn.textContent = `Locked to ${machineName} while logged in. Sign out to switch machines.`;
    warn.style.opacity = '1';
    setTimeout(() => { warn.style.opacity = '0'; }, 4000);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CALCULATE & SAVE
// ═══════════════════════════════════════════════════════════════════════════════

calculateBtn.addEventListener('click', runOptimization);

async function runOptimization() {
    const packingDensity   = parseFloat(packingDensityInput.value)   / 100;
    const chamberVolume    = parseFloat(chamberVolumeInput.value);
    const qualityThreshold = parseFloat(qualityThresholdInput.value) / 100;
    const degradedLimit    = parseFloat(degradedLimitInput.value)    / 100;
    const powderCost       = parseFloat(powderCostInput.value);
    const buildsPerYear    = parseInt(buildsPerYearInput.value);

    const errors = model.validateParameters(packingDensity, qualityThreshold, degradedLimit);
    if (errors.length > 0) { displayErrors(errors); return; }

    calculateBtn.disabled    = true;
    calculateBtn.textContent = 'Calculating…';

    setTimeout(async () => {
        try {
            const results   = model.optimizeVirginRatio(packingDensity, qualityThreshold, degradedLimit);
            const economics = model.calculateEconomics(chamberVolume, packingDensity, buildsPerYear, powderCost, results.alphaOptimal);
            displayResults(results, economics,
                { packingDensity, chamberVolume, qualityThreshold, degradedLimit, powderCost, buildsPerYear });

            if (authToken) {
                await saveRun(packingDensity, results.alphaOptimal, chamberVolume, results.quality, results.degradedFraction);
                showSaveBadge();
            }
        } catch (err) {
            displayError('Calculation error: ' + err.message);
        } finally {
            calculateBtn.disabled = false;
            updateCalculateBtn();
        }
    }, 80);
}

function showSaveBadge() {
    let badge = document.getElementById('save-confirm-badge');
    if (!badge) {
        badge = document.createElement('span');
        badge.id = 'save-confirm-badge';
        badge.style.cssText = `
            display:inline-block;margin-left:1rem;padding:0.3rem 0.75rem;
            background:#e8f5e9;color:#27ae60;border-radius:4px;
            font-size:0.85rem;font-weight:600;vertical-align:middle;
            transition:opacity 0.5s;
        `;
        calculateBtn.insertAdjacentElement('afterend', badge);
    }
    badge.textContent   = '✓ Saved to history';
    badge.style.opacity = '1';
    setTimeout(() => { badge.style.opacity = '0'; }, 3000);
}

async function saveRun(packingDensity, alphaOptimal, chamberVol, qualityResult, degradedFrac) {
    try {
        const res = await fetch(`${API_BASE}/api/runs`, {
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
                machine_id:      operatorInfo.machine_id,   // always the operator's machine
            }),
        });
        if (!res.ok) return;
        await loadHistory();
        renderHistoryPanel();
        await loadInitialState();
    } catch (e) {
        console.warn('Could not save run:', e.message);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESULTS DISPLAY
// ═══════════════════════════════════════════════════════════════════════════════

function displayResults(results, economics, inputs) {
    const { alphaOptimal, piStock, quality, degradedFraction, pi0Source, pi0RunsUsed } = results;

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
                <thead>
                    <tr><th>Strategy</th><th>Virgin Ratio</th><th>Annual Cost</th><th>Savings</th></tr>
                </thead>
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
                        <td class="savings-highlight">+€${economics.savingsVsFormlabs.cost.toFixed(0)} (${economics.savingsVsFormlabs.percentage.toFixed(1)}%)</td>
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
                    α<sub>opt</sub> = ρ<sub>pack</sub> — confirming <strong>Theorem 1</strong>.
                    This is the minimum sustainable virgin ratio for continuous operation.
                </p>
            </div>
        `;
    }

    resultsContent.innerHTML = html;
}

function displayErrors(errors) {
    resultsContent.innerHTML = `
        <div style="color:#e74c3c;padding:1rem;background:#fee;border-radius:4px;">
            <h4 style="margin-top:0;">Input Validation Errors:</h4>
            <ul>${errors.map(e => `<li>${e}</li>`).join('')}</ul>
        </div>`;
}

function displayError(msg) {
    resultsContent.innerHTML = `
        <div style="color:#e74c3c;padding:1rem;background:#fee;border-radius:4px;">
            <strong>Error:</strong> ${msg}
        </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════════

window.addEventListener('load', async () => {
    injectHeaderLogin();
    injectPi0Badge();
    injectHistoryPanel();
    updateCalculateBtn();

    if (authToken && operatorInfo) {
        // Sync calculator dropdown to the operator's linked machine
        const machine = getMachineById(operatorInfo.machine_id);
        if (machine) {
            machineSelect.value       = machine.key;
            packingDensityInput.value = machine.packingDensity;
            chamberVolumeInput.value  = machine.chamberVolume;
        }
        updateNavLoginBtn();
        await loadInitialState();
        await loadHistory();
        renderHistoryPanel();
    }
});
