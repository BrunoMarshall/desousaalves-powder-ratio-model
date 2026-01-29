/**
 * De Sousa Alves et al. Powder Refresh Ratio Optimization Model
 * Markov Chain-Based Framework for SLS Powder Management
 * 
 * Mathematical Implementation of:
 * "A Novel Stochastic Model for Optimizing PA12 Powder Refresh Ratios 
 *  in Selective Laser Sintering"
 * 
 * Authors: Bruno Alexandre de Sousa Alves, Abdel-Hamid Soliman, Dimitrios Kontziampasis
 * License: MIT
 */

class MarkovPowderModel {
    constructor() {
        // Transition probability matrix P for PA12 powder (5x5)
        // Calibrated from 7-cycle DSC study (Formlabs PA12)
        // States: S0 (Virgin), S1 (Lightly Aged), S2 (Moderately Aged), 
        //         S3 (Heavily Aged), S4 (Degraded)
        this.P = [
            [0.62, 0.33, 0.04, 0.01, 0.00],  // S0 -> transitions
            [0.00, 0.67, 0.26, 0.06, 0.01],  // S1 -> transitions
            [0.00, 0.00, 0.72, 0.22, 0.06],  // S2 -> transitions
            [0.00, 0.00, 0.00, 0.77, 0.23],  // S3 -> transitions
            [0.00, 0.00, 0.00, 0.00, 1.00]   // S4 -> absorbing state
        ];

        // Quality weight vector w = [w0, w1, w2, w3, w4]
        // Based on mechanical property degradation correlation
        this.w = [1.0, 0.9, 0.7, 0.4, 0.0];

        // State names for display
        this.stateNames = [
            'S₀ (Virgin)',
            'S₁ (Lightly Aged)',
            'S₂ (Moderately Aged)',
            'S₃ (Heavily Aged)',
            'S₄ (Degraded)'
        ];
    }

    /**
     * Matrix multiplication: C = A * B
     */
    matrixMultiply(A, B) {
        const rowsA = A.length;
        const colsA = A[0].length;
        const colsB = B[0].length;
        
        const result = Array(rowsA).fill(null).map(() => Array(colsB).fill(0));
        
        for (let i = 0; i < rowsA; i++) {
            for (let j = 0; j < colsB; j++) {
                for (let k = 0; k < colsA; k++) {
                    result[i][j] += A[i][k] * B[k][j];
                }
            }
        }
        
        return result;
    }

    /**
     * Matrix subtraction: C = A - B
     */
    matrixSubtract(A, B) {
        return A.map((row, i) => row.map((val, j) => val - B[i][j]));
    }

    /**
     * Scalar matrix multiplication: C = scalar * A
     */
    scalarMultiply(scalar, A) {
        return A.map(row => row.map(val => scalar * val));
    }

    /**
     * Identity matrix of size n
     */
    identityMatrix(n) {
        return Array(n).fill(null).map((_, i) => 
            Array(n).fill(null).map((_, j) => i === j ? 1 : 0)
        );
    }

    /**
     * Matrix inversion using Gaussian elimination with partial pivoting
     */
    matrixInverse(A) {
        const n = A.length;
        
        // Create augmented matrix [A | I]
        const augmented = A.map((row, i) => [...row, ...this.identityMatrix(n)[i]]);
        
        // Forward elimination with partial pivoting
        for (let i = 0; i < n; i++) {
            // Find pivot
            let maxRow = i;
            for (let k = i + 1; k < n; k++) {
                if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
                    maxRow = k;
                }
            }
            
            // Swap rows
            [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];
            
            // Check for singular matrix
            if (Math.abs(augmented[i][i]) < 1e-10) {
                throw new Error('Matrix is singular or nearly singular');
            }
            
            // Scale pivot row
            const pivot = augmented[i][i];
            for (let j = 0; j < 2 * n; j++) {
                augmented[i][j] /= pivot;
            }
            
            // Eliminate column
            for (let k = 0; k < n; k++) {
                if (k !== i) {
                    const factor = augmented[k][i];
                    for (let j = 0; j < 2 * n; j++) {
                        augmented[k][j] -= factor * augmented[i][j];
                    }
                }
            }
        }
        
