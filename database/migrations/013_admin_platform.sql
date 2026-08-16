-- ============================================================
-- 013_admin_platform.sql
-- Tables: platform_config, subscription_events,
--         support_tickets, audit_log
-- ============================================================

DO $$ BEGIN
  CREATE TYPE ticket_status AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ticket_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── platform_config ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform_config (
  key         VARCHAR(100) PRIMARY KEY,
  value       TEXT         NOT NULL,
  description TEXT,
  updated_by  UUID         REFERENCES users(id),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE platform_config IS 'Key-value store for super-admin controlled platform settings';

-- Seed default config values
INSERT INTO platform_config (key, value, description) VALUES
  ('XP_PER_LESSON',              '10',   'Base XP awarded per lesson completion'),
  ('XP_PER_QUIZ_PASS',           '20',   'XP for passing a quiz (>=60%)'),
  ('XP_PER_QUIZ_PERFECT',        '50',   'XP for 100% quiz score'),
  ('XP_STREAK_BONUS_7D',         '100',  'Bonus XP for 7-day streak'),
  ('XP_STREAK_BONUS_30D',        '500',  'Bonus XP for 30-day streak'),
  ('OTP_EXPIRY_MINUTES',         '10',   'OTP validity window in minutes'),
  ('OTP_MAX_ATTEMPTS',           '3',    'Max wrong OTP attempts before lockout'),
  ('LOCKOUT_DURATION_MINUTES',   '60',   'Duration of OTP lockout in minutes'),
  ('FREE_PLAN_MAX_STUDENTS',     '50',   'Max students on free plan'),
  ('BASIC_PLAN_MAX_STUDENTS',    '200',  'Max students on basic plan'),
  ('PRO_PLAN_MAX_STUDENTS',      '1000', 'Max students on pro plan'),
  ('RAZORPAY_FEE_PCT',           '2',    'Razorpay transaction fee percentage'),
  ('WHATSAPP_DAILY_LIMIT',       '1000', 'Max WhatsApp messages per school per day'),
  ('CONTENT_MAX_SIZE_MB',        '500',  'Max upload size per content item in MB'),
  ('OFFLINE_SYNC_INTERVAL_MINS', '30',   'How often offline content delta is packaged')
ON CONFLICT (key) DO NOTHING;

-- ── subscription_events ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS subscription_events (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id        UUID         NOT NULL REFERENCES schools(id),
  event_type       VARCHAR(50)  NOT NULL,  -- 'TRIAL_START', 'UPGRADED', 'DOWNGRADED', 'CANCELLED', 'RENEWED'
  from_plan        school_plan,
  to_plan          school_plan,
  amount_paid      NUMERIC(10,2) DEFAULT 0,
  razorpay_payment_id VARCHAR(100),
  valid_from       TIMESTAMPTZ  NOT NULL,
  valid_until      TIMESTAMPTZ,
  notes            TEXT,
  created_by       UUID         REFERENCES users(id),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_se_school_id   ON subscription_events(school_id);
CREATE INDEX IF NOT EXISTS idx_se_event_type  ON subscription_events(event_type);
CREATE INDEX IF NOT EXISTS idx_se_created_at  ON subscription_events(created_at DESC);

COMMENT ON TABLE subscription_events IS 'Append-only ledger of all subscription changes per school';

-- ── support_tickets ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS support_tickets (
  id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id       UUID            REFERENCES schools(id),
  raised_by       UUID            NOT NULL REFERENCES users(id),
  assigned_to     UUID            REFERENCES users(id),
  subject         VARCHAR(300)    NOT NULL,
  description     TEXT            NOT NULL,
  status          ticket_status   NOT NULL DEFAULT 'OPEN',
  priority        ticket_priority NOT NULL DEFAULT 'MEDIUM',
  category        VARCHAR(100),   -- 'BILLING', 'TECHNICAL', 'CONTENT', 'FEATURE_REQUEST'
  resolution      TEXT,
  closed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_st_school_id   ON support_tickets(school_id);
CREATE INDEX IF NOT EXISTS idx_st_status      ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_st_priority    ON support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_st_raised_by   ON support_tickets(raised_by);
CREATE INDEX IF NOT EXISTS idx_st_created_at  ON support_tickets(created_at DESC);

CREATE OR REPLACE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE support_tickets IS 'Customer support tickets from schools and users';

-- ── audit_log ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id      UUID        REFERENCES users(id),
  actor_role    user_role,
  school_id     UUID        REFERENCES schools(id),
  action        VARCHAR(100) NOT NULL,   -- 'SCHOOL_APPROVED', 'USER_SUSPENDED', 'FEE_WAIVED'
  entity_type   VARCHAR(50),             -- 'school', 'user', 'fee_invoice'
  entity_id     UUID,
  old_value     JSONB,
  new_value     JSONB,
  ip_address    VARCHAR(45),
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- Append-only: no updates, no deletes
);

CREATE INDEX IF NOT EXISTS idx_al_actor_id    ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_al_school_id   ON audit_log(school_id);
CREATE INDEX IF NOT EXISTS idx_al_action      ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_al_entity      ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_al_created_at  ON audit_log(created_at DESC);

COMMENT ON TABLE audit_log IS 'Immutable audit trail of all admin and sensitive actions across the platform';
