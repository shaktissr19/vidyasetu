-- ============================================================
-- 034_ptm_appointments.sql
-- Parent-Teacher Meeting sessions, teacher slots and governed bookings.
-- Depends on migration 029 School Calendar. Additive/idempotent only.
-- ============================================================

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'PTM_BOOKED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'PTM_CANCELLED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'PTM_UPDATED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'PTM_REMINDER';

CREATE TABLE IF NOT EXISTS ptm_sessions (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id          UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  calendar_event_id  UUID REFERENCES school_calendar_events(id) ON DELETE SET NULL,
  title              VARCHAR(220) NOT NULL,
  description        TEXT,
  starts_at          TIMESTAMPTZ NOT NULL,
  ends_at            TIMESTAMPTZ NOT NULL,
  booking_opens_at   TIMESTAMPTZ NOT NULL,
  booking_closes_at  TIMESTAMPTZ NOT NULL,
  status             VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                     CHECK (status IN ('DRAFT','OPEN','CLOSED','COMPLETED','CANCELLED')),
  created_by         UUID NOT NULL REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ptm_session_time CHECK (starts_at < ends_at),
  CONSTRAINT chk_ptm_booking_window CHECK (
    booking_opens_at < booking_closes_at AND booking_closes_at <= starts_at
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ptm_session_calendar_event
  ON ptm_sessions(calendar_event_id) WHERE calendar_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ptm_sessions_school_status
  ON ptm_sessions(school_id,status,starts_at DESC);

DROP TRIGGER IF EXISTS trg_ptm_sessions_updated_at ON ptm_sessions;
CREATE TRIGGER trg_ptm_sessions_updated_at
  BEFORE UPDATE ON ptm_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS ptm_slots (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id  UUID NOT NULL REFERENCES ptm_sessions(id) ON DELETE CASCADE,
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id  UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ NOT NULL,
  location    VARCHAR(160),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ptm_slot_time CHECK (starts_at < ends_at),
  UNIQUE (session_id,teacher_id,starts_at)
);

CREATE INDEX IF NOT EXISTS idx_ptm_slots_session_teacher
  ON ptm_slots(session_id,teacher_id,starts_at) WHERE is_active=TRUE;

DROP TRIGGER IF EXISTS trg_ptm_slots_updated_at ON ptm_slots;
CREATE TRIGGER trg_ptm_slots_updated_at
  BEFORE UPDATE ON ptm_slots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS ptm_bookings (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id     UUID NOT NULL REFERENCES ptm_sessions(id) ON DELETE CASCADE,
  slot_id        UUID NOT NULL REFERENCES ptm_slots(id) ON DELETE CASCADE,
  school_id      UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id     UUID NOT NULL REFERENCES teachers(id),
  student_id     UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  parent_user_id UUID NOT NULL REFERENCES users(id),
  status         VARCHAR(20) NOT NULL DEFAULT 'BOOKED'
                 CHECK (status IN ('BOOKED','CANCELLED','COMPLETED','NO_SHOW')),
  parent_note    VARCHAR(1000),
  outcome_note   VARCHAR(1600),
  booked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at   TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ptm_active_slot_booking
  ON ptm_bookings(slot_id) WHERE status='BOOKED';
CREATE UNIQUE INDEX IF NOT EXISTS uq_ptm_active_student_teacher
  ON ptm_bookings(session_id,student_id,teacher_id) WHERE status='BOOKED';
CREATE INDEX IF NOT EXISTS idx_ptm_bookings_student
  ON ptm_bookings(student_id,booked_at DESC);
CREATE INDEX IF NOT EXISTS idx_ptm_bookings_parent
  ON ptm_bookings(parent_user_id,booked_at DESC);
CREATE INDEX IF NOT EXISTS idx_ptm_bookings_teacher
  ON ptm_bookings(teacher_id,booked_at DESC);

DROP TRIGGER IF EXISTS trg_ptm_bookings_updated_at ON ptm_bookings;
CREATE TRIGGER trg_ptm_bookings_updated_at
  BEFORE UPDATE ON ptm_bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE ptm_sessions IS
  'School-governed Parent-Teacher Meeting windows linked to the canonical School Calendar PTM event';
COMMENT ON TABLE ptm_slots IS
  'One-to-one teacher appointment slots inside a PTM session';
COMMENT ON TABLE ptm_bookings IS
  'Parent bookings for linked Students with auditable lifecycle and meeting outcome';
