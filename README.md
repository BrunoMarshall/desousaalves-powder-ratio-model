# De Sousa Alves et al. Powder Refresh Ratio Optimization Model

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![DOI](https://img.shields.io/badge/DOI-pending-orange.svg)](https://github.com/BrunoMarshall/desousaalves-powder-ratio-model)

## A Novel Stochastic Model for Optimizing PA12 Powder Refresh Ratios in Selective Laser Sintering

This repository contains the web-based implementation of the Markov chain-based optimization framework for SLS powder management published in our research paper.

**Live Website:** [https://desousaalves-powder-ratio-model.com](https://desousaalves-powder-ratio-model.com)

## Authors

- **Bruno Alexandre de Sousa Alves** - Staffordshire University, UK & Ford-Werke GmbH, Germany  
  ORCID: [0000-0002-2716-5329](https://orcid.org/0000-0002-2716-5329)

- **Abdel-Hamid Soliman** - Staffordshire University, UK  
  ORCID: [0000-0001-7382-1107](https://orcid.org/0000-0001-7382-1107)  
  📧 a.soliman@staffs.ac.uk

- **Dimitrios Kontziampasis** - University of Leeds, UK & University of Dundee, UK  
  ORCID: [0000-0002-6787-8892](https://orcid.org/0000-0002-6787-8892)  
  📧 D.Kontziampasis@leeds.ac.uk

## Abstract

The optimization of polyamide 12 (PA12) powder refresh strategies in Selective Laser Sintering (SLS) represents a critical challenge with profound implications for material economics, sustainability, and part quality. This tool implements a novel probabilistic framework based on Markov chain theory to optimize virgin powder refresh ratios without requiring particle-level tracking.

**Key Results:**
- ✅ Optimal virgin ratio equals packing density (Theorem 1: α_min = ρ_pack)
- ✅ Validated with Formlabs Fuse 1+ 30W: α_opt = 29% vs. empirical 30%
- ✅ 42% cost reduction potential vs. conventional 50:50 industrial strategies
- ✅ Calibrated with 7-cycle DSC study: crystallinity evolution 42.33% → 45.30%

## Quick Start

### Option 1: Use the Live Website
Visit [https://desousaalves-powder-ratio-model.com](https://desousaalves-powder-ratio-model.com) to use the calculator directly in your browser.

### Option 2: Run Locally

```bash
# Clone the repository
git clone https://github.com/BrunoMarshall/desousaalves-powder-ratio-model.git
cd desousaalves-powder-ratio-model

# Open in browser (no build process required - pure HTML/CSS/JS)
# Option A: Double-click index.html
# Option B: Use a simple HTTP server
python -m http.server 8000
# Then visit http://localhost:8000
```

## Repository Structure

```
desousaalves-powder-ratio-model/
├── index.html              # Main webpage
├── styles.css              # Academic styling
├── markov-model.js         # Core Markov chain implementation
├── calculator.js           # Interactive calculator interface
├── README.md              # This file
├── LICENSE                # MIT License
├── CITATION.cff           # Citation metadata
└── docs/
    ├── methodology.md     # Detailed mathematical methodology
    ├── validation.md      # Experimental validation details
    └── examples.md        # Usage examples
```

## Features

### Interactive Calculator
- **Pre-configured machine profiles**: Formlabs Fuse 1+ 30W, EOS P770, EOS P396, HP MJF 5200, 3D Systems sPro 60
- **Custom configuration support**: Enter your own packing density and chamber volume
- **Real-time optimization**: Instant calculation of optimal virgin ratios
- **Economic analysis**: Compare costs vs. industry standards (30:70, 50:50)
- **Constraint validation**: Quality threshold (Q_min) and degraded powder limit (ε)

### Mathematical Implementation
- **Closed-form steady-state solution**: π_stock* = α·δ₀·P·[I - (1-α)·P]^(-1)
- **Bisection optimization algorithm**: Finds α_opt efficiently (10-20 iterations)
- **Matrix operations**: Full linear algebra implementation in JavaScript
- **Validated transition matrix**: Calibrated from 7-cycle DSC experimental data

## Mathematical Framework

### Theorem 1: Minimum Sustainable Virgin Ratio
For continuous SLS operation without stock depletion:

```
α ≥ ρ_pack
```

**Proof:** Material balance requires virgin influx = consumption at steady state.  
Virgin influx per cycle = α × V_chamber  
Material consumption = ρ_pack × V_chamber  
Setting equal yields α = ρ_pack. ∎

### State Space
PA12 particles classified into 5 discrete aging states:
- **S₀ (Virgin):** 0 cycles, <43% crystallinity
- **S₁ (Lightly Aged):** 1-2 cycles, 43-44% crystallinity
- **S₂ (Moderately Aged):** 3-5 cycles, 44-45% crystallinity
- **S₃ (Heavily Aged):** 6-10 cycles, 45-46% crystallinity
- **S₄ (Degraded):** >10 cycles, >46% crystallinity

### Transition Matrix (PA12, Formlabs)
```
P = [0.62  0.33  0.04  0.01  0.00]
    [0.00  0.67  0.26  0.06  0.01]
    [0.00  0.00  0.72  0.22  0.06]
    [0.00  0.00  0.00  0.77  0.23]
    [0.00  0.00  0.00  0.00  1.00]
```

Calibrated from 7-cycle thermal aging study with DSC characterization.

## Usage Examples

### Example 1: Formlabs Fuse 1+ 30W
```javascript
const model = new MarkovPowderModel();
const results = model.optimizeVirginRatio(
    0.29,  // packing density (29%)
    0.60,  // quality threshold
    0.12   // degraded limit (12%)
);

console.log(`Optimal virgin ratio: ${results.alphaOptimal * 100}%`);
// Output: Optimal virgin ratio: 29.0%
```

### Example 2: EOS P770
```javascript
const results = model.optimizeVirginRatio(
    0.10,  // packing density (10%)
    0.60,  // quality threshold
    0.12   // degraded limit
);

console.log(`Optimal virgin ratio: ${results.alphaOptimal * 100}%`);
// Output: Optimal virgin ratio: 15.6%
```

### Example 3: Economic Analysis
```javascript
const economics = model.calculateEconomics(
    8.17,   // chamber volume (L)
    0.29,   // packing density
    200,    // builds per year
    119,    // powder cost (€/kg)
    0.29    // alpha optimal
);

console.log(`Annual cost: €${economics.optimal.annualCost}`);
console.log(`Savings vs 50:50: €${economics.savingsVsIndustrial.cost}`);
// Output: Annual cost: €25,375
//         Savings vs 50:50: €18,375 (42%)
```

## API Reference

### `MarkovPowderModel` Class

#### `calculateSteadyState(alpha)`
Calculates steady-state distribution for given virgin ratio.
- **Parameters:** `alpha` (number) - Virgin powder ratio [0, 1]
- **Returns:** Array of 5 probabilities [π₀, π₁, π₂, π₃, π₄]

#### `optimizeVirginRatio(packingDensity, qualityThreshold, degradedLimit, tolerance)`
Finds optimal virgin ratio via bisection search.
- **Parameters:**
  - `packingDensity` (number) - Packing density ρ_pack [0.05, 0.40]
  - `qualityThreshold` (number) - Minimum quality Q_min [0.50, 0.85]
  - `degradedLimit` (number) - Max degraded fraction ε [0.05, 0.20]
  - `tolerance` (number) - Convergence tolerance [default: 0.001]
- **Returns:** Object with `{alphaOptimal, piStock, quality, degradedFraction, iterations, converged}`

#### `calculateEconomics(chamberVolume, packingDensity, buildsPerYear, powderCost, alphaOptimal)`
Calculates annual costs and savings.
- **Returns:** Object with cost comparison data

## Validation Results

| System | ρ_pack | α_opt (Model) | α (Industry) | Agreement |
|--------|--------|---------------|--------------|-----------|
| Formlabs Fuse 1+ 30W | 29% | 29.0% | 30% | 1.0% |
| EOS P770 | 10% | 15.6% | 50% | - |

**Crystallinity Validation (7-cycle DSC study):**
- Virgin (Cycle 0): 42.33%
- Degraded (Cycle 7): 45.30%
- Total increase: 7.0% (comparable to white PA12: 20% → 27%)

## Citation

### Paper (In Review)
```
Bruno Alexandre de Sousa Alves, Abdel-Hamid Soliman, Dimitrios Kontziampasis
"A Novel Stochastic Model for Optimizing PA12 Powder Refresh Ratios in 
Selective Laser Sintering: Application of Markov Chain Theory to Minimize 
Material Waste in Additive Manufacturing"
[Journal Name], 2025 (In Review)
```

### Software
```bibtex
@software{desousaalves2025powder,
  author = {de Sousa Alves, Bruno Alexandre and Soliman, Abdel-Hamid and Kontziampasis, Dimitrios},
  title = {Powder Refresh Ratio Optimization Model},
  year = {2025},
  url = {https://github.com/BrunoMarshall/desousaalves-powder-ratio-model},
  version = {1.0.0},
  doi = {10.5281/zenodo.XXXXXXX}
}
```

## Contributing

We welcome contributions! Please:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/improvement`)
3. Commit changes (`git commit -am 'Add new feature'`)
4. Push to branch (`git push origin feature/improvement`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Andrey Markov (1856-1922) and Andrey Kolmogorov (1903-1987) for foundational probability theory
- Manhattan Project scientists for computational implementation of stochastic methods
- Formlabs for PA12 powder samples and SLS system access
- Staffordshire University, Ford-Werke GmbH, University of Leeds, University of Dundee

## Contact

For questions or collaborations:
- **Bruno Alexandre de Sousa Alves**: [GitHub](https://github.com/BrunoMarshall)
- **Abdel-Hamid Soliman**: a.soliman@staffs.ac.uk
- **Dimitrios Kontziampasis**: D.Kontziampasis@leeds.ac.uk

## References

1. Feng et al. (2019) - PA12 Powder Recycling
2. Schmid et al. (2014) - Materials Perspective on SLS
3. Pham et al. (2008) - Polyamide Powder Deterioration
4. Chen et al. (2018) - PA12 Aging Mechanisms
5. Formlabs Design Guide - Fuse Series SLS
6. EOS PA 2200 Technical Data Sheet

---

**Keywords:** Selective Laser Sintering, PA12, powder aging, Markov chains, stochastic optimization, additive manufacturing, powder bed fusion, material sustainability

**Last Updated:** January 2025
