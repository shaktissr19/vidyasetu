-- Additive migration. Apply separately after review; no content is published.
ALTER TYPE learning_resource_type ADD VALUE IF NOT EXISTS 'DOCUMENT';
ALTER TYPE learning_license_code ADD VALUE IF NOT EXISTS 'PERMISSION_GRANTED';

BEGIN;
ALTER TABLE learning_resources
  ADD COLUMN IF NOT EXISTS difficulty VARCHAR(16) CHECK (difficulty IN ('EASY','MODERATE','ADVANCED')),
  ADD COLUMN IF NOT EXISTS transcript TEXT,
  ADD COLUMN IF NOT EXISTS alt_text TEXT;

ALTER TABLE learning_content_assets DROP CONSTRAINT IF EXISTS learning_content_assets_asset_kind_check;
ALTER TABLE learning_content_assets ADD CONSTRAINT learning_content_assets_asset_kind_check
  CHECK (asset_kind IN ('ARTICLE','VIDEO','AUDIO','IMAGE','INTERACTIVE','PDF','WORKSHEET','QUESTION_PAPER','DOCUMENT','EXTERNAL_LINK'));
CREATE INDEX IF NOT EXISTS idx_learning_resources_topic_difficulty
  ON learning_resources(subject_id,topic_label,difficulty) WHERE review_status='PUBLISHED';

CREATE TABLE IF NOT EXISTS learning_resource_revisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  resource_id UUID NOT NULL REFERENCES learning_resources(id),
  actor_id UUID REFERENCES users(id),
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_learning_resource_revisions_resource ON learning_resource_revisions(resource_id,created_at DESC);

COMMENT ON COLUMN learning_resources.difficulty IS 'Resource complexity, independent from question difficulty: EASY, MODERATE or ADVANCED.';
COMMENT ON COLUMN learning_resources.transcript IS 'Reviewed plain-text transcript; never rendered as executable HTML.';
COMMIT;