        // Extract inverse from augmented matrix
        return augmented.map(row => row.slice(n));
    }

    /**
     * Calculate steady-state distribution: π_stock* = α·δ0·P·[I - (1-α)·P]^(-1)
     * 
     * @param {number} alpha - Virgin powder ratio (0 < alpha <= 1)
     * @returns {Array} - Steady-state probability distribution [π0, π1, π2, π3, π4]
     */
    calculateSteadyState(alpha) {
        const n = this.P.length;
        
        // δ0 = [1, 0, 0, 0, 0] (virgin state vector)
        const delta0 = [1, 0, 0, 0, 0];
        
        // (1-α)·P
        const oneMinusAlphaP = this.scalarMultiply(1 - alpha, this.P);
        
        // I - (1-α)·P
        const I = this.identityMatrix(n);
        const IminusP = this.matrixSubtract(I, oneMinusAlphaP);
        
        // [I - (1-α)·P]^(-1)
        const inverseMatrix = this.matrixInverse(IminusP);
        
        // δ0·P (row vector * matrix)
        let delta0P = Array(n).fill(0);
        for (let j = 0; j < n; j++) {
            for (let k = 0; k < n; k++) {
                delta0P[j] += delta0[k] * this.P[k][j];
            }
        }
        
        // α·δ0·P·[I - (1-α)·P]^(-1)
        let result = Array(n).fill(0);
        for (let j = 0; j < n; j++) {
            for (let k = 0; k < n; k++) {
                result[j] += delta0P[k] * inverseMatrix[k][j];
            }
            result[j] *= alpha;
        }
        
        return result;
    }

    /**
     * Calculate quality metric: Q(π) = w·π^T
     */
    calculateQuality(piStock) {
        return this.w.reduce((sum, wi, i) => sum + wi * piStock[i], 0);
    }

    /**
     * Find optimal virgin ratio using bisection search
     * 
     * @param {number} packingDensity - Packing density ρ_pack (0 < ρ < 1)
     * @param {number} qualityThreshold - Minimum acceptable quality Q_min
     * @param {number} degradedLimit - Maximum degraded powder fraction ε
     * @param {number} tolerance - Convergence tolerance
     * @returns {Object} - Optimization results
     */
    optimizeVirginRatio(packingDensity, qualityThreshold = 0.60, degradedLimit = 0.12, tolerance = 0.001) {
        // Theorem 1: Minimum sustainable virgin ratio = packing density
        let alphaMin = packingDensity;
        let alphaMax = 1.0;
        
        let iterations = 0;
        const maxIterations = 50;
        
        while ((alphaMax - alphaMin) > tolerance && iterations < maxIterations) {
            const alphaMid = (alphaMin + alphaMax) / 2;
            
            // Calculate steady-state distribution
            const piStock = this.calculateSteadyState(alphaMid);
            
            // Calculate quality
            const quality = this.calculateQuality(piStock);
            
            // Check constraints
            const degradedFraction = piStock[4];
            
            if (quality >= qualityThreshold && degradedFraction <= degradedLimit) {
                // Can use less virgin powder
                alphaMax = alphaMid;
            } else {
                // Need more virgin powder
                alphaMin = alphaMid;
            }
            
            iterations++;
        }
        
        const alphaOpt = alphaMax;
        const piStockOpt = this.calculateSteadyState(alphaOpt);
        const qualityOpt = this.calculateQuality(piStockOpt);
        
        return {
            alphaOptimal: alphaOpt,
            piStock: piStockOpt,
            quality: qualityOpt,
            degradedFraction: piStockOpt[4],
            iterations: iterations,
            converged: iterations < maxIterations
        };
    }

    /**
     * Calculate economic comparison between strategies
     */
    calculateEconomics(chamberVolume, packingDensity, buildsPerYear, powderCost, alphaOptimal) {
        // PA12 powder density: approximately 0.47 g/cm³ = 0.47 kg/L
        const powderDensity = 0.47; // kg/L
        
        // Virgin consumption per build = alpha * V_chamber
        const virginPerBuild = alphaOptimal * chamberVolume; // Liters
        const virginMassPerBuild = virginPerBuild * powderDensity; // kg
        
        // Annual virgin consumption
        const annualVirginMass = virginMassPerBuild * buildsPerYear; // kg
        const annualCost = annualVirginMass * powderCost; // €
        
        // Comparison scenarios
        const scenarios = {
            optimal: {
                alpha: alphaOptimal,
                virginPerBuild: virginPerBuild,
                annualMass: annualVirginMass,
                annualCost: annualCost
            },
            formlabs30: {
                alpha: 0.30,
                virginPerBuild: 0.30 * chamberVolume,
                annualMass: 0.30 * chamberVolume * powderDensity * buildsPerYear,
                annualCost: 0.30 * chamberVolume * powderDensity * buildsPerYear * powderCost
            },
            industrial50: {
                alpha: 0.50,
                virginPerBuild: 0.50 * chamberVolume,
                annualMass: 0.50 * chamberVolume * powderDensity * buildsPerYear,
                annualCost: 0.50 * chamberVolume * powderDensity * buildsPerYear * powderCost
            }
        };
        
        // Calculate savings
        scenarios.savingsVsFormlabs = {
            mass: scenarios.formlabs30.annualMass - scenarios.optimal.annualMass,
            cost: scenarios.formlabs30.annualCost - scenarios.optimal.annualCost,
            percentage: ((scenarios.formlabs30.annualCost - scenarios.optimal.annualCost) / scenarios.formlabs30.annualCost) * 100
        };
        
        scenarios.savingsVsIndustrial = {
            mass: scenarios.industrial50.annualMass - scenarios.optimal.annualMass,
            cost: scenarios.industrial50.annualCost - scenarios.optimal.annualCost,
            percentage: ((scenarios.industrial50.annualCost - scenarios.optimal.annualCost) / scenarios.industrial50.annualCost) * 100
        };
        
        return scenarios;
    }

    /**
     * Validate parameters
     */
    validateParameters(packingDensity, qualityThreshold, degradedLimit) {
        const errors = [];
        
        if (packingDensity <= 0 || packingDensity > 0.5) {
            errors.push('Packing density must be between 0 and 50%');
        }
        
        if (qualityThreshold < 0.4 || qualityThreshold > 0.9) {
            errors.push('Quality threshold should be between 0.4 and 0.9');
        }
        
        if (degradedLimit < 0 || degradedLimit > 0.3) {
            errors.push('Degraded limit should be between 0 and 30%');
        }
        
        return errors;
    }
}

// Export for use in calculator
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MarkovPowderModel;
}
