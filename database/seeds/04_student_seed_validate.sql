-- ============================================================
-- 04_student_seed_validate.sql
-- Phase 1B: fail Docker DB initialization if core Student seed
-- invariants do not hold after reconciliation.
-- ============================================================

\echo '▶  Validating Student seed integrity...'

DO $$
DECLARE
  v_count integer;
BEGIN
  -- 1. Every seeded Student must have a users row, school and class.
  SELECT COUNT(*) INTO v_count
  FROM students s
  LEFT JOIN users u ON u.id = s.user_id
  LEFT JOIN schools sch ON sch.id = s.school_id
  LEFT JOIN school_classes sc ON sc.id = s.class_id
  WHERE s.id::text LIKE '30000000-0000-0000-0000-%'
    AND (u.id IS NULL OR sch.id IS NULL OR sc.id IS NULL);

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Student seed validation failed: % student relationship rows are invalid', v_count;
  END IF;

  -- 2. students.xp_total must exactly equal the append-only XP ledger.
  SELECT COUNT(*) INTO v_count
  FROM students s
  LEFT JOIN (
    SELECT student_id, COALESCE(SUM(xp_amount), 0)::integer AS ledger_xp
    FROM xp_events
    GROUP BY student_id
  ) x ON x.student_id = s.id
  WHERE s.id::text LIKE '30000000-0000-0000-0000-%'
    AND s.xp_total <> COALESCE(x.ledger_xp, 0);

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Student seed validation failed: % XP totals do not match xp_events', v_count;
  END IF;

  -- 3. xp_level must match the canonical formula from migration 009.
  SELECT COUNT(*) INTO v_count
  FROM students s
  WHERE s.id::text LIKE '30000000-0000-0000-0000-%'
    AND s.xp_level <> LEAST(GREATEST(FLOOR(s.xp_total / 500.0) + 1, 1), 100)::integer;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Student seed validation failed: % XP levels are inconsistent', v_count;
  END IF;

  -- 4. Active seeded streaks must end today and have enough consecutive rows.
  SELECT COUNT(*) INTO v_count
  FROM students s
  WHERE s.id::text LIKE '30000000-0000-0000-0000-%'
    AND s.streak_current > 0
    AND (
      s.last_activity IS DISTINCT FROM CURRENT_DATE
      OR NOT EXISTS (
        SELECT 1 FROM streak_log sl
        WHERE sl.student_id = s.id AND sl.date = CURRENT_DATE
      )
      OR (
        SELECT COUNT(*) FROM streak_log sl
        WHERE sl.student_id = s.id
          AND sl.date BETWEEN CURRENT_DATE - (s.streak_current - 1) AND CURRENT_DATE
      ) < s.streak_current
    );

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Student seed validation failed: % active streaks are inconsistent', v_count;
  END IF;

  -- 5. Core demo identities used by local smoke tests must exist.
  SELECT COUNT(*) INTO v_count
  FROM users
  WHERE mobile IN ('9300000001', '9300000002')
    AND role = 'STUDENT'
    AND status = 'ACTIVE';

  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Student seed validation failed: Aarav/Priya smoke-test accounts missing';
  END IF;

  -- 6. Priya is intentionally the richer Student demo persona.
  IF NOT EXISTS (
    SELECT 1
    FROM students s
    JOIN users u ON u.id = s.user_id
    WHERE u.mobile = '9300000002'
      AND s.xp_total = 2800
      AND s.streak_current = 30
  ) THEN
    RAISE EXCEPTION 'Student seed validation failed: Priya demo snapshot is inconsistent';
  END IF;
END $$;

\echo '✅  Student seed integrity validation passed.'
