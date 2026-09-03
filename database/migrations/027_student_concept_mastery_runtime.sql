-- ============================================================
-- 027_student_concept_mastery_runtime.sql
-- VidyaSetu runtime bridge for concept-level learner mastery.
-- Additive/idempotent. No destructive data changes.
--
-- IMPORTANT:
-- - Keeps existing learning_assessments.assessment_type unchanged.
-- - Adds an explicit concept-evidence role so low-stakes practice and
--   mastery checks can contribute different learner-state signals.
-- - Existing pilot mastery slugs are backfilled deterministically.
-- - No content is published by this migration.
-- ============================================================

BEGIN;

ALTER TABLE learning_assessment_concepts
  ADD COLUMN IF NOT EXISTS evidence_role VARCHAR(16) NOT NULL DEFAULT 'PRACTICE';

DO $$ BEGIN
  ALTER TABLE learning_assessment_concepts
    ADD CONSTRAINT chk_learning_assessment_concepts_evidence_role
    CHECK (evidence_role IN ('PRACTICE','MASTERY'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The six governed pilot packs already use stable *-practice-v1 and
-- *-mastery-v1 assessment slugs. Backfill any mappings created before this
-- runtime bridge while keeping every other assessment low-stakes by default.
UPDATE learning_assessment_concepts lac
SET evidence_role = 'MASTERY'
FROM learning_assessments la
WHERE la.id = lac.assessment_id
  AND COALESCE(la.public_slug,'') ~* '(^|-)mastery(-|$)'
  AND lac.evidence_role <> 'MASTERY';

-- Keep future pilot staging safe even when an older installer inserts the
-- assessment-concept mapping without explicitly naming evidence_role.
CREATE OR REPLACE FUNCTION set_learning_assessment_concept_evidence_role()
RETURNS TRIGGER AS $$
DECLARE
  assessment_slug TEXT;
BEGIN
  SELECT public_slug INTO assessment_slug
  FROM learning_assessments
  WHERE id = NEW.assessment_id;

  IF COALESCE(assessment_slug,'') ~* '(^|-)mastery(-|$)' THEN
    NEW.evidence_role := 'MASTERY';
  ELSIF NEW.evidence_role IS NULL THEN
    NEW.evidence_role := 'PRACTICE';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_learning_assessment_concept_evidence_role
  ON learning_assessment_concepts;
CREATE TRIGGER trg_learning_assessment_concept_evidence_role
  BEFORE INSERT OR UPDATE OF assessment_id, evidence_role
  ON learning_assessment_concepts
  FOR EACH ROW EXECUTE FUNCTION set_learning_assessment_concept_evidence_role();

CREATE INDEX IF NOT EXISTS idx_lac_evidence_role
  ON learning_assessment_concepts(concept_id, evidence_role, assessment_id);

COMMENT ON COLUMN learning_assessment_concepts.evidence_role IS
  'How this assessment contributes to concept progress: PRACTICE is formative evidence; MASTERY can establish MASTERED when its concept-level score reaches the assessment passing threshold.';

COMMIT;
