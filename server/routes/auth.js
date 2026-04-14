/**
 * POST /api/auth/register          — create operator (explicit only)
 * POST /api/auth/login             — get JWT token
 * GET  /api/auth/me                — verify token, return profile + machines
 * POST /api/auth/machines          — add machine to operator's powder pool
 * DELETE /api/auth/machines/:id    — remove machine from pool
 */
const router  = require('express').Router();
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const { authenticate } = require('../middleware/auth');

const SALT_ROUNDS = 12;

// ─── Register ─────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { username, password, first_name, last_name, machine_ids } = req.body;

  if (!username || !password)
    return res.status(400).json({ error: 'username and password are required' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (!first_name || !last_name)
    return res.status(400).json({ error: 'first_name and last_name are required' });
  if (!machine_ids || !machine_ids.length)
    return res.status(400).json({ error: 'At least one machine must be selected' });

  const db = req.app.locals.db;
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
    const primaryMachineId = machine_ids[0];

    const result = await client.query(
      `INSERT INTO operators (username, password_hash, first_name, last_name, machine_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, first_name, last_name, machine_id, role, created_at`,
      [username, hash, first_name.trim(), last_name.trim(), primaryMachineId]
    );
    const operator = result.rows[0];

    for (const mid of machine_ids) {
      await client.query(
        `INSERT INTO operator_machines (operator_id, machine_id, is_primary)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [operator.id, mid, mid === primaryMachineId]
      );
    }

    await client.query('COMMIT');

    const machines = await db.query(
      `SELECT m.id, m.name, m.model_key, om.is_primary
       FROM operator_machines om
       JOIN machines m ON m.id = om.machine_id
       WHERE om.operator_id = $1
       ORDER BY om.is_primary DESC, m.name`,
      [operator.id]
    );

    res.status(201).json({ operator: { ...operator, machines: machines.rows } });
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

    await db.query('UPDATE operators SET last_login = NOW() WHERE id = $1', [operator.id]);

    const machines = await db.query(
      `SELECT m.id, m.name, m.model_key, om.is_primary
       FROM operator_machines om
       JOIN machines m ON m.id = om.machine_id
       WHERE om.operator_id = $1
       ORDER BY om.is_primary DESC, m.name`,
      [operator.id]
    );
    const machineIds = machines.rows.map(m => m.id);

    const token = jwt.sign(
      {
        id:          operator.id,
        username:    operator.username,
        first_name:  operator.first_name,
        last_name:   operator.last_name,
        machine_id:  operator.machine_id,
        machine_ids: machineIds,
        role:        operator.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      operator: {
        id:          operator.id,
        username:    operator.username,
        first_name:  operator.first_name,
        last_name:   operator.last_name,
        machine_id:  operator.machine_id,
        machine_ids: machineIds,
        machines:    machines.rows,
        role:        operator.role,
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
    const machines = await db.query(
      `SELECT m.id, m.name, m.model_key, om.is_primary
       FROM operator_machines om
       JOIN machines m ON m.id = om.machine_id
       WHERE om.operator_id = $1
       ORDER BY om.is_primary DESC, m.name`,
      [req.operator.id]
    );
    res.json({
      operator: {
        ...result.rows[0],
        machines:    machines.rows,
        machine_ids: machines.rows.map(m => m.id),
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Add machine ──────────────────────────────────────────────────────────────
router.post('/machines', authenticate, async (req, res) => {
  const { machine_id } = req.body;
  if (!machine_id)
    return res.status(400).json({ error: 'machine_id required' });

  const db = req.app.locals.db;
  try {
    const mCheck = await db.query('SELECT id, name FROM machines WHERE id = $1', [machine_id]);
    if (!mCheck.rows.length)
      return res.status(404).json({ error: 'Machine not found' });

    await db.query(
      `INSERT INTO operator_machines (operator_id, machine_id, is_primary)
       VALUES ($1, $2, false) ON CONFLICT DO NOTHING`,
      [req.operator.id, machine_id]
    );

    const machines = await db.query(
      `SELECT m.id, m.name, m.model_key, om.is_primary
       FROM operator_machines om
       JOIN machines m ON m.id = om.machine_id
       WHERE om.operator_id = $1
       ORDER BY om.is_primary DESC, m.name`,
      [req.operator.id]
    );
    res.json({ machines: machines.rows });
  } catch (err) {
    console.error('add machine error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Remove machine ───────────────────────────────────────────────────────────
router.delete('/machines/:machineId', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  const mid = parseInt(req.params.machineId);
  try {
    const count = await db.query(
      'SELECT COUNT(*) FROM operator_machines WHERE operator_id = $1', [req.operator.id]
    );
    if (parseInt(count.rows[0].count) <= 1)
      return res.status(400).json({ error: 'Cannot remove your only machine. Add another first.' });

    await db.query(
      'DELETE FROM operator_machines WHERE operator_id = $1 AND machine_id = $2',
      [req.operator.id, mid]
    );

    const machines = await db.query(
      `SELECT m.id, m.name, m.model_key, om.is_primary
       FROM operator_machines om
       JOIN machines m ON m.id = om.machine_id
       WHERE om.operator_id = $1
       ORDER BY om.is_primary DESC, m.name`,
      [req.operator.id]
    );
    res.json({ machines: machines.rows });
  } catch (err) {
    console.error('remove machine error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
