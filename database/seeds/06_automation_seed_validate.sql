-- Validate the integrated synthetic school network after its idempotent load.
-- Fixed demo IDs only; no production rows are changed.
\echo '▶  Validating integrated school/class/subject demo data...'

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM schools
  WHERE id BETWEEN '10000000-0000-0000-0000-000000000001'::uuid
               AND '10000000-0000-0000-0000-000000000009'::uuid;
  IF v_count <> 9 THEN
    RAISE EXCEPTION 'Automation seed validation failed: expected 9 demo schools, found %', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM school_classes
  WHERE school_id BETWEEN '10000000-0000-0000-0000-000000000001'::uuid
                      AND '10000000-0000-0000-0000-000000000009'::uuid
    AND academic_year = '2026-27' AND is_active = TRUE;
  IF v_count <> 27 THEN
    RAISE EXCEPTION 'Automation seed validation failed: expected 27 active grade sections, found %', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM students
  WHERE id BETWEEN '30000000-0000-0000-0000-000000000001'::uuid
               AND '30000000-0000-0000-0000-000000000015'::uuid;
  IF v_count <> 15 THEN
    RAISE EXCEPTION 'Automation seed validation failed: expected 15 demo students, found %', v_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM students st
    LEFT JOIN school_classes sc ON sc.id = st.class_id
    LEFT JOIN schools s ON s.id = st.school_id
    WHERE st.id BETWEEN '30000000-0000-0000-0000-000000000001'::uuid
                    AND '30000000-0000-0000-0000-000000000015'::uuid
      AND (sc.id IS NULL OR s.id IS NULL OR sc.school_id <> st.school_id
           OR NOT EXISTS (SELECT 1 FROM parent_student_links p WHERE p.student_id = st.id))
  ) THEN
    RAISE EXCEPTION 'Automation seed validation failed: a demo student is missing a same-school class or parent link';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM school_classes sc
    WHERE sc.school_id BETWEEN '10000000-0000-0000-0000-000000000001'::uuid
                           AND '10000000-0000-0000-0000-000000000009'::uuid
      AND sc.academic_year = '2026-27' AND sc.is_active = TRUE
      AND NOT EXISTS (
        SELECT 1
        FROM teacher_assignments ta
        JOIN teachers t ON t.id = ta.teacher_id AND t.school_id = sc.school_id
        JOIN subjects sub ON sub.code = ta.subject_code
        WHERE ta.school_id = sc.school_id AND ta.class_id = sc.id
          AND ta.academic_year = '2026-27'
      )
  ) THEN
    RAISE EXCEPTION 'Automation seed validation failed: a demo class has no same-school teacher/subject assignment';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM students st
    WHERE st.id BETWEEN '30000000-0000-0000-0000-000000000001'::uuid
                    AND '30000000-0000-0000-0000-000000000015'::uuid
      AND (NOT EXISTS (SELECT 1 FROM attendance a WHERE a.student_id = st.id)
           OR NOT EXISTS (SELECT 1 FROM exam_attempts ea WHERE ea.student_id = st.id)
           OR NOT EXISTS (SELECT 1 FROM fee_invoices fi WHERE fi.student_id = st.id))
  ) THEN
    RAISE EXCEPTION 'Automation seed validation failed: a demo student is missing attendance, exam, or fee data';
  END IF;

  IF EXISTS (
    SELECT mobile FROM users
    WHERE id BETWEEN '00000000-0000-0000-0000-000000000001'::uuid
                 AND '00000000-0000-0000-0000-000000000058'::uuid
    GROUP BY mobile HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Automation seed validation failed: duplicate mobile numbers exist among the fixed demo user IDs';
  END IF;
END $$;

\echo '✅  Integrated automation school data is present and linked.'
