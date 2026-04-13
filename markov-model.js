/**
 * De Sousa Alves et al. Powder Refresh Ratio Optimization Model
 * Markov Chain-Based Framework for SLS Powder Management
 *
 * v2.0 — Data-driven initial state π(0) from build history
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
     * Steady-state distribution: π* = α·δ₀·P·[I−(1−α)·P]⁻¹
     * When pi0 has been loaded from history, the chamber-loading step
     * uses the empirical initial stock state instead of δ₀=virgin.
     *
     * @param {number} alpha — virgin powder ratio
     * @param {Array}  pi0Override — optional explicit initial state [π₀…π₄]
     */
    calculateSteadyState(alpha, pi0Override = null) {
        const n  = this.P.length;
        const pi0 = pi0Override || this.pi0;

        // [I − (1−α)·P]⁻¹
        const IminusP = this.matrixSubtract(
            this.identityMatrix(n),
            this.scalarMultiply(1 - alpha, this.P)
        );
        const inv = this.matrixInverse(IminusP);

        // π₀·P  (initial state after one thermal cycle)
        const pi0P = Array(n).fill(0);
        for (let j = 0; j < n; j++)
            for (let k = 0; k < n; k++)
                pi0P[j] += pi0[k] * this.P[k][j];

        // α · π₀·P · [I−(1−α)·P]⁻¹
        const result = Array(n).fill(0);
        for (let j = 0; j < n; j++) {
            for (let k = 0; k < n; k++) result[j] += pi0P[k] * inv[k][j];
            result[j] *= alpha;
        }
        return result;
    }

    calculateQuality(piStock) {
        return this.w.reduce((s, wi, i) => s + wi * piStock[i], 0);
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
     * Bisection optimisation — finds minimum α satisfying quality + sustainability
     */
    optimizeVirginRatio(packingDensity, qualityThreshold = 0.60, degradedLimit = 0.12, tolerance = 0.001) {
        let alphaMin = packingDensity;
        let alphaMax = 1.0;
        let iter = 0;

        while ((alphaMax - alphaMin) > tolerance && iter < 50) {
            const mid    = (alphaMin + alphaMax) / 2;
            const piStock = this.calculateSteadyState(mid);
            const Q       = this.calculateQuality(piStock);

            if (Q >= qualityThreshold && piStock[4] <= degradedLimit) {
                alphaMax = mid;
            } else {
                alphaMin = mid;
            }
            iter++;
        }

        const alphaOpt = alphaMax;
        const piOpt    = this.calculateSteadyState(alphaOpt);

        return {
            alphaOptimal:    alphaOpt,
            piStock:         piOpt,
            quality:         this.calculateQuality(piOpt),
            degradedFraction: piOpt[4],
            iterations:      iter,
            converged:       iter < 50,
            pi0Source:       this.pi0Source,
            pi0RunsUsed:     this.pi0RunsUsed,
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
