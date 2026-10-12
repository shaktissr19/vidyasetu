-- 056: Add explicit unit -> chapter -> topic framework without replacing the
-- stable curriculum UUIDs or the existing syllabus/content publication workflow.
BEGIN;

CREATE TABLE IF NOT EXISTS curriculum_chapters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  curriculum_unit_id UUID NOT NULL REFERENCES curriculum_units(id) ON DELETE CASCADE,
  title VARCHAR(220) NOT NULL,
  title_hi VARCHAR(220),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (curriculum_unit_id, title)
);

ALTER TABLE curriculum_topics
  ADD COLUMN IF NOT EXISTS chapter_id UUID REFERENCES curriculum_chapters(id) ON DELETE SET NULL;

-- Existing units functioned as chapters. Preserve every topic UUID and make its
-- current location explicit, so old syllabus pages and progress remain intact.
INSERT INTO curriculum_chapters(curriculum_unit_id,title,sort_order)
SELECT DISTINCT ON (cu.id) cu.id,cu.title,cu.sort_order
FROM curriculum_units cu
ORDER BY cu.id,cu.sort_order
ON CONFLICT (curriculum_unit_id,title) DO NOTHING;

UPDATE curriculum_topics ct
SET chapter_id=cc.id
FROM curriculum_chapters cc
WHERE ct.chapter_id IS NULL
  AND cc.curriculum_unit_id=ct.curriculum_unit_id
  AND cc.title=(SELECT cu.title FROM curriculum_units cu WHERE cu.id=ct.curriculum_unit_id);

DROP INDEX IF EXISTS uq_curriculum_versions_year_version;
CREATE UNIQUE INDEX IF NOT EXISTS uq_curriculum_versions_year_medium_version
  ON curriculum_versions(board_id,academic_year,medium,version_number);

UPDATE syllabus_documents
SET medium=CASE WHEN language ILIKE 'hi%' THEN 'hi' WHEN language ILIKE 'en%' THEN 'en' ELSE medium END
WHERE language ILIKE 'hi%' OR language ILIKE 'en%';

ALTER TABLE curriculum_versions
  ADD COLUMN IF NOT EXISTS source_hash VARCHAR(64)
    CHECK (source_hash IS NULL OR source_hash ~ '^[a-f0-9]{64}$');

CREATE TABLE IF NOT EXISTS curriculum_version_evidence (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  curriculum_version_id UUID NOT NULL REFERENCES curriculum_versions(id) ON DELETE CASCADE,
  syllabus_document_id UUID NOT NULL REFERENCES syllabus_documents(id) ON DELETE RESTRICT,
  attached_by UUID REFERENCES users(id) ON DELETE SET NULL,
  attached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (curriculum_version_id, syllabus_document_id)
);
CREATE INDEX IF NOT EXISTS idx_curriculum_version_evidence_version
  ON curriculum_version_evidence(curriculum_version_id,attached_at DESC);

COMMENT ON COLUMN curriculum_versions.source_hash IS
  'SHA-256 of the reviewed framework import source; UUID primary keys on curriculum nodes remain stable identifiers.';
COMMENT ON TABLE curriculum_version_evidence IS
  'Official source PDFs attached as evidence to a curriculum version; source PDF rights remain governed by syllabus_documents.';
COMMIT;
