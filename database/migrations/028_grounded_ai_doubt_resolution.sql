-- ============================================================
-- 028_grounded_ai_doubt_resolution.sql
-- VidyaSetu grounded AI Tutor + intelligent doubt escalation.
-- Additive/idempotent. No content publication or destructive data changes.
--
-- Privacy contract:
-- - normal tutor turns are NOT persisted as raw question/answer text
-- - ai_tutor_events stores metadata only
-- - academic text is persisted only when a learner explicitly escalates it
--   into the existing Doubt Forum workflow
-- ============================================================

BEGIN;

-- The current forum controller deliberately supports students who are not yet
-- school-linked by placing their doubt in the global/null-school forum. The
-- original 010 migration predated that behavior and made school_id NOT NULL.
ALTER TABLE doubts
  ALTER COLUMN school_id DROP NOT NULL;

ALTER TABLE doubts
  ADD COLUMN IF NOT EXISTS learning_concept_id UUID REFERENCES learning_concepts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origin VARCHAR(20) NOT NULL DEFAULT 'FORUM',
  ADD COLUMN IF NOT EXISTS ai_context_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS ai_escalation_reason VARCHAR(120);

DO $$ BEGIN
  ALTER TABLE doubts
    ADD CONSTRAINT chk_doubts_origin
    CHECK (origin IN ('FORUM','AI_TUTOR'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_doubts_learning_concept
  ON doubts(learning_concept_id, status, created_at DESC)
  WHERE learning_concept_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_doubts_origin
  ON doubts(origin, created_at DESC);

ALTER TABLE doubt_answers
  ADD COLUMN IF NOT EXISTS ai_grounded BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_concept_id UUID REFERENCES learning_concepts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_provider VARCHAR(24);

CREATE INDEX IF NOT EXISTS idx_doubt_answers_ai_concept
  ON doubt_answers(ai_concept_id, created_at DESC)
  WHERE ai_concept_id IS NOT NULL;

-- Metadata-only tutor history. This intentionally does not store prompt or
-- answer bodies. It is suitable for learner help-history and aggregate quality
-- monitoring without duplicating children's conversations into application DB
-- or log files.
CREATE TABLE IF NOT EXISTS ai_tutor_events (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id          UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  learning_concept_id UUID        REFERENCES learning_concepts(id) ON DELETE SET NULL,
  event_type          VARCHAR(24) NOT NULL,
  grounded            BOOLEAN     NOT NULL DEFAULT FALSE,
  source_count        SMALLINT    NOT NULL DEFAULT 0 CHECK (source_count >= 0),
  mastery_state       VARCHAR(24),
  provider            VARCHAR(24) NOT NULL DEFAULT 'mock',
  doubt_id            UUID        REFERENCES doubts(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (event_type IN ('CHAT','ESCALATED','DOUBT_AI_ANSWER')),
  CHECK (mastery_state IS NULL OR mastery_state IN ('NOT_STARTED','LEARNING','PRACTISING','NEEDS_REVIEW','MASTERED'))
);

CREATE INDEX IF NOT EXISTS idx_ai_tutor_events_student_recent
  ON ai_tutor_events(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_tutor_events_concept_recent
  ON ai_tutor_events(learning_concept_id, created_at DESC)
  WHERE learning_concept_id IS NOT NULL;

COMMENT ON COLUMN doubts.learning_concept_id IS
  'Canonical VidyaSetu concept linked to this doubt when known.';
COMMENT ON COLUMN doubts.origin IS
  'FORUM for manually posted doubts; AI_TUTOR when the learner explicitly escalated a tutor turn.';
COMMENT ON COLUMN doubts.ai_context_snapshot IS
  'Learner-approved academic context captured only on explicit AI Tutor escalation; includes prior tutor answer/source references, not hidden system prompts.';
COMMENT ON COLUMN doubt_answers.ai_grounded IS
  'TRUE only when the AI answer was generated with published VidyaSetu learning resources as grounding context.';
COMMENT ON COLUMN doubt_answers.ai_sources IS
  'Public-safe source metadata for published VidyaSetu resources used to ground an AI answer.';
COMMENT ON TABLE ai_tutor_events IS
  'Privacy-minimised AI Tutor event history. Stores metadata only; no raw student prompt or generated answer text.';

COMMIT;
