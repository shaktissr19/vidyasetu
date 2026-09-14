-- ============================================================
-- 047_learning_source_registry_video_discovery.sql
-- VidyaSetu Learning Content Factory
-- Governed multi-source connector registry + video/media discovery metadata.
--
-- Additive/idempotent. This migration does not fetch remote content, does not
-- grant reuse rights, does not publish anything, and does not change existing
-- Learning review states.
-- ============================================================

ALTER TYPE learning_discovery_provider ADD VALUE IF NOT EXISTS 'NROER';
ALTER TYPE learning_discovery_provider ADD VALUE IF NOT EXISTS 'CBSE';
ALTER TYPE learning_discovery_provider ADD VALUE IF NOT EXISTS 'NCERT_EPATHSHALA';
ALTER TYPE learning_discovery_provider ADD VALUE IF NOT EXISTS 'NIOS';
ALTER TYPE learning_discovery_provider ADD VALUE IF NOT EXISTS 'SWAYAM';
ALTER TYPE learning_discovery_provider ADD VALUE IF NOT EXISTS 'PHET';
ALTER TYPE learning_discovery_provider ADD VALUE IF NOT EXISTS 'OER_COMMONS';
ALTER TYPE learning_license_code ADD VALUE IF NOT EXISTS 'CC_BY_NC';

BEGIN;

-- Dedicated governed source records. NROER and DIKSHA already exist from
-- migrations 020/046. These records intentionally use conservative defaults;
-- item-level evidence remains authoritative.
INSERT INTO learning_content_sources
  (id,code,name,source_kind,homepage_url,default_license,attribution_required,
   allow_rehosting_default,allow_adaptation_default,requires_item_license_check,notes)
