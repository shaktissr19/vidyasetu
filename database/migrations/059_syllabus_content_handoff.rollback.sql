BEGIN;
DROP INDEX IF EXISTS idx_learning_source_intake_curriculum_topic;
DROP INDEX IF EXISTS idx_learning_creator_jobs_curriculum_topic;
DROP INDEX IF EXISTS idx_learning_resources_curriculum_topic;
ALTER TABLE learning_source_intake DROP COLUMN IF EXISTS curriculum_topic_id;
ALTER TABLE learning_creator_jobs DROP COLUMN IF EXISTS curriculum_topic_id;
COMMIT;
