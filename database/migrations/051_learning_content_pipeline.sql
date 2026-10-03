-- ============================================================
-- 051_learning_content_pipeline.sql
-- Provider-agnostic, rights-aware content pipeline.
--
-- This migration adds metadata and audit boundaries for video, audio, image,
-- text/article, document and interactive resources. It deliberately does not
-- download remote content, bypass provider access controls, or auto-publish.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE learning_delivery_mode AS ENUM (
    'EXTERNAL_LINK',
    'OFFICIAL_EMBED',
    'LICENSED_REHOST',
    'VIDYASETU_ORIGINAL'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE learning_rights_status AS ENUM (
    'UNVERIFIED',
    'PENDING_REVIEW',
    'VERIFIED',
    'REJECTED',
    'EXPIRED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE learning_asset_status AS ENUM (
    'METADATA_ONLY',
    'UPLOAD_PENDING',
    'UPLOADED',
    'READY',
    'BLOCKED',
    'FAILED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TYPE learning_resource_type ADD VALUE IF NOT EXISTS 'IMAGE';
ALTER TYPE learning_license_code ADD VALUE IF NOT EXISTS 'CC_BY_ND';
ALTER TYPE learning_license_code ADD VALUE IF NOT EXISTS 'CC_BY_NC';

BEGIN;

-- A canonical asset is separate from a Learning resource. One source asset can
-- therefore be reused in multiple packs without copying its rights record.
CREATE TABLE IF NOT EXISTS learning_content_assets (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  intake_id             UUID REFERENCES learning_source_intake(id) ON DELETE SET NULL,
  resource_id           UUID REFERENCES learning_resources(id) ON DELETE SET NULL,
  asset_kind            VARCHAR(24) NOT NULL CHECK (asset_kind IN (
    'ARTICLE','VIDEO','AUDIO','IMAGE','INTERACTIVE','PDF','WORKSHEET',
    'QUESTION_PAPER','EXTERNAL_LINK'
  )),
  delivery_mode         learning_delivery_mode NOT NULL,
  provider_code         VARCHAR(40),
  source_url             TEXT,
  embed_url              TEXT,
  storage_key            TEXT,
  mime_type              VARCHAR(120),
  byte_size              BIGINT CHECK (byte_size IS NULL OR byte_size >= 0),
  checksum_sha256       VARCHAR(64),
  processing_status      learning_asset_status NOT NULL DEFAULT 'METADATA_ONLY',
  rights_status          learning_rights_status NOT NULL DEFAULT 'UNVERIFIED',
  licence               learning_license_code NOT NULL DEFAULT 'EXTERNAL_LINK_ONLY',
  licence_url            TEXT,
  attribution_text       TEXT,
  rights_evidence_url    TEXT,
  adaptation_allowed     BOOLEAN NOT NULL DEFAULT FALSE,
  commercial_use_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  verified_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at            TIMESTAMPTZ,
  metadata               JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by             UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (delivery_mode <> 'EXTERNAL_LINK' OR storage_key IS NULL),
  CHECK (delivery_mode <> 'OFFICIAL_EMBED' OR embed_url IS NOT NULL),
  CHECK (delivery_mode <> 'LICENSED_REHOST' OR storage_key IS NOT NULL),
  CHECK (delivery_mode <> 'VIDYASETU_ORIGINAL' OR asset_kind IN ('ARTICLE','EXTERNAL_LINK') OR storage_key IS NOT NULL),
  CHECK (rights_status <> 'VERIFIED' OR (licence <> 'OTHER' AND attribution_text IS NOT NULL)),
  CHECK (processing_status NOT IN ('UPLOADED','READY') OR storage_key IS NOT NULL)
);

CREATE OR REPLACE TRIGGER trg_learning_content_assets_updated_at
  BEFORE UPDATE ON learning_content_assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_learning_content_assets_intake
  ON learning_content_assets(intake_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_learning_content_assets_intake
  ON learning_content_assets(intake_id)
  WHERE intake_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_learning_content_assets_resource
  ON learning_content_assets(resource_id)
  WHERE resource_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_learning_content_assets_rights
  ON learning_content_assets(rights_status, processing_status, created_at DESC);

ALTER TABLE learning_source_intake
  ADD COLUMN IF NOT EXISTS delivery_mode learning_delivery_mode NOT NULL DEFAULT 'EXTERNAL_LINK',
  ADD COLUMN IF NOT EXISTS rights_status learning_rights_status NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN IF NOT EXISTS category learning_category NOT NULL DEFAULT 'ACADEMIC',
  ADD COLUMN IF NOT EXISTS licence_url TEXT,
  ADD COLUMN IF NOT EXISTS rights_evidence_url TEXT,
  ADD COLUMN IF NOT EXISTS grade_code VARCHAR(24),
  ADD COLUMN IF NOT EXISTS media_kind VARCHAR(24),
  ADD COLUMN IF NOT EXISTS embed_url TEXT,
  ADD COLUMN IF NOT EXISTS asset_id UUID REFERENCES learning_content_assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_learning_source_intake_pipeline
  ON learning_source_intake(delivery_mode, rights_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_source_intake_grade
  ON learning_source_intake(grade_code, created_at DESC)
  WHERE grade_code IS NOT NULL;

-- Preserve the explicit verification history from migration 049. Existing
-- approved/imported rows should not become semantically unverified merely
-- because the new status column was added with an UNVERIFIED default.
UPDATE learning_source_intake
SET rights_status='VERIFIED'::learning_rights_status
WHERE status IN ('APPROVED','IMPORTED')
  AND licence_candidate IS NOT NULL
  AND licence_candidate::text <> 'OTHER'
  AND licence_verified_at IS NOT NULL;

ALTER TABLE learning_resources
  ADD COLUMN IF NOT EXISTS delivery_mode learning_delivery_mode NOT NULL DEFAULT 'EXTERNAL_LINK',
  ADD COLUMN IF NOT EXISTS rights_status learning_rights_status NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN IF NOT EXISTS rights_evidence_url TEXT,
  ADD COLUMN IF NOT EXISTS rights_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rights_verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS asset_id UUID REFERENCES learning_content_assets(id) ON DELETE SET NULL;

-- Existing original resources are already governed by the original source
-- boundary. Existing external resources remain link-first and unverified.
UPDATE learning_resources lr
SET delivery_mode = CASE
      WHEN lcs.code='VIDYASETU_ORIGINAL' THEN 'VIDYASETU_ORIGINAL'::learning_delivery_mode
      WHEN lr.resource_type='EXTERNAL_LINK' THEN 'EXTERNAL_LINK'::learning_delivery_mode
      ELSE 'EXTERNAL_LINK'::learning_delivery_mode
    END,
    rights_status = CASE
      WHEN lcs.code='VIDYASETU_ORIGINAL' THEN 'VERIFIED'::learning_rights_status
      ELSE 'UNVERIFIED'::learning_rights_status
    END,
    rights_verified_at = CASE WHEN lcs.code='VIDYASETU_ORIGINAL' THEN COALESCE(lr.reviewed_at,lr.created_at) ELSE NULL END
FROM learning_content_sources lcs
WHERE lcs.id=lr.source_id;

-- Add IMAGE to the normalized discovery capability checks without weakening
-- the existing provider allow-list.
ALTER TABLE learning_source_discovery_candidates
  DROP CONSTRAINT IF EXISTS chk_learning_discovery_candidate_media_kind;
ALTER TABLE learning_source_discovery_candidates
  ADD CONSTRAINT chk_learning_discovery_candidate_media_kind
  CHECK (media_kind IS NULL OR media_kind IN ('ARTICLE','VIDEO','AUDIO','IMAGE','INTERACTIVE','PDF','COURSE','LINK'));

ALTER TABLE learning_source_connectors
  DROP CONSTRAINT IF EXISTS learning_source_connectors_supports_media_kinds_check;
ALTER TABLE learning_source_connectors
  ADD CONSTRAINT learning_source_connectors_supports_media_kinds_check
  CHECK (supports_media_kinds <@ ARRAY['ARTICLE','VIDEO','AUDIO','IMAGE','INTERACTIVE','PDF','COURSE','LINK']::TEXT[]);

-- Image/pictorial assets can be discovered as metadata even when a provider
-- does not expose a standalone image API. Reuse still follows the item-level
-- rights review below; this only widens the normalized filter vocabulary.
UPDATE learning_source_connectors
SET supports_media_kinds = ARRAY(
  SELECT DISTINCT unnest(supports_media_kinds || ARRAY['IMAGE']::TEXT[])
);

-- Re-assert the source-review boundary with the pipeline's explicit rights
-- status. Existing migration-049 checks licence/attribution; this adds the
-- human verification flag without changing the normal review states.
CREATE OR REPLACE FUNCTION validate_learning_intake_item_governance()
RETURNS TRIGGER AS $$
DECLARE
  src RECORD;
BEGIN
  IF NEW.status NOT IN ('APPROVED','IMPORTED') THEN
    RETURN NEW;
  END IF;

  SELECT code, attribution_required, requires_item_license_check
  INTO src
  FROM learning_content_sources
  WHERE id=NEW.source_id;

  IF src.requires_item_license_check THEN
    IF NEW.licence_candidate IS NULL OR NEW.licence_candidate::text='OTHER' THEN
      RAISE EXCEPTION 'Item-level licence must be verified before approval/import for source %', src.code;
    END IF;
    IF NEW.licence_verified_at IS NULL THEN
      RAISE EXCEPTION 'Save item-level licence verification before approval/import for source %', src.code;
    END IF;
    IF NEW.rights_status <> 'VERIFIED'::learning_rights_status THEN
      RAISE EXCEPTION 'Rights status must be VERIFIED before approval/import for source %', src.code;
    END IF;
  END IF;

  IF src.attribution_required AND NULLIF(BTRIM(COALESCE(NEW.attribution_text,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Attribution evidence is required before approval/import for source %', src.code;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_learning_intake_item_governance ON learning_source_intake;
CREATE TRIGGER trg_learning_intake_item_governance
  BEFORE INSERT OR UPDATE OF status,licence_candidate,licence_verified_at,attribution_text,rights_status
  ON learning_source_intake
  FOR EACH ROW EXECUTE FUNCTION validate_learning_intake_item_governance();

CREATE TABLE IF NOT EXISTS learning_content_pipeline_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  intake_id   UUID REFERENCES learning_source_intake(id) ON DELETE SET NULL,
  asset_id    UUID REFERENCES learning_content_assets(id) ON DELETE SET NULL,
  resource_id UUID REFERENCES learning_resources(id) ON DELETE SET NULL,
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  event_code  VARCHAR(60) NOT NULL,
  from_state  VARCHAR(60),
  to_state    VARCHAR(60),
  details     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_pipeline_events_intake
  ON learning_content_pipeline_events(intake_id, created_at DESC)
  WHERE intake_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_learning_pipeline_events_resource
  ON learning_content_pipeline_events(resource_id, created_at DESC)
  WHERE resource_id IS NOT NULL;

COMMENT ON TABLE learning_content_assets IS
  'Rights-aware media asset registry. Remote content is never downloaded by this table; storage_key is only an explicitly uploaded/owned object.';
COMMENT ON COLUMN learning_content_assets.rights_evidence_url IS
  'URL or internal evidence reference reviewed by a Platform Admin; discovery metadata alone is not evidence.';
COMMENT ON TABLE learning_content_pipeline_events IS
  'Append-only audit trail for source, rights, asset and canonical-resource transitions.';

COMMIT;
