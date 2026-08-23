-- ============================================================
-- 022_learning_practice_personalization.sql
-- VidyaSetu Learning Platform Phase 2
-- Structured question bank, assessments, student learning state,
-- cross-board personalization and governed OER intake.
-- Additive/idempotent. No destructive data changes.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE learning_question_type AS ENUM ('MCQ_SINGLE','MCQ_MULTIPLE','TRUE_FALSE','SHORT_ANSWER','NUMERIC');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE learning_difficulty AS ENUM ('FOUNDATION','EASY','MEDIUM','HARD','CHALLENGE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE learning_assessment_type AS ENUM ('PRACTICE','CHAPTER_TEST','UNIT_TEST','MOCK','DAILY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE learning_attempt_status AS ENUM ('IN_PROGRESS','SUBMITTED','GRADED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE learning_intake_status AS ENUM ('DISCOVERED','LICENCE_REVIEW','CONTENT_REVIEW','APPROVED','REJECTED','IMPORTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

BEGIN;

CREATE TABLE IF NOT EXISTS learning_questions (
  id                  UUID                    PRIMARY KEY DEFAULT uuid_generate_v4(),
  public_code         VARCHAR(50)             NOT NULL UNIQUE,
  prompt              TEXT                    NOT NULL,
  prompt_hi           TEXT,
  question_type       learning_question_type  NOT NULL,
  difficulty          learning_difficulty     NOT NULL DEFAULT 'MEDIUM',
  explanation         TEXT,
  explanation_hi      TEXT,
  correct_answer      JSONB                   NOT NULL,
  marks               NUMERIC(6,2)            NOT NULL DEFAULT 1 CHECK (marks > 0),
  negative_marks      NUMERIC(6,2)            NOT NULL DEFAULT 0 CHECK (negative_marks >= 0),
  class_min           SMALLINT                CHECK (class_min BETWEEN 1 AND 12),
  class_max           SMALLINT                CHECK (class_max BETWEEN 1 AND 12),
  subject_id          UUID                    REFERENCES subjects(id) ON DELETE SET NULL,
  curriculum_topic_id UUID                    REFERENCES curriculum_topics(id) ON DELETE SET NULL,
  source_id           UUID                    NOT NULL REFERENCES learning_content_sources(id),
  source_url          TEXT,
  licence             learning_license_code   NOT NULL DEFAULT 'VIDYASETU_ORIGINAL',
  attribution_text    TEXT,
  visibility          learning_visibility     NOT NULL DEFAULT 'REGISTERED',
  review_status       learning_review_status  NOT NULL DEFAULT 'DRAFT',
  created_by          UUID                    REFERENCES users(id),
  reviewed_by         UUID                    REFERENCES users(id),
  published_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  CHECK (class_min IS NULL OR class_max IS NULL OR class_min <= class_max)
);

CREATE OR REPLACE TRIGGER trg_learning_questions_updated_at
  BEFORE UPDATE ON learning_questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_lq_scope ON learning_questions(class_min, class_max, subject_id, review_status);
CREATE INDEX IF NOT EXISTS idx_lq_difficulty ON learning_questions(difficulty, review_status);

CREATE TABLE IF NOT EXISTS learning_question_options (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id UUID        NOT NULL REFERENCES learning_questions(id) ON DELETE CASCADE,
  option_key  VARCHAR(10) NOT NULL,
  option_text TEXT        NOT NULL,
  option_text_hi TEXT,
  sort_order  SMALLINT    NOT NULL DEFAULT 0,
  UNIQUE (question_id, option_key)
);
CREATE INDEX IF NOT EXISTS idx_lqo_question ON learning_question_options(question_id, sort_order);

CREATE TABLE IF NOT EXISTS learning_question_boards (
  question_id UUID NOT NULL REFERENCES learning_questions(id) ON DELETE CASCADE,
  board_id    UUID NOT NULL REFERENCES education_boards(id) ON DELETE CASCADE,
  PRIMARY KEY (question_id, board_id)
);

CREATE TABLE IF NOT EXISTS learning_assessments (
  id                 UUID                     PRIMARY KEY DEFAULT uuid_generate_v4(),
  public_slug        VARCHAR(180)             UNIQUE,
  title              VARCHAR(300)             NOT NULL,
  title_hi           VARCHAR(300),
  summary            TEXT,
  summary_hi         TEXT,
  assessment_type    learning_assessment_type NOT NULL DEFAULT 'PRACTICE',
  visibility         learning_visibility      NOT NULL DEFAULT 'REGISTERED',
  review_status      learning_review_status   NOT NULL DEFAULT 'DRAFT',
  class_min          SMALLINT                 CHECK (class_min BETWEEN 1 AND 12),
  class_max          SMALLINT                 CHECK (class_max BETWEEN 1 AND 12),
  subject_id         UUID                     REFERENCES subjects(id) ON DELETE SET NULL,
  time_limit_mins    SMALLINT                 CHECK (time_limit_mins IS NULL OR time_limit_mins > 0),
  passing_pct        NUMERIC(5,2)             NOT NULL DEFAULT 40 CHECK (passing_pct BETWEEN 0 AND 100),
  max_attempts       SMALLINT                 CHECK (max_attempts IS NULL OR max_attempts > 0),
  shuffle_questions  BOOLEAN                  NOT NULL DEFAULT FALSE,
  is_featured_public BOOLEAN                  NOT NULL DEFAULT FALSE,
  created_by         UUID                     REFERENCES users(id),
  reviewed_by        UUID                     REFERENCES users(id),
  published_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
  CHECK (class_min IS NULL OR class_max IS NULL OR class_min <= class_max)
);

CREATE OR REPLACE TRIGGER trg_learning_assessments_updated_at
  BEFORE UPDATE ON learning_assessments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_la_public ON learning_assessments(visibility, review_status, is_featured_public)
  WHERE visibility='PUBLIC' AND review_status='PUBLISHED';
CREATE INDEX IF NOT EXISTS idx_la_scope ON learning_assessments(class_min, class_max, subject_id, review_status);

CREATE TABLE IF NOT EXISTS learning_assessment_boards (
  assessment_id UUID NOT NULL REFERENCES learning_assessments(id) ON DELETE CASCADE,
  board_id      UUID NOT NULL REFERENCES education_boards(id) ON DELETE CASCADE,
  PRIMARY KEY (assessment_id, board_id)
);

CREATE TABLE IF NOT EXISTS learning_assessment_questions (
  assessment_id UUID         NOT NULL REFERENCES learning_assessments(id) ON DELETE CASCADE,
  question_id   UUID         NOT NULL REFERENCES learning_questions(id) ON DELETE CASCADE,
  sort_order    SMALLINT     NOT NULL DEFAULT 0,
  marks_override NUMERIC(6,2),
  PRIMARY KEY (assessment_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_laq_order ON learning_assessment_questions(assessment_id, sort_order);

CREATE TABLE IF NOT EXISTS student_learning_attempts (
  id              UUID                    PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id      UUID                    NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  assessment_id   UUID                    NOT NULL REFERENCES learning_assessments(id) ON DELETE CASCADE,
  status          learning_attempt_status NOT NULL DEFAULT 'IN_PROGRESS',
  started_at      TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  submitted_at    TIMESTAMPTZ,
  score           NUMERIC(8,2),
  max_score       NUMERIC(8,2),
  percentage      NUMERIC(5,2),
  correct_count   INTEGER                 NOT NULL DEFAULT 0,
  wrong_count     INTEGER                 NOT NULL DEFAULT 0,
  skipped_count   INTEGER                 NOT NULL DEFAULT 0,
  time_spent_secs INTEGER,
  created_at      TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sla_student ON student_learning_attempts(student_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sla_assessment ON student_learning_attempts(assessment_id, status);

CREATE TABLE IF NOT EXISTS student_learning_answers (
  attempt_id    UUID         NOT NULL REFERENCES student_learning_attempts(id) ON DELETE CASCADE,
  question_id   UUID         NOT NULL REFERENCES learning_questions(id) ON DELETE CASCADE,
  answer        JSONB,
  is_correct    BOOLEAN,
  marks_awarded NUMERIC(6,2) NOT NULL DEFAULT 0,
  answered_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (attempt_id, question_id)
);

CREATE TABLE IF NOT EXISTS student_learning_resource_progress (
  student_id     UUID          NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  resource_id    UUID          NOT NULL REFERENCES learning_resources(id) ON DELETE CASCADE,
  progress_pct   NUMERIC(5,2)  NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  is_completed   BOOLEAN       NOT NULL DEFAULT FALSE,
  last_accessed  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  completed_at   TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, resource_id)
);
CREATE INDEX IF NOT EXISTS idx_slrp_recent ON student_learning_resource_progress(student_id, last_accessed DESC);

CREATE TABLE IF NOT EXISTS learning_source_intake (
  id                 UUID                   PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id          UUID                   NOT NULL REFERENCES learning_content_sources(id),
  source_item_id     VARCHAR(220),
  title              VARCHAR(300)           NOT NULL,
  source_url         TEXT                   NOT NULL,
  licence_candidate  learning_license_code,
  attribution_text   TEXT,
  class_hint         VARCHAR(50),
  board_hint         VARCHAR(50),
  subject_hint       VARCHAR(120),
  status             learning_intake_status NOT NULL DEFAULT 'DISCOVERED',
  reviewer_note      TEXT,
  created_by         UUID                   REFERENCES users(id),
  reviewed_by        UUID                   REFERENCES users(id),
  reviewed_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
  UNIQUE (source_id, source_url)
);
CREATE OR REPLACE TRIGGER trg_learning_source_intake_updated_at
  BEFORE UPDATE ON learning_source_intake
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX IF NOT EXISTS idx_lsi_status ON learning_source_intake(status, created_at DESC);

-- ------------------------------------------------------------
-- VidyaSetu Original starter question bank.
-- Original questions only; no copied textbook/coaching passages.
-- ------------------------------------------------------------
WITH src AS (
  SELECT id FROM learning_content_sources WHERE code='VIDYASETU_ORIGINAL'
), math AS (
  SELECT id FROM subjects WHERE upper(code) IN ('MATH','MATHS','MATHEMATICS') ORDER BY id LIMIT 1
), science AS (
  SELECT id FROM subjects WHERE upper(code) IN ('SCI','SCIENCE') ORDER BY id LIMIT 1
), english AS (
  SELECT id FROM subjects WHERE upper(code) IN ('ENG','ENGLISH') ORDER BY id LIMIT 1
)
INSERT INTO learning_questions
  (id, public_code, prompt, question_type, difficulty, explanation, correct_answer,
   marks, class_min, class_max, subject_id, source_id, licence, visibility, review_status, published_at)
VALUES
  ('85000000-0000-0000-0000-000000000001','VS8M-LIN-001','Solve: 3x + 5 = 20. What is x?','MCQ_SINGLE','EASY','Subtract 5 from both sides, then divide by 3. x = 5.', '{"option":"B"}',1,8,8,(SELECT id FROM math),(SELECT id FROM src),'VIDYASETU_ORIGINAL','PUBLIC','PUBLISHED',NOW()),
  ('85000000-0000-0000-0000-000000000002','VS8M-LIN-002','Which equation represents: five more than twice a number is 17?','MCQ_SINGLE','MEDIUM','Twice the number is 2x; five more gives 2x + 5 = 17.', '{"option":"C"}',1,8,8,(SELECT id FROM math),(SELECT id FROM src),'VIDYASETU_ORIGINAL','PUBLIC','PUBLISHED',NOW()),
  ('85000000-0000-0000-0000-000000000003','VS8M-RAT-001','A notebook costs ₹48 after a 20% discount. What was its marked price?','MCQ_SINGLE','MEDIUM','₹48 is 80% of the marked price, so marked price = 48 / 0.8 = ₹60.', '{"option":"D"}',1,8,8,(SELECT id FROM math),(SELECT id FROM src),'VIDYASETU_ORIGINAL','REGISTERED','PUBLISHED',NOW()),
  ('85000000-0000-0000-0000-000000000004','VS8M-GEO-001','The angles of a quadrilateral add up to how many degrees?','MCQ_SINGLE','FOUNDATION','A quadrilateral can be divided into two triangles, so 2 × 180° = 360°.', '{"option":"C"}',1,8,8,(SELECT id FROM math),(SELECT id FROM src),'VIDYASETU_ORIGINAL','PUBLIC','PUBLISHED',NOW()),
  ('85000000-0000-0000-0000-000000000005','VS8S-FRC-001','Why does a bicycle eventually slow down when you stop pedalling?','MCQ_SINGLE','MEDIUM','Friction and air resistance oppose motion and reduce the bicycle’s speed.', '{"option":"B"}',1,8,8,(SELECT id FROM science),(SELECT id FROM src),'VIDYASETU_ORIGINAL','PUBLIC','PUBLISHED',NOW()),
  ('85000000-0000-0000-0000-000000000006','VS8S-CEL-001','Which structure controls most activities of a cell?','MCQ_SINGLE','FOUNDATION','The nucleus contains genetic material and controls many cell activities.', '{"option":"A"}',1,8,8,(SELECT id FROM science),(SELECT id FROM src),'VIDYASETU_ORIGINAL','REGISTERED','PUBLISHED',NOW()),
  ('85000000-0000-0000-0000-000000000007','VS8E-GRM-001','Choose the sentence with correct subject–verb agreement.','MCQ_SINGLE','MEDIUM','A singular subject takes a singular verb: “The list of books is on the table.”', '{"option":"C"}',1,8,8,(SELECT id FROM english),(SELECT id FROM src),'VIDYASETU_ORIGINAL','PUBLIC','PUBLISHED',NOW()),
  ('85000000-0000-0000-0000-000000000008','VS8E-VOC-001','Which word is closest in meaning to “resilient”?','MCQ_SINGLE','MEDIUM','Resilient means able to recover or adapt after difficulty.', '{"option":"D"}',1,8,8,(SELECT id FROM english),(SELECT id FROM src),'VIDYASETU_ORIGINAL','REGISTERED','PUBLISHED',NOW())
ON CONFLICT (public_code) DO NOTHING;

INSERT INTO learning_question_options (question_id, option_key, option_text, sort_order)
SELECT q.id, v.option_key, v.option_text, v.sort_order
FROM learning_questions q
JOIN (VALUES
  ('VS8M-LIN-001','A','3',1),('VS8M-LIN-001','B','5',2),('VS8M-LIN-001','C','8',3),('VS8M-LIN-001','D','15',4),
  ('VS8M-LIN-002','A','5x + 2 = 17',1),('VS8M-LIN-002','B','2x - 5 = 17',2),('VS8M-LIN-002','C','2x + 5 = 17',3),('VS8M-LIN-002','D','5x + 17 = 2',4),
  ('VS8M-RAT-001','A','₹50',1),('VS8M-RAT-001','B','₹54',2),('VS8M-RAT-001','C','₹58',3),('VS8M-RAT-001','D','₹60',4),
  ('VS8M-GEO-001','A','180°',1),('VS8M-GEO-001','B','270°',2),('VS8M-GEO-001','C','360°',3),('VS8M-GEO-001','D','540°',4),
  ('VS8S-FRC-001','A','Gravity stops acting',1),('VS8S-FRC-001','B','Friction and air resistance oppose motion',2),('VS8S-FRC-001','C','The mass becomes smaller',3),('VS8S-FRC-001','D','The wheels lose all energy instantly',4),
  ('VS8S-CEL-001','A','Nucleus',1),('VS8S-CEL-001','B','Cell wall',2),('VS8S-CEL-001','C','Vacuole',3),('VS8S-CEL-001','D','Cytoplasm only',4),
  ('VS8E-GRM-001','A','The list of books are on the table.',1),('VS8E-GRM-001','B','The students in the class studies daily.',2),('VS8E-GRM-001','C','The list of books is on the table.',3),('VS8E-GRM-001','D','Each of the players have a badge.',4),
  ('VS8E-VOC-001','A','Fragile',1),('VS8E-VOC-001','B','Uncertain',2),('VS8E-VOC-001','C','Silent',3),('VS8E-VOC-001','D','Able to recover',4)
) AS v(code, option_key, option_text, sort_order) ON q.public_code=v.code
ON CONFLICT (question_id, option_key) DO NOTHING;

INSERT INTO learning_question_boards (question_id, board_id)
SELECT q.id, b.id
FROM learning_questions q
CROSS JOIN education_boards b
WHERE q.public_code LIKE 'VS8%'
  AND b.code='COMMON'
ON CONFLICT DO NOTHING;

WITH math AS (
  SELECT id FROM subjects WHERE upper(code) IN ('MATH','MATHS','MATHEMATICS') ORDER BY id LIMIT 1
)
INSERT INTO learning_assessments
  (id, public_slug, title, summary, assessment_type, visibility, review_status,
   class_min, class_max, subject_id, time_limit_mins, passing_pct, max_attempts,
   shuffle_questions, is_featured_public, published_at)
VALUES
  ('86000000-0000-0000-0000-000000000001','class-8-maths-quick-practice','Class 8 Mathematics · Quick Practice','A short VidyaSetu Original practice set covering equations, percentages and quadrilateral basics.','PRACTICE','PUBLIC','PUBLISHED',8,8,(SELECT id FROM math),10,40,NULL,FALSE,TRUE,NOW())
ON CONFLICT (public_slug) DO NOTHING;

INSERT INTO learning_assessment_boards (assessment_id, board_id)
SELECT a.id, b.id
FROM learning_assessments a
JOIN education_boards b ON b.code='COMMON'
WHERE a.public_slug='class-8-maths-quick-practice'
ON CONFLICT DO NOTHING;

INSERT INTO learning_assessment_questions (assessment_id, question_id, sort_order)
SELECT a.id, q.id, v.sort_order
FROM learning_assessments a
JOIN (VALUES
  ('VS8M-LIN-001',1),('VS8M-LIN-002',2),('VS8M-RAT-001',3),('VS8M-GEO-001',4)
) AS v(code, sort_order) ON TRUE
JOIN learning_questions q ON q.public_code=v.code
WHERE a.public_slug='class-8-maths-quick-practice'
ON CONFLICT (assessment_id, question_id) DO NOTHING;

COMMENT ON TABLE learning_questions IS 'Structured VidyaSetu question bank with board/class/source governance.';
COMMENT ON TABLE learning_assessments IS 'Practice, chapter, unit and mock assessments built from the structured question bank.';
COMMENT ON TABLE student_learning_attempts IS 'Student attempts for Learning Platform assessments; isolated from competition attempts.';
COMMENT ON TABLE learning_source_intake IS 'Governed discovery/licence/content-review queue for NROER and other approved OER sources.';

COMMIT;
