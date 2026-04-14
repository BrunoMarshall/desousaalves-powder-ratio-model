/**
 * De Sousa Alves et al. — SLS Powder History API
 * Node.js / Express backend for Contabo VPS
 * Records build history and computes data-driven initial state π(0)
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
require('dotenv').config();

const authRoutes      = require('./routes/auth');
const runsRoutes      = require('./routes/runs');
const historyRoutes   = require('./routes/history');
const materialsRoutes = require('./routes/materials');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Database pool ──────────────────────────────────────────────────────────
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'sls_powder',
  user:     process.env.DB_USER     || 'sls_user',
  password: process.env.DB_PASSWORD,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('Unexpected DB pool error:', err);
});

// Make pool available to routes
app.locals.db = pool;

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: [
    'https://desousaalves-powder-ratio-model.com',
    'https://www.desousaalves-powder-ratio-model.com',
    'http://localhost:8000',   // local dev
    'http://127.0.0.1:8000',
  ],
  credentials: true,
}));
app.use(express.json());

// Rate limiting — 100 req/15min per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/runs',      runsRoutes);
app.use('/api/history',   historyRoutes);
app.use('/api/materials', materialsRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`SLS Powder API running on port ${PORT}`);
});

module.exports = app;
