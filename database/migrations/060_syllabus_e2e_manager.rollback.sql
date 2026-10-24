BEGIN;
DROP INDEX IF EXISTS idx_curriculum_versions_source_document;
DROP INDEX IF EXISTS idx_curriculum_topics_source_document;
DROP INDEX IF EXISTS idx_curriculum_topic_evidence_document;
DROP INDEX IF EXISTS idx_syllabus_documents_live_scope;
DROP INDEX IF EXISTS uq_syllabus_documents_live_checksum;
ALTER TABLE curriculum_versions DROP COLUMN IF EXISTS source_document_id;
ALTER TABLE curriculum_topics DROP COLUMN IF EXISTS source_document_id;
DROP TABLE IF EXISTS curriculum_topic_evidence;
ALTER TABLE syllabus_documents
  DROP COLUMN IF EXISTS deleted_by,
  DROP COLUMN IF EXISTS deleted_at,
  DROP COLUMN IF EXISTS detected_subject,
  DROP COLUMN IF EXISTS detected_grade_code,
  DROP COLUMN IF EXISTS structured_outline,
  DROP COLUMN IF EXISTS original_filename;
ALTER TABLE syllabus_documents ALTER COLUMN source_url SET NOT NULL;
ALTER TABLE syllabus_documents
  ADD CONSTRAINT syllabus_documents_board_id_academic_year_checksum_sha256_key
  UNIQUE(board_id, academic_year, checksum_sha256);
COMMIT;
