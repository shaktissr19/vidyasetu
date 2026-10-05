-- 055: Versioned syllabus publication and separate student/teacher progress.
-- Existing curriculum rows and uploaded PDFs are preserved. Legacy active versions
-- are backfilled as published; unverified versions remain drafts.
BEGIN;

ALTER TABLE curriculum_versions
  ADD COLUMN IF NOT EXISTS medium VARCHAR(12) NOT NULL DEFAULT 'en'
    CHECK (medium IN ('en','hi')),
  ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1 CHECK (version_number > 0),
  ADD COLUMN IF NOT EXISTS publication_status VARCHAR(16) NOT NULL DEFAULT 'DRAFT'
    CHECK (publication_status IN ('DRAFT','REVIEWED','PUBLISHED','ARCHIVED')),
  ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS published_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

UPDATE curriculum_versions
SET publication_status = CASE WHEN status='ACTIVE' AND verified_at IS NOT NULL
  THEN 'PUBLISHED' ELSE 'DRAFT' END,
  reviewed_by = verified_by,
  published_by = verified_by,
  published_at = verified_at
WHERE publication_status='DRAFT';

-- Replace the original single-version constraint with immutable academic-year versions.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
    WHERE conrelid='curriculum_versions'::regclass AND contype='u'
      AND pg_get_constraintdef(oid) LIKE '%board_id, academic_year%'
  LOOP EXECUTE format('ALTER TABLE curriculum_versions DROP CONSTRAINT %I', c.conname); END LOOP;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_curriculum_versions_year_version
  ON curriculum_versions(board_id,academic_year,version_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_curriculum_versions_single_published
  ON curriculum_versions(board_id,academic_year,medium)
  WHERE publication_status='PUBLISHED';

ALTER TABLE syllabus_documents
  ADD COLUMN IF NOT EXISTS medium VARCHAR(12) NOT NULL DEFAULT 'en'
    CHECK (medium IN ('en','hi'));

-- Keep learner self-report separate from teacher class coverage. Rows hold IDs and
-- status only; no additional personal information is stored.
CREATE TABLE IF NOT EXISTS student_syllabus_progress (
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES curriculum_topics(id) ON DELETE CASCADE,
  student_status VARCHAR(16) NOT NULL DEFAULT 'NOT_STARTED'
    CHECK (student_status IN ('NOT_STARTED','IN_PROGRESS','COMPLETED','REVISED')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(student_id,topic_id)
);
CREATE INDEX IF NOT EXISTS idx_student_syllabus_progress_topic
  ON student_syllabus_progress(topic_id,student_status);

CREATE TABLE IF NOT EXISTS syllabus_class_coverage (
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_name VARCHAR(24) NOT NULL,
  section VARCHAR(40) NOT NULL DEFAULT '',
  topic_id UUID NOT NULL REFERENCES curriculum_topics(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'NOT_COVERED'
    CHECK (status IN ('NOT_COVERED','IN_PROGRESS','COVERED')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(school_id,class_name,section,topic_id)
);
CREATE INDEX IF NOT EXISTS idx_syllabus_class_coverage_topic
  ON syllabus_class_coverage(topic_id,status);

-- Explicit scope metadata for legacy content_items. NULL scope retains existing
-- public catalogue behavior; restricted visibility requires a complete scope.
ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS visibility VARCHAR(24) NOT NULL DEFAULT 'PUBLIC'
    CHECK (visibility IN ('PUBLIC','CLASS_RESTRICTED','SCHOOL_PRIVATE')),
  ADD COLUMN IF NOT EXISTS board_id UUID REFERENCES education_boards(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS grade_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS syllabus_topic_id UUID REFERENCES curriculum_topics(id) ON DELETE SET NULL;
DO $fix$ BEGIN
  ALTER TABLE content_items ADD CONSTRAINT content_items_restricted_scope_check
    CHECK ((visibility='PUBLIC') OR
      (visibility='CLASS_RESTRICTED' AND board_id IS NOT NULL AND grade_code IS NOT NULL AND subject_id IS NOT NULL) OR
      (visibility='SCHOOL_PRIVATE' AND school_id IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL;
END $fix$;
CREATE INDEX IF NOT EXISTS idx_content_items_visibility_scope
  ON content_items(visibility,board_id,grade_code,subject_id,school_id,status);

-- Reversible migration guidance is in 055_syllabus_publication_progress.rollback.sql.
COMMIT;
