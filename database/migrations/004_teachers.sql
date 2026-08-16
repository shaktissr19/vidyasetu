-- ============================================================
-- 004_teachers.sql
-- Tables: teachers, teacher_assignments
-- ============================================================

DO $$ BEGIN
  CREATE TYPE teacher_status AS ENUM ('ACTIVE', 'INACTIVE', 'ON_LEAVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── teachers ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS teachers (
  id              UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID           NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  school_id       UUID           NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  employee_id     VARCHAR(30),
  qualification   VARCHAR(200),
  experience_yrs  SMALLINT       DEFAULT 0,
  status          teacher_status NOT NULL DEFAULT 'ACTIVE',
  joined_date     DATE           NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  UNIQUE (school_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_teachers_user_id   ON teachers(user_id);
CREATE INDEX IF NOT EXISTS idx_teachers_school_id ON teachers(school_id);
CREATE INDEX IF NOT EXISTS idx_teachers_status    ON teachers(status);

CREATE OR REPLACE TRIGGER trg_teachers_updated_at
  BEFORE UPDATE ON teachers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE teachers IS 'Teacher profiles linked to a school';

-- ── teacher_assignments ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS teacher_assignments (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id     UUID        NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  school_id      UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id       UUID        NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  subject_code   VARCHAR(20) NOT NULL,  -- matches subjects.code
  academic_year  VARCHAR(10) NOT NULL DEFAULT '2025-26',
  is_class_teacher BOOLEAN   NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (teacher_id, class_id, subject_code, academic_year)
);

CREATE INDEX IF NOT EXISTS idx_ta_teacher_id ON teacher_assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_ta_class_id   ON teacher_assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_ta_school_id  ON teacher_assignments(school_id);

COMMENT ON TABLE  teacher_assignments                IS 'Which teacher teaches which subject in which class';
COMMENT ON COLUMN teacher_assignments.is_class_teacher IS 'Class teacher flag — used for parent messaging routing';
