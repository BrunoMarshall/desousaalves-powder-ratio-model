/**
 * GET /api/history/initial-state  — π(0) from all operator's machines
 * GET /api/history/stats          — summary stats
 * GET /api/history/trend          — packing density trend
 *
 * Supports multiple machine IDs via ?machine_ids=1,2,3
 * This allows EOS P770 + EOS P396 operators to share powder history.
 */
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// ─── Helper: get operator's machine IDs ───────────────────────────────────────
async function getOperatorMachineIds(db, operatorId, queryMachineIds) {
  // If specific IDs requested, use those (but only ones the operator owns)
  if (queryMachineIds && queryMachineIds.length) {
    const owned = await db.query(
      `SELECT machine_id FROM operator_machines WHERE operator_id = $1`,
      [operatorId]
    );
    const ownedIds = owned.rows.map(r => r.machine_id);
    // Only allow machine IDs the operator actually owns
    return queryMachineIds.filter(id => ownedIds.includes(id));
  }

  // Default: use all operator's machines
  const result = await db.query(
    `SELECT machine_id FROM operator_machines WHERE operator_id = $1`,
    [operatorId]
  );
  return result.rows.map(r => r.machine_id);
}

// ─── Compute π(0) from run history ───────────────────────────────────────────
router.get('/initial-state', async (req, res) => {
  const db = req.app.locals.db;

  // Parse machine_ids from query: ?machine_ids=1,2 or ?machine_id=1
  let requestedIds = [];
  if (req.query.machine_ids) {
    requestedIds = req.query.machine_ids.split(',').map(Number).filter(Boolean);
  } else if (req.query.machine_id) {
    requestedIds = [parseInt(req.query.machine_id)];
  }

  const nRuns = Math.min(parseInt(req.query.n) || 30, 100);

  try {
    const machineIds = await getOperatorMachineIds(db, req.operator.id, requestedIds);

    if (!machineIds.length) {
      return res.status(400).json({ error: 'No valid machine IDs found for this operator' });
    }

    // Fetch runs for all selected machines in chronological order
    const placeholders = machineIds.map((_, i) => `$${i + 1}`).join(',');
    const result = await db.query(
      `SELECT packing_density, alpha_used, alpha_optimal, machine_id, created_at
       FROM runs
       WHERE machine_id IN (${placeholders})
       ORDER BY created_at ASC
       LIMIT $${machineIds.length + 1}`,
      [...machineIds, nRuns]
    );

    const runs = result.rows;

    if (runs.length === 0) {
      return res.json({
        pi0: [1.0, 0.0, 0.0, 0.0, 0.0],
        source: 'assumed_virgin',
        runs_used: 0,
        machine_ids: machineIds,
        message: 'No build history found. Using virgin initial state assumption.',
      });
    }

    // Transition matrix P (calibrated from 7-cycle DSC study)
    const P = [
      [0.62, 0.33, 0.04, 0.01, 0.00],
      [0.00, 0.67, 0.26, 0.06, 0.01],
      [0.00, 0.00, 0.72, 0.22, 0.06],
      [0.00, 0.00, 0.00, 0.77, 0.23],
      [0.00, 0.00, 0.00, 0.00, 1.00],
    ];

    // Simulate stock evolution through recorded history
    let piStock = [1.0, 0.0, 0.0, 0.0, 0.0];

    for (const run of runs) {
      const alpha = parseFloat(run.alpha_used || run.alpha_optimal || 0.30);
      const delta0 = [1, 0, 0, 0, 0];

      // Mix: alpha * virgin + (1-alpha) * current stock
      let piChamber = piStock.map((v, i) => alpha * delta0[i] + (1 - alpha) * v);

      // Apply thermal aging (one build cycle)
      let piAfterBuild = Array(5).fill(0);
      for (let j = 0; j < 5; j++)
        for (let k = 0; k < 5; k++)
          piAfterBuild[j] += piChamber[k] * P[k][j];

      piStock = piAfterBuild;
    }

    // Normalise
    const sum = piStock.reduce((a, b) => a + b, 0);
    piStock = piStock.map(v => v / sum);

    const w = [1.0, 0.9, 0.7, 0.4, 0.0];
    const quality = piStock.reduce((acc, pi, i) => acc + w[i] * pi, 0);
    const avgRho = runs.reduce((s, r) => s + parseFloat(r.packing_density), 0) / runs.length;

    // Get machine names for response
    const machineNames = await db.query(
      `SELECT id, name FROM machines WHERE id = ANY($1::int[])`,
      [machineIds]
    );

    res.json({
      pi0:                    piStock.map(v => Math.round(v * 10000) / 10000),
      quality_estimate:       Math.round(quality * 1000) / 1000,
      source:                 'empirical_history',
      runs_used:              runs.length,
      machine_ids:            machineIds,
      machine_names:          machineNames.rows.map(m => m.name),
      avg_packing_density:    Math.round(avgRho * 10000) / 10000,
      oldest_run:             runs[0].created_at,
      newest_run:             runs[runs.length - 1].created_at,
      message: `Initial state computed from ${runs.length} recorded builds across ${machineIds.length} machine(s).`,
    });

  } catch (err) {
    console.error('initial-state error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Stats ────────────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  const db = req.app.locals.db;
  let requestedIds = [];
  if (req.query.machine_ids) requestedIds = req.query.machine_ids.split(',').map(Number).filter(Boolean);
  else if (req.query.machine_id) requestedIds = [parseInt(req.query.machine_id)];

  try {
    const machineIds = await getOperatorMachineIds(db, req.operator.id, requestedIds);
    const placeholders = machineIds.map((_, i) => `$${i + 1}`).join(',');
    const result = await db.query(
      `SELECT
         COUNT(*)                                AS total_runs,
         ROUND(AVG(packing_density)::numeric, 4) AS avg_packing_density,
         ROUND(MIN(packing_density)::numeric, 4) AS min_packing_density,
         ROUND(MAX(packing_density)::numeric, 4) AS max_packing_density,
         ROUND(AVG(quality_result)::numeric, 4)  AS avg_quality,
         ROUND(AVG(alpha_optimal)::numeric, 4)   AS avg_alpha_optimal,
         MIN(created_at)                          AS first_run,
         MAX(created_at)                          AS last_run
       FROM runs WHERE machine_id IN (${placeholders})`,
      machineIds
    );
    res.json({ stats: result.rows[0], machine_ids: machineIds });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Trend ────────────────────────────────────────────────────────────────────
router.get('/trend', async (req, res) => {
  const db = req.app.locals.db;
  let requestedIds = [];
  if (req.query.machine_ids) requestedIds = req.query.machine_ids.split(',').map(Number).filter(Boolean);
  else if (req.query.machine_id) requestedIds = [parseInt(req.query.machine_id)];
  const limit = Math.min(parseInt(req.query.limit) || 30, 100);

  try {
    const machineIds = await getOperatorMachineIds(db, req.operator.id, requestedIds);
    const placeholders = machineIds.map((_, i) => `$${i + 1}`).join(',');
    const result = await db.query(
      `SELECT id, packing_density, alpha_optimal, quality_result,
              degraded_frac, machine_id, created_at
       FROM runs
       WHERE machine_id IN (${placeholders})
       ORDER BY created_at DESC
       LIMIT $${machineIds.length + 1}`,
      [...machineIds, limit]
    );
    res.json({ trend: result.rows.reverse(), machine_ids: machineIds });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
