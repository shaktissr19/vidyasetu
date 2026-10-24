-- 060: Complete the syllabus document -> structured draft workflow.
BEGIN;

ALTER TABLE syllabus_documents
  ALTER COLUMN source_url DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255),
  ADD COLUMN IF NOT EXISTS structured_outline JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS detected_grade_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS detected_subject VARCHAR(150),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE curriculum_versions
  ADD COLUMN IF NOT EXISTS source_document_id UUID REFERENCES syllabus_documents(id) ON DELETE SET NULL;

ALTER TABLE curriculum_topics
  ADD COLUMN IF NOT EXISTS source_document_id UUID REFERENCES syllabus_documents(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS curriculum_topic_evidence (
  topic_id UUID NOT NULL REFERENCES curriculum_topics(id) ON DELETE CASCADE,
  syllabus_document_id UUID NOT NULL REFERENCES syllabus_documents(id) ON DELETE CASCADE,
  attached_by UUID REFERENCES users(id) ON DELETE SET NULL,
  attached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(topic_id, syllabus_document_id)
);

ALTER TABLE syllabus_documents
  DROP CONSTRAINT IF EXISTS syllabus_documents_board_id_academic_year_checksum_sha256_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_syllabus_documents_live_checksum
  ON syllabus_documents(board_id, academic_year, checksum_sha256)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_syllabus_documents_live_scope
  ON syllabus_documents(board_id, academic_year, grade_code, subject_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_curriculum_versions_source_document
  ON curriculum_versions(source_document_id)
  WHERE source_document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_curriculum_topics_source_document
  ON curriculum_topics(source_document_id)
  WHERE source_document_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_curriculum_topic_evidence_document
  ON curriculum_topic_evidence(syllabus_document_id, topic_id);

COMMENT ON COLUMN syllabus_documents.structured_outline IS
  'Machine-extracted unit/chapter/topic draft candidates. These remain untrusted until academic review.';
COMMENT ON COLUMN syllabus_documents.deleted_at IS
  'Soft deletion marker. Draft source objects are removed from storage while audit metadata remains.';
COMMENT ON COLUMN curriculum_versions.source_document_id IS
  'First source PDF that created this framework draft; all evidence is recorded in curriculum_version_evidence.';
COMMENT ON COLUMN curriculum_topics.source_document_id IS
  'Source PDF that produced this topic, used for safe document-level rebuild and deletion.';

COMMIT;
