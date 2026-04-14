/**
 * GET /api/materials                      — all materials
 * GET /api/materials?machine_key=eos-p770 — filtered by machine compatibility
 */
const router = require('express').Router();

router.get('/', async (req, res) => {
  const db = req.app.locals.db;
  try {
    let query = `SELECT id, name, manufacturer, material_type,
                        compatible_with, is_calibrated, calibration_note
                 FROM materials`;
    const params = [];

    if (req.query.machine_key) {
      query += ` WHERE $1 = ANY(compatible_with)`;
      params.push(req.query.machine_key);
    }

    query += ` ORDER BY is_calibrated DESC, manufacturer, name`;

    const result = await db.query(query, params);
    res.json({ materials: result.rows });
  } catch (err) {
    console.error('materials GET error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
