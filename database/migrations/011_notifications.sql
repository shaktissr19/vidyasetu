-- ============================================================
-- 011_notifications.sql
-- Tables: announcements, notifications, teacher_parent_messages
-- ============================================================

DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM (
    'ATTENDANCE_ABSENT', 'ATTENDANCE_LATE',
    'FEE_REMINDER', 'FEE_OVERDUE', 'FEE_PAID',
    'EXAM_REGISTERED', 'EXAM_STARTING', 'EXAM_RESULT',
    'ANNOUNCEMENT', 'BADGE_EARNED', 'STREAK_BROKEN',
    'NEW_CONTENT', 'DOUBT_ANSWERED', 'SYSTEM'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE notification_channel AS ENUM ('IN_APP', 'WHATSAPP', 'SMS', 'PUSH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── announcements ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS announcements (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id      UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  created_by     UUID        NOT NULL REFERENCES users(id),
  title          VARCHAR(300) NOT NULL,
  body           TEXT        NOT NULL,
  target_classes TEXT[]      NOT NULL DEFAULT '{}',  -- empty = all classes
  target_roles   TEXT[]      NOT NULL DEFAULT '{"PARENT","STUDENT"}',
  is_pinned      BOOLEAN     NOT NULL DEFAULT FALSE,
  send_whatsapp  BOOLEAN     NOT NULL DEFAULT TRUE,
  published_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ann_school_id    ON announcements(school_id);
CREATE INDEX IF NOT EXISTS idx_ann_published_at ON announcements(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_ann_is_pinned    ON announcements(is_pinned) WHERE is_pinned = TRUE;

COMMENT ON TABLE  announcements              IS 'School announcements; optionally broadcast via WhatsApp';
COMMENT ON COLUMN announcements.target_classes IS 'Empty array = all classes; specific = e.g. [''9'',''10'']';

-- ── notifications ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id               UUID                 PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID                 NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_id        UUID                 REFERENCES schools(id),
  type             notification_type    NOT NULL,
  channel          notification_channel NOT NULL DEFAULT 'IN_APP',
  title            VARCHAR(300)         NOT NULL,
  body             TEXT                 NOT NULL,
  reference_id     UUID,        -- linked entity (exam_id, fee_invoice_id, etc.)
  reference_type   VARCHAR(50),
  is_read          BOOLEAN              NOT NULL DEFAULT FALSE,
  sent_at          TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  read_at          TIMESTAMPTZ,
  -- External delivery status
  delivery_status  VARCHAR(20)          NOT NULL DEFAULT 'SENT',  -- SENT | DELIVERED | FAILED
  external_msg_id  VARCHAR(200)         -- WhatsApp/SMS provider message ID
);

CREATE INDEX IF NOT EXISTS idx_notif_user_id   ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_is_read   ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notif_type      ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notif_sent_at   ON notifications(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_school_id ON notifications(school_id);

COMMENT ON TABLE  notifications              IS 'All in-app and delivery-tracked notifications per user';
COMMENT ON COLUMN notifications.reference_id IS 'Polymorphic ref: exam_id, fee_invoice_id, announcement_id, etc.';

-- ── teacher_parent_messages ───────────────────────────────────

CREATE TABLE IF NOT EXISTS teacher_parent_messages (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id    UUID        NOT NULL REFERENCES schools(id),
  student_id   UUID        NOT NULL REFERENCES students(id),
  sender_id    UUID        NOT NULL REFERENCES users(id),
  receiver_id  UUID        NOT NULL REFERENCES users(id),
  body         TEXT        NOT NULL,
  attachment_url TEXT,
  is_read      BOOLEAN     NOT NULL DEFAULT FALSE,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tpm_student_id   ON teacher_parent_messages(student_id);
CREATE INDEX IF NOT EXISTS idx_tpm_sender_id    ON teacher_parent_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_tpm_receiver_id  ON teacher_parent_messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_tpm_created_at   ON teacher_parent_messages(created_at DESC);

COMMENT ON TABLE teacher_parent_messages IS 'Direct 1-to-1 messages between teacher and parent for a student';
