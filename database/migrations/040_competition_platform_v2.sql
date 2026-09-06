-- ============================================================
-- 040_competition_platform_v2.sql
-- Competition 2.0: fair platform competitions connected to the
-- governed Learning Question Bank and learner growth loop.
-- Additive/idempotent; no publication/status changes.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE competition_format AS ENUM ('OLYMPIAD','CHALLENGE','SPRINT','WEEKLY_QUIZ');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE competition_integrity_status AS ENUM ('CLEAN','FLAGGED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE competition_reward_tier AS ENUM ('PARTICIPANT','TOP_25','TOP_10','TOP_3','WINNER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE exams ADD COLUMN IF NOT EXISTS public_slug VARCHAR(180);
ALTER TABLE exams ADD COLUMN IF NOT EXISTS subtitle VARCHAR(300);
ALTER TABLE exams ADD COLUMN IF NOT EXISTS subtitle_hi VARCHAR(300);
ALTER TABLE exams ADD COLUMN IF NOT EXISTS competition_format competition_format NOT NULL DEFAULT 'OLYMPIAD';
ALTER TABLE exams ADD COLUMN IF NOT EXISTS featured_public BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS require_registration BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS shuffle_questions BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS leaderboard_public BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS certificate_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS learning_feedback_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_exams_public_slug
  ON exams(public_slug) WHERE public_slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_exams_public_competitions
  ON exams(status,start_time) WHERE school_id IS NULL AND type='OLYMPIAD';

ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS learning_question_id UUID REFERENCES learning_questions(id) ON DELETE SET NULL;
ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS learning_concept_id UUID REFERENCES learning_concepts(id) ON DELETE SET NULL;
ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS learning_outcome_code VARCHAR(160);
ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS misconception_code VARCHAR(160);
CREATE INDEX IF NOT EXISTS idx_exam_questions_learning_question ON exam_questions(learning_question_id) WHERE learning_question_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_exam_questions_concept ON exam_questions(learning_concept_id) WHERE learning_concept_id IS NOT NULL;

-- Platform competitions must work for independent learners too. School rank is
-- simply unavailable when a learner has no approved School association.
ALTER TABLE exam_registrations ALTER COLUMN school_id DROP NOT NULL;
ALTER TABLE exam_attempts ALTER COLUMN school_id DROP NOT NULL;
ALTER TABLE exam_leaderboard ALTER COLUMN school_id DROP NOT NULL;

ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS deadline_at TIMESTAMPTZ;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS question_order UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS integrity_status competition_integrity_status NOT NULL DEFAULT 'CLEAN';
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS integrity_flags JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS score_released_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_exam_attempts_integrity ON exam_attempts(exam_id,integrity_status,status);

CREATE TABLE IF NOT EXISTS competition_attempt_concept_results (
  attempt_id       UUID        NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  concept_id       UUID        NOT NULL REFERENCES learning_concepts(id) ON DELETE CASCADE,
  question_count   SMALLINT    NOT NULL DEFAULT 0 CHECK (question_count >= 0),
  correct_count    SMALLINT    NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
  wrong_count      SMALLINT    NOT NULL DEFAULT 0 CHECK (wrong_count >= 0),
  skipped_count    SMALLINT    NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  accuracy_pct     NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (accuracy_pct BETWEEN 0 AND 100),
  needs_review     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (attempt_id,concept_id)
);
CREATE INDEX IF NOT EXISTS idx_comp_attempt_concept_concept ON competition_attempt_concept_results(concept_id,needs_review);

CREATE TABLE IF NOT EXISTS competition_achievements (
  id               UUID                    PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id          UUID                    NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id       UUID                    NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  reward_tier      competition_reward_tier NOT NULL,
  rank_overall     INTEGER,
  percentile       NUMERIC(5,2),
  certificate_code VARCHAR(64) UNIQUE,
  awarded_at       TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  UNIQUE (exam_id,student_id,reward_tier)
);
CREATE INDEX IF NOT EXISTS idx_comp_achievement_student ON competition_achievements(student_id,awarded_at DESC);

COMMIT;
