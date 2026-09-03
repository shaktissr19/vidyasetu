-- ============================================================
-- 026_learning_concepts_mastery.sql
-- VidyaSetu canonical concept identity + concept-level mastery.
-- Additive/idempotent. No destructive data changes.
--
-- IMPORTANT:
-- - This migration creates the schema only. It does not publish content.
-- - Canonical concept rows are synchronized separately from the versioned
--   syllabus registry using syncLearningConceptRegistry.ts.
-- - Existing resource-level progress and legacy content tables are preserved.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS learning_concepts (
  id                 UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  code               VARCHAR(180) NOT NULL UNIQUE,
  name               VARCHAR(300) NOT NULL,
  name_hi            VARCHAR(300),
  academic_year      VARCHAR(10)  NOT NULL,
  grade_id           UUID         NOT NULL REFERENCES education_grade_levels(id) ON DELETE RESTRICT,
  subject_id         UUID         REFERENCES subjects(id) ON DELETE SET NULL,
  subject_code       VARCHAR(60)  NOT NULL,
  chapter_code       VARCHAR(100),
  chapter_title      VARCHAR(300),
  registry_status    VARCHAR(60)  NOT NULL DEFAULT 'DRAFT_FOR_ACADEMIC_REVIEW',
  registry_source    VARCHAR(220) NOT NULL,
  sequence           SMALLINT     NOT NULL DEFAULT 0,
  is_active          BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER trg_learning_concepts_updated_at
  BEFORE UPDATE ON learning_concepts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_learning_concepts_grade_subject
  ON learning_concepts(grade_id, subject_code, sequence)
  WHERE is_active=TRUE;
CREATE INDEX IF NOT EXISTS idx_learning_concepts_subject_id
  ON learning_concepts(subject_id)
  WHERE subject_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_learning_concepts_chapter
  ON learning_concepts(chapter_code, sequence)
  WHERE chapter_code IS NOT NULL;

-- A resource, question or assessment may legitimately span more than one
-- canonical syllabus concept. Do not collapse this to a single concept_id.
CREATE TABLE IF NOT EXISTS learning_resource_concepts (
  resource_id UUID NOT NULL REFERENCES learning_resources(id) ON DELETE CASCADE,
  concept_id  UUID NOT NULL REFERENCES learning_concepts(id) ON DELETE CASCADE,
  is_primary  BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (resource_id, concept_id)
);
CREATE INDEX IF NOT EXISTS idx_lrc_concept ON learning_resource_concepts(concept_id, resource_id);

CREATE TABLE IF NOT EXISTS learning_question_concepts (
  question_id UUID NOT NULL REFERENCES learning_questions(id) ON DELETE CASCADE,
  concept_id  UUID NOT NULL REFERENCES learning_concepts(id) ON DELETE CASCADE,
  is_primary  BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (question_id, concept_id)
);
CREATE INDEX IF NOT EXISTS idx_lqc_concept ON learning_question_concepts(concept_id, question_id);

CREATE TABLE IF NOT EXISTS learning_assessment_concepts (
  assessment_id UUID NOT NULL REFERENCES learning_assessments(id) ON DELETE CASCADE,
  concept_id    UUID NOT NULL REFERENCES learning_concepts(id) ON DELETE CASCADE,
  is_primary    BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order    SMALLINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (assessment_id, concept_id)
);
CREATE INDEX IF NOT EXISTS idx_lac_concept ON learning_assessment_concepts(concept_id, assessment_id);

-- Canonical progress belongs to the concept, not to an individual language,
-- article, video or quiz. Existing resource progress remains as a detailed
-- activity signal and will be bridged into this table by the Learning Hub.
CREATE TABLE IF NOT EXISTS student_concept_progress (
  student_id              UUID         NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  concept_id              UUID         NOT NULL REFERENCES learning_concepts(id) ON DELETE CASCADE,
  state                   VARCHAR(24)  NOT NULL DEFAULT 'NOT_STARTED'
    CHECK (state IN ('NOT_STARTED','LEARNING','PRACTISING','NEEDS_REVIEW','MASTERED')),
  exposure_pct            NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (exposure_pct BETWEEN 0 AND 100),
  resource_completion_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (resource_completion_pct BETWEEN 0 AND 100),
  practice_best_pct       NUMERIC(5,2) CHECK (practice_best_pct IS NULL OR practice_best_pct BETWEEN 0 AND 100),
  mastery_pct             NUMERIC(5,2) CHECK (mastery_pct IS NULL OR mastery_pct BETWEEN 0 AND 100),
  practice_attempts       INTEGER      NOT NULL DEFAULT 0 CHECK (practice_attempts >= 0),
  mastery_attempts        INTEGER      NOT NULL DEFAULT 0 CHECK (mastery_attempts >= 0),
  needs_review            BOOLEAN      NOT NULL DEFAULT FALSE,
  first_started_at        TIMESTAMPTZ,
  last_activity_at        TIMESTAMPTZ,
  completed_at            TIMESTAMPTZ,
  mastered_at             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, concept_id)
);

CREATE OR REPLACE TRIGGER trg_student_concept_progress_updated_at
  BEFORE UPDATE ON student_concept_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_scp_student_recent
  ON student_concept_progress(student_id, last_activity_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_scp_student_state
  ON student_concept_progress(student_id, state, needs_review);
CREATE INDEX IF NOT EXISTS idx_scp_concept_mastery
  ON student_concept_progress(concept_id, mastery_pct)
  WHERE mastery_pct IS NOT NULL;

COMMENT ON TABLE learning_concepts IS
  'Canonical syllabus concept identities. Language and media assets map to these concepts rather than becoming separate learning identities.';
COMMENT ON TABLE learning_resource_concepts IS
  'Many-to-many mapping because a learning resource may support one or several canonical concepts.';
COMMENT ON TABLE learning_question_concepts IS
  'Many-to-many mapping used for concept-level diagnostic and mastery evidence.';
COMMENT ON TABLE learning_assessment_concepts IS
  'Many-to-many mapping between assessments and the concepts they measure.';
COMMENT ON TABLE student_concept_progress IS
  'Canonical learner progress/mastery state per concept. Existing resource-level progress is retained as an input signal.';

COMMIT;
