-- ============================================================
-- 048_learning_content_factory_foundation.sql
-- VidyaSetu Learning Content Factory 2.0 foundation
--
-- Adds a governed generic external-web source and a canonical content-pack
-- container that groups Learn / Watch / Listen / Explore / Practice / Revise /
-- Assess assets without replacing the existing Learning resource, question or
-- assessment models.
--
-- Additive/idempotent. No content is fetched, generated, approved or published.
-- ============================================================

BEGIN;

INSERT INTO learning_content_sources
  (id,code,name,source_kind,homepage_url,default_license,attribution_required,
   allow_rehosting_default,allow_adaptation_default,requires_item_license_check,notes)
VALUES
  ('83000000-0000-0000-0000-000000000013','EXTERNAL_WEB','External web resource','EXTERNAL_OFFICIAL',
   NULL,'EXTERNAL_LINK_ONLY',TRUE,FALSE,FALSE,TRUE,
   'Admin-selected external web resource. Reference/link only by default. Every item requires source, licence and attribution review before grounding, adaptation or rehosting.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name,
  source_kind=EXCLUDED.source_kind,
  default_license=EXCLUDED.default_license,
  attribution_required=EXCLUDED.attribution_required,
  allow_rehosting_default=EXCLUDED.allow_rehosting_default,
  allow_adaptation_default=EXCLUDED.allow_adaptation_default,
  requires_item_license_check=EXCLUDED.requires_item_license_check,
  notes=EXCLUDED.notes,
  is_active=TRUE,
  updated_at=NOW();

CREATE TABLE IF NOT EXISTS learning_content_packs (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title                  VARCHAR(300) NOT NULL,
  title_hi               VARCHAR(300),
  class_number           SMALLINT CHECK (class_number BETWEEN 1 AND 12),
  subject_id             UUID REFERENCES subjects(id) ON DELETE SET NULL,
  board_id               UUID REFERENCES education_boards(id) ON DELETE SET NULL,
  curriculum_subject_id  UUID REFERENCES curriculum_subjects(id) ON DELETE SET NULL,
  curriculum_unit_id     UUID REFERENCES curriculum_units(id) ON DELETE SET NULL,
  curriculum_topic_id    UUID REFERENCES curriculum_topics(id) ON DELETE SET NULL,
  concept_id             UUID REFERENCES learning_concepts(id) ON DELETE SET NULL,
  topic_text             VARCHAR(300),
  requested_outputs      TEXT[] NOT NULL DEFAULT ARRAY['LEARN','PRACTICE','REVISE','ASSESS']::TEXT[],
  visibility             learning_visibility NOT NULL DEFAULT 'REGISTERED',
  access_requirement     learning_access_requirement NOT NULL DEFAULT 'REGISTERED',
  review_status          learning_review_status NOT NULL DEFAULT 'DRAFT',
  creator_job_id         UUID REFERENCES learning_creator_jobs(id) ON DELETE SET NULL,
  validation_summary     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by             UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at            TIMESTAMPTZ,
  published_at           TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (requested_outputs <@ ARRAY['LEARN','WATCH','LISTEN','EXPLORE','PRACTICE','REVISE','ASSESS','WORKSHEET']::TEXT[]),
  CHECK (visibility <> 'PUBLIC' OR access_requirement = 'PUBLIC'),
  CHECK (access_requirement <> 'PUBLIC' OR visibility = 'PUBLIC')
);

CREATE OR REPLACE TRIGGER trg_learning_content_packs_updated_at
  BEFORE UPDATE ON learning_content_packs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_learning_content_packs_scope
  ON learning_content_packs(class_number,subject_id,board_id,review_status);
CREATE INDEX IF NOT EXISTS idx_learning_content_packs_creator_job
  ON learning_content_packs(creator_job_id) WHERE creator_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_learning_content_packs_topic
  ON learning_content_packs(curriculum_topic_id,concept_id) WHERE curriculum_topic_id IS NOT NULL OR concept_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS learning_content_pack_items (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pack_id        UUID NOT NULL REFERENCES learning_content_packs(id) ON DELETE CASCADE,
  role           VARCHAR(20) NOT NULL CHECK (role IN ('LEARN','WATCH','LISTEN','EXPLORE','PRACTICE','REVISE','ASSESS','WORKSHEET')),
  resource_id    UUID REFERENCES learning_resources(id) ON DELETE CASCADE,
  question_id    UUID REFERENCES learning_questions(id) ON DELETE CASCADE,
  assessment_id  UUID REFERENCES learning_assessments(id) ON DELETE CASCADE,
  sequence       SMALLINT NOT NULL DEFAULT 0,
  is_primary     BOOLEAN NOT NULL DEFAULT FALSE,
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((resource_id IS NOT NULL)::int + (question_id IS NOT NULL)::int + (assessment_id IS NOT NULL)::int = 1)
);

CREATE INDEX IF NOT EXISTS idx_learning_pack_items_pack_role
  ON learning_content_pack_items(pack_id,role,sequence,id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_learning_pack_item_resource
  ON learning_content_pack_items(pack_id,role,resource_id) WHERE resource_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_learning_pack_item_question
  ON learning_content_pack_items(pack_id,role,question_id) WHERE question_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_learning_pack_item_assessment
  ON learning_content_pack_items(pack_id,role,assessment_id) WHERE assessment_id IS NOT NULL;

COMMENT ON TABLE learning_content_packs IS
  'Canonical concept/topic learning pack. Groups existing Learning resources, questions and assessments into Learn/Watch/Listen/Explore/Practice/Revise/Assess experiences without duplicating their governance.';
COMMENT ON COLUMN learning_content_packs.requested_outputs IS
  'Content-factory output roles requested for this pack. Generation may be staged across text, media and assessment pipelines.';
COMMENT ON TABLE learning_content_pack_items IS
  'Ordered canonical assets belonging to a Learning content pack. Each item points to exactly one governed resource, question or assessment.';

COMMIT;
