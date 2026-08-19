-- ============================================================
-- 016_demo_academic_year_alignment.sql
-- Keep only the known VidyaSetu demo schools/classes/students coherent
-- with the current 2026-27 academic year.
-- ============================================================

BEGIN;

UPDATE schools
SET academic_year = '2026-27',
    updated_at = NOW()
WHERE id IN (
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002'
);

-- school_classes has no updated_at column. Restrict the change to the four
-- deterministic demo class rows so real School ERP classes are never touched.
UPDATE school_classes
SET academic_year = '2026-27'
WHERE id IN (
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000004'
);

UPDATE students
SET academic_year = '2026-27',
    updated_at = NOW()
WHERE id IN (
  '30000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000003',
  '30000000-0000-0000-0000-000000000004',
  '30000000-0000-0000-0000-000000000005',
  '30000000-0000-0000-0000-000000000006',
  '30000000-0000-0000-0000-000000000007',
  '30000000-0000-0000-0000-000000000008',
  '30000000-0000-0000-0000-000000000009',
  '30000000-0000-0000-0000-000000000010',
  '30000000-0000-0000-0000-000000000011',
  '30000000-0000-0000-0000-000000000012'
);

-- Keep displayed school totals consistent with the actual approved demo roster.
UPDATE schools sch
SET total_students = roster.approved_students,
    updated_at = NOW()
FROM (
  SELECT school_id, COUNT(*)::INTEGER AS approved_students
  FROM students
  WHERE school_id IN (
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002'
  )
    AND status = 'ACTIVE'
    AND school_link_status = 'APPROVED'
  GROUP BY school_id
) roster
WHERE sch.id = roster.school_id;

COMMIT;
