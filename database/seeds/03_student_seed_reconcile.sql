-- ============================================================
-- 03_student_seed_reconcile.sql
-- Phase 1B: normalize development Student gamification seed data
-- Runs after dev_seed.sql in Docker initialization.
-- ============================================================

\echo '▶  Reconciling Student XP, streaks and badges...'

BEGIN;

-- -----------------------------------------------------------------
-- 1. Give Priya enough historical lesson events to legitimately meet
--    the CURIOUS_MIND (10 lessons) criterion. dev_seed.sql already
--    contains one LESSON_COMPLETE event for this student.
--    The NOT EXISTS predicate makes this block safe to re-run.
-- -----------------------------------------------------------------
WITH lesson_seed AS (
  SELECT
    '30000000-0000-0000-0000-000000000002'::uuid AS student_id,
    gs AS lesson_no,
    format('Seed historical lesson %s', lpad(gs::text, 2, '0')) AS description
  FROM generate_series(2, 10) AS gs
)
INSERT INTO xp_events
  (student_id, event_type, xp_amount, reference_type, description, created_at)
SELECT
  ls.student_id,
  'LESSON_COMPLETE'::xp_event_type,
  10,
  'seed_history',
  ls.description,
  NOW() - ((75 - ls.lesson_no)::text || ' days')::interval
FROM lesson_seed ls
WHERE NOT EXISTS (
  SELECT 1
  FROM xp_events xe
  WHERE xe.student_id = ls.student_id
    AND xe.description = ls.description
);

-- -----------------------------------------------------------------
-- 2. Preserve the intentionally rich demo XP snapshots declared in
--    dev_seed.sql while keeping xp_events as the authoritative ledger.
--
--    dev_seed.sql inserts a small recent-event window. The one baseline
--    event below represents older activity outside that detailed window.
--    Because the database trigger derives students.xp_total from the
--    ledger, adding the balance here makes the summary and ledger agree.
-- -----------------------------------------------------------------
WITH targets(student_id, target_xp) AS (
  VALUES
    ('30000000-0000-0000-0000-000000000001'::uuid, 1250),
    ('30000000-0000-0000-0000-000000000002'::uuid, 2800),
    ('30000000-0000-0000-0000-000000000003'::uuid,  600),
    ('30000000-0000-0000-0000-000000000004'::uuid, 4500),
    ('30000000-0000-0000-0000-000000000005'::uuid,  900),
    ('30000000-0000-0000-0000-000000000006'::uuid, 3200),
    ('30000000-0000-0000-0000-000000000007'::uuid,  450),
    ('30000000-0000-0000-0000-000000000008'::uuid, 1800),
    ('30000000-0000-0000-0000-000000000009'::uuid, 5200),
    ('30000000-0000-0000-0000-000000000010'::uuid, 2100),
    ('30000000-0000-0000-0000-000000000011'::uuid,  350),
    ('30000000-0000-0000-0000-000000000012'::uuid, 1100)
), current_totals AS (
  SELECT
    t.student_id,
    t.target_xp,
    COALESCE(SUM(xe.xp_amount), 0)::integer AS current_xp
  FROM targets t
  LEFT JOIN xp_events xe ON xe.student_id = t.student_id
  GROUP BY t.student_id, t.target_xp
)
INSERT INTO xp_events
  (student_id, event_type, xp_amount, reference_type, description, created_at)
SELECT
  c.student_id,
  'PROFILE_COMPLETE'::xp_event_type,
  c.target_xp - c.current_xp,
  'seed_baseline',
  'Development seed baseline — historical XP before detailed event window',
  NOW() - INTERVAL '120 days'
FROM current_totals c
WHERE c.target_xp > c.current_xp
  AND NOT EXISTS (
    SELECT 1
    FROM xp_events xe
    WHERE xe.student_id = c.student_id
      AND xe.reference_type = 'seed_baseline'
  );

-- -----------------------------------------------------------------
-- 3. Rebuild seeded streak history relative to CURRENT_DATE.
--    Fixed 2025 dates made every demo streak stale on modern runs.
--    Each seeded student's streak_current is now backed by consecutive
--    streak_log rows ending today, and last_activity matches the ledger.
-- -----------------------------------------------------------------
DELETE FROM streak_log
WHERE student_id IN (
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

INSERT INTO streak_log (student_id, date, activity, streak_count)
SELECT
  s.id,
  CURRENT_DATE - gs.day_offset,
  'DAILY_LOGIN',
  s.streak_current - gs.day_offset
FROM students s
CROSS JOIN LATERAL generate_series(0, GREATEST(s.streak_current - 1, 0)) AS gs(day_offset)
WHERE s.id IN (
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
)
  AND s.streak_current > 0
ON CONFLICT (student_id, date) DO UPDATE
SET activity = EXCLUDED.activity,
    streak_count = EXCLUDED.streak_count;

UPDATE students
SET last_activity = CURRENT_DATE,
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
)
  AND streak_current > 0;

-- -----------------------------------------------------------------
-- 4. Seed badges from the same criteria the Student service now uses.
--    Existing hand-picked badges (for example EXAM_TOPPER) are retained.
-- -----------------------------------------------------------------

-- Lesson-count badges
INSERT INTO student_badges (student_id, badge_id)
SELECT lc.student_id, b.id
FROM (
  SELECT student_id, COUNT(*)::integer AS lesson_count
  FROM xp_events
  WHERE event_type = 'LESSON_COMPLETE'
    AND student_id IN (
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
    )
  GROUP BY student_id
) lc
JOIN badges b
  ON (b.code = 'FIRST_STEP'   AND lc.lesson_count >= 1)
  OR (b.code = 'CURIOUS_MIND' AND lc.lesson_count >= 10)
WHERE b.is_active = TRUE
ON CONFLICT (student_id, badge_id) DO NOTHING;

-- Streak badges
INSERT INTO student_badges (student_id, badge_id)
SELECT s.id, b.id
FROM students s
JOIN badges b
  ON (b.code = 'WEEK_WARRIOR' AND s.streak_current >= 7)
  OR (b.code = 'MONTH_MASTER' AND s.streak_current >= 30)
WHERE s.id IN (
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
)
  AND b.is_active = TRUE
ON CONFLICT (student_id, badge_id) DO NOTHING;

-- XP threshold badges
INSERT INTO student_badges (student_id, badge_id)
SELECT s.id, b.id
FROM students s
JOIN badges b
  ON b.criteria_type = 'XP_THRESHOLD'
 AND s.xp_total >= b.criteria_value
WHERE s.id IN (
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
)
  AND b.is_active = TRUE
ON CONFLICT (student_id, badge_id) DO NOTHING;

COMMIT;

\echo '✅  Student seed reconciliation complete.'
