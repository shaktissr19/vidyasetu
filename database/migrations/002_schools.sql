-- ============================================================
-- 002_schools.sql
-- Tables: schools, school_classes
-- ============================================================

DO $$ BEGIN
  CREATE TYPE school_status AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE school_plan AS ENUM ('FREE', 'BASIC', 'PRO', 'ENTERPRISE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── schools ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS schools (
  id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              VARCHAR(200)  NOT NULL,
  name_hi           VARCHAR(200),                      -- Hindi name for display
  udise_code        VARCHAR(20)   UNIQUE,              -- Govt school identifier
  admin_user_id     UUID          NOT NULL REFERENCES users(id),
  status            school_status NOT NULL DEFAULT 'PENDING',
  plan              school_plan   NOT NULL DEFAULT 'FREE',

  -- Location
  address           TEXT,
  city              VARCHAR(100),
  district          VARCHAR(100),
  state             VARCHAR(100)  NOT NULL DEFAULT 'Uttar Pradesh',
  pincode           VARCHAR(10),
  lat               NUMERIC(10,7),
  lng               NUMERIC(10,7),

  -- Contact
  mobile            VARCHAR(15),
  email             VARCHAR(150),
  website           VARCHAR(255),

  -- Stats (denormalised counters — updated via triggers)
  total_students    INTEGER       NOT NULL DEFAULT 0,
  total_teachers    INTEGER       NOT NULL DEFAULT 0,

  -- Subscription
  plan_started_at   TIMESTAMPTZ,
  plan_expires_at   TIMESTAMPTZ,
  trial_ends_at     TIMESTAMPTZ,

  -- Meta
  academic_year     VARCHAR(10)   NOT NULL DEFAULT '2025-26',
  logo_url          TEXT,
  settings          JSONB         NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schools_status        ON schools(status);
CREATE INDEX IF NOT EXISTS idx_schools_state         ON schools(state);
CREATE INDEX IF NOT EXISTS idx_schools_admin_user_id ON schools(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_schools_udise         ON schools(udise_code);

CREATE OR REPLACE TRIGGER trg_schools_updated_at
  BEFORE UPDATE ON schools
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE  schools             IS 'Partner schools onboarded to VidyaSetu';
COMMENT ON COLUMN schools.udise_code  IS 'UDISE+ unique identifier assigned by Govt of India';
COMMENT ON COLUMN schools.settings    IS 'JSON bag: fee_cycle, whatsapp_enabled, etc.';

-- ── school_classes ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS school_classes (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id      UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_name     VARCHAR(10) NOT NULL,   -- '6', '7', '8', '9', '10', '11', '12'
  section        VARCHAR(5)  NOT NULL DEFAULT 'A',
  academic_year  VARCHAR(10) NOT NULL DEFAULT '2025-26',
  room_number    VARCHAR(20),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (school_id, class_name, section, academic_year)
);

CREATE INDEX IF NOT EXISTS idx_school_classes_school ON school_classes(school_id);
CREATE INDEX IF NOT EXISTS idx_school_classes_name   ON school_classes(class_name);

COMMENT ON TABLE school_classes IS 'Each class-section combination in a school per academic year';
