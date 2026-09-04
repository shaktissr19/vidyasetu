-- ============================================================
-- 029_absence_school_calendar.sql
-- Governed Student leave + School calendar integrated with attendance.
-- Additive/idempotent. No seed, publication or destructive reset.
-- ============================================================

ALTER TYPE attendance_status ADD VALUE IF NOT EXISTS 'EXCUSED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'LEAVE_SUBMITTED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'LEAVE_APPROVED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'LEAVE_REJECTED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'SCHOOL_CALENDAR';

ALTER TABLE attendance_monthly_summary
  ADD COLUMN IF NOT EXISTS excused_days SMALLINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS student_leave_requests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  requested_by    UUID NOT NULL REFERENCES users(id),
  requester_role  VARCHAR(20) NOT NULL CHECK (requester_role IN ('STUDENT','PARENT')),
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  reason          TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 5 AND 1200),
  status          VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  reviewed_by     UUID REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  review_note     VARCHAR(1200),
  cancelled_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_student_leave_date_range CHECK (start_date <= end_date),
  CONSTRAINT chk_student_leave_review_state CHECK (
    (status IN ('APPROVED','REJECTED') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    OR status IN ('PENDING','CANCELLED')
  )
);

CREATE INDEX IF NOT EXISTS idx_leave_school_status
  ON student_leave_requests(school_id,status,start_date);
CREATE INDEX IF NOT EXISTS idx_leave_student_dates
  ON student_leave_requests(student_id,start_date DESC,end_date DESC);
CREATE INDEX IF NOT EXISTS idx_leave_requester
  ON student_leave_requests(requested_by,created_at DESC);

DROP TRIGGER IF EXISTS trg_student_leave_updated_at ON student_leave_requests;
CREATE TRIGGER trg_student_leave_updated_at
  BEFORE UPDATE ON student_leave_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS school_calendar_events (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title             VARCHAR(220) NOT NULL,
  description       TEXT,
  event_type        VARCHAR(30) NOT NULL
                    CHECK (event_type IN ('HOLIDAY','SCHOOL_EVENT','PTM','EXAM','ACTIVITY','OTHER')),
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  is_school_closed  BOOLEAN NOT NULL DEFAULT FALSE,
  created_by        UUID NOT NULL REFERENCES users(id),
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_school_calendar_date_range CHECK (start_date <= end_date),
  CONSTRAINT chk_closed_calendar_event CHECK (NOT is_school_closed OR event_type='HOLIDAY')
);

CREATE INDEX IF NOT EXISTS idx_school_calendar_dates
  ON school_calendar_events(school_id,start_date,end_date) WHERE is_active=TRUE;
CREATE INDEX IF NOT EXISTS idx_school_calendar_type
  ON school_calendar_events(school_id,event_type) WHERE is_active=TRUE;

DROP TRIGGER IF EXISTS trg_school_calendar_updated_at ON school_calendar_events;
CREATE TRIGGER trg_school_calendar_updated_at
  BEFORE UPDATE ON school_calendar_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS school_calendar_event_classes (
  event_id UUID NOT NULL REFERENCES school_calendar_events(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id,class_id)
);
CREATE INDEX IF NOT EXISTS idx_calendar_event_classes_class
  ON school_calendar_event_classes(class_id,event_id);

-- Rebuild attendance summary semantics:
-- EXCUSED is a working school day but is reported separately from unexcused ABSENT.
-- It therefore remains in the attendance-percentage denominator and does not
-- inflate physical attendance.
CREATE OR REPLACE FUNCTION refresh_attendance_summary()
RETURNS TRIGGER AS $$
DECLARE
  v_year  SMALLINT := EXTRACT(YEAR  FROM NEW.date);
  v_month SMALLINT := EXTRACT(MONTH FROM NEW.date);
BEGIN
  INSERT INTO attendance_monthly_summary
    (student_id,school_id,year,month,working_days,present_days,absent_days,
     late_days,half_days,excused_days,percentage)
  SELECT
    a.student_id,
    a.school_id,
    v_year,
    v_month,
    COUNT(*) FILTER (WHERE a.status != 'HOLIDAY') AS working_days,
    COUNT(*) FILTER (WHERE a.status = 'PRESENT') AS present_days,
    COUNT(*) FILTER (WHERE a.status = 'ABSENT') AS absent_days,
    COUNT(*) FILTER (WHERE a.status = 'LATE') AS late_days,
    COUNT(*) FILTER (WHERE a.status = 'HALF_DAY') AS half_days,
    COUNT(*) FILTER (WHERE a.status = 'EXCUSED') AS excused_days,
    COALESCE(ROUND(
      COUNT(*) FILTER (WHERE a.status IN ('PRESENT','LATE','HALF_DAY'))::DECIMAL
      / NULLIF(COUNT(*) FILTER (WHERE a.status != 'HOLIDAY'),0) * 100
    ,2),0) AS percentage
  FROM attendance a
  WHERE a.student_id = NEW.student_id
    AND EXTRACT(YEAR FROM a.date) = v_year
    AND EXTRACT(MONTH FROM a.date) = v_month
  GROUP BY a.student_id,a.school_id
  ON CONFLICT (student_id,year,month) DO UPDATE SET
    working_days = EXCLUDED.working_days,
    present_days = EXCLUDED.present_days,
    absent_days = EXCLUDED.absent_days,
    late_days = EXCLUDED.late_days,
    half_days = EXCLUDED.half_days,
    excused_days = EXCLUDED.excused_days,
    percentage = EXCLUDED.percentage;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON COLUMN attendance_monthly_summary.excused_days IS
  'Approved leave on an otherwise working school day; reported separately and not counted as physical presence';
COMMENT ON TABLE student_leave_requests IS
  'Student/Parent leave requests with class-teacher or School Admin review';
COMMENT ON TABLE school_calendar_events IS
  'School-governed holidays and calendar events; empty class mapping means whole school';
COMMENT ON TABLE school_calendar_event_classes IS
  'Optional class scope for a school calendar event; no rows means all classes';
