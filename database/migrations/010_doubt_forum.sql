-- ============================================================
-- 010_doubt_forum.sql
-- Tables: doubts, doubt_answers, doubt_answer_upvotes
-- Trigger: increment_doubt_answer_count
-- ============================================================

DO $$ BEGIN
  CREATE TYPE doubt_status AS ENUM ('OPEN', 'RESOLVED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── doubts ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS doubts (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id       UUID         NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_id        UUID         NOT NULL REFERENCES schools(id),
  subject_code     VARCHAR(20),
  chapter_id       UUID         REFERENCES chapters(id),
  content_item_id  UUID         REFERENCES content_items(id),
  title            VARCHAR(300) NOT NULL,
  body             TEXT         NOT NULL,
  image_url        TEXT,        -- optional photo of notebook/problem
  status           doubt_status NOT NULL DEFAULT 'OPEN',
  -- Denormalised counter
  answer_count     INTEGER      NOT NULL DEFAULT 0,
  upvote_count     INTEGER      NOT NULL DEFAULT 0,
  ai_answered      BOOLEAN      NOT NULL DEFAULT FALSE,
  resolved_by      UUID         REFERENCES users(id),
  resolved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doubts_student_id  ON doubts(student_id);
CREATE INDEX IF NOT EXISTS idx_doubts_school_id   ON doubts(school_id);
CREATE INDEX IF NOT EXISTS idx_doubts_status      ON doubts(status);
CREATE INDEX IF NOT EXISTS idx_doubts_subject     ON doubts(subject_code);
CREATE INDEX IF NOT EXISTS idx_doubts_chapter     ON doubts(chapter_id);
CREATE INDEX IF NOT EXISTS idx_doubts_created_at  ON doubts(created_at DESC);

CREATE OR REPLACE TRIGGER trg_doubts_updated_at
  BEFORE UPDATE ON doubts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE  doubts              IS 'Student questions in the doubt forum; scoped to school';
COMMENT ON COLUMN doubts.answer_count IS 'Denormalised; updated by trigger on doubt_answers insert';

-- ── doubt_answers ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS doubt_answers (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  doubt_id       UUID        NOT NULL REFERENCES doubts(id) ON DELETE CASCADE,
  author_id      UUID        NOT NULL REFERENCES users(id),  -- student, teacher, or AI
  body           TEXT        NOT NULL,
  image_url      TEXT,
  is_ai_answer   BOOLEAN     NOT NULL DEFAULT FALSE,
  is_accepted    BOOLEAN     NOT NULL DEFAULT FALSE,
  upvote_count   INTEGER     NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_da_doubt_id   ON doubt_answers(doubt_id);
CREATE INDEX IF NOT EXISTS idx_da_author_id  ON doubt_answers(author_id);
CREATE INDEX IF NOT EXISTS idx_da_created_at ON doubt_answers(created_at);

CREATE OR REPLACE TRIGGER trg_doubt_answers_updated_at
  BEFORE UPDATE ON doubt_answers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE  doubt_answers           IS 'Answers to doubts from students, teachers, or VidyaBot';
COMMENT ON COLUMN doubt_answers.is_accepted IS 'Marked by the question author; used for resolved state';

-- ── Trigger: keep doubts.answer_count in sync ─────────────────

CREATE OR REPLACE FUNCTION increment_doubt_answer_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE doubts
  SET answer_count = answer_count + 1,
      updated_at   = NOW()
  WHERE id = NEW.doubt_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_doubt_answer_count
  AFTER INSERT ON doubt_answers
  FOR EACH ROW EXECUTE FUNCTION increment_doubt_answer_count();

-- ── doubt_answer_upvotes ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS doubt_answer_upvotes (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  answer_id  UUID        NOT NULL REFERENCES doubt_answers(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (answer_id, user_id)   -- one upvote per user per answer
);

CREATE INDEX IF NOT EXISTS idx_dau_answer_id ON doubt_answer_upvotes(answer_id);
CREATE INDEX IF NOT EXISTS idx_dau_user_id   ON doubt_answer_upvotes(user_id);

COMMENT ON TABLE doubt_answer_upvotes IS 'Toggle-style upvotes; insert/delete managed by service layer';

-- ── Trigger: update doubt_answers.upvote_count ───────────────

CREATE OR REPLACE FUNCTION sync_answer_upvote_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE doubt_answers SET upvote_count = upvote_count + 1 WHERE id = NEW.answer_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE doubt_answers SET upvote_count = GREATEST(upvote_count - 1, 0) WHERE id = OLD.answer_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_answer_upvote_count
  AFTER INSERT OR DELETE ON doubt_answer_upvotes
  FOR EACH ROW EXECUTE FUNCTION sync_answer_upvote_count();
