/**
 * Interactive Calculator Interface
 * Connects UI to Markov Model
 */

// Machine configurations database
const machineConfigs = {
    'formlabs-fuse1-30w': {
        name: 'Formlabs Fuse 1+ 30W',
        chamberVolume: 8.17,
        packingDensity: 0.29,
        buildVolume: '165 × 165 × 300 mm',
        type: 'Desktop'
    },
    'eos-p770': {
        name: 'EOS P770',
        chamberVolume: 154,
        packingDensity: 0.10,
        buildVolume: '700 × 380 × 580 mm',
        type: 'Industrial'
    },
    'eos-p396': {
        name: 'EOS P396',
        chamberVolume: 89,
        packingDensity: 0.11,
        buildVolume: '340 × 340 × 600 mm',
        type: 'Industrial'
    },
    '3dsystems-spro60': {
        name: '3D Systems sPro 60',
        chamberVolume: 68,
        packingDensity: 0.12,
        buildVolume: '381 × 330 × 457 mm',
        type: 'Industrial'
    },
    'hp-mjf5200': {
        name: 'HP Multi Jet Fusion 5200',
        chamberVolume: 116,
        packingDensity: 0.13,
        buildVolume: '380 × 284 × 380 mm',
        type: 'Industrial'
    }
};

// Initialize model
const model = new MarkovPowderModel();

// DOM elements
const machineSelect = document.getElementById('machine-select');
const packingDensityInput = document.getElementById('packing-density');
const chamberVolumeInput = document.getElementById('chamber-volume');
const qualityThresholdInput = document.getElementById('quality-threshold');
const degradedLimitInput = document.getElementById('degraded-limit');
const powderCostInput = document.getElementById('powder-cost');
const buildsPerYearInput = document.getElementById('builds-per-year');
const calculateBtn = document.getElementById('calculate-btn');
const resultsContent = document.getElementById('results-content');

// Event listeners
machineSelect.addEventListener('change', handleMachineSelection);
calculateBtn.addEventListener('click', runOptimization);

/**
 * Handle machine selection from dropdown
 */
function handleMachineSelection() {
    const selectedMachine = machineSelect.value;
    
    if (selectedMachine !== 'custom' && machineConfigs[selectedMachine]) {
        const config = machineConfigs[selectedMachine];
        packingDensityInput.value = config.packingDensity;
        chamberVolumeInput.value = config.chamberVolume;
    }
}

/**
 * Run optimization and display results
 */
function runOptimization() {
    // Get input values
    const packingDensity = parseFloat(packingDensityInput.value);
    const chamberVolume = parseFloat(chamberVolumeInput.value);
    const qualityThreshold = parseFloat(qualityThresholdInput.value);
    const degradedLimit = parseFloat(degradedLimitInput.value);
    const powderCost = parseFloat(powderCostInput.value);
    const buildsPerYear = parseInt(buildsPerYearInput.value);
    
    // Validate inputs
    const errors = model.validateParameters(packingDensity, qualityThreshold, degradedLimit);
    
    if (errors.length > 0) {
        displayErrors(errors);
        return;
    }
    
    // Show loading state
    calculateBtn.disabled = true;
    calculateBtn.textContent = 'Calculating...';
    
    // Run optimization (with small delay for UI responsiveness)
    setTimeout(() => {
        try {
            // Optimize
            const results = model.optimizeVirginRatio(
                packingDensity,
                qualityThreshold,
                degradedLimit
            );
            
            // Calculate economics
            const economics = model.calculateEconomics(
                chamberVolume,
                packingDensity,
                buildsPerYear,
                powderCost,
                results.alphaOptimal
            );
            
            // Display results
            displayResults(results, economics, {
                packingDensity,
                chamberVolume,
                qualityThreshold,
                degradedLimit,
                powderCost,
                buildsPerYear
            });
            
        } catch (error) {
            displayError('Calculation error: ' + error.message);
        } finally {
            calculateBtn.disabled = false;
            calculateBtn.textContent = 'Calculate Optimal Ratio';
        }
    }, 100);
}

/**
 * Display optimization results
 */
