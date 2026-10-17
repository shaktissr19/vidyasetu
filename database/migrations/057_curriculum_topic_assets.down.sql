BEGIN;
DROP TABLE IF EXISTS learning_asset_nodes;
ALTER TABLE learning_content_assets DROP COLUMN IF EXISTS original_file_name;
ALTER TABLE learning_content_assets DROP COLUMN IF EXISTS version_number;
ALTER TABLE learning_content_assets DROP COLUMN IF EXISTS captions_url;
ALTER TABLE learning_content_assets DROP COLUMN IF EXISTS transcript;
ALTER TABLE learning_content_assets DROP COLUMN IF EXISTS ai_generated;
ALTER TABLE learning_content_assets DROP COLUMN IF EXISTS reviewer_id;
ALTER TABLE learning_content_assets DROP COLUMN IF EXISTS author_id;
ALTER TABLE learning_content_assets DROP COLUMN IF EXISTS difficulty;
ALTER TABLE learning_content_assets DROP COLUMN IF EXISTS duration_secs;
ALTER TABLE learning_content_assets DROP COLUMN IF EXISTS language;
ALTER TABLE learning_content_assets DROP CONSTRAINT IF EXISTS learning_content_assets_asset_kind_check;
ALTER TABLE learning_content_assets ADD CONSTRAINT learning_content_assets_asset_kind_check CHECK (asset_kind IN (
 'ARTICLE','VIDEO','AUDIO','IMAGE','INTERACTIVE','PDF','WORKSHEET','QUESTION_PAPER','EXTERNAL_LINK','QUIZ','DOCUMENT'
));
COMMIT;