VALUES
  ('83000000-0000-0000-0000-000000000007','CBSE_ACADEMIC','CBSE Academic','EXTERNAL_OFFICIAL',
   'https://cbseacademic.nic.in','EXTERNAL_LINK_ONLY',TRUE,FALSE,FALSE,TRUE,
   'Official CBSE academic/support resources. Discover and link/reference by default; verify explicit item rights before copying or adapting.'),
  ('83000000-0000-0000-0000-000000000008','NCERT_EPATHSHALA','NCERT / ePathshala','EXTERNAL_OFFICIAL',
   'https://epathshala.nic.in','EXTERNAL_LINK_ONLY',TRUE,FALSE,FALSE,TRUE,
   'Official NCERT/ePathshala resources including chapter-linked audio/video. Reference/link by default; never infer reuse rights from free access.'),
  ('83000000-0000-0000-0000-000000000009','NIOS','National Institute of Open Schooling','EXTERNAL_OFFICIAL',
   'https://digital.nios.ac.in','EXTERNAL_LINK_ONLY',TRUE,FALSE,FALSE,TRUE,
   'Official NIOS digital learning resources and video programmes. NIOS copyright or item-specific terms require reference-first handling.'),
  ('83000000-0000-0000-0000-000000000010','SWAYAM','SWAYAM','EXTERNAL_OFFICIAL',
   'https://swayam.gov.in','EXTERNAL_LINK_ONLY',TRUE,FALSE,FALSE,TRUE,
   'Government MOOC catalogue. School education includes NCERT/NIOS coordinated courses; treat discovered courses as external references unless item rights are verified.'),
  ('83000000-0000-0000-0000-000000000011','PHET','PhET Interactive Simulations','OTHER_OER',
   'https://phet.colorado.edu','CC_BY_NC',TRUE,FALSE,TRUE,TRUE,
   'PhET simulations are licence-sensitive and non-commercial by default. Subscriber/commercial use must remain blocked unless separately licensed.'),
  ('83000000-0000-0000-0000-000000000012','OER_COMMONS','OER Commons','OTHER_OER',
   'https://oercommons.org','OTHER',TRUE,FALSE,FALSE,TRUE,
   'OER aggregator. Every selected item requires its own licence/attribution verification before grounding, adaptation or rehosting.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name,
  source_kind=EXCLUDED.source_kind,
  homepage_url=EXCLUDED.homepage_url,
  default_license=EXCLUDED.default_license,
  attribution_required=EXCLUDED.attribution_required,
  allow_rehosting_default=EXCLUDED.allow_rehosting_default,
  allow_adaptation_default=EXCLUDED.allow_adaptation_default,
  requires_item_license_check=EXCLUDED.requires_item_license_check,
  notes=EXCLUDED.notes,
  is_active=TRUE,
  updated_at=NOW();

CREATE TABLE IF NOT EXISTS learning_source_connectors (
  code                    VARCHAR(40) PRIMARY KEY,
  provider                learning_discovery_provider NOT NULL UNIQUE,
  source_id               UUID REFERENCES learning_content_sources(id) ON DELETE SET NULL,
  label                   VARCHAR(180) NOT NULL,
  connector_mode          VARCHAR(30) NOT NULL CHECK (connector_mode IN ('LOCAL_CATALOGUE','LIVE_API','REFERENCE_SEARCH')),
  homepage_url            TEXT NOT NULL,
  search_url_template     TEXT,
  enabled                 BOOLEAN NOT NULL DEFAULT TRUE,
  supports_search         BOOLEAN NOT NULL DEFAULT TRUE,
  supports_media_kinds    TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  requires_api_key        BOOLEAN NOT NULL DEFAULT FALSE,
  requires_item_review    BOOLEAN NOT NULL DEFAULT TRUE,
  commercial_policy       VARCHAR(40) NOT NULL DEFAULT 'ITEM_LEVEL_REVIEW'
                          CHECK (commercial_policy IN ('ALLOWED','ITEM_LEVEL_REVIEW','NON_COMMERCIAL_ONLY','LINK_ONLY')),
  licence_policy          TEXT NOT NULL,
  status_note             TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (supports_media_kinds <@ ARRAY['ARTICLE','VIDEO','AUDIO','INTERACTIVE','PDF','COURSE','LINK']::TEXT[])
);

CREATE OR REPLACE TRIGGER trg_learning_source_connectors_updated_at
  BEFORE UPDATE ON learning_source_connectors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO learning_source_connectors
  (code,provider,source_id,label,connector_mode,homepage_url,search_url_template,enabled,supports_search,
   supports_media_kinds,requires_api_key,requires_item_review,commercial_policy,licence_policy,status_note)
VALUES
  ('LOCAL','LOCAL',NULL,'VidyaSetu governed catalogue','LOCAL_CATALOGUE','https://vidyasetu.sbs',NULL,TRUE,TRUE,
   ARRAY['ARTICLE','VIDEO','AUDIO','INTERACTIVE','PDF','COURSE','LINK'],FALSE,FALSE,'ALLOWED',
   'Only APPROVED/PUBLISHED canonical VidyaSetu Learning resources are discoverable. Their stored licence remains authoritative.',
   'Live canonical catalogue search.'),
  ('DIKSHA','DIKSHA','83000000-0000-0000-0000-000000000006','DIKSHA / PM eVIDYA','LIVE_API','https://diksha.gov.in',
   'https://diksha.gov.in/resources?query={query}',TRUE,TRUE,
   ARRAY['ARTICLE','VIDEO','AUDIO','INTERACTIVE','PDF','COURSE','LINK'],FALSE,TRUE,'ITEM_LEVEL_REVIEW',
   'Public metadata discovery only. Item licence/attribution must be verified before grounding or adaptation.',
   'Live metadata API; supports publisher/channel and media filtering in VidyaSetu.'),
  ('NROER','NROER','83000000-0000-0000-0000-000000000002','NROER','REFERENCE_SEARCH','https://nroer.gov.in',
   'https://nroer.gov.in/',TRUE,TRUE,ARRAY['ARTICLE','VIDEO','AUDIO','INTERACTIVE','PDF','LINK'],FALSE,TRUE,'ITEM_LEVEL_REVIEW',
   'Open-resource repository, but item licence/attribution must be verified. Rehosting is off by default.',
   'Official source selector/reference search; no stable public structured API is assumed.'),
  ('CBSE','CBSE','83000000-0000-0000-0000-000000000007','CBSE Academic','REFERENCE_SEARCH','https://cbseacademic.nic.in',
   'https://cbseacademic.nic.in/',TRUE,TRUE,ARRAY['ARTICLE','VIDEO','PDF','LINK'],FALSE,TRUE,'LINK_ONLY',
   'Official CBSE resources are reference/link-first unless an individual item explicitly grants broader reuse rights.',
   'Official academic/support-resource discovery.'),
  ('NCERT_EPATHSHALA','NCERT_EPATHSHALA','83000000-0000-0000-0000-000000000008','NCERT / ePathshala','REFERENCE_SEARCH','https://epathshala.nic.in',
   'https://epathshala.nic.in/eresources_m.php',TRUE,TRUE,ARRAY['ARTICLE','VIDEO','AUDIO','PDF','LINK'],FALSE,TRUE,'LINK_ONLY',
   'Free access does not imply commercial reuse. Link/reference by default and verify rights for any reuse/adaptation.',
   'Official chapter/eResource discovery, including audio and video.'),
  ('NIOS','NIOS','83000000-0000-0000-0000-000000000009','NIOS Digital Learning','REFERENCE_SEARCH','https://digital.nios.ac.in',
   'https://digital.nios.ac.in/',TRUE,TRUE,ARRAY['ARTICLE','VIDEO','AUDIO','PDF','COURSE','LINK'],FALSE,TRUE,'LINK_ONLY',
   'NIOS copyright/item terms remain authoritative. Link/reference unless explicit reuse permission is verified.',
   'Official NIOS digital resources and video programmes.'),
  ('SWAYAM','SWAYAM','83000000-0000-0000-0000-000000000010','SWAYAM','REFERENCE_SEARCH','https://swayam.gov.in',
   'https://swayam.gov.in/search_courses?searchText={query}',TRUE,TRUE,ARRAY['VIDEO','PDF','COURSE','LINK'],FALSE,TRUE,'LINK_ONLY',
   'Course materials remain under their course/provider terms. Use catalogue discovery and external linking unless reuse rights are explicit.',
   'Government course catalogue; school courses include NCERT/NIOS coordinated offerings.'),
  ('PHET','PHET','83000000-0000-0000-0000-000000000011','PhET','REFERENCE_SEARCH','https://phet.colorado.edu',
   'https://phet.colorado.edu/en/simulations/filter?sort=alpha&view=grid&q={query}',TRUE,TRUE,ARRAY['INTERACTIVE','VIDEO','LINK'],FALSE,TRUE,'NON_COMMERCIAL_ONLY',
   'CC BY-NC/item terms apply; block commercial/subscriber reuse unless separately licensed. Attribution is required.',
   'High-value Science/Math simulation source.'),
  ('OER_COMMONS','OER_COMMONS','83000000-0000-0000-0000-000000000012','OER Commons','REFERENCE_SEARCH','https://oercommons.org',
   'https://oercommons.org/search?f.search={query}',TRUE,TRUE,ARRAY['ARTICLE','VIDEO','AUDIO','INTERACTIVE','PDF','COURSE','LINK'],FALSE,TRUE,'ITEM_LEVEL_REVIEW',
   'Aggregator results have varying conditions of use; verify each selected item licence and attribution before reuse.',
   'Broad OER discovery with media/type/licence filtering at source.' )
ON CONFLICT (code) DO UPDATE SET
  provider=EXCLUDED.provider,
  source_id=EXCLUDED.source_id,
  label=EXCLUDED.label,
  connector_mode=EXCLUDED.connector_mode,
  homepage_url=EXCLUDED.homepage_url,
  search_url_template=EXCLUDED.search_url_template,
  enabled=EXCLUDED.enabled,
  supports_search=EXCLUDED.supports_search,
  supports_media_kinds=EXCLUDED.supports_media_kinds,
  requires_api_key=EXCLUDED.requires_api_key,
  requires_item_review=EXCLUDED.requires_item_review,
  commercial_policy=EXCLUDED.commercial_policy,
  licence_policy=EXCLUDED.licence_policy,
  status_note=EXCLUDED.status_note,
  updated_at=NOW();

ALTER TABLE learning_source_discovery_candidates
  ADD COLUMN IF NOT EXISTS media_kind VARCHAR(20),
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS embed_url TEXT,
  ADD COLUMN IF NOT EXISTS reference_only BOOLEAN NOT NULL DEFAULT FALSE;

DO $$ BEGIN
  ALTER TABLE learning_source_discovery_candidates
    ADD CONSTRAINT chk_learning_discovery_candidate_media_kind
    CHECK (media_kind IS NULL OR media_kind IN ('ARTICLE','VIDEO','AUDIO','INTERACTIVE','PDF','COURSE','LINK'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE learning_source_discovery_candidates
    ADD CONSTRAINT chk_learning_discovery_candidate_duration
    CHECK (duration_seconds IS NULL OR duration_seconds >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

UPDATE learning_source_discovery_candidates
SET media_kind = CASE
  WHEN UPPER(COALESCE(resource_type,''))='VIDEO' THEN 'VIDEO'
  WHEN UPPER(COALESCE(resource_type,''))='AUDIO' THEN 'AUDIO'
  WHEN UPPER(COALESCE(resource_type,''))='PDF' THEN 'PDF'
  WHEN UPPER(COALESCE(resource_type,''))='INTERACTIVE' THEN 'INTERACTIVE'
  WHEN UPPER(COALESCE(resource_type,'')) IN ('COURSE','COLLECTION') THEN 'COURSE'
  WHEN resource_id IS NULL THEN 'LINK'
  ELSE 'ARTICLE'
END
WHERE media_kind IS NULL;

CREATE INDEX IF NOT EXISTS idx_learning_discovery_candidates_media
  ON learning_source_discovery_candidates(media_kind,provider,created_at DESC);

COMMENT ON TABLE learning_source_connectors IS
  'Admin-visible governed source registry. LIVE_API/LOCAL connectors return item candidates; REFERENCE_SEARCH connectors expose official source search/navigation without pretending an undocumented API exists.';
COMMENT ON COLUMN learning_source_discovery_candidates.media_kind IS
  'Normalized student-learning media role used by Watch/Listen/Explore/Learn filters.';
COMMENT ON COLUMN learning_source_discovery_candidates.reference_only IS
  'True when the candidate is an official search/reference entry rather than a remotely normalized reusable content item.';

COMMIT;
