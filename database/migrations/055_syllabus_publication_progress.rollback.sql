-- Rollback for 055_syllabus_publication_progress.sql.
-- Exports of new student and teacher progress should be retained before rollback.
BEGIN;
DROP INDEX IF EXISTS idx_content_items_visibility_scope;
ALTER TABLE content_items DROP CONSTRAINT IF EXISTS content_items_restricted_scope_check;
ALTER TABLE content_items DROP COLUMN IF EXISTS syllabus_topic_id, DROP COLUMN IF EXISTS school_id,
  DROP COLUMN IF EXISTS subject_id, DROP COLUMN IF EXISTS grade_code, DROP COLUMN IF EXISTS board_id,
  DROP COLUMN IF EXISTS visibility;
DROP TABLE IF EXISTS syllabus_class_coverage;
DROP TABLE IF EXISTS student_syllabus_progress;
ALTER TABLE syllabus_documents DROP COLUMN IF EXISTS medium;
DROP INDEX IF EXISTS uq_curriculum_versions_single_published;
DROP INDEX IF EXISTS uq_curriculum_versions_year_version;
ALTER TABLE curriculum_versions
  DROP COLUMN IF EXISTS published_at, DROP COLUMN IF EXISTS published_by,
  DROP COLUMN IF EXISTS reviewed_by, DROP COLUMN IF EXISTS uploaded_by,
  DROP COLUMN IF EXISTS publication_status, DROP COLUMN IF EXISTS version_number,
  DROP COLUMN IF EXISTS medium;
-- Restore legacy uniqueness only when the old data permits it. On collision,
-- rollback stops safely so operators can archive extra versions first.
DO $$ BEGIN
  ALTER TABLE curriculum_versions ADD CONSTRAINT curriculum_versions_board_id_academic_year_key UNIQUE(board_id,academic_year);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
COMMIT;
