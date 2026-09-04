-- ============================================================
-- 038_diagnostic_evidence_role_bridge.sql
-- Diagnostic & Assessment Intelligence 2.0
-- Ensures DIAGNOSTIC assessments always emit DIAGNOSTIC concept evidence
-- while preserving the existing mastery-slug convention.
-- Additive/idempotent. No content publication or destructive changes.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION set_learning_assessment_concept_evidence_role()
RETURNS TRIGGER AS $$
DECLARE
  assessment_slug TEXT;
  assessment_kind TEXT;
BEGIN
  SELECT public_slug, assessment_type::text
    INTO assessment_slug, assessment_kind
  FROM learning_assessments
  WHERE id = NEW.assessment_id;

  IF assessment_kind = 'DIAGNOSTIC' THEN
    NEW.evidence_role := 'DIAGNOSTIC';
  ELSIF COALESCE(assessment_slug,'') ~* '(^|-)mastery(-|$)' THEN
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

UPDATE learning_assessment_concepts lac
SET evidence_role='DIAGNOSTIC'
FROM learning_assessments la
WHERE la.id=lac.assessment_id
  AND la.assessment_type::text='DIAGNOSTIC'
  AND lac.evidence_role <> 'DIAGNOSTIC';

COMMENT ON FUNCTION set_learning_assessment_concept_evidence_role() IS
  'Canonical evidence-role resolver: DIAGNOSTIC assessment type wins, mastery slugs remain MASTERY, otherwise mappings remain PRACTICE unless explicitly set.';

COMMIT;
