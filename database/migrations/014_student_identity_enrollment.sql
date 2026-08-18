-- ============================================================
-- 014_student_identity_enrollment.sql
-- Student credentials + school/parent linking workflow
-- Safe for an existing database and idempotent on repeat runs.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE student_school_link_status AS ENUM ('NOT_REQUESTED', 'PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE link_request_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Login identity ───────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(60);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(180);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_failed_attempts SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_locked_until TIMESTAMPTZ;

-- Legacy accounts need a guaranteed-unique non-mobile identity.  Use the full
-- UUID for the migration backfill so duplicate names can never collide.  New
-- registrations use the friendlier firstname.lastname allocator in auth.service.
UPDATE users
SET username = CONCAT(
  LEFT(
    COALESCE(
      NULLIF(TRIM(BOTH '.' FROM REGEXP_REPLACE(LOWER(COALESCE(name, 'user')), '[^a-z0-9]+', '.', 'g')), ''),
      'user'
    ),
    27
  ),
  '.',
  REPLACE(id::text, '-', '')
)
WHERE username IS NULL;

ALTER TABLE users ALTER COLUMN username SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username_lower
  ON users (LOWER(username));
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower
  ON users (LOWER(email)) WHERE email IS NOT NULL;

-- ── Student public identity + independent learning profile ───
CREATE SEQUENCE IF NOT EXISTS student_code_seq START WITH 100001;

CREATE OR REPLACE FUNCTION next_student_code()
RETURNS TEXT AS $$
BEGIN
  RETURN 'VS' || TO_CHAR(CURRENT_DATE, 'YY') || '-' || LPAD(NEXTVAL('student_code_seq')::TEXT, 7, '0');
END;
$$ LANGUAGE plpgsql;

ALTER TABLE students ADD COLUMN IF NOT EXISTS student_code VARCHAR(24);
ALTER TABLE students ADD COLUMN IF NOT EXISTS grade_level VARCHAR(10);
ALTER TABLE students ADD COLUMN IF NOT EXISTS school_link_status student_school_link_status NOT NULL DEFAULT 'APPROVED';
ALTER TABLE students ADD COLUMN IF NOT EXISTS school_link_reviewed_at TIMESTAMPTZ;
ALTER TABLE students ADD COLUMN IF NOT EXISTS school_link_reviewed_by UUID REFERENCES users(id);

-- A VidyaSetu Student may learn independently.  School/class become official
-- only after a school approves the affiliation request.
ALTER TABLE students ALTER COLUMN school_id DROP NOT NULL;
ALTER TABLE students ALTER COLUMN class_id DROP NOT NULL;

UPDATE students s
SET grade_level = COALESCE(s.grade_level, sc.class_name),
    school_link_status = CASE
      WHEN s.school_id IS NOT NULL THEN 'APPROVED'::student_school_link_status
      ELSE 'NOT_REQUESTED'::student_school_link_status
    END
FROM school_classes sc
WHERE s.class_id = sc.id;

UPDATE students
SET grade_level = COALESCE(grade_level, '8')
WHERE grade_level IS NULL;

UPDATE students
SET student_code = next_student_code()
WHERE student_code IS NULL;

ALTER TABLE students ALTER COLUMN student_code SET DEFAULT next_student_code();
ALTER TABLE students ALTER COLUMN student_code SET NOT NULL;
ALTER TABLE students ALTER COLUMN grade_level SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_students_student_code ON students(student_code);
CREATE INDEX IF NOT EXISTS idx_students_school_link_status ON students(school_link_status);

-- Platform-wide exams must also work for Students who are not yet affiliated
-- with a school. School-specific exams remain guarded by application logic.
ALTER TABLE exam_registrations ALTER COLUMN school_id DROP NOT NULL;
ALTER TABLE exam_attempts ALTER COLUMN school_id DROP NOT NULL;
ALTER TABLE exam_leaderboard ALTER COLUMN school_id DROP NOT NULL;

-- ── Student → School enrollment requests ────────────────────
CREATE TABLE IF NOT EXISTS student_school_requests (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id          UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  requested_school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  requested_class_id  UUID REFERENCES school_classes(id) ON DELETE SET NULL,
  requested_grade     VARCHAR(10) NOT NULL,
  status              link_request_status NOT NULL DEFAULT 'PENDING',
  student_note        TEXT,
  school_note         TEXT,
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at         TIMESTAMPTZ,
  reviewed_by         UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ssr_school_status
  ON student_school_requests(requested_school_id, status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_ssr_student
  ON student_school_requests(student_id, requested_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ssr_one_pending_per_student
  ON student_school_requests(student_id) WHERE status = 'PENDING';

DROP TRIGGER IF EXISTS trg_student_school_requests_updated_at ON student_school_requests;
CREATE TRIGGER trg_student_school_requests_updated_at
  BEFORE UPDATE ON student_school_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Student → Parent link/invitation requests ───────────────
CREATE TABLE IF NOT EXISTS parent_link_requests (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id     UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  parent_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  parent_name    VARCHAR(120),
  parent_mobile  VARCHAR(15),
  parent_email   VARCHAR(180),
  relation       VARCHAR(30) NOT NULL DEFAULT 'PARENT',
  status         link_request_status NOT NULL DEFAULT 'PENDING',
  claimed_at     TIMESTAMPTZ,
  reviewed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (parent_mobile IS NOT NULL OR parent_email IS NOT NULL OR parent_user_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_plr_student ON parent_link_requests(student_id, status);
CREATE INDEX IF NOT EXISTS idx_plr_mobile ON parent_link_requests(parent_mobile) WHERE parent_mobile IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_plr_email_lower ON parent_link_requests(LOWER(parent_email)) WHERE parent_email IS NOT NULL;

DROP TRIGGER IF EXISTS trg_parent_link_requests_updated_at ON parent_link_requests;
CREATE TRIGGER trg_parent_link_requests_updated_at
  BEFORE UPDATE ON parent_link_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON COLUMN users.username IS 'Case-insensitive login name; new users default to firstname.lastname with a numeric suffix only when needed';
COMMENT ON COLUMN users.email IS 'Optional email login/recovery identifier';
COMMENT ON COLUMN users.password_hash IS 'scrypt password hash; never stores plaintext';
COMMENT ON COLUMN students.student_code IS 'Stable human-readable VidyaSetu Student ID; accepted as a login identifier';
COMMENT ON COLUMN students.school_link_status IS 'Whether the Student is officially linked to the selected school';
COMMENT ON TABLE student_school_requests IS 'Self-registration school affiliation requests visible to School ERP for approval/rejection';
COMMENT ON TABLE parent_link_requests IS 'Pending parent relationships; auto-linked when a matching Parent account exists or claimed later';
