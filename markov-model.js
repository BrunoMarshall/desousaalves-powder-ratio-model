/**
 * De Sousa Alves et al. Powder Refresh Ratio Optimization Model
 * Markov Chain-Based Framework for SLS Powder Management
 *
 * v3.0 — Model A / Model B split (correction per S. Pougkakiotis review)
 *
 *   Model A — calculateSteadyState(alpha)
 *     Long-run planning/design model. Always starts from virgin powder
 *     (delta_0) and asks: "if I commit to ratio alpha forever, what is
 *     the long-run equilibrium powder-quality distribution?" The initial
 *     condition is irrelevant by construction (it washes out over many
 *     cycles) — that is the model's correct, intended behaviour.
 *
 *   Model B — optimizeVirginRatio(...) / oneStepDistribution(alpha, piE)
 *     Per-build operational/control model. Uses the empirically measured
 *     current stock distribution piE directly: mixes it with fresh virgin
 *     powder at ratio alpha, then propagates ONE thermal cycle through P.
 *     This answers "given what's in the hopper right now, what alpha
 *     should I use for the NEXT build?" — the question the build-tracking
 *     app and live calculator actually need answered.
 *
 *   Earlier versions (<3.0) incorrectly substituted the empirical stock
 *   distribution into the Model A steady-state formula. That silently
 *   computes the stationary distribution of a hypothetical process in
 *   which aged stock — not virgin powder — is the refresh source, which
 *   is not the physical question being asked. See the "Data-Driven
 *   Initial State Estimation" / Theorem 2 correction in the manuscript.
 *
 * Authors: Bruno Alexandre de Sousa Alves, Abdel-Hamid Soliman, Dimitrios Kontziampasis
 * License: MIT
 */

class MarkovPowderModel {
    constructor() {
        // Transition probability matrix P — calibrated from 7-cycle DSC study
        this.P = [
            [0.62, 0.33, 0.04, 0.01, 0.00],
            [0.00, 0.67, 0.26, 0.06, 0.01],
            [0.00, 0.00, 0.72, 0.22, 0.06],
            [0.00, 0.00, 0.00, 0.77, 0.23],
            [0.00, 0.00, 0.00, 0.00, 1.00],
        ];

        this.w = [1.0, 0.9, 0.7, 0.4, 0.0];

        this.stateNames = [
            'S₀ (Virgin)',
            'S₁ (Lightly Aged)',
            'S₂ (Moderately Aged)',
            'S₃ (Heavily Aged)',
            'S₄ (Degraded)',
        ];

        // Initial state: virgin by default; overridden by loadHistoricalState()
        this.pi0 = [1.0, 0.0, 0.0, 0.0, 0.0];
        this.pi0Source = 'assumed_virgin';
        this.pi0RunsUsed = 0;
    }

    // ── Matrix helpers ─────────────────────────────────────────────────────────

    matrixMultiply(A, B) {
        const n = A.length, m = B[0].length, p = B.length;
        const C = Array.from({length: n}, () => Array(m).fill(0));
        for (let i = 0; i < n; i++)
            for (let j = 0; j < m; j++)
                for (let k = 0; k < p; k++)
                    C[i][j] += A[i][k] * B[k][j];
        return C;
    }

    matrixSubtract(A, B) {
        return A.map((row, i) => row.map((v, j) => v - B[i][j]));
    }

    scalarMultiply(s, A) {
        return A.map(row => row.map(v => s * v));
    }

    identityMatrix(n) {
        return Array.from({length: n}, (_, i) => Array.from({length: n}, (_, j) => i === j ? 1 : 0));
    }

    matrixInverse(A) {
        const n = A.length;
        const aug = A.map((row, i) => [...row, ...this.identityMatrix(n)[i]]);
        for (let i = 0; i < n; i++) {
            let max = i;
            for (let k = i + 1; k < n; k++)
                if (Math.abs(aug[k][i]) > Math.abs(aug[max][i])) max = k;
            [aug[i], aug[max]] = [aug[max], aug[i]];
            if (Math.abs(aug[i][i]) < 1e-10) throw new Error('Matrix is singular');
            const piv = aug[i][i];
            for (let j = 0; j < 2 * n; j++) aug[i][j] /= piv;
            for (let k = 0; k < n; k++) {
                if (k === i) continue;
                const f = aug[k][i];
                for (let j = 0; j < 2 * n; j++) aug[k][j] -= f * aug[i][j];
            }
        }
        return aug.map(row => row.slice(n));
    }

    // ── Core model ─────────────────────────────────────────────────────────────

    /**
     * MODEL A — Steady-state distribution (long-run planning/design):
     * π* = α·δ₀·P·[I−(1−α)·P]⁻¹
     *
     * Always starts from virgin powder (δ₀). The initial condition is
     * deliberately irrelevant here — that is the correct behaviour for a
     * long-run planning question, NOT a defect to "fix" with empirical
     * stock data. Use this for capacity/design decisions, not per-build
     * recommendations (use optimizeVirginRatio / Model B for those).
     *
     * @param {number} alpha — virgin powder ratio
     */
    calculateSteadyState(alpha) {
        const n  = this.P.length;
        const delta0 = [1, 0, 0, 0, 0];

        // [I − (1−α)·P]⁻¹
        const IminusP = this.matrixSubtract(
            this.identityMatrix(n),
            this.scalarMultiply(1 - alpha, this.P)
        );
        const inv = this.matrixInverse(IminusP);

        // δ₀·P  (virgin powder after one thermal cycle)
        const d0P = Array(n).fill(0);
        for (let j = 0; j < n; j++)
            for (let k = 0; k < n; k++)
                d0P[j] += delta0[k] * this.P[k][j];

        // α · δ₀·P · [I−(1−α)·P]⁻¹
        const result = Array(n).fill(0);
        for (let j = 0; j < n; j++) {
            for (let k = 0; k < n; k++) result[j] += d0P[k] * inv[k][j];
            result[j] *= alpha;
        }
        return result;
    }

