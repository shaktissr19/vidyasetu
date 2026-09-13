-- ============================================================
-- 046_learning_creator_source_discovery.sql
-- VidyaSetu hybrid Content Creator: governed source discovery.
--
-- Discovery only finds/stages candidates. It never makes a source
-- grounding-ready, never approves a licence, and never publishes content.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE learning_discovery_provider AS ENUM ('LOCAL','DIKSHA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE learning_discovery_run_status AS ENUM ('RUNNING','COMPLETED','PARTIAL','FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

BEGIN;

INSERT INTO learning_content_sources
  (id,code,name,source_kind,homepage_url,default_license,attribution_required,
   allow_rehosting_default,allow_adaptation_default,requires_item_license_check,notes)
VALUES
  ('83000000-0000-0000-0000-000000000006','DIKSHA','DIKSHA — Digital Infrastructure for Knowledge Sharing',
   'OTHER_OER','https://diksha.gov.in','OTHER',TRUE,FALSE,FALSE,TRUE,
   'Discovery may use DIKSHA/Sunbird public search metadata. Every selected item still requires item-level licence and attribution review before grounding/adaptation.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name,
  homepage_url=EXCLUDED.homepage_url,
  attribution_required=EXCLUDED.attribution_required,
  allow_rehosting_default=EXCLUDED.allow_rehosting_default,
  allow_adaptation_default=EXCLUDED.allow_adaptation_default,
  requires_item_license_check=EXCLUDED.requires_item_license_check,
  notes=EXCLUDED.notes,
  is_active=TRUE,
  updated_at=NOW();

CREATE TABLE IF NOT EXISTS learning_source_discovery_runs (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider       learning_discovery_provider NOT NULL,
  query_text     VARCHAR(300) NOT NULL,
  class_number   SMALLINT CHECK (class_number BETWEEN 1 AND 12),
  subject        VARCHAR(160),
  language       VARCHAR(80),
  filters        JSONB NOT NULL DEFAULT '{}'::JSONB,
  status         learning_discovery_run_status NOT NULL DEFAULT 'RUNNING',
  result_count   INTEGER NOT NULL DEFAULT 0 CHECK (result_count >= 0),
  error_message  TEXT,
  created_by     UUID NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_learning_discovery_runs_created
  ON learning_source_discovery_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_discovery_runs_creator
  ON learning_source_discovery_runs(created_by,created_at DESC);

CREATE TABLE IF NOT EXISTS learning_source_discovery_candidates (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id               UUID NOT NULL REFERENCES learning_source_discovery_runs(id) ON DELETE CASCADE,
  provider             learning_discovery_provider NOT NULL,
  source_code          VARCHAR(40) NOT NULL,
  source_item_id       VARCHAR(220) NOT NULL,
  resource_id          UUID REFERENCES learning_resources(id) ON DELETE SET NULL,
  title                VARCHAR(500) NOT NULL,
  description          TEXT,
  source_url           TEXT,
  primary_category     VARCHAR(180),
  resource_type        VARCHAR(180),
  licence_candidate    learning_license_code,
  licence_raw          VARCHAR(300),
  attribution_text     TEXT,
  author_text          TEXT,
  publisher_text       TEXT,
  grade_levels         TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  subjects             TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  languages            TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  can_adapt            BOOLEAN NOT NULL DEFAULT FALSE,
  can_use_commercially BOOLEAN NOT NULL DEFAULT FALSE,
  licence_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  metadata             JSONB NOT NULL DEFAULT '{}'::JSONB,
  intake_id            UUID REFERENCES learning_source_intake(id) ON DELETE SET NULL,
  staged_by            UUID REFERENCES users(id),
  staged_at            TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id,provider,source_item_id)
);

CREATE INDEX IF NOT EXISTS idx_learning_discovery_candidates_run
  ON learning_source_discovery_candidates(run_id,created_at);
CREATE INDEX IF NOT EXISTS idx_learning_discovery_candidates_source
  ON learning_source_discovery_candidates(source_code,source_item_id);
CREATE INDEX IF NOT EXISTS idx_learning_discovery_candidates_intake
  ON learning_source_discovery_candidates(intake_id)
  WHERE intake_id IS NOT NULL;

COMMENT ON TABLE learning_source_discovery_runs IS
  'Audit trail of Admin-only curated source searches. Discovery is metadata-only and does not grant reuse rights.';
COMMENT ON TABLE learning_source_discovery_candidates IS
  'Normalized source-search candidates. licence_verified remains false until existing OER intake review explicitly verifies licence/attribution.';

COMMIT;
