/**
 * Interactive Calculator v5.0
 * - Powder pools: each pool = independent set of machines sharing powder
 * - Operator can have multiple pools (e.g. Fuse pool + EOS pool)
 * - Nav shows username (not full name)
 * - Separate Sign In / Register tabs — no auto-register
 * - Register: First name, Last name, username, password x2, pool name, machines
 * - Logged-in modal: pool management (add pool, add/remove machines per pool)
 * - History and π(0) scoped to the active pool
 */

const API_BASE = 'https://api.desousaalves-powder-ratio-model.com';

const MACHINES = [
    { id: 1, key: 'formlabs-fuse1-30w', name: 'Formlabs Fuse 1+ 30W',    chamberVolume: 8.17,  packingDensity: 29 },
    { id: 2, key: 'eos-p770',           name: 'EOS P770',                 chamberVolume: 154,   packingDensity: 10 },
    { id: 3, key: 'eos-p396',           name: 'EOS P396',                 chamberVolume: 89,    packingDensity: 11 },
    { id: 4, key: '3dsystems-spro60',   name: '3D Systems sPro 60',       chamberVolume: 68,    packingDensity: 12 },
    { id: 5, key: 'hp-mjf5200',         name: 'HP Multi Jet Fusion 5200', chamberVolume: 116,   packingDensity: 13 },
];

function getMachineById(id)   { return MACHINES.find(m => m.id  === parseInt(id))  || null; }
function getMachineByKey(key) { return MACHINES.find(m => m.key === key)            || null; }

const model = new MarkovPowderModel();

// ── App state ─────────────────────────────────────────────────────────────────
let authToken    = localStorage.getItem('sls_token')    || null;
let operatorInfo = JSON.parse(localStorage.getItem('sls_operator') || 'null');
let activePoolId = parseInt(localStorage.getItem('sls_active_pool') || '0') || null;
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function activePool() {
    if (!operatorInfo?.pools?.length) return null;
    return operatorInfo.pools.find(p => p.id === activePoolId)
        || operatorInfo.pools[0];
}

function setActivePool(poolId) {
    activePoolId = poolId;
    localStorage.setItem('sls_active_pool', poolId);
}

// ═══════════════════════════════════════════════════════════════════════════════
// HEADER NAV LOGIN BUTTON
// ═══════════════════════════════════════════════════════════════════════════════

function injectHeaderLogin() {
    const nav = document.querySelector('header nav');
    if (!nav) return;

    const loginLink = document.createElement('a');
    loginLink.id = 'nav-login-btn';
    loginLink.href = '#';
    loginLink.style.cssText = 'font-weight:600;color:#f0a500;white-space:nowrap;';
    loginLink.addEventListener('click', e => { e.preventDefault(); toggleModal(); });
    nav.appendChild(loginLink);

    buildModal();
    updateNavLoginBtn();
}

