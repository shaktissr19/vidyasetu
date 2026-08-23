-- ============================================================
-- 023_global_learning_bulk_importer.sql
-- Global Learning Content Importer foundation.
-- Covers Pre-Nursery, Nursery, LKG, UKG and Classes 1-12.
-- Additive/idempotent. No destructive data changes.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS education_grade_levels (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  code          VARCHAR(24) NOT NULL UNIQUE,
  name          VARCHAR(80) NOT NULL,
  short_name    VARCHAR(30) NOT NULL,
  stage         VARCHAR(30) NOT NULL CHECK (stage IN ('EARLY_YEARS','FOUNDATIONAL','PRIMARY','MIDDLE','SECONDARY','SENIOR_SECONDARY')),
  class_number  SMALLINT    CHECK (class_number IS NULL OR class_number BETWEEN 1 AND 12),
  sort_order    SMALLINT    NOT NULL,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER trg_education_grade_levels_updated_at
  BEFORE UPDATE ON education_grade_levels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO education_grade_levels (id, code, name, short_name, stage, class_number, sort_order) VALUES
  ('87000000-0000-0000-0000-000000000001','PRE_NURSERY','Pre-Nursery','Pre-Nursery','EARLY_YEARS',NULL,1),
  ('87000000-0000-0000-0000-000000000002','NURSERY','Nursery','Nursery','EARLY_YEARS',NULL,2),
  ('87000000-0000-0000-0000-000000000003','LKG','Lower Kindergarten','LKG','FOUNDATIONAL',NULL,3),
  ('87000000-0000-0000-0000-000000000004','UKG','Upper Kindergarten','UKG','FOUNDATIONAL',NULL,4),
  ('87000000-0000-0000-0000-000000000005','CLASS_1','Class 1','Class 1','FOUNDATIONAL',1,5),
  ('87000000-0000-0000-0000-000000000006','CLASS_2','Class 2','Class 2','FOUNDATIONAL',2,6),
  ('87000000-0000-0000-0000-000000000007','CLASS_3','Class 3','Class 3','PRIMARY',3,7),
  ('87000000-0000-0000-0000-000000000008','CLASS_4','Class 4','Class 4','PRIMARY',4,8),
  ('87000000-0000-0000-0000-000000000009','CLASS_5','Class 5','Class 5','PRIMARY',5,9),
  ('87000000-0000-0000-0000-000000000010','CLASS_6','Class 6','Class 6','MIDDLE',6,10),
  ('87000000-0000-0000-0000-000000000011','CLASS_7','Class 7','Class 7','MIDDLE',7,11),
  ('87000000-0000-0000-0000-000000000012','CLASS_8','Class 8','Class 8','MIDDLE',8,12),
  ('87000000-0000-0000-0000-000000000013','CLASS_9','Class 9','Class 9','SECONDARY',9,13),
  ('87000000-0000-0000-0000-000000000014','CLASS_10','Class 10','Class 10','SECONDARY',10,14),
  ('87000000-0000-0000-0000-000000000015','CLASS_11','Class 11','Class 11','SENIOR_SECONDARY',11,15),
  ('87000000-0000-0000-0000-000000000016','CLASS_12','Class 12','Class 12','SENIOR_SECONDARY',12,16)
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name,
  short_name=EXCLUDED.short_name,
  stage=EXCLUDED.stage,
  class_number=EXCLUDED.class_number,
  sort_order=EXCLUDED.sort_order,
  is_active=TRUE;

-- Preserve legacy grade_level while adding a canonical grade code for the
-- whole platform. Existing Class 1-12 students are backfilled automatically.
ALTER TABLE students ADD COLUMN IF NOT EXISTS grade_code VARCHAR(24);
UPDATE students
SET grade_code = CASE
  WHEN grade_code IS NOT NULL THEN grade_code
  WHEN grade_level ~ '^[0-9]+$' AND grade_level::int BETWEEN 1 AND 12 THEN 'CLASS_' || grade_level
  WHEN UPPER(REPLACE(grade_level,'-','_')) IN ('PRE_NURSERY','PRENURSERY','PN') THEN 'PRE_NURSERY'
  WHEN UPPER(grade_level)='NURSERY' THEN 'NURSERY'
  WHEN UPPER(grade_level)='LKG' THEN 'LKG'
  WHEN UPPER(grade_level)='UKG' THEN 'UKG'
  ELSE NULL
END
WHERE grade_code IS NULL;
CREATE INDEX IF NOT EXISTS idx_students_grade_code ON students(grade_code);

CREATE TABLE IF NOT EXISTS learning_resource_grades (
  resource_id UUID NOT NULL REFERENCES learning_resources(id) ON DELETE CASCADE,
  grade_id    UUID NOT NULL REFERENCES education_grade_levels(id) ON DELETE CASCADE,
  PRIMARY KEY (resource_id, grade_id)
);
CREATE INDEX IF NOT EXISTS idx_lrg_grade ON learning_resource_grades(grade_id, resource_id);

CREATE TABLE IF NOT EXISTS learning_question_grades (
  question_id UUID NOT NULL REFERENCES learning_questions(id) ON DELETE CASCADE,
  grade_id    UUID NOT NULL REFERENCES education_grade_levels(id) ON DELETE CASCADE,
  PRIMARY KEY (question_id, grade_id)
);
CREATE INDEX IF NOT EXISTS idx_lqg_grade ON learning_question_grades(grade_id, question_id);

-- Human-readable labels allow cross-board imports without requiring a platform
-- subject UUID to exist first. Exact subject/curriculum IDs may still be mapped later.
ALTER TABLE learning_resources ADD COLUMN IF NOT EXISTS subject_label VARCHAR(160);
ALTER TABLE learning_resources ADD COLUMN IF NOT EXISTS topic_label VARCHAR(220);
ALTER TABLE learning_questions ADD COLUMN IF NOT EXISTS subject_label VARCHAR(160);
ALTER TABLE learning_questions ADD COLUMN IF NOT EXISTS topic_label VARCHAR(220);

CREATE TABLE IF NOT EXISTS learning_import_batches (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_filename VARCHAR(255) NOT NULL,
  import_format   VARCHAR(10)  NOT NULL CHECK (import_format IN ('CSV','JSON')),
  status          VARCHAR(20)  NOT NULL DEFAULT 'STAGED' CHECK (status IN ('STAGED','VALIDATED','IMPORTING','COMPLETED','FAILED')),
  total_rows      INTEGER      NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  valid_rows      INTEGER      NOT NULL DEFAULT 0 CHECK (valid_rows >= 0),
  error_rows      INTEGER      NOT NULL DEFAULT 0 CHECK (error_rows >= 0),
  imported_rows   INTEGER      NOT NULL DEFAULT 0 CHECK (imported_rows >= 0),
  summary         JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_by      UUID        NOT NULL REFERENCES users(id),
  committed_by    UUID        REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  validated_at    TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_learning_import_batches_created ON learning_import_batches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_import_batches_status ON learning_import_batches(status, created_at DESC);

CREATE TABLE IF NOT EXISTS learning_import_rows (
  id                   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id             UUID        NOT NULL REFERENCES learning_import_batches(id) ON DELETE CASCADE,
  row_number           INTEGER     NOT NULL CHECK (row_number > 0),
  record_type          VARCHAR(20) NOT NULL CHECK (record_type IN ('RESOURCE','QUESTION')),
  raw_payload          JSONB       NOT NULL,
  normalized_payload   JSONB       NOT NULL,
  validation_status    VARCHAR(20) NOT NULL CHECK (validation_status IN ('VALID','INVALID')),
  errors               JSONB       NOT NULL DEFAULT '[]'::jsonb,
  warnings             JSONB       NOT NULL DEFAULT '[]'::jsonb,
  imported_resource_id UUID        REFERENCES learning_resources(id) ON DELETE SET NULL,
  imported_question_id UUID        REFERENCES learning_questions(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (batch_id, row_number)
);
CREATE INDEX IF NOT EXISTS idx_learning_import_rows_batch ON learning_import_rows(batch_id, row_number);
CREATE INDEX IF NOT EXISTS idx_learning_import_rows_validation ON learning_import_rows(batch_id, validation_status);

ALTER TABLE learning_resources ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES learning_import_batches(id) ON DELETE SET NULL;
ALTER TABLE learning_resources ADD COLUMN IF NOT EXISTS import_key VARCHAR(180);
ALTER TABLE learning_questions ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES learning_import_batches(id) ON DELETE SET NULL;
ALTER TABLE learning_questions ADD COLUMN IF NOT EXISTS import_key VARCHAR(180);
CREATE UNIQUE INDEX IF NOT EXISTS uq_learning_resources_import_key ON learning_resources(import_key) WHERE import_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_learning_questions_import_key ON learning_questions(import_key) WHERE import_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_learning_resources_import_batch ON learning_resources(import_batch_id) WHERE import_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_learning_questions_import_batch ON learning_questions(import_batch_id) WHERE import_batch_id IS NOT NULL;

-- Backfill canonical grade mappings for existing numeric-range content so old
-- Learning resources immediately participate in the new global grade model.
INSERT INTO learning_resource_grades(resource_id, grade_id)
SELECT lr.id, egl.id
FROM learning_resources lr
JOIN education_grade_levels egl
  ON egl.class_number IS NOT NULL
 AND (lr.class_min IS NULL OR egl.class_number >= lr.class_min)
 AND (lr.class_max IS NULL OR egl.class_number <= lr.class_max)
WHERE lr.class_min IS NOT NULL OR lr.class_max IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO learning_question_grades(question_id, grade_id)
SELECT lq.id, egl.id
FROM learning_questions lq
JOIN education_grade_levels egl
  ON egl.class_number IS NOT NULL
 AND (lq.class_min IS NULL OR egl.class_number >= lq.class_min)
 AND (lq.class_max IS NULL OR egl.class_number <= lq.class_max)
WHERE lq.class_min IS NOT NULL OR lq.class_max IS NOT NULL
ON CONFLICT DO NOTHING;

COMMENT ON TABLE education_grade_levels IS 'Canonical VidyaSetu grade catalogue from Pre-Nursery through Class 12.';
COMMENT ON TABLE learning_import_batches IS 'Admin-only staged bulk Learning imports with validation and audit history.';
COMMENT ON TABLE learning_import_rows IS 'Per-row normalized payload, warnings/errors and resulting Learning object IDs.';
COMMENT ON COLUMN students.grade_code IS 'Canonical grade code such as PRE_NURSERY, LKG, CLASS_5 or CLASS_12; grade_level is retained for backward compatibility.';
COMMENT ON COLUMN learning_resources.import_key IS 'Idempotent external/admin import key used by the global Learning bulk importer.';
COMMENT ON COLUMN learning_questions.import_key IS 'Idempotent external/admin import key used by the global Learning bulk importer.';

COMMIT;