function displayResults(results, economics, inputs) {
    const { alphaOptimal, piStock, quality, degradedFraction } = results;
    
    let html = `
        <div class="result-item">
            <h4>Optimal Virgin Powder Ratio</h4>
            <div class="result-value">${(alphaOptimal * 100).toFixed(1)}%</div>
            <div class="result-label">Virgin : ${((1 - alphaOptimal) * 100).toFixed(1)}% Aged</div>
        </div>
        
        <div class="result-item">
            <h4>Quality Index</h4>
            <div class="result-value">${quality.toFixed(3)}</div>
            <div class="result-label">
                Threshold: ${inputs.qualityThreshold.toFixed(2)} 
                <span style="color: ${quality >= inputs.qualityThreshold ? '#27ae60' : '#e74c3c'}">
                    (${quality >= inputs.qualityThreshold ? '✓ Pass' : '✗ Fail'})
                </span>
            </div>
        </div>
        
        <div class="result-item">
            <h4>Degraded Powder Fraction (S₄)</h4>
            <div class="result-value">${(degradedFraction * 100).toFixed(1)}%</div>
            <div class="result-label">
                Limit: ${(inputs.degradedLimit * 100).toFixed(0)}%
                <span style="color: ${degradedFraction <= inputs.degradedLimit ? '#27ae60' : '#e74c3c'}">
                    (${degradedFraction <= inputs.degradedLimit ? '✓ Pass' : '✗ Fail'})
                </span>
            </div>
        </div>
        
        <div class="state-distribution">
            <h4>Steady-State Powder Distribution</h4>
    `;
    
    // Add state bars
    piStock.forEach((fraction, i) => {
        const percentage = (fraction * 100).toFixed(1);
        html += `
            <div class="state-bar">
                <div class="state-label">
                    <span>${model.stateNames[i]}</span>
                    <span>${percentage}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${percentage}%"></div>
                </div>
            </div>
        `;
    });
    
    html += `</div>`;
    
    // Add economic comparison
    html += `
        <div class="result-item" style="margin-top: 1.5rem;">
            <h4>Economic Analysis</h4>
            <table class="comparison-table">
                <thead>
                    <tr>
                        <th>Strategy</th>
                        <th>Virgin Ratio</th>
                        <th>Annual Cost</th>
                        <th>Savings</th>
                    </tr>
                </thead>
                <tbody>
                    <tr style="background: #f0fff4;">
                        <td><strong>Optimized (This Model)</strong></td>
                        <td>${(economics.optimal.alpha * 100).toFixed(1)}%</td>
                        <td>€${economics.optimal.annualCost.toFixed(0)}</td>
                        <td>-</td>
                    </tr>
                    <tr>
                        <td>Formlabs Guideline (30:70)</td>
                        <td>30.0%</td>
                        <td>€${economics.formlabs30.annualCost.toFixed(0)}</td>
                        <td class="savings-highlight">
                            ${economics.savingsVsFormlabs.cost >= 0 ? '+' : ''}€${economics.savingsVsFormlabs.cost.toFixed(0)}
                            (${economics.savingsVsFormlabs.percentage.toFixed(1)}%)
                        </td>
                    </tr>
                    <tr>
                        <td>Industrial Practice (50:50)</td>
                        <td>50.0%</td>
                        <td>€${economics.industrial50.annualCost.toFixed(0)}</td>
                        <td class="savings-highlight">
                            +€${economics.savingsVsIndustrial.cost.toFixed(0)}
                            (${economics.savingsVsIndustrial.percentage.toFixed(1)}%)
                        </td>
                    </tr>
                </tbody>
            </table>
            <p style="margin-top: 1rem; font-size: 0.9rem; color: #555;">
                <strong>Annual Virgin Consumption:</strong> ${economics.optimal.annualMass.toFixed(0)} kg
                (${inputs.buildsPerYear} builds/year × ${inputs.chamberVolume} L chamber)
            </p>
        </div>
    `;
    
    // Add validation note
    if (Math.abs(alphaOptimal - inputs.packingDensity) < 0.02) {
        html += `
            <div class="result-item" style="background: #f0f7ff; border-left-color: #1a4d7a;">
                <h4>⚠️ Sustainability Constraint Active</h4>
                <p style="margin: 0; font-size: 0.95rem;">
                    The optimal ratio equals the packing density (α<sub>opt</sub> = ρ<sub>pack</sub>), 
                    confirming <strong>Theorem 1</strong>. This is the minimum sustainable virgin ratio 
                    for continuous operation. Quality requirements are satisfied at this minimum threshold.
                </p>
            </div>
        `;
    }
    
    resultsContent.innerHTML = html;
}

/**
 * Display validation errors
 */
function displayErrors(errors) {
    let html = '<div style="color: #e74c3c; padding: 1rem; background: #fee; border-radius: 4px;">';
    html += '<h4 style="margin-top: 0;">Input Validation Errors:</h4><ul>';
    errors.forEach(error => {
        html += `<li>${error}</li>`;
    });
    html += '</ul></div>';
    resultsContent.innerHTML = html;
}

/**
 * Display single error
 */
function displayError(message) {
    resultsContent.innerHTML = `
        <div style="color: #e74c3c; padding: 1rem; background: #fee; border-radius: 4px;">
            <strong>Error:</strong> ${message}
        </div>
    `;
}

// Initialize with default calculation on page load
window.addEventListener('load', () => {
    // Optional: Run calculation with default values
    // runOptimization();
});
