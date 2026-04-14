/**
 * GET /api/history/initial-state?pool_id=1
 * GET /api/history/stats?pool_id=1
 * GET /api/history/trend?pool_id=1
 */
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

async function getPoolMachineIds(db, poolId, operatorId) {
  const check = await db.query(
    'SELECT id FROM powder_pools WHERE id=$1 AND operator_id=$2', [poolId, operatorId]
  );
  if (!check.rows.length) return null;
  const result = await db.query(
    'SELECT machine_id FROM pool_machines WHERE pool_id=$1', [poolId]
  );
  return result.rows.map(r => r.machine_id);
}

router.get('/initial-state', async (req, res) => {
  const db    = req.app.locals.db;
  const nRuns = Math.min(parseInt(req.query.n) || 30, 100);

  if (!req.query.pool_id)
    return res.status(400).json({ error: 'pool_id is required' });
  const poolId = parseInt(req.query.pool_id);

  try {
    const machineIds = await getPoolMachineIds(db, poolId, req.operator.id);
    if (!machineIds) return res.status(404).json({ error: 'Pool not found' });

    if (!machineIds.length) {
      return res.json({
        pi0: [1.0, 0.0, 0.0, 0.0, 0.0], source: 'assumed_virgin',
        runs_used: 0, pool_id: poolId, message: 'Pool has no machines yet.',
      });
    }

    const ph = machineIds.map((_, i) => `$${i + 1}`).join(',');
    const result = await db.query(
      `SELECT packing_density, alpha_used, alpha_optimal, machine_id, created_at
       FROM runs WHERE machine_id IN (${ph})
       ORDER BY created_at ASC LIMIT $${machineIds.length + 1}`,
      [...machineIds, nRuns]
    );
    const runs = result.rows;

    if (runs.length === 0) {
      return res.json({
        pi0: [1.0, 0.0, 0.0, 0.0, 0.0], source: 'assumed_virgin',
        runs_used: 0, pool_id: poolId,
        message: 'No build history for this pool yet. Using virgin initial state assumption.',
      });
    }

    const P = [
      [0.62, 0.33, 0.04, 0.01, 0.00],
      [0.00, 0.67, 0.26, 0.06, 0.01],
      [0.00, 0.00, 0.72, 0.22, 0.06],
      [0.00, 0.00, 0.00, 0.77, 0.23],
      [0.00, 0.00, 0.00, 0.00, 1.00],
    ];

    let piStock = [1.0, 0.0, 0.0, 0.0, 0.0];
    for (const run of runs) {
      const alpha  = parseFloat(run.alpha_used || run.alpha_optimal || 0.30);
      const delta0 = [1, 0, 0, 0, 0];
      let piChamber = piStock.map((v, i) => alpha * delta0[i] + (1 - alpha) * v);
      let piAfter   = Array(5).fill(0);
      for (let j = 0; j < 5; j++)
        for (let k = 0; k < 5; k++)
          piAfter[j] += piChamber[k] * P[k][j];
      piStock = piAfter;
    }

    const sum = piStock.reduce((a, b) => a + b, 0);
    piStock = piStock.map(v => v / sum);

    const w       = [1.0, 0.9, 0.7, 0.4, 0.0];
    const quality = piStock.reduce((acc, pi, i) => acc + w[i] * pi, 0);
    const avgRho  = runs.reduce((s, r) => s + parseFloat(r.packing_density), 0) / runs.length;
    const mNames  = await db.query(
      `SELECT id, name FROM machines WHERE id=ANY($1::int[])`, [machineIds]
    );

    res.json({
      pi0:                 piStock.map(v => Math.round(v * 10000) / 10000),
      quality_estimate:    Math.round(quality * 1000) / 1000,
      source:              'empirical_history',
      runs_used:           runs.length,
      pool_id:             poolId,
      machine_ids:         machineIds,
      machine_names:       mNames.rows.map(m => m.name),
      avg_packing_density: Math.round(avgRho * 10000) / 10000,
      oldest_run:          runs[0].created_at,
      newest_run:          runs[runs.length - 1].created_at,
      message: `π(0) from ${runs.length} builds across ${machineIds.length} machine(s).`,
    });
  } catch (err) {
    console.error('initial-state error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/stats', async (req, res) => {
  const db = req.app.locals.db;
  if (!req.query.pool_id) return res.status(400).json({ error: 'pool_id required' });
  const poolId = parseInt(req.query.pool_id);
  try {
    const machineIds = await getPoolMachineIds(db, poolId, req.operator.id);
    if (!machineIds) return res.status(404).json({ error: 'Pool not found' });
    const ph = machineIds.map((_, i) => `$${i + 1}`).join(',');
    const result = await db.query(
      `SELECT COUNT(*) AS total_runs,
              ROUND(AVG(packing_density)::numeric,4) AS avg_packing_density,
              ROUND(AVG(quality_result)::numeric,4)  AS avg_quality,
              ROUND(AVG(alpha_optimal)::numeric,4)   AS avg_alpha_optimal,
              MIN(created_at) AS first_run, MAX(created_at) AS last_run
       FROM runs WHERE machine_id IN (${ph})`, machineIds
    );
    res.json({ stats: result.rows[0], pool_id: poolId });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/trend', async (req, res) => {
  const db    = req.app.locals.db;
  const limit = Math.min(parseInt(req.query.limit) || 30, 100);
  if (!req.query.pool_id) return res.status(400).json({ error: 'pool_id required' });
  const poolId = parseInt(req.query.pool_id);
  try {
    const machineIds = await getPoolMachineIds(db, poolId, req.operator.id);
    if (!machineIds) return res.status(404).json({ error: 'Pool not found' });
    const ph = machineIds.map((_, i) => `$${i + 1}`).join(',');
    const result = await db.query(
      `SELECT id, packing_density, alpha_optimal, quality_result,
              degraded_frac, machine_id, created_at
       FROM runs WHERE machine_id IN (${ph})
       ORDER BY created_at DESC LIMIT $${machineIds.length + 1}`,
      [...machineIds, limit]
    );
    res.json({ trend: result.rows.reverse(), pool_id: poolId });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
