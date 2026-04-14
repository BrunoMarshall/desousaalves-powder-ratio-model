/**
 * POST /api/runs        — record a new build run
 * GET  /api/runs        — list runs (supports ?machine_ids=1,2 or ?machine_id=1)
 * GET  /api/runs/:id    — single run
 * DELETE /api/runs/:id  — delete a run
 */
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// ─── Record a run ─────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const {
    packing_density, alpha_used, alpha_optimal,
    chamber_vol, quality_result, degraded_frac,
    machine_id, notes,
  } = req.body;

  if (packing_density === undefined || packing_density === null)
    return res.status(400).json({ error: 'packing_density is required' });
  if (packing_density <= 0 || packing_density > 0.6)
    return res.status(400).json({ error: 'packing_density must be between 0 and 0.6' });

  const db  = req.app.locals.db;
  const mid = machine_id || req.operator.machine_id;

  try {
    const result = await db.query(
      `INSERT INTO runs
         (operator_id, machine_id, packing_density, alpha_used, alpha_optimal,
          chamber_vol, quality_result, degraded_frac, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [req.operator.id, mid, packing_density, alpha_used ?? null,
       alpha_optimal ?? null, chamber_vol ?? null,
       quality_result ?? null, degraded_frac ?? null, notes ?? null]
    );
    res.status(201).json({ run: result.rows[0] });
  } catch (err) {
    console.error('runs POST error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── List runs ────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const db     = req.app.locals.db;
  const limit  = Math.min(parseInt(req.query.limit)  || 100, 500);
  const offset = parseInt(req.query.offset) || 0;

  // Support ?machine_ids=1,2,3 or ?machine_id=1
  let machineIds = [];
  if (req.query.machine_ids) {
    machineIds = req.query.machine_ids.split(',').map(Number).filter(Boolean);
  } else if (req.query.machine_id) {
    machineIds = [parseInt(req.query.machine_id)];
  } else if (req.operator.machine_id) {
    machineIds = [req.operator.machine_id];
  }

  if (!machineIds.length)
    return res.status(400).json({ error: 'machine_id or machine_ids required' });

  try {
    const placeholders = machineIds.map((_, i) => `$${i + 1}`).join(',');
    const result = await db.query(
      `SELECT r.*, o.username AS operator_name,
              CONCAT(o.last_name, ', ', o.first_name) AS operator_display,
              m.name AS machine_name
       FROM runs r
       LEFT JOIN operators o ON o.id = r.operator_id
       LEFT JOIN machines  m ON m.id = r.machine_id
       WHERE r.machine_id IN (${placeholders})
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

// ─── Single run ───────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query(
      `SELECT r.*, o.username, m.name AS machine_name
       FROM runs r
       LEFT JOIN operators o ON o.id = r.operator_id
       LEFT JOIN machines  m ON m.id = r.machine_id
       WHERE r.id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ run: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Delete a run ─────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const db = req.app.locals.db;
  try {
    const check = await db.query(
      'SELECT id, machine_id FROM runs WHERE id = $1', [req.params.id]
    );
    if (!check.rows.length)
      return res.status(404).json({ error: 'Run not found' });

    // Allow deletion if the run belongs to one of the operator's machines
    const ownedMachines = await db.query(
      'SELECT machine_id FROM operator_machines WHERE operator_id = $1',
      [req.operator.id]
    );
    const ownedIds = ownedMachines.rows.map(r => r.machine_id);

    if (!ownedIds.includes(check.rows[0].machine_id) && req.operator.role !== 'admin')
      return res.status(403).json({ error: 'Not authorized to delete this run' });

    await db.query('DELETE FROM runs WHERE id = $1', [req.params.id]);
    res.json({ deleted: true, id: parseInt(req.params.id) });
  } catch (err) {
    console.error('runs DELETE error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
