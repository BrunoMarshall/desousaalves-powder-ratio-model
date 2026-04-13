-- SLS Powder History Database Schema
-- Run as: psql -U postgres -f schema.sql

-- Create database and user
CREATE DATABASE sls_powder;
CREATE USER sls_user WITH ENCRYPTED PASSWORD 'CHANGE_THIS_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE sls_powder TO sls_user;

\connect sls_powder;
GRANT ALL ON SCHEMA public TO sls_user;

-- ─── Machines ─────────────────────────────────────────────────────────────────
CREATE TABLE machines (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  type        VARCHAR(50)  NOT NULL,   -- 'desktop' | 'industrial'
  model_key   VARCHAR(50)  UNIQUE,     -- e.g. 'formlabs-fuse1-30w'
  chamber_vol NUMERIC(8,3),            -- litres
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Pre-load the 5 machines from the website
INSERT INTO machines (name, type, model_key, chamber_vol) VALUES
  ('Formlabs Fuse 1+ 30W',       'desktop',    'formlabs-fuse1-30w',  8.17),
  ('EOS P770',                    'industrial', 'eos-p770',           154.00),
  ('EOS P396',                    'industrial', 'eos-p396',            89.00),
  ('3D Systems sPro 60',          'industrial', '3dsystems-spro60',    68.00),
  ('HP Multi Jet Fusion 5200',    'industrial', 'hp-mjf5200',         116.00);

-- ─── Operators (users) ────────────────────────────────────────────────────────
CREATE TABLE operators (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(80) UNIQUE NOT NULL,
  password_hash VARCHAR(120) NOT NULL,   -- bcrypt
  machine_id    INT REFERENCES machines(id),
  role          VARCHAR(20) DEFAULT 'operator',  -- 'operator' | 'admin'
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_login    TIMESTAMPTZ
);

-- ─── Build runs ───────────────────────────────────────────────────────────────
-- One row per SLS build. This is the core history table.
CREATE TABLE runs (
  id               SERIAL PRIMARY KEY,
  operator_id      INT REFERENCES operators(id) ON DELETE SET NULL,
  machine_id       INT REFERENCES machines(id)  ON DELETE SET NULL,
  packing_density  NUMERIC(6,4) NOT NULL,   -- decimal, e.g. 0.29
  alpha_used       NUMERIC(6,4),            -- virgin ratio actually used
  alpha_optimal    NUMERIC(6,4),            -- what model recommended
  chamber_vol      NUMERIC(8,3),            -- litres (may differ per run)
  quality_result   NUMERIC(6,4),            -- Q value computed
  degraded_frac    NUMERIC(6,4),            -- π₄ fraction
  builds_context   INT DEFAULT 1,           -- build number in current powder batch
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Powder batches ───────────────────────────────────────────────────────────
-- Optional: track when a fresh powder batch starts
CREATE TABLE batches (
  id          SERIAL PRIMARY KEY,
  operator_id INT REFERENCES operators(id),
  machine_id  INT REFERENCES machines(id),
  started_at  TIMESTAMPTZ DEFAULT NOW(),
  closed_at   TIMESTAMPTZ,
  notes       TEXT
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX idx_runs_machine   ON runs(machine_id);
CREATE INDEX idx_runs_operator  ON runs(operator_id);
CREATE INDEX idx_runs_created   ON runs(created_at DESC);

-- ─── Grant table privileges ───────────────────────────────────────────────────
GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO sls_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO sls_user;
