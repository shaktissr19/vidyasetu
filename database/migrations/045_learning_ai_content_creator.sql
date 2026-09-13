-- ============================================================
-- 045_learning_ai_content_creator.sql
-- VidyaSetu Admin-only Hybrid AI Content Creator foundation.
-- Additive/idempotent. No destructive data changes and no content publish.
--
-- Design:
--   ADMIN REQUEST -> SOURCE GOVERNANCE -> AI DRAFT -> AUTO VALIDATION
--   -> HUMAN REVIEW -> MATERIALISE AS GOVERNED DRAFT -> NORMAL STUDIO REVIEW
--
-- AI output is NEVER published directly by this schema or migration.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE learning_creator_mode AS ENUM ('CURRICULUM','SOURCES','IMPROVE_EXISTING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE learning_creator_language_mode AS ENUM ('ENGLISH','HINDI','BILINGUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE learning_creator_job_status AS ENUM (
    'DRAFT','READY_TO_GENERATE','GENERATING','GENERATED','VALIDATION_FAILED',
    'READY_FOR_REVIEW','APPROVED','REJECTED','MATERIALISED','FAILED','CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE learning_creator_source_role AS ENUM ('GROUNDING','REFERENCE_ONLY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE learning_creator_output_type AS ENUM ('RESOURCE','QUESTION','ASSESSMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

BEGIN;

CREATE TABLE IF NOT EXISTS learning_creator_jobs (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mode                  learning_creator_mode NOT NULL,
  title                 VARCHAR(300) NOT NULL,
  instructions          TEXT,
  concept_id            UUID REFERENCES learning_concepts(id) ON DELETE SET NULL,
  existing_resource_id  UUID REFERENCES learning_resources(id) ON DELETE SET NULL,
  class_number          SMALLINT CHECK (class_number BETWEEN 1 AND 12),
  subject_id            UUID REFERENCES subjects(id) ON DELETE SET NULL,
  board_codes           TEXT[] NOT NULL DEFAULT ARRAY['COMMON']::TEXT[],
  language_mode         learning_creator_language_mode NOT NULL DEFAULT 'BILINGUAL',
  visibility            learning_visibility NOT NULL DEFAULT 'REGISTERED',
  access_requirement    learning_access_requirement NOT NULL DEFAULT 'REGISTERED',
  requested_pack        JSONB NOT NULL DEFAULT '{}'::JSONB,
  status                learning_creator_job_status NOT NULL DEFAULT 'DRAFT',
  provider              VARCHAR(40),
  provider_model        VARCHAR(120),
  prompt_version        VARCHAR(40) NOT NULL DEFAULT 'VS-CREATOR-V1',
  generated_pack        JSONB,
  validation_report     JSONB,
  error_message         TEXT,
  source_count          INTEGER NOT NULL DEFAULT 0 CHECK (source_count >= 0),
  created_by            UUID NOT NULL REFERENCES users(id),
  reviewed_by           UUID REFERENCES users(id),
  review_note           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_at          TIMESTAMPTZ,
  reviewed_at           TIMESTAMPTZ,
  materialised_at       TIMESTAMPTZ,
  CONSTRAINT learning_creator_public_access_consistency CHECK (
    (visibility='PUBLIC' AND access_requirement='PUBLIC') OR
    (visibility<>'PUBLIC' AND access_requirement<>'PUBLIC')
  ),
  CONSTRAINT learning_creator_mode_target CHECK (
    (mode='CURRICULUM' AND concept_id IS NOT NULL) OR
    (mode='SOURCES') OR
    (mode='IMPROVE_EXISTING' AND existing_resource_id IS NOT NULL)
  )
);

CREATE OR REPLACE TRIGGER trg_learning_creator_jobs_updated_at
  BEFORE UPDATE ON learning_creator_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_learning_creator_jobs_status
  ON learning_creator_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_creator_jobs_creator
  ON learning_creator_jobs(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_creator_jobs_concept
  ON learning_creator_jobs(concept_id)
  WHERE concept_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS learning_creator_sources (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id                UUID NOT NULL REFERENCES learning_creator_jobs(id) ON DELETE CASCADE,
  source_role           learning_creator_source_role NOT NULL DEFAULT 'GROUNDING',
  source_code           VARCHAR(40) NOT NULL,
  title                 VARCHAR(300) NOT NULL,
  source_url            TEXT,
  resource_id           UUID REFERENCES learning_resources(id) ON DELETE SET NULL,
  intake_id             UUID REFERENCES learning_source_intake(id) ON DELETE SET NULL,
  licence               learning_license_code NOT NULL,
  licence_url           TEXT,
  attribution_text      TEXT,
  allow_adaptation      BOOLEAN NOT NULL DEFAULT FALSE,
  allow_commercial      BOOLEAN NOT NULL DEFAULT FALSE,
  verified_for_use      BOOLEAN NOT NULL DEFAULT FALSE,
  excerpt               TEXT,
  excerpt_hash          VARCHAR(128),
  metadata              JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT learning_creator_source_locator CHECK (
    source_url IS NOT NULL OR resource_id IS NOT NULL OR intake_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_learning_creator_sources_job
  ON learning_creator_sources(job_id, source_role, created_at);
CREATE INDEX IF NOT EXISTS idx_learning_creator_sources_resource
  ON learning_creator_sources(resource_id)
  WHERE resource_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS learning_creator_outputs (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id                UUID NOT NULL REFERENCES learning_creator_jobs(id) ON DELETE CASCADE,
  output_type           learning_creator_output_type NOT NULL,
  output_key            VARCHAR(120) NOT NULL,
  resource_id           UUID REFERENCES learning_resources(id) ON DELETE SET NULL,
  question_id           UUID REFERENCES learning_questions(id) ON DELETE SET NULL,
  assessment_id         UUID REFERENCES learning_assessments(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, output_type, output_key),
  CONSTRAINT learning_creator_output_target CHECK (
    (output_type='RESOURCE' AND resource_id IS NOT NULL AND question_id IS NULL AND assessment_id IS NULL) OR
    (output_type='QUESTION' AND resource_id IS NULL AND question_id IS NOT NULL AND assessment_id IS NULL) OR
    (output_type='ASSESSMENT' AND resource_id IS NULL AND question_id IS NULL AND assessment_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_learning_creator_outputs_job
  ON learning_creator_outputs(job_id, output_type);

COMMENT ON TABLE learning_creator_jobs IS
  'Admin-only hybrid AI content-creation jobs. Generated content remains a draft until human review and materialisation into the governed Learning Studio.';
COMMENT ON TABLE learning_creator_sources IS
  'Source provenance/licence evidence used by an AI creator job. verified_for_use must be true for grounding sources.';
COMMENT ON TABLE learning_creator_outputs IS
  'Links AI creator jobs to canonical Learning Studio entities created only after explicit admin approval/materialisation.';

COMMIT;
