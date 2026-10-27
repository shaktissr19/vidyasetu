-- Add a live YouTube video connector. Results use YouTube's official player;
-- discovery never downloads or rehosts video bytes.
ALTER TYPE learning_discovery_provider ADD VALUE IF NOT EXISTS 'YOUTUBE';

BEGIN;

INSERT INTO learning_content_sources
  (id,code,name,source_kind,homepage_url,default_license,attribution_required,
   allow_rehosting_default,allow_adaptation_default,requires_item_license_check,notes)
VALUES
  ('83000000-0000-0000-0000-000000000061','YOUTUBE','YouTube','EXTERNAL_OFFICIAL',
   'https://www.youtube.com','EXTERNAL_LINK_ONLY',TRUE,FALSE,FALSE,TRUE,
   'Searches individual videos with the YouTube Data API and verifies embeddability. Playback is through YouTube’s privacy-enhanced official player; this grants no download, rehosting, adaptation, or subscriber paywall rights.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name,source_kind=EXCLUDED.source_kind,homepage_url=EXCLUDED.homepage_url,
  default_license=EXCLUDED.default_license,attribution_required=EXCLUDED.attribution_required,
  allow_rehosting_default=EXCLUDED.allow_rehosting_default,allow_adaptation_default=EXCLUDED.allow_adaptation_default,
  requires_item_license_check=EXCLUDED.requires_item_license_check,notes=EXCLUDED.notes,is_active=TRUE,updated_at=NOW();

INSERT INTO learning_source_connectors
  (code,provider,source_id,label,connector_mode,homepage_url,search_url_template,enabled,supports_search,
   supports_media_kinds,requires_api_key,requires_item_review,commercial_policy,licence_policy,status_note)
SELECT
  'YOUTUBE','YOUTUBE',source.id,'YouTube videos','LIVE_API','https://www.youtube.com',
  'https://www.youtube.com/results?search_query={query}',TRUE,TRUE,ARRAY['VIDEO']::TEXT[],TRUE,TRUE,'ITEM_LEVEL_REVIEW',
  'Official YouTube player only. Each result is checked for embeddability; standard-license videos cannot be downloaded, rehosted, adapted, or placed behind a subscriber paywall. Review title, class suitability, creator, and playback before publishing.',
  'Requires YOUTUBE_DATA_API_KEY on the backend. Search returns only videos whose API status allows embedding.'
FROM learning_content_sources source WHERE source.code='YOUTUBE'
ON CONFLICT (code) DO UPDATE SET
  provider=EXCLUDED.provider,source_id=EXCLUDED.source_id,label=EXCLUDED.label,
  connector_mode=EXCLUDED.connector_mode,homepage_url=EXCLUDED.homepage_url,
  search_url_template=EXCLUDED.search_url_template,enabled=EXCLUDED.enabled,
  supports_search=EXCLUDED.supports_search,supports_media_kinds=EXCLUDED.supports_media_kinds,
  requires_api_key=EXCLUDED.requires_api_key,requires_item_review=EXCLUDED.requires_item_review,
  commercial_policy=EXCLUDED.commercial_policy,licence_policy=EXCLUDED.licence_policy,
  status_note=EXCLUDED.status_note,updated_at=NOW();

COMMIT;
