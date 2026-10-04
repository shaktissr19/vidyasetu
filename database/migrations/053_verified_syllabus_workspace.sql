BEGIN;
ALTER TABLE curriculum_subjects ALTER COLUMN class_name TYPE VARCHAR(24);
ALTER TABLE curriculum_versions ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE curriculum_versions ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES users(id);
ALTER TABLE curriculum_versions ADD COLUMN IF NOT EXISTS review_note TEXT;
ALTER TABLE curriculum_topics ADD COLUMN IF NOT EXISTS is_retired BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE curriculum_topics ADD COLUMN IF NOT EXISTS evidence_url TEXT;
ALTER TABLE curriculum_topics ADD COLUMN IF NOT EXISTS page_reference VARCHAR(100);
CREATE TABLE IF NOT EXISTS curriculum_topic_concepts (
 topic_id UUID NOT NULL REFERENCES curriculum_topics(id) ON DELETE CASCADE,
 concept_id UUID NOT NULL REFERENCES learning_concepts(id) ON DELETE RESTRICT,
 PRIMARY KEY(topic_id,concept_id)
);
CREATE TABLE IF NOT EXISTS student_learning_preferences (
 student_id UUID PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
 board_id UUID NOT NULL REFERENCES education_boards(id),
 grade_id UUID NOT NULL REFERENCES education_grade_levels(id),
 academic_year VARCHAR(10) NOT NULL CHECK(academic_year ~ '^20[0-9]{2}-[0-9]{2}$'),
 language VARCHAR(10) NOT NULL DEFAULT 'en' CHECK(language IN ('en','hi')),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Legacy ACTIVE records are deliberately not certified by this migration.
COMMENT ON COLUMN curriculum_versions.verified_at IS 'Academic reviewer confirmation; required in addition to ACTIVE for student syllabus visibility.';
COMMIT;
