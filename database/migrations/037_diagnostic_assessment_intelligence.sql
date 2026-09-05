-- ============================================================
-- 037_diagnostic_assessment_intelligence.sql
-- VidyaSetu Diagnostic & Assessment Intelligence 2.0
-- Additive/idempotent learner-evidence, proficiency, confidence,
-- misconception, retention and prerequisite intelligence.
--
-- IMPORTANT:
-- - Does not delete or reset existing mastery/progress.
-- - Historical MASTERED state remains an achievement signal.
-- - Retention/review-due is tracked separately from mastery.
-- - No content or assessment is published by this migration.
-- ============================================================

-- PostgreSQL requires enum values to be committed before they are used by
-- later statements, so extend the assessment type outside the main block.
ALTER TYPE learning_assessment_type ADD VALUE IF NOT EXISTS 'DIAGNOSTIC';

BEGIN;

-- Diagnostic evidence is distinct from low-stakes practice and mastery.
ALTER TABLE learning_assessment_concepts
  DROP CONSTRAINT IF EXISTS chk_learning_assessment_concepts_evidence_role;
ALTER TABLE learning_assessment_concepts
  ADD CONSTRAINT chk_learning_assessment_concepts_evidence_role
  CHECK (evidence_role IN ('DIAGNOSTIC','PRACTICE','MASTERY'));

-- Canonical prerequisite graph. A concept may depend on several earlier
-- concepts; the graph is deliberately separate from chapter ordering.
CREATE TABLE IF NOT EXISTS learning_concept_prerequisites (
  concept_id              UUID        NOT NULL REFERENCES learning_concepts(id) ON DELETE CASCADE,
  prerequisite_concept_id UUID        NOT NULL REFERENCES learning_concepts(id) ON DELETE CASCADE,
  strength                VARCHAR(16) NOT NULL DEFAULT 'REQUIRED'
    CHECK (strength IN ('HELPFUL','REQUIRED')),
  rationale               TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (concept_id, prerequisite_concept_id),
  CHECK (concept_id <> prerequisite_concept_id)
);
CREATE INDEX IF NOT EXISTS idx_lcp_prerequisite
  ON learning_concept_prerequisites(prerequisite_concept_id, concept_id);

