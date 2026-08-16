-- ============================================================
-- 009_gamification.sql
-- Tables: xp_events, badges, student_badges, streak_log
-- Trigger: update_student_xp (after xp_events insert)
-- ============================================================

DO $$ BEGIN
  CREATE TYPE xp_event_type AS ENUM (
    'LESSON_COMPLETE', 'QUIZ_PASS', 'QUIZ_PERFECT', 'STREAK_BONUS',
    'EXAM_COMPLETE', 'EXAM_TOP_10', 'EXAM_TOP_3', 'FIRST_LOGIN',
    'PROFILE_COMPLETE', 'DOUBT_ANSWERED', 'DOUBT_UPVOTED', 'DAILY_LOGIN'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE badge_tier AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── xp_events ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS xp_events (
  id               UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id       UUID           NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  event_type       xp_event_type  NOT NULL,
  xp_amount        INTEGER        NOT NULL CHECK (xp_amount > 0),
  reference_id     UUID,          -- content_item_id / exam_id / doubt_id
  reference_type   VARCHAR(50),   -- 'content_item' | 'exam' | 'doubt'
  description      TEXT,
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW()
  -- Append-only: no UPDATE trigger
);

CREATE INDEX IF NOT EXISTS idx_xpe_student_id  ON xp_events(student_id);
CREATE INDEX IF NOT EXISTS idx_xpe_created_at  ON xp_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_xpe_event_type  ON xp_events(event_type);

COMMENT ON TABLE  xp_events            IS 'Append-only XP ledger; students.xp_total kept in sync by trigger';
COMMENT ON COLUMN xp_events.reference_id IS 'Optional FK to the entity that triggered the XP (no FK constraint for flexibility)';

-- ── Trigger: update students.xp_total and xp_level ───────────

CREATE OR REPLACE FUNCTION update_student_xp()
RETURNS TRIGGER AS $$
DECLARE
  v_xp_total INTEGER;
  v_xp_level INTEGER;
BEGIN
  SELECT COALESCE(SUM(xp_amount), 0)
  INTO   v_xp_total
  FROM   xp_events
  WHERE  student_id = NEW.student_id;

  -- Level formula: 1 level per 500 XP, cap at 100
  v_xp_level := LEAST(GREATEST(FLOOR(v_xp_total / 500.0) + 1, 1), 100);

  UPDATE students
  SET xp_total   = v_xp_total,
      xp_level   = v_xp_level,
      updated_at = NOW()
  WHERE id = NEW.student_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_xp_events_update_student
  AFTER INSERT ON xp_events
  FOR EACH ROW EXECUTE FUNCTION update_student_xp();

-- ── badges ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS badges (
  id               UUID       PRIMARY KEY DEFAULT uuid_generate_v4(),
  code             VARCHAR(50) NOT NULL UNIQUE,
  name             VARCHAR(100) NOT NULL,
  name_hi          VARCHAR(100),
  description      TEXT,
  description_hi   TEXT,
  tier             badge_tier  NOT NULL DEFAULT 'BRONZE',
  icon_url         TEXT,
  xp_bonus         INTEGER     NOT NULL DEFAULT 0,
  -- Criteria (checked in student.service.js)
  criteria_type    VARCHAR(50) NOT NULL,  -- 'XP_THRESHOLD', 'STREAK', 'EXAM_RANK', 'LESSONS_COUNT'
  criteria_value   INTEGER     NOT NULL,
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_badges_code ON badges(code);

COMMENT ON TABLE  badges                IS 'Badge catalogue; criteria checked programmatically in student.service.js';
COMMENT ON COLUMN badges.criteria_type  IS 'Used by student.service.checkAndAwardBadges() to evaluate eligibility';

-- ── student_badges ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS student_badges (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id   UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  badge_id     UUID        NOT NULL REFERENCES badges(id),
  awarded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_displayed BOOLEAN     NOT NULL DEFAULT TRUE,

  UNIQUE (student_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_sb_student_id ON student_badges(student_id);
CREATE INDEX IF NOT EXISTS idx_sb_badge_id   ON student_badges(badge_id);
CREATE INDEX IF NOT EXISTS idx_sb_awarded_at ON student_badges(awarded_at DESC);

COMMENT ON TABLE student_badges IS 'Badges earned by students; many-to-many with badges';

-- ── streak_log ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS streak_log (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id   UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date         DATE        NOT NULL,
  activity     VARCHAR(100) NOT NULL DEFAULT 'DAILY_LOGIN',
  streak_count INTEGER     NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (student_id, date)
);

CREATE INDEX IF NOT EXISTS idx_sl_student_id ON streak_log(student_id);
CREATE INDEX IF NOT EXISTS idx_sl_date       ON streak_log(date DESC);

COMMENT ON TABLE streak_log IS 'One row per active day per student; xpRecalc.job.js resets streak_current if no entry today';

-- ── Seed default badge catalogue ──────────────────────────────

INSERT INTO badges (code, name, name_hi, description, tier, xp_bonus, criteria_type, criteria_value) VALUES
  ('FIRST_STEP',    'First Step',     'पहला कदम',    'Complete your first lesson',          'BRONZE',   10,   'LESSONS_COUNT', 1),
  ('CURIOUS_MIND',  'Curious Mind',   'जिज्ञासु मन', 'Complete 10 lessons',                 'BRONZE',   25,   'LESSONS_COUNT', 10),
  ('WEEK_WARRIOR',  'Week Warrior',   'सप्ताह योद्धा','Maintain a 7-day streak',            'SILVER',   50,   'STREAK',        7),
  ('MONTH_MASTER',  'Month Master',   'माह प्रवीण',  'Maintain a 30-day streak',            'GOLD',    200,   'STREAK',        30),
  ('XP_500',        'Rising Star',    'उदीयमान तारा','Earn 500 XP',                         'BRONZE',   25,   'XP_THRESHOLD',  500),
  ('XP_2000',       'Scholar',        'विद्वान',     'Earn 2000 XP',                        'SILVER',  100,   'XP_THRESHOLD',  2000),
  ('XP_5000',       'Expert',         'विशेषज्ञ',   'Earn 5000 XP',                        'GOLD',    250,   'XP_THRESHOLD',  5000),
  ('XP_10000',      'Legend',         'किंवदंती',    'Earn 10000 XP',                       'PLATINUM',500,   'XP_THRESHOLD',  10000),
  ('QUIZ_MASTER',   'Quiz Master',    'प्रश्नोत्तरी','Score 100% in 5 quizzes',            'SILVER',   75,   'LESSONS_COUNT', 5),
  ('EXAM_TOPPER',   'Exam Topper',    'परीक्षा टॉपर','Finish in top 3 of an olympiad',     'GOLD',    300,   'EXAM_RANK',     3)
ON CONFLICT (code) DO NOTHING;