    calculateQuality(piStock) {
        return this.w.reduce((s, wi, i) => s + wi * piStock[i], 0);
    }

    /**
     * MODEL B — One-step (per-build) propagation using the empirical
     * current stock distribution piE directly:
     *   mix    = α·δ₀ + (1−α)·piE        (loading the hopper for this build)
     *   π_next = mix · P                  (one thermal/sinter cycle)
     *
     * This is the correct way to use real-time build-tracking data —
     * it answers "what will this build's resulting powder quality be
     * if I use ratio α right now", not a steady-state question.
     *
     * @param {number} alpha
     * @param {Array}  piE — current empirical stock distribution
     */
    oneStepDistribution(alpha, piE) {
        const n = this.P.length;
        const delta0 = [1, 0, 0, 0, 0];
        const mix = Array(n).fill(0).map((_, i) => alpha * delta0[i] + (1 - alpha) * piE[i]);

        const piNext = Array(n).fill(0);
        for (let j = 0; j < n; j++)
            for (let k = 0; k < n; k++)
                piNext[j] += mix[k] * this.P[k][j];
        return piNext;
    }

    /**
     * Load historical initial state from the API.
     * After this call, calculateSteadyState() uses the empirical π(0).
     *
     * @param {string} apiBase   — e.g. 'https://api.desousaalves-powder-ratio-model.com'
     * @param {string} token     — JWT from login
     * @param {number} machineId
     */
    async loadHistoricalState(apiBase, token, machineId) {
        try {
            const url = `${apiBase}/api/history/initial-state?machine_id=${machineId}`;
            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error(`API ${res.status}`);
            const data = await res.json();
            this.pi0         = data.pi0;
            this.pi0Source   = data.source;
            this.pi0RunsUsed = data.runs_used;
            return data;
        } catch (err) {
            console.warn('Could not load historical state, using virgin assumption:', err.message);
            return null;
        }
    }

    /**
     * MODEL B optimiser — bisection over α using the one-step (per-build)
     * propagation of the empirical current stock distribution (this.pi0).
     * Replaces the earlier (incorrect) call into the Model A steady-state
     * formula with the empirical stock plugged in as if it were δ₀.
     */
    optimizeVirginRatio(packingDensity, qualityThreshold = 0.60, degradedLimit = 0.12, tolerance = 0.001) {
        let alphaMin = packingDensity;
        let alphaMax = 1.0;
        let iter = 0;

        while ((alphaMax - alphaMin) > tolerance && iter < 50) {
            const mid     = (alphaMin + alphaMax) / 2;
            const piNext  = this.oneStepDistribution(mid, this.pi0);
            const Q       = this.calculateQuality(piNext);

            if (Q >= qualityThreshold && piNext[4] <= degradedLimit) {
                alphaMax = mid;
            } else {
                alphaMin = mid;
            }
            iter++;
        }

        const alphaOpt = alphaMax;
        const piOpt    = this.oneStepDistribution(alphaOpt, this.pi0);

        return {
            alphaOptimal:    alphaOpt,
            piStock:         piOpt,
            quality:         this.calculateQuality(piOpt),
            degradedFraction: piOpt[4],
            iterations:      iter,
            converged:       iter < 50,
            pi0Source:       this.pi0Source,
            pi0RunsUsed:     this.pi0RunsUsed,
            model:           'B',
        };
    }

    calculateEconomics(chamberVolume, packingDensity, buildsPerYear, powderCost, alphaOptimal) {
        const density = 0.47; // kg/L

        const costFor = (a) => ({
            alpha: a,
            virginPerBuild: a * chamberVolume,
            annualMass:     a * chamberVolume * density * buildsPerYear,
            annualCost:     a * chamberVolume * density * buildsPerYear * powderCost,
        });

        const opt  = costFor(alphaOptimal);
        const f30  = costFor(0.30);
        const i50  = costFor(0.50);

        const savings = (base, opt) => ({
            mass: base.annualMass - opt.annualMass,
            cost: base.annualCost - opt.annualCost,
            percentage: ((base.annualCost - opt.annualCost) / base.annualCost) * 100,
        });

        return {
            optimal: opt,
            formlabs30: f30,
            industrial50: i50,
            savingsVsFormlabs: savings(f30, opt),
            savingsVsIndustrial: savings(i50, opt),
        };
    }

    validateParameters(packingDensity, qualityThreshold, degradedLimit) {
        const errors = [];
        if (packingDensity <= 0 || packingDensity > 0.5)
            errors.push('Packing density must be between 0 and 50%');
        if (qualityThreshold < 0.4 || qualityThreshold > 0.9)
            errors.push('Quality threshold should be between 0.4 and 0.9');
        if (degradedLimit < 0 || degradedLimit > 0.3)
            errors.push('Degraded limit should be between 0 and 30%');
        return errors;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MarkovPowderModel;
}
