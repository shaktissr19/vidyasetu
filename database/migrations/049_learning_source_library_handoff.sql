-- ============================================================
-- 049_learning_source_library_handoff.sql
-- Content Factory E2E: explicit source verification and audited
-- Source & Licence Review -> canonical Learning Content Library handoff.
--
-- Additive/idempotent. No source is auto-approved and no Learning
-- resource is auto-published.
-- ============================================================

BEGIN;

ALTER TABLE learning_source_intake
  ADD COLUMN IF NOT EXISTS licence_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS licence_verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS imported_resource_id UUID REFERENCES learning_resources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS imported_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_learning_source_intake_imported_resource
  ON learning_source_intake(imported_resource_id)
  WHERE imported_resource_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_learning_source_intake_library_handoff
  ON learning_source_intake(status, imported_at DESC)
  WHERE status IN ('APPROVED','IMPORTED');

-- Preserve already-reviewed production history. Existing approved/imported
-- items with a concrete licence were necessarily allowed by the previous
-- governance boundary, so their historic review timestamp is the best
-- available verification evidence during this additive upgrade.
UPDATE learning_source_intake
SET licence_verified_at = COALESCE(licence_verified_at, reviewed_at, updated_at),
    licence_verified_by = COALESCE(licence_verified_by, reviewed_by)
WHERE status IN ('APPROVED','IMPORTED')
  AND licence_candidate IS NOT NULL
  AND licence_candidate::text <> 'OTHER'
  AND licence_verified_at IS NULL;

-- subject_label/topic_label already exist on current Learning installations
-- from the global importer. IF NOT EXISTS keeps older upgrade paths safe.
ALTER TABLE learning_resources
  ADD COLUMN IF NOT EXISTS subject_label VARCHAR(160),
  ADD COLUMN IF NOT EXISTS topic_label VARCHAR(220),
  ADD COLUMN IF NOT EXISTS chapter_label VARCHAR(220);

-- Strengthen the migration-046 boundary: item-level-review sources now require
-- an explicit human verification timestamp in addition to a non-OTHER licence.
CREATE OR REPLACE FUNCTION validate_learning_intake_item_governance()
RETURNS TRIGGER AS $$
DECLARE
  src RECORD;
BEGIN
  IF NEW.status NOT IN ('APPROVED','IMPORTED') THEN
    RETURN NEW;
  END IF;

  SELECT code, attribution_required, requires_item_license_check
  INTO src
  FROM learning_content_sources
  WHERE id=NEW.source_id;

  IF src.requires_item_license_check THEN
    IF NEW.licence_candidate IS NULL OR NEW.licence_candidate::text='OTHER' THEN
      RAISE EXCEPTION 'Item-level licence must be verified before approval/import for source %', src.code;
    END IF;
    IF NEW.licence_verified_at IS NULL THEN
      RAISE EXCEPTION 'Save item-level licence verification before approval/import for source %', src.code;
    END IF;
  END IF;

  IF src.attribution_required AND NULLIF(BTRIM(COALESCE(NEW.attribution_text,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Attribution evidence is required before approval/import for source %', src.code;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_learning_intake_item_governance ON learning_source_intake;
CREATE TRIGGER trg_learning_intake_item_governance
  BEFORE INSERT OR UPDATE OF status,licence_candidate,licence_verified_at,attribution_text
  ON learning_source_intake
  FOR EACH ROW EXECUTE FUNCTION validate_learning_intake_item_governance();

COMMENT ON COLUMN learning_source_intake.licence_verified_at IS
  'Explicit Platform Admin item-level licence verification timestamp. Discovery metadata alone never sets this field.';
COMMENT ON COLUMN learning_source_intake.imported_resource_id IS
  'Canonical Learning resource created by the approved-source Add to Content Library handoff.';
COMMENT ON COLUMN learning_source_intake.imported_at IS
  'Timestamp when an APPROVED source was converted to a canonical DRAFT Learning resource.';
COMMENT ON COLUMN learning_resources.chapter_label IS
  'Optional human-readable chapter/unit label for cross-board or not-yet-mapped curriculum content.';

COMMIT;
