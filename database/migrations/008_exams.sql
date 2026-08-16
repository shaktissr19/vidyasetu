-- ============================================================
-- 008_exams.sql
-- Tables: exams, exam_questions, exam_registrations,
--         exam_attempts, exam_responses, exam_leaderboard
-- ============================================================

DO $$ BEGIN
  CREATE TYPE exam_type   AS ENUM ('SCHOOL_TEST', 'OLYMPIAD', 'MOCK', 'PRACTICE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE exam_status AS ENUM (
    'DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'LIVE', 'SCORING', 'COMPLETED', 'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE attempt_status AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'SCORED', 'DISQUALIFIED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── exams ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS exams (
  id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id           UUID         REFERENCES schools(id),   -- NULL = platform-wide olympiad
  created_by          UUID         NOT NULL REFERENCES users(id),
  title               VARCHAR(300) NOT NULL,
  title_hi            VARCHAR(300),
  description         TEXT,
  type                exam_type    NOT NULL DEFAULT 'OLYMPIAD',
  status              exam_status  NOT NULL DEFAULT 'DRAFT',
  class_names         TEXT[]       NOT NULL DEFAULT '{}',   -- ['8','9','10']
  subject_codes       TEXT[]       NOT NULL DEFAULT '{}',   -- ['MATH','SCI']
  total_questions     SMALLINT     NOT NULL DEFAULT 30,
  duration_mins       SMALLINT     NOT NULL DEFAULT 60,
  marks_per_question  NUMERIC(4,2) NOT NULL DEFAULT 4,
  negative_marks      NUMERIC(4,2) NOT NULL DEFAULT 1,
  registration_start  TIMESTAMPTZ,
  registration_end    TIMESTAMPTZ,
  start_time          TIMESTAMPTZ  NOT NULL,
  end_time            TIMESTAMPTZ  NOT NULL,
  results_at          TIMESTAMPTZ,
  prize_pool          NUMERIC(12,2) NOT NULL DEFAULT 0,
  instructions        TEXT,
  instructions_hi     TEXT,
  banner_url          TEXT,
  max_registrations   INTEGER,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exams_status       ON exams(status);
CREATE INDEX IF NOT EXISTS idx_exams_school_id    ON exams(school_id);
CREATE INDEX IF NOT EXISTS idx_exams_start_time   ON exams(start_time);
CREATE INDEX IF NOT EXISTS idx_exams_class_names  ON exams USING GIN(class_names);

CREATE OR REPLACE TRIGGER trg_exams_updated_at
  BEFORE UPDATE ON exams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE  exams             IS 'School tests and platform-wide olympiads';
COMMENT ON COLUMN exams.school_id   IS 'NULL for platform olympiads visible to all schools';
COMMENT ON COLUMN exams.class_names IS 'Array of eligible class names; empty = all classes';

-- ── exam_questions ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS exam_questions (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id         UUID         NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  question_text   TEXT         NOT NULL,
  question_hi     TEXT,
  option_a        TEXT         NOT NULL,
  option_b        TEXT         NOT NULL,
  option_c        TEXT         NOT NULL,
  option_d        TEXT         NOT NULL,
  option_a_hi     TEXT,
  option_b_hi     TEXT,
  option_c_hi     TEXT,
  option_d_hi     TEXT,
  correct_option  CHAR(1)      NOT NULL CHECK (correct_option IN ('A','B','C','D')),
  explanation     TEXT,
  subject_code    VARCHAR(20),
  difficulty      difficulty_level NOT NULL DEFAULT 'MEDIUM',
  sort_order      SMALLINT     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eq_exam_id ON exam_questions(exam_id);

COMMENT ON TABLE exam_questions IS 'Questions for an exam; correct_option hidden from students until results';

-- ── exam_registrations ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS exam_registrations (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id     UUID        NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id  UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_id   UUID        NOT NULL REFERENCES schools(id),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (exam_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_er_exam_id    ON exam_registrations(exam_id);
CREATE INDEX IF NOT EXISTS idx_er_student_id ON exam_registrations(student_id);

COMMENT ON TABLE exam_registrations IS 'Students who have registered for an exam';

-- ── exam_attempts ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS exam_attempts (
  id            UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id       UUID           NOT NULL REFERENCES exams(id),
  student_id    UUID           NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_id     UUID           NOT NULL REFERENCES schools(id),
  status        attempt_status NOT NULL DEFAULT 'IN_PROGRESS',
  started_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  submitted_at  TIMESTAMPTZ,
  time_taken_secs INTEGER,
  total_marks   NUMERIC(8,2),
  correct_count SMALLINT,
  wrong_count   SMALLINT,
  skipped_count SMALLINT,
  percentile    NUMERIC(5,2),
  rank_school   INTEGER,
  rank_overall  INTEGER,
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  UNIQUE (exam_id, student_id)   -- one attempt per exam per student
);

CREATE INDEX IF NOT EXISTS idx_ea_exam_id    ON exam_attempts(exam_id);
CREATE INDEX IF NOT EXISTS idx_ea_student_id ON exam_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_ea_status     ON exam_attempts(status);

COMMENT ON TABLE exam_attempts IS 'One attempt record per student per exam; scores computed on submission';

-- ── exam_responses ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS exam_responses (
  id                UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  attempt_id        UUID    NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  question_id       UUID    NOT NULL REFERENCES exam_questions(id),
  selected_option   CHAR(1) CHECK (selected_option IN ('A','B','C','D')),  -- NULL = skipped
  is_correct        BOOLEAN,
  marks_awarded     NUMERIC(4,2),
  time_spent_secs   SMALLINT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_er_attempt_id  ON exam_responses(attempt_id);
CREATE INDEX IF NOT EXISTS idx_er_question_id ON exam_responses(question_id);

COMMENT ON TABLE exam_responses IS 'Per-question responses; populated during exam, scored on submission';

-- ── exam_leaderboard ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS exam_leaderboard (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  exam_id       UUID         NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  attempt_id    UUID         NOT NULL REFERENCES exam_attempts(id),
  student_id    UUID         NOT NULL REFERENCES students(id),
  school_id     UUID         NOT NULL REFERENCES schools(id),
  total_marks   NUMERIC(8,2) NOT NULL,
  rank_school   INTEGER,
  rank_overall  INTEGER,
  percentile    NUMERIC(5,2),
  xp_awarded    INTEGER      NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  UNIQUE (exam_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_el_exam_id    ON exam_leaderboard(exam_id);
CREATE INDEX IF NOT EXISTS idx_el_rank       ON exam_leaderboard(exam_id, rank_overall);
CREATE INDEX IF NOT EXISTS idx_el_student_id ON exam_leaderboard(student_id);

COMMENT ON TABLE exam_leaderboard IS 'Materialised leaderboard populated by competition.service.js after scoring';
