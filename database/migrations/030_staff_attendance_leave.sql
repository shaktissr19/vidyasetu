-- ============================================================
-- 030_staff_attendance_leave.sql
-- Governed Teacher leave + staff attendance integrated with School calendar.
-- Additive/idempotent. Requires the School Calendar foundation from migration 029.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE staff_attendance_status AS ENUM
    ('PRESENT','ABSENT','LATE','HALF_DAY','EXCUSED','HOLIDAY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'STAFF_LEAVE_SUBMITTED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'STAFF_LEAVE_APPROVED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'STAFF_LEAVE_REJECTED';

CREATE TABLE IF NOT EXISTS teacher_leave_requests (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id    UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id   UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(id),
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  reason       TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 5 AND 1200),
  status       VARCHAR(20) NOT NULL DEFAULT 'PENDING'
               CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  reviewed_by  UUID REFERENCES users(id),
  reviewed_at  TIMESTAMPTZ,
  review_note  VARCHAR(1200),
  cancelled_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_teacher_leave_date_range CHECK (start_date <= end_date),
  CONSTRAINT chk_teacher_leave_review_state CHECK (
    (status IN ('APPROVED','REJECTED') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    OR status IN ('PENDING','CANCELLED')
  )
);

CREATE INDEX IF NOT EXISTS idx_teacher_leave_school_status
  ON teacher_leave_requests(school_id,status,start_date);
CREATE INDEX IF NOT EXISTS idx_teacher_leave_teacher_dates
  ON teacher_leave_requests(teacher_id,start_date DESC,end_date DESC);
CREATE INDEX IF NOT EXISTS idx_teacher_leave_requester
  ON teacher_leave_requests(requested_by,created_at DESC);

DROP TRIGGER IF EXISTS trg_teacher_leave_updated_at ON teacher_leave_requests;
CREATE TRIGGER trg_teacher_leave_updated_at
  BEFORE UPDATE ON teacher_leave_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS teacher_attendance (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id  UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  status     staff_attendance_status NOT NULL,
  remark     VARCHAR(300),
  marked_by  UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (teacher_id,date)
);

CREATE INDEX IF NOT EXISTS idx_teacher_attendance_school_date
  ON teacher_attendance(school_id,date DESC);
CREATE INDEX IF NOT EXISTS idx_teacher_attendance_teacher_date
  ON teacher_attendance(teacher_id,date DESC);
CREATE INDEX IF NOT EXISTS idx_teacher_attendance_status
  ON teacher_attendance(school_id,status,date DESC);

DROP TRIGGER IF EXISTS trg_teacher_attendance_updated_at ON teacher_attendance;
CREATE TRIGGER trg_teacher_attendance_updated_at
  BEFORE UPDATE ON teacher_attendance
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE teacher_leave_requests IS
  'Dated Teacher leave requests reviewed by the Teacher''s School Admin; does not mutate teachers.status';
COMMENT ON TABLE teacher_attendance IS
  'Daily School staff attendance ledger. EXCUSED is approved leave on an otherwise working School day.';
COMMENT ON TYPE staff_attendance_status IS
  'Operational daily Teacher attendance independent from teacher employment/profile status';