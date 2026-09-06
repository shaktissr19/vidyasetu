-- ============================================================
-- 039_personalized_adaptive_learning_v2.sql
-- VidyaSetu Personalized / Adaptive Learning 2.0
-- Persistent, explainable daily learning journeys built from the
-- established mastery + diagnostic/adaptive evidence engines.
--
-- IMPORTANT:
-- - Additive/idempotent only.
-- - Does not modify mastery, diagnostic evidence or publication state.
-- - A daily journey is a snapshot of recommendations, not a new source
--   of academic truth.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS student_adaptive_preferences (
  student_id      UUID        PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  daily_minutes   SMALLINT    NOT NULL DEFAULT 25
    CHECK (daily_minutes IN (15,25,40)),
  plan_style      VARCHAR(16) NOT NULL DEFAULT 'BALANCED'
    CHECK (plan_style IN ('BALANCED','FOCUS')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE OR REPLACE TRIGGER trg_student_adaptive_preferences_updated_at
  BEFORE UPDATE ON student_adaptive_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS student_daily_learning_plans (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id          UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  plan_date           DATE        NOT NULL,
  revision            INTEGER     NOT NULL DEFAULT 1 CHECK (revision > 0),
  status              VARCHAR(16) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','COMPLETED','SUPERSEDED')),
  daily_minutes       SMALLINT    NOT NULL CHECK (daily_minutes IN (15,25,40)),
  plan_style          VARCHAR(16) NOT NULL DEFAULT 'BALANCED'
    CHECK (plan_style IN ('BALANCED','FOCUS')),
  headline            TEXT        NOT NULL,
  explanation         TEXT        NOT NULL,
  estimated_minutes   SMALLINT    NOT NULL DEFAULT 0 CHECK (estimated_minutes >= 0),
  source_generated_at TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, plan_date, revision)
);
CREATE OR REPLACE TRIGGER trg_student_daily_learning_plans_updated_at
  BEFORE UPDATE ON student_daily_learning_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_daily_learning_plan_active
  ON student_daily_learning_plans(student_id, plan_date)
  WHERE status='ACTIVE';
CREATE INDEX IF NOT EXISTS idx_student_daily_learning_plans_history
  ON student_daily_learning_plans(student_id, plan_date DESC, revision DESC);

CREATE TABLE IF NOT EXISTS student_daily_learning_plan_items (
  id                 UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id            UUID        NOT NULL REFERENCES student_daily_learning_plans(id) ON DELETE CASCADE,
  position           SMALLINT    NOT NULL CHECK (position > 0),
  source_action_id   TEXT        NOT NULL,
  concept_id         UUID        NOT NULL REFERENCES learning_concepts(id) ON DELETE CASCADE,
  action_type        VARCHAR(32) NOT NULL
    CHECK (action_type IN (
      'CONTINUE_RESOURCE','REVIEW_RESOURCE','PRACTICE','MASTERY_CHECK','START_NEXT_CONCEPT',
      'QUICK_DIAGNOSTIC','REPAIR_MISCONCEPTION','SPACED_REVIEW','REVIEW_PREREQUISITE'
    )),
  urgency            VARCHAR(8)  NOT NULL CHECK (urgency IN ('HIGH','FOCUS','NEXT')),
  target_kind        VARCHAR(12) NOT NULL CHECK (target_kind IN ('RESOURCE','ASSESSMENT')),
  target_id          UUID        NOT NULL,
  target_public_slug TEXT,
  target_title       TEXT        NOT NULL,
  title              TEXT        NOT NULL,
  reason             TEXT        NOT NULL,
  estimated_minutes  SMALLINT    NOT NULL CHECK (estimated_minutes > 0 AND estimated_minutes <= 120),
  status             VARCHAR(16) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','COMPLETED','SKIPPED')),
  completed_at       TIMESTAMPTZ,
  skipped_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plan_id, position),
  UNIQUE (plan_id, source_action_id)
);
CREATE OR REPLACE TRIGGER trg_student_daily_learning_plan_items_updated_at
  BEFORE UPDATE ON student_daily_learning_plan_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX IF NOT EXISTS idx_student_daily_learning_plan_items_status
  ON student_daily_learning_plan_items(plan_id, status, position);
CREATE INDEX IF NOT EXISTS idx_student_daily_learning_plan_items_target
  ON student_daily_learning_plan_items(target_kind, target_id);

COMMENT ON TABLE student_adaptive_preferences IS
  'Learner-controlled time budget and journey style for personalized daily learning. No academic evidence is stored here.';
COMMENT ON TABLE student_daily_learning_plans IS
  'Stable daily personalized learning journey snapshot generated from established adaptive and diagnostic evidence.';
COMMENT ON TABLE student_daily_learning_plan_items IS
  'Ordered explainable actions within a daily learning journey; completion is reconciled against actual resource/assessment activity.';

COMMIT;
