-- ============================================================
-- 041_learning_support_v2.sql
-- Parent Progress & Intervention 2.0 + Teacher Academic Workspace 2.0
-- + intervention-aware PTM + learning-centric Communities 2.0.
--
-- Additive/idempotent. Academic truth remains in Learning/Diagnostic tables;
-- this migration stores support workflow, acknowledgements and collaboration
-- context only.
-- ============================================================

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'LEARNING_INTERVENTION_ASSIGNED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'LEARNING_INTERVENTION_ACKNOWLEDGED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'LEARNING_INTERVENTION_UPDATED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'PTM_BOOKED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'PTM_CANCELLED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'PTM_UPDATED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'PTM_REMINDER';

BEGIN;

CREATE TABLE IF NOT EXISTS learning_interventions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id          UUID NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  subject_code      VARCHAR(50) NOT NULL,
  concept_id        UUID REFERENCES learning_concepts(id) ON DELETE SET NULL,
  teacher_id        UUID NOT NULL REFERENCES teachers(id),
  created_by        UUID NOT NULL REFERENCES users(id),
  title             VARCHAR(220) NOT NULL,
  reason            TEXT NOT NULL,
  priority          VARCHAR(12) NOT NULL DEFAULT 'FOCUS'
                    CHECK (priority IN ('HIGH','FOCUS','ROUTINE')),
  status            VARCHAR(24) NOT NULL DEFAULT 'OPEN'
                    CHECK (status IN ('OPEN','PARENT_ACKNOWLEDGED','IN_PROGRESS','PTM_REQUESTED','RESOLVED','CLOSED')),
  evidence_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  action_plan       JSONB NOT NULL DEFAULT '{}'::jsonb,
  due_at            TIMESTAMPTZ,
  resolved_at       TIMESTAMPTZ,
  outcome_note      VARCHAR(2000),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_interventions_scope
  ON learning_interventions(school_id,class_id,subject_code,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_interventions_teacher
  ON learning_interventions(teacher_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_interventions_concept
  ON learning_interventions(concept_id,status) WHERE concept_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_learning_interventions_updated_at ON learning_interventions;
CREATE TRIGGER trg_learning_interventions_updated_at
  BEFORE UPDATE ON learning_interventions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS learning_intervention_students (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  intervention_id        UUID NOT NULL REFERENCES learning_interventions(id) ON DELETE CASCADE,
  student_id             UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status                 VARCHAR(20) NOT NULL DEFAULT 'ASSIGNED'
                         CHECK (status IN ('ASSIGNED','ACKNOWLEDGED','IN_PROGRESS','RESOLVED','REMOVED')),
  parent_acknowledged_at TIMESTAMPTZ,
  parent_acknowledged_by UUID REFERENCES users(id),
  parent_note            VARCHAR(1200),
  resolved_at            TIMESTAMPTZ,
  outcome_note           VARCHAR(1600),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (intervention_id,student_id)
);

CREATE INDEX IF NOT EXISTS idx_learning_intervention_students_student
  ON learning_intervention_students(student_id,status,created_at DESC);

DROP TRIGGER IF EXISTS trg_learning_intervention_students_updated_at ON learning_intervention_students;
CREATE TRIGGER trg_learning_intervention_students_updated_at
  BEFORE UPDATE ON learning_intervention_students
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Learning-centric context on the existing governed Communities/Groups model.
ALTER TABLE collaboration_groups
  ADD COLUMN IF NOT EXISTS learning_purpose VARCHAR(24) NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN IF NOT EXISTS subject_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS concept_id UUID REFERENCES learning_concepts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS competition_exam_id UUID REFERENCES exams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS intervention_id UUID REFERENCES learning_interventions(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE collaboration_groups ADD CONSTRAINT chk_collaboration_learning_purpose
    CHECK (learning_purpose IN ('GENERAL','CONCEPT_SUPPORT','INTERVENTION','COMPETITION_PREP','TEACHER_LED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_cg_learning_context
  ON collaboration_groups(learning_purpose,subject_code,concept_id,status);
CREATE INDEX IF NOT EXISTS idx_cg_intervention
  ON collaboration_groups(intervention_id) WHERE intervention_id IS NOT NULL;

ALTER TABLE collaboration_group_posts
  ADD COLUMN IF NOT EXISTS concept_id UUID REFERENCES learning_concepts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS learning_resource_id UUID REFERENCES learning_resources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS learning_assessment_id UUID REFERENCES learning_assessments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS learning_label VARCHAR(180);

CREATE INDEX IF NOT EXISTS idx_cgp_learning_context
  ON collaboration_group_posts(group_id,concept_id,created_at DESC)
  WHERE concept_id IS NOT NULL;

-- Port the proven PTM scheduling foundation onto the current migration line.
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
  intervention_id UUID REFERENCES learning_interventions(id) ON DELETE SET NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'BOOKED'
                 CHECK (status IN ('BOOKED','CANCELLED','COMPLETED','NO_SHOW')),
  parent_note    VARCHAR(1000),
  outcome_note   VARCHAR(1600),
  agreed_action  VARCHAR(1600),
  follow_up_at   TIMESTAMPTZ,
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
CREATE INDEX IF NOT EXISTS idx_ptm_bookings_intervention
  ON ptm_bookings(intervention_id) WHERE intervention_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_ptm_bookings_updated_at ON ptm_bookings;
CREATE TRIGGER trg_ptm_bookings_updated_at
  BEFORE UPDATE ON ptm_bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE learning_interventions IS
  'Teacher/School support workflow derived from learning evidence; never a replacement for mastery or diagnostic truth.';
COMMENT ON TABLE learning_intervention_students IS
  'Per-Student intervention participation, Parent acknowledgement and support outcome.';
COMMENT ON COLUMN collaboration_groups.learning_purpose IS
  'Learning purpose for the existing moderated Community/Group model.';
COMMENT ON TABLE ptm_bookings IS
  'Parent-Teacher bookings that may optionally continue an existing learning intervention.';

COMMIT;
