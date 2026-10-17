-- Phase B: map governed Learning assets to stable curriculum topic IDs.
-- Additive: existing resource/concept links and review states remain intact.
BEGIN;

ALTER TABLE learning_content_assets
  DROP CONSTRAINT IF EXISTS learning_content_assets_asset_kind_check;
ALTER TABLE learning_content_assets
  ADD CONSTRAINT learning_content_assets_asset_kind_check CHECK (asset_kind IN (
    'ARTICLE','VIDEO','AUDIO','IMAGE','INTERACTIVE','PDF','WORKSHEET',
    'QUESTION_PAPER','EXTERNAL_LINK','QUIZ','DOCUMENT'
  ));
ALTER TABLE learning_content_assets
  ADD COLUMN IF NOT EXISTS language VARCHAR(12) NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS duration_secs INTEGER CHECK (duration_secs IS NULL OR duration_secs BETWEEN 1 AND 86400),
  ADD COLUMN IF NOT EXISTS difficulty VARCHAR(20) CHECK (difficulty IS NULL OR difficulty IN ('EASY','MEDIUM','HARD','CHALLENGE')),
  ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS transcript TEXT,
  ADD COLUMN IF NOT EXISTS captions_url TEXT,
  ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1 CHECK (version_number > 0),
  ADD COLUMN IF NOT EXISTS original_file_name VARCHAR(240);

CREATE TABLE IF NOT EXISTS learning_asset_nodes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id UUID NOT NULL REFERENCES learning_content_assets(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES curriculum_topics(id) ON DELETE CASCADE,
  board_id UUID NOT NULL REFERENCES education_boards(id) ON DELETE CASCADE,
  grade_code VARCHAR(24) NOT NULL,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  medium VARCHAR(12) NOT NULL CHECK (medium IN ('en','hi')),
  visibility VARCHAR(24) NOT NULL DEFAULT 'CLASS_RESTRICTED'
    CHECK (visibility IN ('PUBLIC','CLASS_RESTRICTED','SCHOOL_PRIVATE')),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((visibility='SCHOOL_PRIVATE' AND school_id IS NOT NULL) OR
         (visibility<>'SCHOOL_PRIVATE' AND school_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_learning_asset_nodes_scope
  ON learning_asset_nodes(asset_id,topic_id,board_id,grade_code,medium,
    (COALESCE(school_id,'00000000-0000-0000-0000-000000000000'::uuid)));
CREATE INDEX IF NOT EXISTS idx_learning_asset_nodes_topic_scope
  ON learning_asset_nodes(topic_id,board_id,grade_code,medium,visibility);
CREATE INDEX IF NOT EXISTS idx_learning_asset_nodes_asset ON learning_asset_nodes(asset_id);

COMMIT;
