-- ============================================================
-- 019_parent_grievances.sql
-- Structured Parent Concern & Grievance Centre.
-- Parent raises a concern for a linked student/school; School Admin
-- responds and resolves; Parent can close/reopen/escalate; Platform
-- Admin can oversee and intervene. All actions are retained in history.
-- ============================================================

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'GRIEVANCE_SUBMITTED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'GRIEVANCE_UPDATED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'GRIEVANCE_REPLY';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'GRIEVANCE_ESCALATED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'GRIEVANCE_RESOLVED';

DO $$ BEGIN
  CREATE TYPE grievance_category AS ENUM (
    'ACADEMICS','ATTENDANCE','FEES','TEACHER_CONCERN','BULLYING_SAFETY',
    'TRANSPORT','INFRASTRUCTURE','ADMINISTRATION','OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE grievance_priority AS ENUM ('LOW','NORMAL','HIGH','URGENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE grievance_status AS ENUM (
    'OPEN','ACKNOWLEDGED','IN_PROGRESS','RESOLVED','CLOSED','ESCALATED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

BEGIN;

CREATE TABLE IF NOT EXISTS parent_grievances (
  id                UUID               PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_number     VARCHAR(40)        NOT NULL UNIQUE DEFAULT (
    'VG-' || TO_CHAR(CURRENT_DATE,'YYYYMMDD') || '-' || UPPER(SUBSTR(REPLACE(uuid_generate_v4()::text,'-',''),1,8))
  ),
  parent_user_id    UUID               NOT NULL REFERENCES users(id),
  student_id        UUID               NOT NULL REFERENCES students(id),
  school_id         UUID               NOT NULL REFERENCES schools(id),
  category          grievance_category NOT NULL,
  priority          grievance_priority NOT NULL DEFAULT 'NORMAL',
  subject           VARCHAR(180)       NOT NULL,
  description       TEXT               NOT NULL CHECK (char_length(description) BETWEEN 10 AND 5000),
  status            grievance_status   NOT NULL DEFAULT 'OPEN',
  assigned_to       UUID               REFERENCES users(id),
  due_at            TIMESTAMPTZ,
  acknowledged_at   TIMESTAMPTZ,
  resolved_at       TIMESTAMPTZ,
  closed_at         TIMESTAMPTZ,
  escalated_at      TIMESTAMPTZ,
  resolution        TEXT,
  reopen_count      INTEGER            NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pg_parent ON parent_grievances(parent_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pg_student ON parent_grievances(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pg_school_status ON parent_grievances(school_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pg_status_due ON parent_grievances(status, due_at);
CREATE INDEX IF NOT EXISTS idx_pg_assigned ON parent_grievances(assigned_to, status);

CREATE OR REPLACE TRIGGER trg_parent_grievances_updated_at
  BEFORE UPDATE ON parent_grievances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS grievance_messages (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  grievance_id   UUID        NOT NULL REFERENCES parent_grievances(id) ON DELETE CASCADE,
  author_user_id UUID        NOT NULL REFERENCES users(id),
  body           TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  is_internal    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gm_grievance ON grievance_messages(grievance_id, created_at ASC);

CREATE TABLE IF NOT EXISTS grievance_attachments (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  grievance_id   UUID        NOT NULL REFERENCES parent_grievances(id) ON DELETE CASCADE,
  uploaded_by    UUID        NOT NULL REFERENCES users(id),
  object_key     TEXT        NOT NULL UNIQUE,
  file_name      VARCHAR(180) NOT NULL,
  content_type   VARCHAR(120) NOT NULL,
  file_size      BIGINT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (file_size IS NULL OR (file_size > 0 AND file_size <= 10485760))
);

CREATE INDEX IF NOT EXISTS idx_ga_grievance ON grievance_attachments(grievance_id, created_at ASC);

CREATE TABLE IF NOT EXISTS grievance_history (
  id             UUID             PRIMARY KEY DEFAULT uuid_generate_v4(),
  grievance_id   UUID             NOT NULL REFERENCES parent_grievances(id) ON DELETE CASCADE,
  actor_user_id  UUID             NOT NULL REFERENCES users(id),
  action         VARCHAR(40)      NOT NULL,
  from_status    grievance_status,
  to_status      grievance_status,
  note           VARCHAR(1200),
  created_at     TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gh_grievance ON grievance_history(grievance_id, created_at ASC);

INSERT INTO platform_config (key, value, description) VALUES
  ('GRIEVANCES_ENABLED', 'true', 'Enable Parent Concern & Grievance Centre'),
  ('GRIEVANCE_DEFAULT_SLA_HOURS', '72', 'Default School response/resolution SLA in hours'),
  ('GRIEVANCE_REOPEN_LIMIT', '3', 'Maximum Parent reopen attempts before Platform Admin intervention')
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE parent_grievances IS 'Child-linked Parent concerns routed to the linked School Admin with Platform Admin escalation oversight.';
COMMENT ON TABLE grievance_messages IS 'Parent/School/Admin conversation. is_internal=true is hidden from Parent.';
COMMENT ON TABLE grievance_attachments IS 'Private evidence files stored in S3-compatible object storage; only metadata and private object keys are stored here.';
COMMENT ON TABLE grievance_history IS 'Immutable grievance lifecycle audit trail.';

COMMIT;
