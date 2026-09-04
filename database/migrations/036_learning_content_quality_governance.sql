-- ============================================================
-- 036_learning_content_quality_governance.sql
-- VidyaSetu Learning & Content Platform 2.0
-- Additive/idempotent quality, pedagogy and assessment metadata.
-- This migration NEVER publishes content or changes existing review states.
-- ============================================================

BEGIN;

DO $$ BEGIN
  CREATE TYPE learning_journey_stage AS ENUM ('SEE','UNDERSTAND','DO','PRACTISE','APPLY','REVISE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE learning_cognitive_skill AS ENUM ('REMEMBER','UNDERSTAND','APPLY','ANALYSE','EVALUATE','CREATE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE learning_quality_entity_type AS ENUM ('RESOURCE','QUESTION','ASSESSMENT','CONCEPT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE learning_quality_gate_status AS ENUM ('PENDING','PASS','FAIL','NOT_APPLICABLE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE learning_resource_concepts
  ADD COLUMN IF NOT EXISTS journey_stage learning_journey_stage;

-- Backfill a safe pedagogic default for existing mappings. This is metadata only;
-- it does not make any concept learner-ready or publish anything.
UPDATE learning_resource_concepts
SET journey_stage='UNDERSTAND'::learning_journey_stage
WHERE journey_stage IS NULL;

ALTER TABLE learning_questions
  ADD COLUMN IF NOT EXISTS cognitive_skill learning_cognitive_skill NOT NULL DEFAULT 'UNDERSTAND',
  ADD COLUMN IF NOT EXISTS skill_code VARCHAR(120),
  ADD COLUMN IF NOT EXISTS learning_outcome_code VARCHAR(160),
  ADD COLUMN IF NOT EXISTS misconception_code VARCHAR(160),
  ADD COLUMN IF NOT EXISTS misconception_text TEXT,
  ADD COLUMN IF NOT EXISTS misconception_text_hi TEXT;

ALTER TABLE learning_concepts
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS description_hi TEXT,
  ADD COLUMN IF NOT EXISTS learning_outcome TEXT,
  ADD COLUMN IF NOT EXISTS learning_outcome_hi TEXT;

CREATE TABLE IF NOT EXISTS learning_quality_gate_reviews (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type    learning_quality_entity_type NOT NULL,
  entity_id      UUID NOT NULL,
  gate_code      VARCHAR(80) NOT NULL,
  status         learning_quality_gate_status NOT NULL DEFAULT 'PENDING',
  note           TEXT,
  reviewer_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(entity_type, entity_id, gate_code),
  CHECK (gate_code IN (
    'ACADEMIC_ACCURACY',
    'AGE_APPROPRIATENESS',
    'ENGLISH_QUALITY',
    'HINDI_QUALITY',
    'LEARNING_OUTCOME_ALIGNMENT',
    'PRACTICE_QUALITY',
    'MISCONCEPTION_COVERAGE',
    'APPLICATION',
    'ACCESSIBILITY',
    'SAFETY',
    'COPYRIGHT_LICENSING',
    'TECHNICAL_READINESS'
  ))
);

CREATE OR REPLACE TRIGGER trg_learning_quality_gate_reviews_updated_at
  BEFORE UPDATE ON learning_quality_gate_reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_learning_quality_gate_entity
  ON learning_quality_gate_reviews(entity_type, entity_id, gate_code);
CREATE INDEX IF NOT EXISTS idx_learning_quality_gate_pending
  ON learning_quality_gate_reviews(status, entity_type)
  WHERE status IN ('PENDING','FAIL');
CREATE INDEX IF NOT EXISTS idx_learning_questions_skill
  ON learning_questions(cognitive_skill, skill_code)
  WHERE review_status IN ('APPROVED','PUBLISHED');
CREATE INDEX IF NOT EXISTS idx_learning_questions_misconception
  ON learning_questions(misconception_code)
  WHERE misconception_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_learning_resource_concepts_journey
  ON learning_resource_concepts(concept_id, journey_stage, resource_id);

COMMENT ON TABLE learning_quality_gate_reviews IS
  'Auditable manual quality gates used with deterministic readiness checks. A score never overrides a failed mandatory publication gate.';
COMMENT ON COLUMN learning_resource_concepts.journey_stage IS
  'Pedagogic role in the VidyaSetu SEE → UNDERSTAND → DO → PRACTISE → APPLY → REVISE learning journey.';
COMMENT ON COLUMN learning_questions.cognitive_skill IS
  'Cognitive demand used by question-bank quality, diagnostics and later adaptive learning.';
COMMENT ON COLUMN learning_questions.misconception_code IS
  'Optional stable misconception signal used by diagnostics/remediation when this question is designed to expose a known error pattern.';

COMMIT;
