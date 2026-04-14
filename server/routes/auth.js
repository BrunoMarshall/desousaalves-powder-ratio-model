/**
 * POST /api/auth/register              — create operator with first pool
 * POST /api/auth/login                 — get JWT
 * GET  /api/auth/me                    — profile + all pools
 * GET  /api/auth/pools                 — list operator's powder pools
 * POST /api/auth/pools                 — create a new powder pool
 * DELETE /api/auth/pools/:poolId       — delete a pool (must have no runs)
 * POST /api/auth/pools/:poolId/machines       — add machine to pool
 * DELETE /api/auth/pools/:poolId/machines/:mid — remove machine from pool
 */
const router  = require('express').Router();
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const { authenticate } = require('../middleware/auth');

const SALT_ROUNDS = 12;

// ─── Helper: fetch all pools for an operator ──────────────────────────────────
async function fetchPools(db, operatorId) {
  const pools = await db.query(
    `SELECT pp.id, pp.name, pp.created_at,
            array_agg(pm.machine_id ORDER BY pm.machine_id) AS machine_ids,
            array_agg(m.name        ORDER BY pm.machine_id) AS machine_names,
            array_agg(m.model_key   ORDER BY pm.machine_id) AS machine_keys
     FROM powder_pools pp
     LEFT JOIN pool_machines pm ON pm.pool_id  = pp.id
     LEFT JOIN machines m       ON m.id        = pm.machine_id
     WHERE pp.operator_id = $1
     GROUP BY pp.id, pp.name, pp.created_at
     ORDER BY pp.created_at`,
    [operatorId]
  );
  return pools.rows.map(p => ({
    ...p,
    machine_ids:   p.machine_ids.filter(Boolean),
    machine_names: p.machine_names.filter(Boolean),
    machine_keys:  p.machine_keys.filter(Boolean),
  }));
}