function updateNavLoginBtn() {
    const btn = document.getElementById('nav-login-btn');
    if (!btn) return;
    if (authToken && operatorInfo) {
        btn.textContent = operatorInfo.username;
        btn.style.color = '#27ae60';
    } else {
        btn.textContent = 'Sign In';
        btn.style.color = '#f0a500';
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL BUILD
// ═══════════════════════════════════════════════════════════════════════════════

function buildModal() {
    const machineOptions = MACHINES.map(m =>
        `<option value="${m.id}">${m.name}</option>`
    ).join('');

    const machineCheckboxes = MACHINES.map(m => `
        <label style="display:flex;align-items:center;gap:0.5rem;padding:0.3rem 0;cursor:pointer;font-size:0.87rem;color:#333;">
            <input type="checkbox" name="reg-machine" value="${m.id}"
                style="width:15px;height:15px;cursor:pointer;accent-color:#1a4d7a;">
            ${m.name}
        </label>
    `).join('');

    const modal = document.createElement('div');
    modal.id = 'auth-modal';
    modal.style.cssText = `
        display:none;position:fixed;top:0;left:0;width:100%;height:100%;
        background:rgba(0,0,0,0.55);z-index:9999;
        align-items:flex-start;justify-content:center;
        padding-top:50px;overflow-y:auto;box-sizing:border-box;
    `;
    modal.innerHTML = `
      <div id="modal-card" style="background:#fff;border-radius:10px;padding:2rem;width:100%;
            max-width:430px;box-shadow:0 20px 60px rgba(0,0,0,0.3);
            position:relative;margin-bottom:2rem;">

        <button onclick="toggleModal()" style="position:absolute;top:1rem;right:1rem;
            background:none;border:none;font-size:1.5rem;cursor:pointer;color:#aaa;line-height:1;">×</button>

        <!-- ══ LOGGED IN VIEW ══ -->
        <div id="modal-loggedin" style="display:none;">
            <p id="modal-greeting" style="font-weight:700;font-size:1.1rem;color:#1a4d7a;margin:0 0 0.15rem;"></p>
            <p id="modal-username-display" style="color:#888;font-size:0.85rem;margin:0 0 1.3rem;"></p>

            <!-- Pool selector -->
            <div style="margin-bottom:1rem;">
                <label style="font-size:0.84rem;font-weight:600;color:#333;display:block;margin-bottom:0.4rem;">
                    Active Powder Pool
                </label>
                <div style="display:flex;gap:0.5rem;align-items:center;">
                    <select id="pool-selector"
                        style="flex:1;padding:0.5rem 0.65rem;border:1px solid #ddd;border-radius:6px;font-size:0.92rem;">
                    </select>
                    <button onclick="confirmDeletePool()"
                        style="padding:0.45rem 0.7rem;background:#fee;border:1px solid #f5c6cb;
                               color:#e74c3c;border-radius:5px;cursor:pointer;font-size:0.82rem;">
                        Delete
                    </button>
                </div>
            </div>

            <!-- Machines in active pool -->
            <div style="border:1px solid #e8edf2;border-radius:8px;padding:0.85rem;margin-bottom:1rem;">
                <p style="margin:0 0 0.5rem;font-size:0.84rem;font-weight:600;color:#333;">
                    Machines in this pool
                    <span style="font-weight:400;color:#888;font-size:0.78rem;">(share powder)</span>
                </p>
                <div id="modal-pool-machines"></div>
                <div style="margin-top:0.6rem;display:flex;gap:0.5rem;">
                    <select id="modal-add-machine-sel"
                        style="flex:1;padding:0.4rem 0.55rem;border:1px solid #ddd;border-radius:5px;font-size:0.85rem;">
                        <option value="">Add machine to pool…</option>
                        ${machineOptions}
                    </select>
                    <button onclick="addMachineToPool()"
                        style="padding:0.4rem 0.8rem;background:#1a4d7a;color:white;border:none;
                               border-radius:5px;font-size:0.85rem;cursor:pointer;">+ Add</button>
                </div>
                <p id="pool-machine-error" style="color:#e74c3c;font-size:0.8rem;margin:0.35rem 0 0;display:none;"></p>
            </div>

            <!-- Create new pool -->
            <div style="border:1px solid #e8edf2;border-radius:8px;padding:0.85rem;margin-bottom:1.2rem;">
                <p style="margin:0 0 0.5rem;font-size:0.84rem;font-weight:600;color:#333;">Create New Pool</p>
                <input id="new-pool-name" type="text" placeholder="e.g. EOS Floor, Fuse Lab…"
                    style="width:100%;box-sizing:border-box;padding:0.45rem 0.65rem;border:1px solid #ddd;
                           border-radius:5px;font-size:0.88rem;margin-bottom:0.5rem;">
                <div id="new-pool-machines">
                    ${MACHINES.map(m => `
                    <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.84rem;color:#333;padding:0.2rem 0;cursor:pointer;">
                        <input type="checkbox" name="new-pool-machine" value="${m.id}"
                            style="accent-color:#1a4d7a;"> ${m.name}
                    </label>`).join('')}
                </div>
                <p id="new-pool-error" style="color:#e74c3c;font-size:0.8rem;margin:0.35rem 0 0.5rem;display:none;"></p>
                <button onclick="createPool()"
                    style="width:100%;padding:0.5rem;background:#1a6b3a;color:white;border:none;
                           border-radius:5px;font-size:0.9rem;font-weight:600;cursor:pointer;">
                    + Create Pool
                </button>
            </div>

            <button onclick="doLogout()"
                style="width:100%;padding:0.55rem;border:1px solid #ddd;border-radius:6px;
                       background:white;cursor:pointer;font-size:0.9rem;color:#555;">
                Sign Out
            </button>
        </div>

        <!-- ══ AUTH FORMS ══ -->
        <div id="modal-authforms">
            <h3 style="margin:0 0 1.1rem;color:#1a4d7a;font-size:1.2rem;">Operator Access</h3>

            <!-- Tabs -->
            <div style="display:flex;border-bottom:2px solid #e8edf2;margin-bottom:1.3rem;">
                <button id="tab-login" onclick="switchTab('login')"
                    style="flex:1;padding:0.5rem;background:none;border:none;cursor:pointer;
                           font-size:0.94rem;font-weight:600;color:#1a4d7a;
                           border-bottom:2px solid #1a4d7a;margin-bottom:-2px;">
                    Sign In
                </button>
                <button id="tab-register" onclick="switchTab('register')"
                    style="flex:1;padding:0.5rem;background:none;border:none;cursor:pointer;
                           font-size:0.94rem;font-weight:600;color:#aaa;
                           border-bottom:2px solid transparent;margin-bottom:-2px;">
                    Register New User
                </button>
            </div>

            <!-- Login panel -->
            <div id="panel-login">
                <div style="margin-bottom:0.7rem;">
                    <label style="font-size:0.84rem;font-weight:600;display:block;margin-bottom:0.28rem;color:#333;">Username</label>
                    <input id="login-username" type="text" placeholder="your username" autocomplete="username"
                        style="width:100%;box-sizing:border-box;padding:0.58rem 0.72rem;
                               border:1px solid #ddd;border-radius:6px;font-size:0.95rem;">
                </div>
                <div style="margin-bottom:1rem;">
                    <label style="font-size:0.84rem;font-weight:600;display:block;margin-bottom:0.28rem;color:#333;">Password</label>
                    <input id="login-password" type="password" placeholder="password" autocomplete="current-password"
                        style="width:100%;box-sizing:border-box;padding:0.58rem 0.72rem;
                               border:1px solid #ddd;border-radius:6px;font-size:0.95rem;">
                </div>
                <p id="login-error" style="color:#e74c3c;font-size:0.84rem;margin:0 0 0.7rem;display:none;"></p>
                <button id="do-login-btn"
                    style="width:100%;padding:0.7rem;background:#1a4d7a;color:white;border:none;
                           border-radius:6px;font-size:1rem;font-weight:600;cursor:pointer;">
                    Sign In
                </button>
            </div>

            <!-- Register panel -->
            <div id="panel-register" style="display:none;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.55rem;margin-bottom:0.65rem;">
                    <div>
                        <label style="font-size:0.83rem;font-weight:600;display:block;margin-bottom:0.28rem;color:#333;">First Name</label>
                        <input id="reg-firstname" type="text" placeholder="First"
                            style="width:100%;box-sizing:border-box;padding:0.55rem 0.65rem;
                                   border:1px solid #ddd;border-radius:6px;font-size:0.92rem;">
                    </div>
                    <div>
                        <label style="font-size:0.83rem;font-weight:600;display:block;margin-bottom:0.28rem;color:#333;">Last Name</label>
                        <input id="reg-lastname" type="text" placeholder="Last"
                            style="width:100%;box-sizing:border-box;padding:0.55rem 0.65rem;
                                   border:1px solid #ddd;border-radius:6px;font-size:0.92rem;">
                    </div>
                </div>
                <div style="margin-bottom:0.65rem;">
                    <label style="font-size:0.83rem;font-weight:600;display:block;margin-bottom:0.28rem;color:#333;">Username</label>
                    <input id="reg-username" type="text" placeholder="choose a username" autocomplete="off"
                        style="width:100%;box-sizing:border-box;padding:0.58rem 0.72rem;
                               border:1px solid #ddd;border-radius:6px;font-size:0.95rem;">
                </div>
                <div style="margin-bottom:0.65rem;">
                    <label style="font-size:0.83rem;font-weight:600;display:block;margin-bottom:0.28rem;color:#333;">Password</label>
                    <input id="reg-password" type="password" placeholder="min 8 characters"
                        style="width:100%;box-sizing:border-box;padding:0.58rem 0.72rem;
                               border:1px solid #ddd;border-radius:6px;font-size:0.95rem;">
                </div>
                <div style="margin-bottom:0.65rem;">
                    <label style="font-size:0.83rem;font-weight:600;display:block;margin-bottom:0.28rem;color:#333;">Confirm Password</label>
                    <input id="reg-password2" type="password" placeholder="repeat password"
                        style="width:100%;box-sizing:border-box;padding:0.58rem 0.72rem;
                               border:1px solid #ddd;border-radius:6px;font-size:0.95rem;">
                </div>
                <div style="margin-bottom:0.65rem;">
                    <label style="font-size:0.83rem;font-weight:600;display:block;margin-bottom:0.28rem;color:#333;">
                        First Powder Pool Name
                        <span style="font-weight:400;color:#888;font-size:0.78rem;">(you can add more later)</span>
                    </label>
                    <input id="reg-poolname" type="text" placeholder="e.g. Fuse Lab, Production Floor…"
                        style="width:100%;box-sizing:border-box;padding:0.58rem 0.72rem;
                               border:1px solid #ddd;border-radius:6px;font-size:0.95rem;">
                </div>
                <div style="margin-bottom:1rem;">
                    <label style="font-size:0.83rem;font-weight:600;display:block;margin-bottom:0.35rem;color:#333;">
                        Machines in this pool
                        <span style="font-weight:400;color:#888;font-size:0.78rem;">— tick all that share powder</span>
                    </label>
                    <div style="border:1px solid #ddd;border-radius:6px;padding:0.45rem 0.7rem;background:#fafafa;">
                        ${machineCheckboxes}
                    </div>
                </div>
                <p id="reg-error" style="color:#e74c3c;font-size:0.84rem;margin:0 0 0.7rem;display:none;"></p>
                <button id="do-register-btn"
                    style="width:100%;padding:0.7rem;background:#1a6b3a;color:white;border:none;
                           border-radius:6px;font-size:1rem;font-weight:600;cursor:pointer;">
                    Create Account
                </button>
            </div>
        </div>

      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) toggleModal(); });

    document.getElementById('do-login-btn').addEventListener('click', doLogin);
    document.getElementById('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    document.getElementById('do-register-btn').addEventListener('click', doRegister);
    document.getElementById('reg-password2').addEventListener('keydown', e => { if (e.key === 'Enter') doRegister(); });
}

function toggleModal() {
    const modal = document.getElementById('auth-modal');
    const isOpen = modal.style.display === 'flex';
    modal.style.display = isOpen ? 'none' : 'flex';
}

function switchTab(tab) {
    document.getElementById('panel-login').style.display    = tab === 'login'    ? 'block' : 'none';
    document.getElementById('panel-register').style.display = tab === 'register' ? 'block' : 'none';
    const activeColor = '#1a4d7a', inactiveColor = '#aaa';
    document.getElementById('tab-login').style.color                  = tab === 'login'    ? activeColor : inactiveColor;
    document.getElementById('tab-register').style.color               = tab === 'register' ? activeColor : inactiveColor;
    document.getElementById('tab-login').style.borderBottomColor      = tab === 'login'    ? activeColor : 'transparent';
    document.getElementById('tab-register').style.borderBottomColor   = tab === 'register' ? activeColor : 'transparent';
}

// ── Show logged-in view inside modal ──────────────────────────────────────────
function showLoggedInModal() {
    document.getElementById('modal-authforms').style.display = 'none';
    document.getElementById('modal-loggedin').style.display  = 'block';

    document.getElementById('modal-greeting').textContent =
        `Welcome, ${operatorInfo.username}`;
    document.getElementById('modal-username-display').textContent =
        `${operatorInfo.first_name || ''} ${operatorInfo.last_name || ''}`.trim();

    renderPoolSelector();
    renderPoolMachines();
}

function renderPoolSelector() {
    const sel = document.getElementById('pool-selector');
    if (!sel || !operatorInfo?.pools) return;
    sel.innerHTML = operatorInfo.pools.map(p =>
        `<option value="${p.id}" ${p.id === activePool()?.id ? 'selected' : ''}>
            ${p.name} (${p.machine_names.join(', ') || 'no machines'})
         </option>`
    ).join('');
    sel.onchange = () => {
        setActivePool(parseInt(sel.value));
        renderPoolMachines();
        loadInitialState();
        loadHistory().then(renderHistoryPanel);
        updatePi0Badge(null);
    };
}

function renderPoolMachines() {
    const pool = activePool();
    const list = document.getElementById('modal-pool-machines');
    const errEl = document.getElementById('pool-machine-error');
    if (errEl) errEl.style.display = 'none';
    if (!list) return;

    if (!pool || !pool.machine_ids.length) {
        list.innerHTML = `<p style="color:#aaa;font-size:0.83rem;margin:0.2rem 0;">No machines in this pool yet.</p>`;
        return;
    }

    list.innerHTML = pool.machine_ids.map((mid, idx) => {
        const name = pool.machine_names[idx] || `Machine ${mid}`;
        return `
            <div style="display:flex;align-items:center;justify-content:space-between;
                        padding:0.28rem 0;border-bottom:1px solid #f5f5f5;">
                <span style="font-size:0.86rem;color:#333;">${name}</span>
                ${pool.machine_ids.length > 1 ? `
                <button onclick="removeMachineFromPool(${pool.id}, ${mid})"
                    style="background:none;border:none;color:#e74c3c;cursor:pointer;font-size:0.79rem;padding:0 0.3rem;">
                    Remove
                </button>` : `<span style="font-size:0.75rem;color:#bbb;">only machine</span>`}
            </div>
        `;
    }).join('');

    // Update add-machine dropdown — disable already linked machines
    const addSel = document.getElementById('modal-add-machine-sel');
    if (addSel) {
        Array.from(addSel.options).forEach(opt => {
            if (opt.value) opt.disabled = pool.machine_ids.includes(parseInt(opt.value));
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

async function doLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl    = document.getElementById('login-error');
    errEl.style.display = 'none';

    if (!username || !password) {
        errEl.textContent = 'Please enter your username and password.';
        errEl.style.display = 'block'; return;
    }

    const btn = document.getElementById('do-login-btn');
    btn.textContent = 'Signing in…'; btn.disabled = true;

    try {
        const res  = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login failed');
        onLoginSuccess(data);
        setTimeout(() => toggleModal(), 600);
    } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
    } finally {
        btn.textContent = 'Sign In'; btn.disabled = false;
    }
}

async function doRegister() {
    const firstName = document.getElementById('reg-firstname').value.trim();
    const lastName  = document.getElementById('reg-lastname').value.trim();
    const username  = document.getElementById('reg-username').value.trim();
    const password  = document.getElementById('reg-password').value;
    const password2 = document.getElementById('reg-password2').value;
    const poolName  = document.getElementById('reg-poolname').value.trim();
    const errEl     = document.getElementById('reg-error');
    errEl.style.display = 'none';

    const checkedMachines = Array.from(
        document.querySelectorAll('input[name="reg-machine"]:checked')
    ).map(cb => parseInt(cb.value));

    if (!firstName || !lastName)   { errEl.textContent = 'Please enter your first and last name.'; errEl.style.display='block'; return; }
    if (!username)                  { errEl.textContent = 'Please choose a username.'; errEl.style.display='block'; return; }
    if (password.length < 8)        { errEl.textContent = 'Password must be at least 8 characters.'; errEl.style.display='block'; return; }
    if (password !== password2)     { errEl.textContent = 'Passwords do not match.'; errEl.style.display='block'; return; }
    if (!poolName)                  { errEl.textContent = 'Please name your first powder pool.'; errEl.style.display='block'; return; }
    if (!checkedMachines.length)    { errEl.textContent = 'Please select at least one machine for this pool.'; errEl.style.display='block'; return; }

    const btn = document.getElementById('do-register-btn');
    btn.textContent = 'Creating account…'; btn.disabled = true;

    try {
        const regRes = await fetch(`${API_BASE}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username, password,
                first_name:  firstName,
                last_name:   lastName,
                pool_name:   poolName,
                machine_ids: checkedMachines,
            }),
        });
        const regData = await regRes.json();
        if (!regRes.ok) throw new Error(regData.error || 'Registration failed');

        // Auto-login after register
        const loginRes  = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        const loginData = await loginRes.json();
        if (!loginRes.ok) throw new Error(loginData.error || 'Login after register failed');

        onLoginSuccess(loginData);
        setTimeout(() => toggleModal(), 600);
    } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
    } finally {
        btn.textContent = 'Create Account'; btn.disabled = false;
    }
}

