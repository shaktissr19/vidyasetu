-- ============================================================
-- 024_student_global_grade_sync.sql
-- Keeps the canonical students.grade_code synchronized for
-- Pre-Nursery, Nursery, LKG, UKG and Classes 1-12.
-- Additive/idempotent; legacy grade_level remains supported.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION vidyasetu_grade_code_from_legacy(value TEXT)
RETURNS VARCHAR(24)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE normalized TEXT;
DECLARE class_number INTEGER;
BEGIN
  normalized := UPPER(REPLACE(REPLACE(BTRIM(COALESCE(value,'')), '-', '_'), ' ', '_'));
  IF normalized IN ('PN','PRENURSERY','PRE_NURSERY') THEN RETURN 'PRE_NURSERY'; END IF;
  IF normalized = 'NURSERY' THEN RETURN 'NURSERY'; END IF;
  IF normalized IN ('LKG','LOWER_KG','LOWER_KINDERGARTEN') THEN RETURN 'LKG'; END IF;
  IF normalized IN ('UKG','UPPER_KG','UPPER_KINDERGARTEN') THEN RETURN 'UKG'; END IF;
  IF normalized ~ '^(CLASS_)?[0-9]{1,2}$' THEN
    class_number := REGEXP_REPLACE(normalized, '^CLASS_', '')::INTEGER;
    IF class_number BETWEEN 1 AND 12 THEN RETURN 'CLASS_' || class_number; END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION sync_student_grade_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.grade_code IS NULL
     OR NEW.grade_code = ''
     OR NEW.grade_level IS DISTINCT FROM OLD.grade_level THEN
    NEW.grade_code := vidyasetu_grade_code_from_legacy(NEW.grade_level);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_students_sync_grade_code ON students;
CREATE TRIGGER trg_students_sync_grade_code
BEFORE INSERT OR UPDATE OF grade_level ON students
FOR EACH ROW EXECUTE FUNCTION sync_student_grade_code();

UPDATE students
SET grade_code = vidyasetu_grade_code_from_legacy(grade_level)
WHERE grade_code IS NULL OR grade_code = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'students_grade_code_fkey'
      AND conrelid = 'students'::regclass
  ) THEN
    ALTER TABLE students
      ADD CONSTRAINT students_grade_code_fkey
      FOREIGN KEY (grade_code) REFERENCES education_grade_levels(code)
      NOT VALID;
  END IF;
END $$;

ALTER TABLE students VALIDATE CONSTRAINT students_grade_code_fkey;

COMMIT;
