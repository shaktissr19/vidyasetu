-- ============================================================
-- 029_homework_student_notifications.sql
-- Homework lifecycle + explicit homework notification types.
-- Safe to run after the School/Teacher and notification foundations.
-- Idempotent on repeat runs.
-- ============================================================

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'HOMEWORK_ASSIGNED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'HOMEWORK_FEEDBACK';

BEGIN;

CREATE TABLE IF NOT EXISTS homework_assignments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id        UUID NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  subject_code    VARCHAR(20) NOT NULL,
  title           VARCHAR(220) NOT NULL,
  description     TEXT NOT NULL,
  instructions    TEXT,
  attachment_url  TEXT,
  due_at          TIMESTAMPTZ NOT NULL,
  max_marks       NUMERIC(8,2),
  status          VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  created_by      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  published_at    TIMESTAMPTZ,
  closed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_homework_assignment_status
    CHECK (status IN ('DRAFT','PUBLISHED','CLOSED')),
  CONSTRAINT chk_homework_max_marks
    CHECK (max_marks IS NULL OR max_marks >= 0),
  CONSTRAINT chk_homework_title_nonempty
    CHECK (length(btrim(title)) > 0),
  CONSTRAINT chk_homework_description_nonempty
    CHECK (length(btrim(description)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_homework_school_status
  ON homework_assignments(school_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_homework_class_status
  ON homework_assignments(class_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_homework_created_by
  ON homework_assignments(created_by, created_at DESC);

CREATE OR REPLACE TRIGGER trg_homework_assignments_updated_at
  BEFORE UPDATE ON homework_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS homework_submissions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  homework_id     UUID NOT NULL REFERENCES homework_assignments(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  answer_text     TEXT,
  attachment_url  TEXT,
  status          VARCHAR(20) NOT NULL DEFAULT 'SUBMITTED',
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  marks_awarded   NUMERIC(8,2),
  feedback        TEXT,
  reviewed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_homework_submission_student UNIQUE(homework_id, student_id),
  CONSTRAINT chk_homework_submission_status
    CHECK (status IN ('SUBMITTED','LATE','REVIEWED','RETURNED')),
  CONSTRAINT chk_homework_submission_content
    CHECK (
      (answer_text IS NOT NULL AND length(btrim(answer_text)) > 0)
      OR (attachment_url IS NOT NULL AND length(btrim(attachment_url)) > 0)
    ),
  CONSTRAINT chk_homework_marks_nonnegative
    CHECK (marks_awarded IS NULL OR marks_awarded >= 0)
);

CREATE INDEX IF NOT EXISTS idx_homework_submissions_homework
  ON homework_submissions(homework_id, status, submitted_at);
CREATE INDEX IF NOT EXISTS idx_homework_submissions_student
  ON homework_submissions(student_id, submitted_at DESC);

CREATE OR REPLACE TRIGGER trg_homework_submissions_updated_at
  BEFORE UPDATE ON homework_submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE homework_assignments IS
  'Class and subject targeted homework authored by School Admins or assigned Teachers.';
COMMENT ON TABLE homework_submissions IS
  'One current submission per Student per homework, including review marks and feedback.';
COMMENT ON COLUMN homework_assignments.status IS
  'DRAFT is staff-only; PUBLISHED is visible/submittable; CLOSED is visible but no longer submittable.';

COMMIT;