function onLoginSuccess(data) {
    authToken    = data.token;
    operatorInfo = data.operator;
    localStorage.setItem('sls_token',    authToken);
    localStorage.setItem('sls_operator', JSON.stringify(operatorInfo));

    // Set active pool if not set or if saved pool no longer exists
    const savedPool = operatorInfo.pools?.find(p => p.id === activePoolId);
    if (!savedPool && operatorInfo.pools?.length) {
        setActivePool(operatorInfo.pools[0].id);
    }

    syncCalculatorToPool();
    updateNavLoginBtn();
    showLoggedInModal();
    updateCalculateBtn();
    loadInitialState();
    loadHistory().then(renderHistoryPanel);
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
    // Reset modal to auth forms
    const authforms = document.getElementById('modal-authforms');
    const loggedin  = document.getElementById('modal-loggedin');
    if (authforms) authforms.style.display = 'block';
    if (loggedin)  loggedin.style.display  = 'none';
    toggleModal();
}

// ── Sync calculator dropdown to pool's primary machine ────────────────────────
function syncCalculatorToPool() {
    const pool = activePool();
    if (!pool?.machine_ids?.length) return;
    const cfg = getMachineById(pool.machine_ids[0]);
    if (cfg) {
        machineSelect.value       = cfg.key;
        packingDensityInput.value = cfg.packingDensity;
        chamberVolumeInput.value  = cfg.chamberVolume;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POOL MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

async function createPool() {
    const name = document.getElementById('new-pool-name').value.trim();
    const machines = Array.from(
        document.querySelectorAll('input[name="new-pool-machine"]:checked')
    ).map(cb => parseInt(cb.value));
    const errEl = document.getElementById('new-pool-error');
    errEl.style.display = 'none';

    if (!name)          { errEl.textContent = 'Please enter a pool name.'; errEl.style.display='block'; return; }
    if (!machines.length){ errEl.textContent = 'Please select at least one machine.'; errEl.style.display='block'; return; }

    try {
        const res  = await fetch(`${API_BASE}/api/auth/pools`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ name, machine_ids: machines }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create pool');

        operatorInfo.pools = data.pools;
        localStorage.setItem('sls_operator', JSON.stringify(operatorInfo));
        document.getElementById('new-pool-name').value = '';
        document.querySelectorAll('input[name="new-pool-machine"]').forEach(cb => cb.checked = false);
        renderPoolSelector();
        renderPoolMachines();
        updatePi0Badge(null);
        await refreshHistoryBadge();
    } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
    }
}

async function confirmDeletePool() {
    const pool = activePool();
    if (!pool) return;
    if (!confirm(`Delete pool "${pool.name}"? All build history in this pool will be unlinked.`)) return;

    try {
        const res  = await fetch(`${API_BASE}/api/auth/pools/${pool.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${authToken}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to delete pool');

        operatorInfo.pools = data.pools;
        localStorage.setItem('sls_operator', JSON.stringify(operatorInfo));
        if (data.pools.length) setActivePool(data.pools[0].id);
        renderPoolSelector();
        renderPoolMachines();
        syncCalculatorToPool();
        await loadInitialState();
        await loadHistory();
        renderHistoryPanel();
    } catch (err) {
        alert(err.message);
    }
}

async function addMachineToPool() {
    const pool  = activePool();
    const sel   = document.getElementById('modal-add-machine-sel');
    const mid   = parseInt(sel.value);
    const errEl = document.getElementById('pool-machine-error');
    errEl.style.display = 'none';

    if (!mid) { errEl.textContent = 'Please select a machine.'; errEl.style.display='block'; return; }

    try {
        const res  = await fetch(`${API_BASE}/api/auth/pools/${pool.id}/machines`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ machine_id: mid }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to add machine');

        operatorInfo.pools = data.pools;
        localStorage.setItem('sls_operator', JSON.stringify(operatorInfo));
        sel.value = '';
        renderPoolSelector();
        renderPoolMachines();
        await loadInitialState();
        await loadHistory();
        renderHistoryPanel();
    } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
    }
}

async function removeMachineFromPool(poolId, machineId) {
    const machine = getMachineById(machineId);
    if (!confirm(`Remove ${machine?.name || 'this machine'} from the pool?`)) return;

    const errEl = document.getElementById('pool-machine-error');
    errEl.style.display = 'none';

    try {
        const res  = await fetch(`${API_BASE}/api/auth/pools/${poolId}/machines/${machineId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${authToken}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to remove machine');

        operatorInfo.pools = data.pools;
        localStorage.setItem('sls_operator', JSON.stringify(operatorInfo));
        renderPoolSelector();
        renderPoolMachines();
        await loadInitialState();
        await loadHistory();
        renderHistoryPanel();
    } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
    }
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

machineSelect.addEventListener('change', () => {
    if (authToken && operatorInfo?.pools?.length) {
        const pool = activePool();
        const cfg  = pool?.machine_ids?.length ? getMachineById(pool.machine_ids[0]) : null;
        if (cfg && machineSelect.value !== cfg.key) {
            machineSelect.value = cfg.key;
            showMachineLockWarn(pool.machine_names.join(' / '));
            return;
        }
    }
    const cfg = getMachineByKey(machineSelect.value);
    if (cfg) { packingDensityInput.value = cfg.packingDensity; chamberVolumeInput.value = cfg.chamberVolume; }
});

function showMachineLockWarn(names) {
    let w = document.getElementById('machine-lock-warn');
    if (!w) {
        w = document.createElement('div');
        w.id = 'machine-lock-warn';
        w.style.cssText = `font-size:0.81rem;color:#856404;background:#fff3cd;border:1px solid #ffc107;
            border-radius:5px;padding:0.35rem 0.7rem;margin-top:0.35rem;transition:opacity 0.5s;`;
        machineSelect.insertAdjacentElement('afterend', w);
    }
    w.textContent = `Locked to pool: ${names}. Manage pools from the menu.`;
    w.style.opacity = '1';
    setTimeout(() => { w.style.opacity = '0'; }, 5000);
}

// ═══════════════════════════════════════════════════════════════════════════════
// π(0) BADGE
// ═══════════════════════════════════════════════════════════════════════════════

async function loadInitialState() {
    const pool = activePool();
    if (!authToken || !pool) return;

    try {
        const url  = `${API_BASE}/api/history/initial-state?pool_id=${pool.id}`;
        const res  = await fetch(url, { headers: { Authorization: `Bearer ${authToken}` } });
        if (!res.ok) return;
        const data = await res.json();
        model.pi0         = data.pi0;
        model.pi0Source   = data.source;
        model.pi0RunsUsed = data.runs_used;
        updatePi0Badge(data);
    } catch (e) {
        console.warn('loadInitialState error:', e.message);
    }
}

function updatePi0Badge(data) {
    const badge = document.getElementById('pi0-badge');
    if (!badge) return;
    const pool = activePool();

    if (data && data.source === 'empirical_history') {
        const poolLabel = pool ? `<span style="color:#1a4d7a;font-size:0.83rem;margin-left:0.4rem;">[${pool.name}: ${pool.machine_names.join(' + ')}]</span>` : '';
        const pct = data.pi0.map((v, i) =>
            `<span style="margin-right:6px"><strong>${['S₀','S₁','S₂','S₃','S₄'][i]}:</strong>${(v*100).toFixed(1)}%</span>`
        ).join('');
        badge.innerHTML = `
            <div><span style="color:#27ae60;font-weight:600;">✓ Data-driven π(0) — ${data.runs_used} builds</span>${poolLabel}</div>
            <div style="margin-top:0.4rem;font-size:0.85rem;color:#555;">${pct}</div>
        `;
        badge.style.background  = '#f0fff4';
        badge.style.borderColor = '#b2dfdb';
    } else if (authToken && pool) {
        badge.innerHTML = `<span style="color:#888;">No builds for pool "<strong>${pool.name}</strong>" yet — using virgin initial state.</span>`;
        badge.style.background  = '#fffef0';
        badge.style.borderColor = '#e0d89a';
    } else {
        badge.innerHTML = `<span style="color:#888;">Sign in to enable data-driven mode. Create pools for machines that share powder.</span>`;
        badge.style.background  = '#f8f9fa';
        badge.style.borderColor = '#dee2e6';
    }
}

function injectPi0Badge() {
    const h2 = document.querySelector('#calculator h2');
    const badge = document.createElement('div');
    badge.id = 'pi0-badge';
    badge.style.cssText = `padding:0.85rem 1.1rem;border-radius:7px;border:1px solid #dee2e6;
        margin-bottom:1.25rem;font-size:0.9rem;background:#f8f9fa;transition:background 0.3s,border-color 0.3s;`;
    badge.innerHTML = `<span style="color:#888;">Sign in to enable data-driven mode. Create pools for machines that share powder.</span>`;
    h2.insertAdjacentElement('afterend', badge);
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUILD HISTORY
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
            <p style="color:#888;font-style:italic;">Sign in to view your build history.</p>
        </div>
    `;
    calcSection.appendChild(panel);
}

async function loadHistory() {
    const pool = activePool();
    if (!authToken || !pool) return;
    try {
        const res = await fetch(
            `${API_BASE}/api/runs?pool_id=${pool.id}&limit=100`,
            { headers: { Authorization: `Bearer ${authToken}` } }
        );
        if (!res.ok) return;
        const data = await res.json();
        buildHistory = data.runs || [];
    } catch (e) {
        console.warn('loadHistory error:', e.message);
    }
}

async function refreshHistoryBadge() {
    await loadHistory();
    renderHistoryPanel();
    await loadInitialState();
}

function renderHistoryPanel() {
    const content = document.getElementById('history-content');
    if (!content) return;

    if (!authToken) {
        content.innerHTML = `<p style="color:#888;font-style:italic;">Sign in to view your build history.</p>`;
        return;
    }

    const pool = activePool();
    const poolTag = pool
        ? `<span style="display:inline-block;background:#e8f0fe;color:#1a4d7a;border-radius:4px;
                        padding:1px 9px;font-size:0.8rem;font-weight:600;">${pool.name}</span>`
        : '';

    if (!pool) {
        content.innerHTML = `<p style="color:#aaa;">No active pool selected.</p>`;
        return;
    }

    if (buildHistory.length === 0) {
        content.innerHTML = `
            <p style="color:#888;margin-bottom:0.25rem;">No builds recorded for ${poolTag}</p>
            <p style="color:#aaa;font-size:0.87rem;">
                Use "Calculate &amp; Save to History" to start building your powder history.
            </p>`;
        return;
    }

    const rows = buildHistory.map(run => {
        const date    = new Date(run.created_at);
        const dateStr = date.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
        const timeStr = date.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
        const machineName = getMachineById(run.machine_id)?.name || run.machine_name || `Machine ${run.machine_id}`;
        const rho   = run.packing_density ? (parseFloat(run.packing_density)*100).toFixed(1)+'%' : '—';
        const alpha = run.alpha_optimal   ? (parseFloat(run.alpha_optimal)*100).toFixed(1)+'%'   : '—';
        const q     = run.quality_result  ? parseFloat(run.quality_result).toFixed(3)            : '—';
        const s4    = run.degraded_frac   ? (parseFloat(run.degraded_frac)*100).toFixed(1)+'%'   : '—';
        const s4Hi  = run.degraded_frac && parseFloat(run.degraded_frac) > 0.12;

        return `
            <tr style="border-bottom:1px solid #f0f0f0;">
                <td style="padding:0.5rem 0.6rem;font-size:0.82rem;color:#555;white-space:nowrap;">
                    ${dateStr}<br><span style="color:#bbb;font-size:0.76rem;">${timeStr}</span>
                </td>
                <td style="padding:0.5rem 0.6rem;font-size:0.79rem;color:#666;">${machineName}</td>
                <td style="padding:0.5rem 0.6rem;text-align:center;font-weight:600;">${rho}</td>
                <td style="padding:0.5rem 0.6rem;text-align:center;font-weight:600;color:#1a6b3a;">${alpha}</td>
                <td style="padding:0.5rem 0.6rem;text-align:center;">${q}</td>
                <td style="padding:0.5rem 0.6rem;text-align:center;color:${s4Hi?'#e74c3c':'#555'};">${s4}${s4Hi?' ⚠':''}</td>
                <td style="padding:0.5rem 0.6rem;text-align:center;">
                    <button onclick="deleteRun(${run.id})"
                        style="background:#fee;border:1px solid #f5c6cb;color:#e74c3c;
                               padding:0.2rem 0.55rem;border-radius:4px;cursor:pointer;font-size:0.78rem;"
                        onmouseover="this.style.background='#f5c6cb'" onmouseout="this.style.background='#fee'">
                        Delete
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    content.innerHTML = `
        <div style="margin-bottom:0.6rem;font-size:0.87rem;color:#555;">
            Pool: ${poolTag}
            <span style="color:#aaa;font-size:0.8rem;margin-left:0.4rem;">
                — ${pool.machine_names.join(' + ')}
            </span>
        </div>
        <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:0.87rem;">
                <thead>
                    <tr style="background:#f0f4f8;border-bottom:2px solid #dee2e6;">
                        <th style="padding:0.5rem 0.6rem;text-align:left;  font-weight:600;color:#1a4d7a;">Date</th>
                        <th style="padding:0.5rem 0.6rem;text-align:left;  font-weight:600;color:#1a4d7a;">Machine</th>
                        <th style="padding:0.5rem 0.6rem;text-align:center;font-weight:600;color:#1a4d7a;">ρ_pack</th>
                        <th style="padding:0.5rem 0.6rem;text-align:center;font-weight:600;color:#1a4d7a;">α_opt</th>
                        <th style="padding:0.5rem 0.6rem;text-align:center;font-weight:600;color:#1a4d7a;">Quality</th>
                        <th style="padding:0.5rem 0.6rem;text-align:center;font-weight:600;color:#1a4d7a;">S₄</th>
                        <th style="padding:0.5rem 0.6rem;text-align:center;font-weight:600;color:#1a4d7a;">Action</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        <p style="margin-top:0.45rem;font-size:0.78rem;color:#bbb;">
            ${buildHistory.length} build${buildHistory.length!==1?'s':''} in this pool — newest first
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
        await loadInitialState();
    } catch (e) { alert('Could not delete: ' + e.message); }
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
            displayResults(results, economics, { packingDensity, chamberVolume, qualityThreshold, degradedLimit, powderCost, buildsPerYear });

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
    let b = document.getElementById('save-confirm-badge');
    if (!b) {
        b = document.createElement('span');
        b.id = 'save-confirm-badge';
        b.style.cssText = `display:inline-block;margin-left:1rem;padding:0.3rem 0.75rem;
            background:#e8f5e9;color:#27ae60;border-radius:4px;font-size:0.85rem;
            font-weight:600;vertical-align:middle;transition:opacity 0.5s;`;
        calculateBtn.insertAdjacentElement('afterend', b);
    }
    b.textContent = '✓ Saved to history'; b.style.opacity = '1';
    setTimeout(() => { b.style.opacity = '0'; }, 3000);
}

async function saveRun(packingDensity, alphaOptimal, chamberVol, qualityResult, degradedFrac) {
    const pool = activePool();
    if (!pool?.machine_ids?.length) return;
    const mid = pool.machine_ids[0];  // primary machine in pool

    try {
        const res = await fetch(`${API_BASE}/api/runs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({
                packing_density: packingDensity,
                alpha_optimal:   alphaOptimal,
                chamber_vol:     chamberVol,
                quality_result:  qualityResult,
                degraded_frac:   degradedFrac,
                machine_id:      mid,
                pool_id:         pool.id,
            }),
        });
        if (!res.ok) return;
        await loadHistory();
        renderHistoryPanel();
        await loadInitialState();
    } catch (e) { console.warn('Could not save run:', e.message); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════════════════════════════════════════════

function displayResults(results, economics, inputs) {
    const { alphaOptimal, piStock, quality, degradedFraction, pi0Source, pi0RunsUsed } = results;

    const sourceBadge = pi0Source === 'empirical_history'
        ? `<span style="display:inline-block;background:#e8f5e9;color:#27ae60;border-radius:4px;padding:2px 8px;font-size:0.8rem;font-weight:600;margin-left:0.5rem;">Data-driven (${pi0RunsUsed} builds)</span>`
        : `<span style="display:inline-block;background:#fff3cd;color:#856404;border-radius:4px;padding:2px 8px;font-size:0.8rem;">Virgin assumption</span>`;

    let html = `
        <div class="result-item">
            <h4>Optimal Virgin Powder Ratio ${sourceBadge}</h4>
            <div class="result-value">${(alphaOptimal*100).toFixed(1)}%</div>
            <div class="result-label">Virgin : ${((1-alphaOptimal)*100).toFixed(1)}% Aged</div>
        </div>
        <div class="result-item">
            <h4>Quality Index</h4>
            <div class="result-value">${quality.toFixed(3)}</div>
            <div class="result-label">Threshold: ${inputs.qualityThreshold.toFixed(2)}
                <span style="color:${quality>=inputs.qualityThreshold?'#27ae60':'#e74c3c'}">
                    (${quality>=inputs.qualityThreshold?'✓ Pass':'✗ Fail'})
                </span>
            </div>
        </div>
        <div class="result-item">
            <h4>Degraded Powder Fraction (S₄)</h4>
            <div class="result-value">${(degradedFraction*100).toFixed(1)}%</div>
            <div class="result-label">Limit: ${(inputs.degradedLimit*100).toFixed(0)}%
                <span style="color:${degradedFraction<=inputs.degradedLimit?'#27ae60':'#e74c3c'}">
                    (${degradedFraction<=inputs.degradedLimit?'✓ Pass':'✗ Fail'})
                </span>
            </div>
        </div>
        <div class="state-distribution"><h4>Steady-State Powder Distribution</h4>
    `;
    piStock.forEach((frac, i) => {
        const pct = (frac*100).toFixed(1);
        html += `<div class="state-bar">
            <div class="state-label"><span>${model.stateNames[i]}</span><span>${pct}%</span></div>
            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        </div>`;
    });
    html += `</div>
        <div class="result-item" style="margin-top:1.5rem;">
            <h4>Economic Analysis</h4>
            <table class="comparison-table">
                <thead><tr><th>Strategy</th><th>Virgin Ratio</th><th>Annual Cost</th><th>Savings</th></tr></thead>
                <tbody>
                    <tr style="background:#f0fff4;">
                        <td><strong>Optimized (This Model)</strong></td>
                        <td>${(economics.optimal.alpha*100).toFixed(1)}%</td>
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
        </div>`;

    if (Math.abs(alphaOptimal - inputs.packingDensity) < 0.02) {
        html += `<div class="result-item" style="background:#f0f7ff;border-left-color:#1a4d7a;">
            <h4>⚠ Sustainability Constraint Active</h4>
            <p style="margin:0;font-size:0.95rem;">α<sub>opt</sub> = ρ<sub>pack</sub> — confirming <strong>Theorem 1</strong>.</p>
        </div>`;
    }
    resultsContent.innerHTML = html;
}

function displayErrors(errors) {
    resultsContent.innerHTML = `<div style="color:#e74c3c;padding:1rem;background:#fee;border-radius:4px;">
        <h4 style="margin-top:0;">Validation Errors:</h4><ul>${errors.map(e=>`<li>${e}</li>`).join('')}</ul></div>`;
}
function displayError(msg) {
    resultsContent.innerHTML = `<div style="color:#e74c3c;padding:1rem;background:#fee;border-radius:4px;"><strong>Error:</strong> ${msg}</div>`;
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
        const savedPool = operatorInfo.pools?.find(p => p.id === activePoolId);
        if (!savedPool && operatorInfo.pools?.length) setActivePool(operatorInfo.pools[0].id);
        syncCalculatorToPool();
        updateNavLoginBtn();
        showLoggedInModal();
        await loadInitialState();
        await loadHistory();
        renderHistoryPanel();
    }
});