-- Immutable-ish answer evidence ledger. One assessment answer may map to
-- multiple concepts, so concept_id is part of the idempotency key.
CREATE TABLE IF NOT EXISTS student_learning_evidence (
  id                    UUID                     PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id            UUID                     NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  attempt_id            UUID                     NOT NULL REFERENCES student_learning_attempts(id) ON DELETE CASCADE,
  assessment_id         UUID                     NOT NULL REFERENCES learning_assessments(id) ON DELETE CASCADE,
  question_id           UUID                     NOT NULL REFERENCES learning_questions(id) ON DELETE CASCADE,
  concept_id            UUID                     NOT NULL REFERENCES learning_concepts(id) ON DELETE CASCADE,
  evidence_role         VARCHAR(16)              NOT NULL
    CHECK (evidence_role IN ('DIAGNOSTIC','PRACTICE','MASTERY')),
  is_correct            BOOLEAN,
  answer_was_skipped    BOOLEAN                  NOT NULL DEFAULT FALSE,
  difficulty            learning_difficulty      NOT NULL,
  cognitive_skill       learning_cognitive_skill NOT NULL,
  skill_code            VARCHAR(120),
  learning_outcome_code VARCHAR(160),
  misconception_code    VARCHAR(160),
  evidence_weight       NUMERIC(6,3)             NOT NULL DEFAULT 1
    CHECK (evidence_weight > 0 AND evidence_weight <= 5),
  score_signal          NUMERIC(5,2)
    CHECK (score_signal IS NULL OR score_signal BETWEEN 0 AND 100),
  occurred_at           TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, attempt_id, question_id, concept_id),
  CHECK (NOT answer_was_skipped OR is_correct IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_sle_student_concept_recent
  ON student_learning_evidence(student_id, concept_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_sle_concept_role
  ON student_learning_evidence(concept_id, evidence_role, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_sle_misconception
  ON student_learning_evidence(student_id, concept_id, misconception_code, occurred_at DESC)
  WHERE misconception_code IS NOT NULL;

-- Explainable derived learner state. This supplements student_concept_progress;
-- it does not overwrite historical mastery or resource completion.
CREATE TABLE IF NOT EXISTS student_concept_intelligence (
  student_id             UUID         NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  concept_id             UUID         NOT NULL REFERENCES learning_concepts(id) ON DELETE CASCADE,
  proficiency_score      NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (proficiency_score BETWEEN 0 AND 100),
  confidence_score       NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (confidence_score BETWEEN 0 AND 100),
  confidence_level       VARCHAR(12)  NOT NULL DEFAULT 'NONE'
    CHECK (confidence_level IN ('NONE','LOW','MEDIUM','HIGH')),
  evidence_count         INTEGER      NOT NULL DEFAULT 0 CHECK (evidence_count >= 0),
  correct_evidence_count INTEGER      NOT NULL DEFAULT 0 CHECK (correct_evidence_count >= 0),
  diagnostic_count       INTEGER      NOT NULL DEFAULT 0 CHECK (diagnostic_count >= 0),
  practice_count         INTEGER      NOT NULL DEFAULT 0 CHECK (practice_count >= 0),
  mastery_count          INTEGER      NOT NULL DEFAULT 0 CHECK (mastery_count >= 0),
  difficulty_diversity   SMALLINT     NOT NULL DEFAULT 0 CHECK (difficulty_diversity >= 0),
  skill_diversity        SMALLINT     NOT NULL DEFAULT 0 CHECK (skill_diversity >= 0),
  role_diversity         SMALLINT     NOT NULL DEFAULT 0 CHECK (role_diversity >= 0),
  retention_status       VARCHAR(20)  NOT NULL DEFAULT 'NOT_ASSESSED'
    CHECK (retention_status IN ('NOT_ASSESSED','ACTIVE_LEARNING','STABLE','REVIEW_SOON','REVIEW_DUE')),
  next_review_at         TIMESTAMPTZ,
  dominant_misconception_code VARCHAR(160),
  last_evidence_at       TIMESTAMPTZ,
  last_mastery_at        TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, concept_id)
);
CREATE OR REPLACE TRIGGER trg_student_concept_intelligence_updated_at
  BEFORE UPDATE ON student_concept_intelligence
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX IF NOT EXISTS idx_sci_student_priority
  ON student_concept_intelligence(student_id, retention_status, proficiency_score, confidence_score);
CREATE INDEX IF NOT EXISTS idx_sci_concept_gap
  ON student_concept_intelligence(concept_id, proficiency_score, confidence_score);
CREATE INDEX IF NOT EXISTS idx_sci_review_due
  ON student_concept_intelligence(student_id, next_review_at)
  WHERE next_review_at IS NOT NULL;

-- Misconceptions are tracked independently from generic wrong answers. The
-- state can move from suspected -> active -> resolved as later evidence arrives.
CREATE TABLE IF NOT EXISTS student_concept_misconceptions (
  student_id          UUID         NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  concept_id          UUID         NOT NULL REFERENCES learning_concepts(id) ON DELETE CASCADE,
  misconception_code VARCHAR(160) NOT NULL,
  state               VARCHAR(16)  NOT NULL DEFAULT 'SUSPECTED'
    CHECK (state IN ('SUSPECTED','ACTIVE','RESOLVED')),
  wrong_count         INTEGER      NOT NULL DEFAULT 0 CHECK (wrong_count >= 0),
  correct_count       INTEGER      NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
  first_seen_at       TIMESTAMPTZ,
  last_seen_at        TIMESTAMPTZ,
  resolved_at         TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, concept_id, misconception_code)
);
CREATE INDEX IF NOT EXISTS idx_scm_student_active
  ON student_concept_misconceptions(student_id, state, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_scm_concept_active
  ON student_concept_misconceptions(concept_id, state, last_seen_at DESC);

COMMENT ON TABLE student_learning_evidence IS
  'Question-level canonical concept evidence ledger for diagnostic, practice and mastery intelligence. Rebuilt idempotently from graded attempts.';
COMMENT ON TABLE student_concept_intelligence IS
  'Derived proficiency, confidence and retention state. Kept separate from historical mastery achievement.';
COMMENT ON TABLE student_concept_misconceptions IS
  'Explainable misconception signals derived only from reviewed questions carrying stable misconception_code metadata.';
COMMENT ON TABLE learning_concept_prerequisites IS
  'Canonical prerequisite graph used to recommend prerequisite repair instead of repeatedly serving harder current-concept questions.';

COMMIT;
