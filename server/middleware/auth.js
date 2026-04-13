/**
 * POST /api/auth/register  — create operator account
 * POST /api/auth/login     — get JWT token
 * GET  /api/auth/me        — verify token, return profile
 */
const router  = require('express').Router();
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const { authenticate } = require('../middleware/auth');

const SALT_ROUNDS = 12;

// ─── Register ─────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { username, password, machine_id } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const db = req.app.locals.db;
  try {
    const exists = await db.query('SELECT id FROM operators WHERE username = $1', [username]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await db.query(
      `INSERT INTO operators (username, password_hash, machine_id)
       VALUES ($1, $2, $3) RETURNING id, username, machine_id, role, created_at`,
      [username, hash, machine_id || null]
    );

    res.status(201).json({ operator: result.rows[0] });
  } catch (err) {
    console.error('register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Login ────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const db = req.app.locals.db;
  try {
    const result = await db.query(
      'SELECT * FROM operators WHERE username = $1',
      [username]
    );
    const operator = result.rows[0];

    if (!operator) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, operator.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last_login
    await db.query('UPDATE operators SET last_login = NOW() WHERE id = $1', [operator.id]);

    const token = jwt.sign(
      { id: operator.id, username: operator.username,
        machine_id: operator.machine_id, role: operator.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      operator: {
        id: operator.id,
        username: operator.username,
        machine_id: operator.machine_id,
        role: operator.role,
      }
    });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Me (verify token) ────────────────────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  const db = req.app.locals.db;
  try {
    const result = await db.query(
      `SELECT o.id, o.username, o.machine_id, o.role, o.created_at,
              m.name AS machine_name, m.model_key
       FROM operators o
       LEFT JOIN machines m ON m.id = o.machine_id
       WHERE o.id = $1`,
      [req.operator.id]
    );
    res.json({ operator: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
