-- ============================================================
-- 001_users.sql
-- Tables: users, otp_requests, refresh_tokens
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Enum types ──────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('STUDENT', 'SCHOOL_ADMIN', 'PARENT', 'SUPER_ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Shared trigger function: update updated_at ──────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── users ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  mobile           VARCHAR(15) NOT NULL UNIQUE,
  name             VARCHAR(120),
  role             user_role   NOT NULL DEFAULT 'STUDENT',
  status           user_status NOT NULL DEFAULT 'ACTIVE',
  language         VARCHAR(5)  NOT NULL DEFAULT 'hi'
                     CHECK (language IN ('hi','en','ta','te','mr','bn','gu','kn','or')),
  profile_photo    TEXT,
  last_login_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_mobile ON users(mobile);
CREATE INDEX IF NOT EXISTS idx_users_role   ON users(role);

CREATE OR REPLACE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE  users           IS 'All platform users across roles';
COMMENT ON COLUMN users.language  IS 'ISO 639-1 code; hi=Hindi default for Bharat';

-- ── otp_requests ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS otp_requests (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  mobile       VARCHAR(15) NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address   VARCHAR(45),
  user_agent   TEXT
);

CREATE INDEX IF NOT EXISTS idx_otp_requests_mobile ON otp_requests(mobile);
CREATE INDEX IF NOT EXISTS idx_otp_requests_time   ON otp_requests(requested_at);

COMMENT ON TABLE otp_requests IS 'Audit log of every OTP send; used for rate-limit checks';

-- ── refresh_tokens ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   VARCHAR(64) NOT NULL UNIQUE,
  device_info  TEXT,
  ip_address   VARCHAR(45),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rt_user_id    ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_rt_token_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_rt_expires    ON refresh_tokens(expires_at);

COMMENT ON TABLE  refresh_tokens            IS 'JWT refresh tokens; revoked_at NULL means active';
COMMENT ON COLUMN refresh_tokens.token_hash IS 'SHA-256 hex of the raw JWT refresh token';
