-- ============================================================
-- 050_unified_registration_role_linking.sql
-- Public registration + verified Parent/Teacher/School linking.
-- Additive and safe to run repeatedly after 049.
-- ============================================================

-- Add enum values outside the transaction so they are available to statements
-- below on PostgreSQL versions that defer new enum values until commit.
ALTER TYPE link_request_status ADD VALUE IF NOT EXISTS 'AWAITING_STUDENT';
ALTER TYPE link_request_status ADD VALUE IF NOT EXISTS 'AWAITING_PARENT';

BEGIN;

-- Parent/Student relationships are two-sided. A registration form may create
-- a request, but it must never create access merely because somebody typed a
-- matching Student ID, mobile number or email address.
ALTER TABLE parent_link_requests
  ADD COLUMN IF NOT EXISTS initiated_by VARCHAR(20) NOT NULL DEFAULT 'STUDENT',
  ADD COLUMN IF NOT EXISTS requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS student_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS parent_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS school_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE parent_link_requests
    ADD CONSTRAINT ck_parent_link_requests_initiated_by
    CHECK (initiated_by IN ('STUDENT', 'PARENT', 'SCHOOL'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Existing invitations were created from the Student/School onboarding side.
-- Mark Student consent for those legacy requests without changing their status.
UPDATE parent_link_requests
SET student_confirmed_at = COALESCE(student_confirmed_at, created_at)
WHERE initiated_by = 'STUDENT'
  AND student_confirmed_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_parent_link_open_pair
  ON parent_link_requests(parent_user_id, student_id)
  WHERE status IN ('PENDING', 'AWAITING_STUDENT', 'AWAITING_PARENT') AND parent_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_parent_link_open_parent
  ON parent_link_requests(parent_user_id, status, created_at DESC)
  WHERE parent_user_id IS NOT NULL;

-- A Teacher can create an identity independently, but joining a School is a
-- separate, School-approved membership. The teachers row is created only when
-- the School approves this request.
CREATE TABLE IF NOT EXISTS teacher_school_requests (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  status              link_request_status NOT NULL DEFAULT 'PENDING',
  employee_id         VARCHAR(30),
  designation         VARCHAR(120),
  qualification       VARCHAR(200),
  experience_yrs      SMALLINT NOT NULL DEFAULT 0 CHECK (experience_yrs BETWEEN 0 AND 60),
  employment_type     VARCHAR(30) NOT NULL DEFAULT 'FULL_TIME'
                        CHECK (employment_type IN ('FULL_TIME','PART_TIME','CONTRACT','VISITING')),
  teacher_note        TEXT,
  school_note         TEXT,
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at         TIMESTAMPTZ,
  reviewed_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_teacher_school_one_pending
  ON teacher_school_requests(teacher_user_id)
  WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_teacher_school_requests_school_status
  ON teacher_school_requests(requested_school_id, status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_teacher_school_requests_user
  ON teacher_school_requests(teacher_user_id, requested_at DESC);

DROP TRIGGER IF EXISTS trg_teacher_school_requests_updated_at ON teacher_school_requests;
CREATE TRIGGER trg_teacher_school_requests_updated_at
  BEFORE UPDATE ON teacher_school_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE teacher_school_requests IS
  'Teacher self-registration membership requests; School approval creates the canonical teachers row.';
COMMENT ON COLUMN parent_link_requests.initiated_by IS
  'Who initiated the relationship request. Access is granted only after the opposite side confirms, or a School verifies it.';

COMMIT;
