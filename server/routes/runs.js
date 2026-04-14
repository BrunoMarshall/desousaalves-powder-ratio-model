/**
 * POST /api/runs
 * GET  /api/runs?pool_id=
 * GET  /api/runs/:id
 * DELETE /api/runs/:id
 */
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.post('/', async (req, res) => {
  const {
    packing_density, alpha_used, alpha_optimal,
    chamber_vol, quality_result, degraded_frac,
    machine_id, pool_id, material_id, notes,
  } = req.body;

  if (packing_density == null)
    return res.status(400).json({ error: 'packing_density is required' });
  if (packing_density <= 0 || packing_density > 0.6)
    return res.status(400).json({ error: 'packing_density must be between 0 and 0.6' });

  const db  = req.app.locals.db;
  const mid = machine_id || req.operator.machine_id;

  try {
    const result = await db.query(
      `INSERT INTO runs
         (operator_id, machine_id, pool_id, material_id, packing_density,
          alpha_used, alpha_optimal, chamber_vol, quality_result, degraded_frac, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [req.operator.id, mid, pool_id ?? null, material_id ?? null,
       packing_density, alpha_used ?? null, alpha_optimal ?? null,
       chamber_vol ?? null, quality_result ?? null, degraded_frac ?? null, notes ?? null]
    );
    res.status(201).json({ run: result.rows[0] });
  } catch (err) {
    console.error('runs POST error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/', async (req, res) => {
  const db     = req.app.locals.db;
  const limit  = Math.min(parseInt(req.query.limit) || 100, 500);
  const offset = parseInt(req.query.offset) || 0;

  let machineIds = [];

  if (req.query.pool_id) {
    const poolCheck = await db.query(
      'SELECT id FROM powder_pools WHERE id=$1 AND operator_id=$2',
      [parseInt(req.query.pool_id), req.operator.id]
    );
    if (!poolCheck.rows.length)
      return res.status(404).json({ error: 'Pool not found' });
    const pmResult = await db.query(
      'SELECT machine_id FROM pool_machines WHERE pool_id=$1',
      [parseInt(req.query.pool_id)]
    );
    machineIds = pmResult.rows.map(r => r.machine_id);
  } else if (req.query.machine_ids) {
    machineIds = req.query.machine_ids.split(',').map(Number).filter(Boolean);
  } else if (req.query.machine_id) {
    machineIds = [parseInt(req.query.machine_id)];
  } else {
    machineIds = [req.operator.machine_id];
  }

  if (!machineIds.length)
    return res.status(400).json({ error: 'No machines found' });

  try {
    const ph = machineIds.map((_, i) => `$${i + 1}`).join(',');
    const result = await db.query(
      `SELECT r.*, m.name AS machine_name, mat.name AS material_name,
              mat.is_calibrated AS material_is_calibrated
       FROM runs r
       LEFT JOIN machines  m   ON m.id   = r.machine_id
       LEFT JOIN materials mat ON mat.id = r.material_id
       WHERE r.machine_id IN (${ph})
       ORDER BY r.created_at DESC
       LIMIT $${machineIds.length + 1} OFFSET $${machineIds.length + 2}`,
      [...machineIds, limit, offset]
    );
    res.json({ runs: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('runs GET error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query(
      `SELECT r.*, m.name AS machine_name, mat.name AS material_name
       FROM runs r
       LEFT JOIN machines  m   ON m.id   = r.machine_id
       LEFT JOIN materials mat ON mat.id = r.material_id
       WHERE r.id=$1`, [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ run: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const check = await db.query(
      'SELECT id, machine_id FROM runs WHERE id=$1', [req.params.id]
    );
    if (!check.rows.length)
      return res.status(404).json({ error: 'Run not found' });

    const owned = await db.query(
      'SELECT machine_id FROM operator_machines WHERE operator_id=$1', [req.operator.id]
    );
    const ownedIds = owned.rows.map(r => r.machine_id);
    if (!ownedIds.includes(check.rows[0].machine_id) && req.operator.role !== 'admin')
      return res.status(403).json({ error: 'Not authorized to delete this run' });

    await db.query('DELETE FROM runs WHERE id=$1', [req.params.id]);
    res.json({ deleted: true, id: parseInt(req.params.id) });
  } catch (err) {
    console.error('runs DELETE error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
