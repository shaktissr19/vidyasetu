-- ============================================================
-- 007_content.sql
-- Tables: subjects, chapters, content_items, quiz_questions,
--         student_content_progress, offline_downloads
-- ============================================================

DO $$ BEGIN
  CREATE TYPE content_type   AS ENUM ('VIDEO', 'PDF', 'QUIZ', 'NOTES', 'AUDIO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE content_status AS ENUM ('DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE difficulty_level AS ENUM ('EASY', 'MEDIUM', 'HARD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── subjects ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subjects (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(100) NOT NULL,
  name_hi       VARCHAR(100),
  code          VARCHAR(20)  NOT NULL UNIQUE,  -- 'MATH', 'SCI', 'ENG', 'HIN', 'SST'
  color_hex     VARCHAR(7)   NOT NULL DEFAULT '#6366F1',
  icon_url      TEXT,
  board         VARCHAR(20)  NOT NULL DEFAULT 'NCERT',
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  sort_order    SMALLINT     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subjects_code ON subjects(code);

COMMENT ON TABLE  subjects       IS 'NCERT subject catalogue; shared across all schools';
COMMENT ON COLUMN subjects.code  IS 'Short code used by teacher_assignments and content joins';

-- ── chapters ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chapters (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id       UUID        NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  class_name       VARCHAR(10) NOT NULL,  -- '6' … '12'
  chapter_number   SMALLINT    NOT NULL,
  title            VARCHAR(200) NOT NULL,
  title_hi         VARCHAR(200),
  description      TEXT,
  thumbnail_url    TEXT,
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (subject_id, class_name, chapter_number)
);

CREATE INDEX IF NOT EXISTS idx_chapters_subject_id  ON chapters(subject_id);
CREATE INDEX IF NOT EXISTS idx_chapters_class_name  ON chapters(class_name);

CREATE OR REPLACE TRIGGER trg_chapters_updated_at
  BEFORE UPDATE ON chapters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE chapters IS 'NCERT chapters per subject per class';

-- ── content_items ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS content_items (
  id               UUID             PRIMARY KEY DEFAULT uuid_generate_v4(),
  chapter_id       UUID             NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  type             content_type     NOT NULL,
  status           content_status   NOT NULL DEFAULT 'DRAFT',
  title            VARCHAR(300)     NOT NULL,
  title_hi         VARCHAR(300),
  language         VARCHAR(5)       NOT NULL DEFAULT 'hi',
  file_url         TEXT,               -- S3 key
  thumbnail_url    TEXT,
  duration_secs    INTEGER,            -- for VIDEO/AUDIO
  file_size_kb     INTEGER,
  difficulty       difficulty_level NOT NULL DEFAULT 'MEDIUM',
  xp_reward        INTEGER          NOT NULL DEFAULT 10,
  sort_order       SMALLINT         NOT NULL DEFAULT 0,
  is_offline_ready BOOLEAN          NOT NULL DEFAULT FALSE,
  view_count       INTEGER          NOT NULL DEFAULT 0,
  created_by       UUID             REFERENCES users(id),
  created_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ci_chapter_id       ON content_items(chapter_id);
CREATE INDEX IF NOT EXISTS idx_ci_status           ON content_items(status);
CREATE INDEX IF NOT EXISTS idx_ci_type             ON content_items(type);
CREATE INDEX IF NOT EXISTS idx_ci_is_offline_ready ON content_items(is_offline_ready) WHERE is_offline_ready = TRUE;
CREATE INDEX IF NOT EXISTS idx_ci_language         ON content_items(language);

CREATE OR REPLACE TRIGGER trg_content_items_updated_at
  BEFORE UPDATE ON content_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE  content_items                  IS 'Individual videos, PDFs, quizzes per chapter';
COMMENT ON COLUMN content_items.xp_reward        IS 'XP awarded on first completion';
COMMENT ON COLUMN content_items.is_offline_ready IS 'Admin-approved flag for offline download eligibility';

-- ── quiz_questions ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quiz_questions (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_item_id UUID         NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
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
  explanation_hi  TEXT,
  difficulty      difficulty_level NOT NULL DEFAULT 'MEDIUM',
  sort_order      SMALLINT     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qq_content_item_id ON quiz_questions(content_item_id);

COMMENT ON TABLE quiz_questions IS 'MCQ questions for QUIZ-type content items';

-- ── student_content_progress ──────────────────────────────────

CREATE TABLE IF NOT EXISTS student_content_progress (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id      UUID         NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  content_item_id UUID         NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  is_completed    BOOLEAN      NOT NULL DEFAULT FALSE,
  progress_pct    SMALLINT     NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  quiz_score      SMALLINT,    -- percentage score if type=QUIZ
  attempts        SMALLINT     NOT NULL DEFAULT 1,
  last_accessed   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  UNIQUE (student_id, content_item_id)
);

CREATE INDEX IF NOT EXISTS idx_scp_student_id      ON student_content_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_scp_content_item_id ON student_content_progress(content_item_id);
CREATE INDEX IF NOT EXISTS idx_scp_completed       ON student_content_progress(is_completed);

COMMENT ON TABLE student_content_progress IS 'Per-student progress on each content item; upserted on watch/submit';

-- ── offline_downloads ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS offline_downloads (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id      UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  content_item_id UUID        NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  downloaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  file_size_kb    INTEGER,
  is_synced       BOOLEAN     NOT NULL DEFAULT TRUE,

  UNIQUE (student_id, content_item_id)
);

CREATE INDEX IF NOT EXISTS idx_od_student_id ON offline_downloads(student_id);

COMMENT ON TABLE offline_downloads IS 'Tracks which content each student has saved for offline; used by offline.service.js delta sync';
