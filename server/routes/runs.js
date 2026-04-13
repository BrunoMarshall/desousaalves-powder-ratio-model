/**
 * POST /api/runs        — record a new build run
 * GET  /api/runs        — list runs for current operator's machine
 * GET  /api/runs/:id    — single run detail
 */
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');

// All run endpoints require auth
router.use(authenticate);

// ─── Record a build run ───────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const {
    packing_density,   // 0.29 (decimal)
    alpha_used,        // 0.30
    alpha_optimal,     // 0.29  (what model recommended)
    chamber_vol,
    quality_result,
    degraded_frac,
    machine_id,
    notes,
  } = req.body;

  if (packing_density === undefined || packing_density === null) {
    return res.status(400).json({ error: 'packing_density is required' });
  }
  if (packing_density <= 0 || packing_density > 0.6) {
    return res.status(400).json({ error: 'packing_density must be between 0 and 0.6' });
  }

  const db = req.app.locals.db;
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

// ─── List runs for this machine ───────────────────────────────────────────────
router.get('/', async (req, res) => {
  const db = req.app.locals.db;
  const mid = req.query.machine_id || req.operator.machine_id;
  const limit  = Math.min(parseInt(req.query.limit)  || 50, 200);
  const offset = parseInt(req.query.offset) || 0;

  try {
    const result = await db.query(
      `SELECT r.*, o.username AS operator_name, m.name AS machine_name
       FROM runs r
       LEFT JOIN operators o ON o.id = r.operator_id
       LEFT JOIN machines  m ON m.id = r.machine_id
       WHERE r.machine_id = $1
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [mid, limit, offset]
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
    // Only allow deletion of own machine's runs
    const check = await db.query(
      'SELECT id, machine_id FROM runs WHERE id = $1',
      [req.params.id]
    );
    if (!check.rows.length) {
      return res.status(404).json({ error: 'Run not found' });
    }
    if (check.rows[0].machine_id !== req.operator.machine_id && req.operator.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to delete this run' });
    }

    await db.query('DELETE FROM runs WHERE id = $1', [req.params.id]);
    res.json({ deleted: true, id: parseInt(req.params.id) });
  } catch (err) {
    console.error('runs DELETE error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
