-- ============================================================
-- 003_students.sql
-- Tables: students, parent_student_links
-- ============================================================

DO $$ BEGIN
  CREATE TYPE student_status AS ENUM ('ACTIVE', 'INACTIVE', 'TRANSFERRED', 'GRADUATED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE gender_type AS ENUM ('MALE', 'FEMALE', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── students ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS students (
  id              UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID           NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  school_id       UUID           NOT NULL REFERENCES schools(id),
  class_id        UUID           NOT NULL REFERENCES school_classes(id),
  roll_number     VARCHAR(20),
  academic_year   VARCHAR(10)    NOT NULL DEFAULT '2025-26',
  date_of_birth   DATE,
  gender          gender_type,
  status          student_status NOT NULL DEFAULT 'ACTIVE',
  admission_date  DATE           NOT NULL DEFAULT CURRENT_DATE,

  -- Gamification (denormalised for fast leaderboard reads)
  xp_total        INTEGER        NOT NULL DEFAULT 0,
  xp_level        INTEGER        NOT NULL DEFAULT 1,
  streak_current  INTEGER        NOT NULL DEFAULT 0,
  streak_best     INTEGER        NOT NULL DEFAULT 0,
  last_activity   DATE,

  -- Parent link (primary parent mobile for quick lookups)
  primary_parent_mobile VARCHAR(15),

  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  UNIQUE (school_id, class_id, roll_number, academic_year)
);

CREATE INDEX IF NOT EXISTS idx_students_user_id    ON students(user_id);
CREATE INDEX IF NOT EXISTS idx_students_school_id  ON students(school_id);
CREATE INDEX IF NOT EXISTS idx_students_class_id   ON students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_xp_total   ON students(xp_total DESC);
CREATE INDEX IF NOT EXISTS idx_students_status     ON students(status);

CREATE OR REPLACE TRIGGER trg_students_updated_at
  BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE  students              IS 'Student profiles; one row per enrollment';
COMMENT ON COLUMN students.xp_total    IS 'Denormalised XP; updated by trigger on xp_events insert';
COMMENT ON COLUMN students.xp_level    IS 'Level derived from xp_total; 1 level per 500 XP';
COMMENT ON COLUMN students.streak_current IS 'Consecutive active days; reset by nightly cron';

-- ── parent_student_links ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS parent_student_links (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_user_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id      UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  relation        VARCHAR(30) NOT NULL DEFAULT 'PARENT',  -- FATHER, MOTHER, GUARDIAN
  is_primary      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (parent_user_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_psl_parent_user_id ON parent_student_links(parent_user_id);
CREATE INDEX IF NOT EXISTS idx_psl_student_id     ON parent_student_links(student_id);

COMMENT ON TABLE parent_student_links IS 'Many-to-many: a parent can have multiple children; a student can have multiple parents';
