-- Persist the exact published syllabus topic selected in Content Factory.
-- Existing intake/resource/job records remain unlinked and keep their behavior.
BEGIN;

ALTER TABLE learning_source_intake
  ADD COLUMN IF NOT EXISTS curriculum_topic_id UUID
    REFERENCES curriculum_topics(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_learning_source_intake_curriculum_topic
  ON learning_source_intake(curriculum_topic_id) WHERE curriculum_topic_id IS NOT NULL;

ALTER TABLE learning_creator_jobs
  ADD COLUMN IF NOT EXISTS curriculum_topic_id UUID
    REFERENCES curriculum_topics(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_learning_creator_jobs_curriculum_topic
  ON learning_creator_jobs(curriculum_topic_id) WHERE curriculum_topic_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_learning_resources_curriculum_topic
  ON learning_resources(curriculum_topic_id) WHERE curriculum_topic_id IS NOT NULL;

COMMENT ON COLUMN learning_source_intake.curriculum_topic_id IS
  'Exact published syllabus topic selected in Content Factory; validated again at Library materialisation.';
COMMENT ON COLUMN learning_creator_jobs.curriculum_topic_id IS
  'Exact published syllabus topic used to ground this generated draft job.';

COMMIT;