// ─── Register ─────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { username, password, first_name, last_name, pool_name, machine_ids } = req.body;

  if (!username || !password)
    return res.status(400).json({ error: 'username and password are required' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (!first_name || !last_name)
    return res.status(400).json({ error: 'first_name and last_name are required' });
  if (!machine_ids || !machine_ids.length)
    return res.status(400).json({ error: 'At least one machine must be selected' });

  const db     = req.app.locals.db;
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const exists = await client.query(
      'SELECT id FROM operators WHERE username = $1', [username]
    );
    if (exists.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Username already taken' });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);

    const opResult = await client.query(
      `INSERT INTO operators (username, password_hash, first_name, last_name, machine_id)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, username, first_name, last_name, machine_id, role, created_at`,
      [username, hash, first_name.trim(), last_name.trim(), machine_ids[0]]
    );
    const operator = opResult.rows[0];

    // Create first powder pool
    const poolName = (pool_name || 'Pool 1').trim();
    const poolResult = await client.query(
      `INSERT INTO powder_pools (operator_id, name) VALUES ($1,$2) RETURNING id`,
      [operator.id, poolName]
    );
    const poolId = poolResult.rows[0].id;

    // Link machines to pool + operator_machines
    for (const mid of machine_ids) {
      await client.query(
        `INSERT INTO pool_machines (pool_id, machine_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [poolId, mid]
      );
      await client.query(
        `INSERT INTO operator_machines (operator_id, machine_id, is_primary)
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [operator.id, mid, mid === machine_ids[0]]
      );
    }

    await client.query('COMMIT');

    const pools = await fetchPools(db, operator.id);
    res.status(201).json({ operator: { ...operator, pools } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// ─── Login ────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'username and password are required' });

  const db = req.app.locals.db;
  try {
    const result = await db.query(
      'SELECT * FROM operators WHERE username = $1', [username]
    );
    const operator = result.rows[0];
    if (!operator)
      return res.status(401).json({ error: 'Invalid username or password' });

    const match = await bcrypt.compare(password, operator.password_hash);
    if (!match)
      return res.status(401).json({ error: 'Invalid username or password' });

    await db.query('UPDATE operators SET last_login=NOW() WHERE id=$1', [operator.id]);

    const pools = await fetchPools(db, operator.id);

    const token = jwt.sign(
      {
        id:         operator.id,
        username:   operator.username,
        first_name: operator.first_name,
        last_name:  operator.last_name,
        machine_id: operator.machine_id,
        role:       operator.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      operator: {
        id:         operator.id,
        username:   operator.username,
        first_name: operator.first_name,
        last_name:  operator.last_name,
        machine_id: operator.machine_id,
        role:       operator.role,
        pools,
      }
    });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Me ───────────────────────────────────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query(
      `SELECT id, username, first_name, last_name, machine_id, role, created_at
       FROM operators WHERE id = $1`, [req.operator.id]
    );
    const pools = await fetchPools(db, req.operator.id);
    res.json({ operator: { ...result.rows[0], pools } });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── List pools ───────────────────────────────────────────────────────────────
router.get('/pools', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const pools = await fetchPools(db, req.operator.id);
    res.json({ pools });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Create pool ──────────────────────────────────────────────────────────────
router.post('/pools', authenticate, async (req, res) => {
  const { name, machine_ids } = req.body;
  if (!name || !name.trim())
    return res.status(400).json({ error: 'Pool name is required' });
  if (!machine_ids || !machine_ids.length)
    return res.status(400).json({ error: 'At least one machine required' });

  const db     = req.app.locals.db;
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const poolResult = await client.query(
      `INSERT INTO powder_pools (operator_id, name) VALUES ($1,$2) RETURNING id, name, created_at`,
      [req.operator.id, name.trim()]
    );
    const poolId = poolResult.rows[0].id;

    for (const mid of machine_ids) {
      await client.query(
        `INSERT INTO pool_machines (pool_id, machine_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [poolId, mid]
      );
      // Also ensure machine is in operator_machines
      await client.query(
        `INSERT INTO operator_machines (operator_id, machine_id, is_primary)
         VALUES ($1,$2,false) ON CONFLICT DO NOTHING`,
        [req.operator.id, mid]
      );
    }

    await client.query('COMMIT');
    const pools = await fetchPools(db, req.operator.id);
    res.status(201).json({ pools });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('create pool error:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// ─── Delete pool ──────────────────────────────────────────────────────────────
router.delete('/pools/:poolId', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  const pid = parseInt(req.params.poolId);
  try {
    // Check ownership
    const check = await db.query(
      'SELECT id FROM powder_pools WHERE id=$1 AND operator_id=$2',
      [pid, req.operator.id]
    );
    if (!check.rows.length)
      return res.status(404).json({ error: 'Pool not found' });

    // Prevent deleting last pool
    const count = await db.query(
      'SELECT COUNT(*) FROM powder_pools WHERE operator_id=$1', [req.operator.id]
    );
    if (parseInt(count.rows[0].count) <= 1)
      return res.status(400).json({ error: 'Cannot delete your only pool. Create another first.' });

    await db.query('DELETE FROM powder_pools WHERE id=$1', [pid]);
    const pools = await fetchPools(db, req.operator.id);
    res.json({ pools });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Add machine to pool ──────────────────────────────────────────────────────
router.post('/pools/:poolId/machines', authenticate, async (req, res) => {
  const db  = req.app.locals.db;
  const pid = parseInt(req.params.poolId);
  const { machine_id } = req.body;
  if (!machine_id)
    return res.status(400).json({ error: 'machine_id required' });

  try {
    const check = await db.query(
      'SELECT id FROM powder_pools WHERE id=$1 AND operator_id=$2',
      [pid, req.operator.id]
    );
    if (!check.rows.length)
      return res.status(404).json({ error: 'Pool not found' });

    await db.query(
      `INSERT INTO pool_machines (pool_id, machine_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [pid, machine_id]
    );
    await db.query(
      `INSERT INTO operator_machines (operator_id, machine_id, is_primary)
       VALUES ($1,$2,false) ON CONFLICT DO NOTHING`,
      [req.operator.id, machine_id]
    );

    const pools = await fetchPools(db, req.operator.id);
    res.json({ pools });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Remove machine from pool ─────────────────────────────────────────────────
router.delete('/pools/:poolId/machines/:machineId', authenticate, async (req, res) => {
  const db  = req.app.locals.db;
  const pid = parseInt(req.params.poolId);
  const mid = parseInt(req.params.machineId);

  try {
    const check = await db.query(
      'SELECT id FROM powder_pools WHERE id=$1 AND operator_id=$2',
      [pid, req.operator.id]
    );
    if (!check.rows.length)
      return res.status(404).json({ error: 'Pool not found' });

    // Prevent removing last machine from pool
    const count = await db.query(
      'SELECT COUNT(*) FROM pool_machines WHERE pool_id=$1', [pid]
    );
    if (parseInt(count.rows[0].count) <= 1)
      return res.status(400).json({ error: 'Cannot remove the last machine from a pool. Delete the pool instead.' });

    await db.query(
      'DELETE FROM pool_machines WHERE pool_id=$1 AND machine_id=$2', [pid, mid]
    );

    const pools = await fetchPools(db, req.operator.id);
    res.json({ pools });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
