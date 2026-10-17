-- Phases C/D: review governance, moderation, version history and anonymous analytics.
BEGIN;

ALTER TABLE doubts ADD COLUMN IF NOT EXISTS curriculum_topic_id UUID REFERENCES curriculum_topics(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_doubts_curriculum_topic ON doubts(curriculum_topic_id) WHERE curriculum_topic_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS learning_asset_review_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(subject_id,reviewer_id)
);

CREATE TABLE IF NOT EXISTS learning_asset_checklist (
  asset_id UUID NOT NULL REFERENCES learning_content_assets(id) ON DELETE CASCADE,
  gate_code VARCHAR(40) NOT NULL CHECK (gate_code IN ('ACADEMIC_ACCURACY','AGE_APPROPRIATENESS','ACCESSIBILITY','TECHNICAL_READINESS','SAFETY')),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PASS','FAIL','NOT_APPLICABLE')),
  note TEXT,
  reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  PRIMARY KEY(asset_id,gate_code)
);

CREATE TABLE IF NOT EXISTS learning_asset_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id UUID NOT NULL REFERENCES learning_content_assets(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(asset_id,version_number)
);

CREATE TABLE IF NOT EXISTS learning_asset_moderation (
  asset_id UUID PRIMARY KEY REFERENCES learning_content_assets(id) ON DELETE CASCADE,
  state VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE','TAKEN_DOWN')),
  reason TEXT,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO learning_asset_moderation(asset_id)
SELECT id FROM learning_content_assets ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS learning_asset_usage_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asset_id UUID NOT NULL REFERENCES learning_content_assets(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES learning_resources(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES curriculum_topics(id) ON DELETE SET NULL,
  event_code VARCHAR(24) NOT NULL CHECK (event_code IN ('PLAY_START','WATCH_PROGRESS','COMPLETED','AUDIO_PLAY','QUIZ_RESULT','DOUBT')),
  duration_secs INTEGER CHECK (duration_secs IS NULL OR duration_secs BETWEEN 0 AND 86400),
  result_pct NUMERIC(5,2) CHECK (result_pct IS NULL OR result_pct BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_learning_asset_usage_topic_created
  ON learning_asset_usage_events(topic_id,created_at DESC);

CREATE TABLE IF NOT EXISTS learning_asset_governance_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  asset_id UUID NOT NULL REFERENCES learning_content_assets(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(48) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_learning_asset_governance_audit_asset
  ON learning_asset_governance_audit(asset_id,created_at DESC);

COMMIT;
