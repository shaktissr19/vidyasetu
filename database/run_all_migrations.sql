Warning: truncated output (original token count: 33997)
Total output lines: 2497

-- ============================================================
-- 001_users.sql
-- Tables: users, otp_requests, refresh_tokens
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Enum types ──────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('STUDENT', 'SCHOOL_ADMIN', 'PARENT', 'SUPER_ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Shared trigger function: update updated_at ──────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── users ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  mobile           VARCHAR(15) NOT NULL UNIQUE,
  name             VARCHAR(120),
  role             user_role   NOT NULL DEFAULT 'STUDENT',
  status           user_status NOT NULL DEFAULT 'ACTIVE',
  language         VARCHAR(5)  NOT NULL DEFAULT 'hi'
                     CHECK (language IN ('hi','en','ta','te','mr','bn','gu','kn','or')),
  profile_photo    TEXT,
  last_login_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_mobile ON users(mobile);
CREATE INDEX IF NOT EXISTS idx_users_role   ON users(role);

CREATE OR REPLACE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE  users           IS 'All platform users across roles';
COMMENT ON COLUMN users.language  IS 'ISO 639-1 code; hi=Hindi default for Bharat';

-- ── otp_requests ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS otp_requests (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  mobile       VARCHAR(15) NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address   VARCHAR(45),
  user_agent   TEXT
);

CREATE INDEX IF NOT EXISTS idx_otp_requests_mobile ON otp_requests(mobile);
CREATE INDEX IF NOT EXISTS idx_otp_requests_time   ON otp_requests(requested_at);

COMMENT ON TABLE otp_requests IS 'Audit log of every OTP send; used for rate-limit checks';

-- ── refresh_tokens ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   VARCHAR(64) NOT NULL UNIQUE,
  device_info  TEXT,
  ip_address   VARCHAR(45),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rt_user_id    ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_rt_token_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_rt_expires    ON refresh_tokens(expires_at);

COMMENT ON TABLE  refresh_tokens            IS 'JWT refresh tokens; revoked_at NULL means active';
COMMENT ON COLUMN refresh_tokens.token_hash IS 'SHA-256 hex of the raw JWT refresh token';
-- ============================================================
-- 002_schools.sql
-- Tables: schools, school_classes
-- ============================================================

DO $$ BEGIN
  CREATE TYPE school_status AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE school_plan AS ENUM ('FREE', 'BASIC', 'PRO', 'ENTERPRISE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── schools ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS schools (
  id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              VARCHAR(200)  NOT NULL,
  name_hi           VARCHAR(200),                      -- Hindi name for display
  udise_code        VARCHAR(20)   UNIQUE,              -- Govt school identifier
  admin_user_id     UUID          NOT NULL REFERENCES users(id),
  status            school_status NOT NULL DEFAULT 'PENDING',
  plan              school_plan   NOT NULL DEFAULT 'FREE',

  -- Location
  address           TEXT,
  city              VARCHAR(100),
  district          VARCHAR(100),
  state             VARCHAR(100)  NOT NULL DEFAULT 'Uttar Pradesh',
  pincode           VARCHAR(10),
  lat               NUMERIC(10,7),
  lng               NUMERIC(10,7),

  -- Contact
  mobile            VARCHAR(15),
  email             VARCHAR(150),
  website           VARCHAR(255),

  -- Stats (denormalised counters — updated via triggers)
  total_students    INTEGER       NOT NULL DEFAULT 0,
  total_teachers    INTEGER       NOT NULL DEFAULT 0,

  -- Subscription
  plan_started_at   TIMESTAMPTZ,
  plan_expires_at   TIMESTAMPTZ,
  trial_ends_at     TIMESTAMPTZ,

  -- Meta
  academic_year     VARCHAR(10)   NOT NULL DEFAULT '2025-26',
  logo_url          TEXT,
  settings          JSONB         NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schools_status        ON schools(status);
CREATE INDEX IF NOT EXISTS idx_schools_state         ON schools(state);
CREATE INDEX IF NOT EXISTS idx_schools_admin_user_id ON schools(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_schools_udise         ON schools(udise_code);

CREATE OR REPLACE TRIGGER trg_schools_updated_at
  BEFORE UPDATE ON schools
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE  schools             IS 'Partner schools onboarded to VidyaSetu';
COMMENT ON COLUMN schools.udise_code  IS 'UDISE+ unique identifier assigned by Govt of India';
COMMENT ON COLUMN schools.settings    IS 'JSON bag: fee_cycle, whatsapp_enabled, etc.';

-- ── school_classes ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS school_classes (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id      UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_name     VARCHAR(10) NOT NULL,   -- '6', '7', '8', '9', '10', '11', '12'
  section        VARCHAR(5)  NOT NULL DEFAULT 'A',
  academic_year  VARCHAR(10) NOT NULL DEFAULT '2025-26',
  room_number    VARCHAR(20),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (school_id, class_name, section, academic_year)
);

CREATE INDEX IF NOT EXISTS idx_school_classes_school ON school_classes(school_id);
CREATE INDEX IF NOT EXISTS idx_school_classes_name   ON school_classes(class_name);

COMMENT ON TABLE school_classes IS 'Each class-section combination in a school per academic year';
-- ============================================================
-- 003_students.sql
-- Tables: students, parent_student_links
-- ============================================================

DO $$ BEGIN
  CREATE TYPE student_status AS ENUM ('ACTIVE', 'INACTIVE', 'TRANSFERRED', 'GRADUATED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE gender_type AS ENUM ('MALE', 'FEMALE', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── students ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS students (
  id              UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID           NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  school_id       UUID           NOT NULL REFERENCES schools(id),
  class_id        UUID           NOT NULL REFERENCES school_classes(id),
  roll_number     VARCHAR(20),
  academic_year   VARCHAR(10)    NOT NULL DEFAULT '2025-26',
  date_of_birth   DATE,
  gender          gender_type,
  status          student_status NOT NULL DEFAULT 'ACTIVE',
  admission_date  DATE           NOT NULL DEFAULT CURRENT_DATE,

  -- Gamification (denormalised for fast leaderboard reads)
  xp_total        INTEGER        NOT NULL DEFAULT 0,
  xp_level        INTEGER        NOT NULL DEFAULT 1,
  streak_current  INTEGER        NOT NULL DEFAULT 0,
  streak_best     INTEGER        NOT NULL DEFAULT 0,
  last_activity   DATE,

  -- Parent link (primary parent mobile for quick lookups)
  primary_parent_mobile VARCHAR(15),

  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  UNIQUE (school_id, class_id, roll_number, academic_year)
);

CREATE INDEX IF NOT EXISTS idx_students_user_id    ON students(user_id);
CREATE INDEX IF NOT EXISTS idx_students_school_id  ON students(school_id);
CREATE INDEX IF NOT EXISTS idx_students_class_id   ON students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_xp_total   ON students(xp_total DESC);
CREATE INDEX IF NOT EXISTS idx_students_status     ON students(status);

CREATE OR REPLACE TRIGGER trg_students_updated_at
  BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE  students              IS 'Student profiles; one row per enrollment';
COMMENT ON COLUMN students.xp_total    IS 'Denormalised XP; updated by trigger on xp_events insert';
COMMENT ON COLUMN students.xp_level    IS 'Level derived from xp_total; 1 level per 500 XP';
COMMENT ON COLUMN students.streak_current IS 'Consecutive active days; reset by nightly cron';

-- ── parent_student_links ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS parent_student_links (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_user_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id      UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  relation        VARCHAR(30) NOT NULL DEFAULT 'PARENT',  -- FATHER, MOTHER, GUARDIAN
  is_primary      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (parent_user_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_psl_parent_user_id ON parent_student_links(parent_user_id);
CREATE INDEX IF NOT EXISTS idx_psl_student_id     ON parent_student_links(student_id);

COMMENT ON TABLE parent_student_links IS 'Many-to-many: a parent can have multiple children; a student can have multiple parents';
-- ============================================================
-- 004_teachers.sql
-- Tables: teachers, teacher_assignments
-- ============================================================

DO $$ BEGIN
  CREATE TYPE teacher_status AS ENUM ('ACTIVE', 'INACTIVE', 'ON_LEAVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── teachers ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS teachers (
  id              UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID           NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  school_id       UUID           NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  employee_id     VARCHAR(30),
  qualification   VARCHAR(200),
  experience_yrs  SMALLINT       DEFAULT 0,
  status          teacher_status NOT NULL DEFAULT 'ACTIVE',
  joined_date     DATE           NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  UNIQUE (school_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_teachers_user_id   ON teachers(user_id);
CREATE INDEX IF NOT EXISTS idx_teachers_school_id ON teachers(school_id);
CREATE INDEX IF NOT EXISTS idx_teachers_status    ON teachers(status);

CREATE OR REPLACE TRIGGER trg_teachers_updated_at
  BEFORE UPDATE ON teachers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE teachers IS 'Teacher profiles linked to a school';

-- ── teacher_assignments ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS teacher_assignments (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id     UUID        NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  school_id      UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id       UUID        NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  subject_code   VARCHAR(20) NOT NULL,  -- matches subjects.code
  academic_year  VARCHAR(10) NOT NULL DEFAULT '2025-26',
  is_class_teacher BOOLEAN   NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (teacher_id, class_id, subject_code, academic_year)
);

CREATE INDEX IF NOT EXISTS idx_ta_teacher_id ON teacher_assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_ta_class_id   ON teacher_assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_ta_school_id  ON teacher_assignments(school_id);

COMMENT ON TABLE  teacher_assignments                IS 'Which teacher teaches which subject in which class';
COMMENT ON COLUMN teacher_assignments.is_class_teacher IS 'Class teacher flag — used for parent messaging routing';
-- ============================================================
-- 005_attendance.sql
-- Tables: attendance, attendance_monthly_summary
-- Trigger: refresh_attendance_summary
-- ============================================================

DO $$ BEGIN
  CREATE TYPE attendance_status AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'HOLIDAY', 'HALF_DAY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── attendance ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS attendance (
  id           UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id   UUID              NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id     UUID              NOT NULL REFERENCES school_classes(id),
  school_id    UUID              NOT NULL REFERENCES schools(id),
  date         DATE              NOT NULL,
  status       attendance_status NOT NULL,
  remark       VARCHAR(200),
  marked_by    UUID              REFERENCES users(id),  -- teacher who marked
  created_at   TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

  UNIQUE (student_id, date)  -- one record per student per day
);

CREATE INDEX IF NOT EXISTS idx_att_student_id ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_att_class_id   ON attendance(class_id);
CREATE INDEX IF NOT EXISTS idx_att_school_id  ON attendance(school_id);
CREATE INDEX IF NOT EXISTS idx_att_date       ON attendance(date DESC);
CREATE INDEX IF NOT EXISTS idx_att_status     ON attendance(status);

COMMENT ON TABLE attendance IS 'Append-only daily attendance records — never updated after creation';

-- ── attendance_monthly_summary ───────────────────────────────

CREATE TABLE IF NOT EXISTS attendance_monthly_summary (
  id            UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id    UUID    NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_id     UUID    NOT NULL REFERENCES schools(id),
  year          SMALLINT NOT NULL,
  month         SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  working_days  SMALLINT NOT NULL DEFAULT 0,
  present_days  SMALLINT NOT NULL DEFAULT 0,
  absent_days   SMALLINT NOT NULL DEFAULT 0,
  late_days     SMALLINT NOT NULL DEFAULT 0,
  half_days     SMALLINT NOT NULL DEFAULT 0,
  percentage    NUMERIC(5,2) NOT NULL DEFAULT 0,

  UNIQUE (student_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_ams_student_id ON attendance_monthly_summary(student_id);
CREATE INDEX IF NOT EXISTS idx_ams_school_id  ON attendance_monthly_summary(school_id);
CREATE INDEX IF NOT EXISTS idx_ams_year_month ON attendance_monthly_summary(year, month);

COMMENT ON TABLE attendance_monthly_summary IS 'Denormalised monthly rollup; rebuilt on each attendance insert';

-- ── Trigger: rebuild monthly summary after each attendance row ──

CREATE OR REPLACE FUNCTION refresh_attendance_summary()
RETURNS TRIGGER AS $$
DECLARE
  v_year  SMALLINT := EXTRACT(YEAR  FROM NEW.date);
  v_month SMALLINT := EXTRACT(MONTH FROM NEW.date);
BEGIN
  INSERT INTO attendance_monthly_summary
    (student_id, school_id, year, month, working_days, present_days, absent_days, late_days, half_days, percentage)
  SELECT
    a.student_id,
    a.school_id,
    v_year,
    v_month,
    COUNT(*) FILTER (WHERE a.status != 'HOLIDAY')                      AS working_days,
    COUNT(*) FILTER (WHERE a.status = 'PRESENT')                       AS present_days,
    COUNT(*) FILTER (WHERE a.status = 'ABSENT')                        AS absent_days,
    COUNT(*) FILTER (WHERE a.status = 'LATE')                          AS late_days,
    COUNT(*) FILTER (WHERE a.status = 'HALF_DAY')                      AS half_days,
    ROUND(
      COUNT(*) FILTER (WHERE a.status IN ('PRESENT','LATE','HALF_DAY'))::DECIMAL
      / NULLIF(COUNT(*) FILTER (WHERE a.status != 'HOLIDAY'), 0) * 100
    , 2)                                                               AS percentage
  FROM attendance a
  WHERE a.student_id = NEW.student_id
    AND EXTRACT(YEAR  FROM a.date) = v_year
    AND EXTRACT(MONTH FROM a.date) = v_month
  GROUP BY a.student_id, a.school_id
  ON CONFLICT (student_id, year, month) DO UPDATE SET
    working_days = EXCLUDED.working_days,
    present_days = EXCLUDED.present_days,
    absent_days  = EXCLUDED.absent_days,
    late_days    = EXCLUDED.late_days,
    half_days    = EXCLUDED.half_days,
    percentage   = EXCLUDED.percentage;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_attendance_summary
  AFTER INSERT OR UPDATE ON attendance
  FOR EACH ROW EXECUTE FUNCTION refresh_attendance_summary();
-- ============================================================
-- 006_fees.sql
-- Tables: fee_structures, fee_invoices, fee_payments
-- Trigger: update_invoice_after_payment
-- ============================================================

DO $$ BEGIN
  CREATE TYPE fee_status   AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'WAIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_mode AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER', 'RAZORPAY', 'CHEQUE', 'DD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── fee_structures ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fee_structures (
  id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id      UUID         NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_name     VARCHAR(10)  NOT NULL,
  academic_year  VARCHAR(10)  NOT NULL DEFAULT '2025-26',
  term           SMALLINT     NOT NULL CHECK (term BETWEEN 1 AND 4),
  fee_head       VARCHAR(100) NOT NULL,   -- 'Tuition', 'Transport', 'Sports', etc.
  amount         NUMERIC(10,2) NOT NULL,
  due_date       DATE,
  is_optional    BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  UNIQUE (school_id, class_name, academic_year, term, fee_head)
);

CREATE INDEX IF NOT EXISTS idx_fs_school_id ON fee_structures(school_id);
CREATE INDEX IF NOT EXISTS idx_fs_class     ON fee_structures(class_name, academic_year);

CREATE OR REPLACE TRIGGER trg_fee_structures_updated_at
  BEFORE UPDATE ON fee_structures
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE fee_structures IS 'School-defined fee heads per class per term';

-- ── fee_invoices ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fee_invoices (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id       UUID         NOT NULL REFERENCES schools(id),
  student_id      UUID         NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  academic_year   VARCHAR(10)  NOT NULL DEFAULT '2025-26',
  term            SMALLINT     NOT NULL CHECK (term BETWEEN 1 AND 4),
  invoice_number  VARCHAR(50)  UNIQUE,
  amount_due      NUMERIC(10,2) NOT NULL,
  amount_paid     NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount_waived   NUMERIC(10,2) NOT NULL DEFAULT 0,
  status          fee_status   NOT NULL DEFAULT 'PENDING',
  due_date        DATE,
  razorpay_order_id VARCHAR(100) UNIQUE,
  razorpay_payment_link TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  UNIQUE (student_id, academic_year, term)
);

CREATE INDEX IF NOT EXISTS idx_fi_school_id     ON fee_invoices(school_id);
CREATE INDEX IF NOT EXISTS idx_fi_student_id    ON fee_invoices(student_id);
CREATE INDEX IF NOT EXISTS idx_fi_status        ON fee_invoices(status);
CREATE INDEX IF NOT EXISTS idx_fi_academic_year ON fee_invoices(academic_year, term);
CREATE INDEX IF NOT EXISTS idx_fi_due_date      ON fee_invoices(due_date);

CREATE OR REPLACE TRIGGER trg_fee_invoices_updated_at
  BEFORE UPDATE ON fee_invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE fee_invoices IS 'One invoice per student per term; status managed by trigger';

-- ── fee_payments ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fee_payments (
  id                   UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id           UUID          NOT NULL REFERENCES fee_invoices(id) ON DELETE CASCADE,
  school_id            UUID          NOT NULL REFERENCES schools(id),
  student_id           UUID          NOT NULL REFERENCES students(id),
  amount               NUMERIC(10,2) NOT NULL,
  mode                 payment_mode  NOT NULL DEFAULT 'CASH',
  razorpay_payment_id  VARCHAR(100),
  transaction_ref      VARCHAR(100),
  receipt_url          TEXT,
  collected_by         UUID          REFERENCES users(id),  -- school admin who recorded it
  paid_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  notes                TEXT,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
  -- Append-only: no UPDATE trigger needed
);

CREATE INDEX IF NOT EXISTS idx_fp_invoice_id  ON fee_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_fp_student_id  ON fee_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_fp_school_id   ON fee_payments(school_id);
CREATE INDEX IF NOT EXISTS idx_fp_paid_at     ON fee_payments(paid_at DESC);

COMMENT ON TABLE fee_payments IS 'Append-only payment receipts; each insert updates invoice via trigger';

-- ── Trigger: recompute invoice status after each payment ──────

CREATE OR REPLACE FUNCTION update_invoice_after_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_total_paid    NUMERIC(10,2);
  v_amount_due    NUMERIC(10,2);
  v_amount_waived NUMERIC(10,2);
  v_new_status    fee_status;
BEGIN
  SELECT SUM(amount) INTO v_total_paid
  FROM fee_payments
  WHERE invoice_id = NEW.invoice_id;

  SELECT amount_due, amount_waived
  INTO   v_amount_due, v_amount_waived
  FROM   fee_invoices
  WHERE  id = NEW.invoice_id;

  IF v_total_paid + v_amount_waived >= v_amount_due THEN
    v_new_status := 'PAID';
  ELSIF v_total_paid > 0 THEN
    v_new_status := 'PARTIAL';
  ELSE
    v_new_status := 'PENDING';
  END IF;

  UPDATE fee_invoices
  SET amount_paid = v_total_paid,
      status      = v_new_status,
      updated_at  = NOW()
  WHERE id = NEW.invoice_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_payment_update_invoice
  AFTER INSERT ON fee_payments
  FOR EACH ROW EXECUTE FUNCTION update_invoice_after_payment();
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

  UNIQUE (attempt_id, question_id…13997 tokens truncated…s IS 'Extensible national/state/other board registry. Content is not limited to CBSE.';
COMMENT ON TABLE curriculum_versions IS 'Board-specific curriculum versions by academic year.';
COMMENT ON TABLE learning_content_sources IS 'Source and licence policy registry. NROER resources require item-level licence verification before import/adaptation.';
COMMENT ON TABLE learning_resources IS 'Canonical cross-board public/registered learning and growth library resources.';
COMMENT ON COLUMN learning_resources.visibility IS 'PUBLIC is discoverable without login; REGISTERED/CLASS_ONLY/SCHOOL_ONLY require authenticated delivery policies.';
COMMENT ON COLUMN learning_resources.licence IS 'Per-resource licence is mandatory; never infer reuse rights from the source name alone.';

COMMIT;




-- Minimal grade catalog prerequisite for a clean consolidated demo database.
-- Production receives the full importer/backfill from migration 023 separately.
BEGIN;
CREATE TABLE IF NOT EXISTS education_grade_levels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(24) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL,
  short_name VARCHAR(30) NOT NULL,
  stage VARCHAR(30) NOT NULL CHECK (stage IN ('EARLY_YEARS','FOUNDATIONAL','PRIMARY','MIDDLE','SECONDARY','SENIOR_SECONDARY')),
  class_number SMALLINT CHECK (class_number IS NULL OR class_number BETWEEN 1 AND 12),
  sort_order SMALLINT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE OR REPLACE TRIGGER trg_education_grade_levels_updated_at
  BEFORE UPDATE ON education_grade_levels FOR EACH ROW EXECUTE FUNCTION update_updated_at();
INSERT INTO education_grade_levels (id,code,name,short_name,stage,class_number,sort_order) VALUES
  ('87000000-0000-0000-0000-000000000001','PRE_NURSERY','Pre-Nursery','Pre-Nursery','EARLY_YEARS',NULL,1),
  ('87000000-0000-0000-0000-000000000002','NURSERY','Nursery','Nursery','EARLY_YEARS',NULL,2),
  ('87000000-0000-0000-0000-000000000003','LKG','Lower Kindergarten','LKG','FOUNDATIONAL',NULL,3),
  ('87000000-0000-0000-0000-000000000004','UKG','Upper Kindergarten','UKG','FOUNDATIONAL',NULL,4),
  ('87000000-0000-0000-0000-000000000005','CLASS_1','Class 1','Class 1','FOUNDATIONAL',1,5),
  ('87000000-0000-0000-0000-000000000006','CLASS_2','Class 2','Class 2','FOUNDATIONAL',2,6),
  ('87000000-0000-0000-0000-000000000007','CLASS_3','Class 3','Class 3','PRIMARY',3,7),
  ('87000000-0000-0000-0000-000000000008','CLASS_4','Class 4','Class 4','PRIMARY',4,8),
  ('87000000-0000-0000-0000-000000000009','CLASS_5','Class 5','Class 5','PRIMARY',5,9),
  ('87000000-0000-0000-0000-000000000010','CLASS_6','Class 6','Class 6','MIDDLE',6,10),
  ('87000000-0000-0000-0000-000000000011','CLASS_7','Class 7','Class 7','MIDDLE',7,11),
  ('87000000-0000-0000-0000-000000000012','CLASS_8','Class 8','Class 8','MIDDLE',8,12),
  ('87000000-0000-0000-0000-000000000013','CLASS_9','Class 9','Class 9','SECONDARY',9,13),
  ('87000000-0000-0000-0000-000000000014','CLASS_10','Class 10','Class 10','SECONDARY',10,14),
  ('87000000-0000-0000-0000-000000000015','CLASS_11','Class 11','Class 11','SENIOR_SECONDARY',11,15),
  ('87000000-0000-0000-0000-000000000016','CLASS_12','Class 12','Class 12','SENIOR_SECONDARY',12,16)
ON CONFLICT (code) DO NOTHING;
COMMIT;

-- Migration 022: question and assessment tables required by concept mappings.
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


-- Migration 026: canonical learning concepts required by syllabus verification.
-- ============================================================
-- 026_learning_concepts_mastery.sql
-- VidyaSetu canonical concept identity + concept-level mastery.
-- Additive/idempotent. No destructive data changes.
--
-- IMPORTANT:
-- - This migration creates the schema only. It does not publish content.
-- - Canonical concept rows are synchronized separately from the versioned
--   syllabus registry using syncLearningConceptRegistry.ts.
-- - Existing resource-level progress and legacy content tables are preserved.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS learning_concepts (
  id                 UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  code               VARCHAR(180) NOT NULL UNIQUE,
  name               VARCHAR(300) NOT NULL,
  name_hi            VARCHAR(300),
  node_type          VARCHAR(40)  NOT NULL DEFAULT 'CHAPTER_CONCEPT',
  academic_year      VARCHAR(10)  NOT NULL,
  grade_id           UUID         NOT NULL REFERENCES education_grade_levels(id) ON DELETE RESTRICT,
  subject_id         UUID         REFERENCES subjects(id) ON DELETE SET NULL,
  subject_code       VARCHAR(60)  NOT NULL,
  chapter_code       VARCHAR(100),
  chapter_title      VARCHAR(300),
  registry_status    VARCHAR(60)  NOT NULL DEFAULT 'DRAFT_FOR_ACADEMIC_REVIEW',
  registry_source    VARCHAR(220) NOT NULL,
  sequence           SMALLINT     NOT NULL DEFAULT 0,
  is_active          BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Keep the migration idempotent for any non-production environment that may
-- have applied an earlier draft of migration 026 before node types were added.
ALTER TABLE learning_concepts
  ADD COLUMN IF NOT EXISTS node_type VARCHAR(40) NOT NULL DEFAULT 'CHAPTER_CONCEPT';

CREATE OR REPLACE TRIGGER trg_learning_concepts_updated_at
  BEFORE UPDATE ON learning_concepts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_learning_concepts_grade_subject
  ON learning_concepts(grade_id, subject_code, sequence)
  WHERE is_active=TRUE;
CREATE INDEX IF NOT EXISTS idx_learning_concepts_subject_id
  ON learning_concepts(subject_id)
  WHERE subject_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_learning_concepts_chapter
  ON learning_concepts(chapter_code, sequence)
  WHERE chapter_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_learning_concepts_node_type
  ON learning_concepts(node_type, grade_id, subject_code)
  WHERE is_active=TRUE;

-- A resource, question or assessment may legitimately span more than one
-- canonical syllabus concept. Do not collapse this to a single concept_id.
CREATE TABLE IF NOT EXISTS learning_resource_concepts (
  resource_id UUID NOT NULL REFERENCES learning_resources(id) ON DELETE CASCADE,
  concept_id  UUID NOT NULL REFERENCES learning_concepts(id) ON DELETE CASCADE,
  is_primary  BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (resource_id, concept_id)
);
CREATE INDEX IF NOT EXISTS idx_lrc_concept ON learning_resource_concepts(concept_id, resource_id);

CREATE TABLE IF NOT EXISTS learning_question_concepts (
  question_id UUID NOT NULL REFERENCES learning_questions(id) ON DELETE CASCADE,
  concept_id  UUID NOT NULL REFERENCES learning_concepts(id) ON DELETE CASCADE,
  is_primary  BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (question_id, concept_id)
);
CREATE INDEX IF NOT EXISTS idx_lqc_concept ON learning_question_concepts(concept_id, question_id);

CREATE TABLE IF NOT EXISTS learning_assessment_concepts (
  assessment_id UUID NOT NULL REFERENCES learning_assessments(id) ON DELETE CASCADE,
  concept_id    UUID NOT NULL REFERENCES learning_concepts(id) ON DELETE CASCADE,
  is_primary    BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order    SMALLINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (assessment_id, concept_id)
);
CREATE INDEX IF NOT EXISTS idx_lac_concept ON learning_assessment_concepts(concept_id, assessment_id);

-- Canonical progress belongs to the concept, not to an individual language,
-- article, video or quiz. Existing resource progress remains as a detailed
-- activity signal and will be bridged into this table by the Learning Hub.
CREATE TABLE IF NOT EXISTS student_concept_progress (
  student_id              UUID         NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  concept_id              UUID         NOT NULL REFERENCES learning_concepts(id) ON DELETE CASCADE,
  state                   VARCHAR(24)  NOT NULL DEFAULT 'NOT_STARTED'
    CHECK (state IN ('NOT_STARTED','LEARNING','PRACTISING','NEEDS_REVIEW','MASTERED')),
  exposure_pct            NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (exposure_pct BETWEEN 0 AND 100),
  resource_completion_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (resource_completion_pct BETWEEN 0 AND 100),
  practice_best_pct       NUMERIC(5,2) CHECK (practice_best_pct IS NULL OR practice_best_pct BETWEEN 0 AND 100),
  mastery_pct             NUMERIC(5,2) CHECK (mastery_pct IS NULL OR mastery_pct BETWEEN 0 AND 100),
  practice_attempts       INTEGER      NOT NULL DEFAULT 0 CHECK (practice_attempts >= 0),
  mastery_attempts        INTEGER      NOT NULL DEFAULT 0 CHECK (mastery_attempts >= 0),
  needs_review            BOOLEAN      NOT NULL DEFAULT FALSE,
  first_started_at        TIMESTAMPTZ,
  last_activity_at        TIMESTAMPTZ,
  completed_at            TIMESTAMPTZ,
  mastered_at             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, concept_id)
);

CREATE OR REPLACE TRIGGER trg_student_concept_progress_updated_at
  BEFORE UPDATE ON student_concept_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_scp_student_recent
  ON student_concept_progress(student_id, last_activity_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_scp_student_state
  ON student_concept_progress(student_id, state, needs_review);
CREATE INDEX IF NOT EXISTS idx_scp_concept_mastery
  ON student_concept_progress(concept_id, mastery_pct)
  WHERE mastery_pct IS NOT NULL;

COMMENT ON TABLE learning_concepts IS
  'Canonical syllabus concept/strand identities. Language and media assets map to these nodes rather than becoming separate learning identities.';
COMMENT ON COLUMN learning_concepts.node_type IS
  'Registry node shape, for example CHAPTER_CONCEPT, SKILL_STRAND, SUBJECT_CONCEPT, PROJECT_CONCEPT or STRAND.';
COMMENT ON TABLE learning_resource_concepts IS
  'Many-to-many mapping because a learning resource may support one or several canonical concepts.';
COMMENT ON TABLE learning_question_concepts IS
  'Many-to-many mapping used for concept-level diagnostic and mastery evidence.';
COMMENT ON TABLE learning_assessment_concepts IS
  'Many-to-many mapping between assessments and the concepts they measure.';
COMMENT ON TABLE student_concept_progress IS
  'Canonical learner progress/mastery state per concept. Existing resource-level progress is retained as an input signal.';

COMMIT;


BEGIN;
ALTER TABLE curriculum_subjects ALTER COLUMN class_name TYPE VARCHAR(24);
ALTER TABLE curriculum_versions ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE curriculum_versions ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES users(id);
ALTER TABLE curriculum_versions ADD COLUMN IF NOT EXISTS review_note TEXT;
ALTER TABLE curriculum_topics ADD COLUMN IF NOT EXISTS is_retired BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE curriculum_topics ADD COLUMN IF NOT EXISTS evidence_url TEXT;
ALTER TABLE curriculum_topics ADD COLUMN IF NOT EXISTS page_reference VARCHAR(100);
CREATE TABLE IF NOT EXISTS curriculum_topic_concepts (
 topic_id UUID NOT NULL REFERENCES curriculum_topics(id) ON DELETE CASCADE,
 concept_id UUID NOT NULL REFERENCES learning_concepts(id) ON DELETE RESTRICT,
 PRIMARY KEY(topic_id,concept_id)
);
CREATE TABLE IF NOT EXISTS student_learning_preferences (
 student_id UUID PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
 board_id UUID NOT NULL REFERENCES education_boards(id),
 grade_id UUID NOT NULL REFERENCES education_grade_levels(id),
 academic_year VARCHAR(10) NOT NULL CHECK(academic_year ~ '^20[0-9]{2}-[0-9]{2}$'),
 language VARCHAR(10) NOT NULL DEFAULT 'en' CHECK(language IN ('en','hi')),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Legacy ACTIVE records are deliberately not certified by this migration.
COMMENT ON COLUMN curriculum_versions.verified_at IS 'Academic reviewer confirmation; required in addition to ACTIVE for student syllabus visibility.';
COMMIT;


BEGIN;

CREATE TABLE IF NOT EXISTS syllabus_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id UUID NOT NULL REFERENCES education_boards(id),
  academic_year VARCHAR(10) NOT NULL,
  grade_code VARCHAR(20) REFERENCES education_grade_levels(code),
  subject_id UUID REFERENCES subjects(id),
  title VARCHAR(240) NOT NULL,
  language VARCHAR(12) NOT NULL DEFAULT 'en',
  source_url TEXT NOT NULL,
  source_publisher VARCHAR(220),
  source_published_at DATE,
  source_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  storage_key TEXT NOT NULL,
  checksum_sha256 VARCHAR(64) NOT NULL,
  byte_size BIGINT NOT NULL CHECK (byte_size > 0),
  page_count INTEGER NOT NULL CHECK (page_count BETWEEN 1 AND 1000),
  extracted_text TEXT NOT NULL DEFAULT '',
  outline JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'REVIEW' CHECK (status IN ('REVIEW','APPROVED','REJECTED')),
  redistribution_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  redistribution_evidence_url TEXT,
  rights_reviewed_by UUID REFERENCES users(id),
  rights_reviewed_at TIMESTAMPTZ,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (board_id, academic_year, checksum_sha256)
);
CREATE INDEX IF NOT EXISTS idx_syllabus_documents_scope
  ON syllabus_documents(board_id, academic_year, grade_code, subject_id, status);
CREATE INDEX IF NOT EXISTS idx_syllabus_documents_checksum ON syllabus_documents(checksum_sha256);
CREATE OR REPLACE TRIGGER trg_syllabus_documents_updated_at
  BEFORE UPDATE ON syllabus_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE syllabus_documents IS 'Private source syllabus PDFs with provenance and reviewer-approved redistribution policy. Extracted outline is a candidate, not a verified curriculum.';
COMMIT;


-- Migration 055: syllabus publication and progress
-- 055: Versioned syllabus publication and separate student/teacher progress.
-- Existing curriculum rows and uploaded PDFs are preserved. Legacy active versions
-- are backfilled as published; unverified versions remain drafts.
BEGIN;

ALTER TABLE curriculum_versions
  ADD COLUMN IF NOT EXISTS medium VARCHAR(12) NOT NULL DEFAULT 'en'
    CHECK (medium IN ('en','hi')),
  ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1 CHECK (version_number > 0),
  ADD COLUMN IF NOT EXISTS publication_status VARCHAR(16) NOT NULL DEFAULT 'DRAFT'
    CHECK (publication_status IN ('DRAFT','REVIEWED','PUBLISHED','ARCHIVED')),
  ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS published_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

UPDATE curriculum_versions
SET publication_status = CASE WHEN status='ACTIVE' AND verified_at IS NOT NULL
  THEN 'PUBLISHED' ELSE 'DRAFT' END,
  reviewed_by = verified_by,
  published_by = verified_by,
  published_at = verified_at
WHERE publication_status='DRAFT';

-- Replace the original single-version constraint with immutable academic-year versions.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
    WHERE conrelid='curriculum_versions'::regclass AND contype='u'
      AND pg_get_constraintdef(oid) LIKE '%board_id, academic_year%'
  LOOP EXECUTE format('ALTER TABLE curriculum_versions DROP CONSTRAINT %I', c.conname); END LOOP;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_curriculum_versions_year_version
  ON curriculum_versions(board_id,academic_year,version_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_curriculum_versions_single_published
  ON curriculum_versions(board_id,academic_year,medium)
  WHERE publication_status='PUBLISHED';

ALTER TABLE syllabus_documents
  ADD COLUMN IF NOT EXISTS medium VARCHAR(12) NOT NULL DEFAULT 'en'
    CHECK (medium IN ('en','hi'));

-- Keep learner self-report separate from teacher class coverage. Rows hold IDs and
-- status only; no additional personal information is stored.
CREATE TABLE IF NOT EXISTS student_syllabus_progress (
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES curriculum_topics(id) ON DELETE CASCADE,
  student_status VARCHAR(16) NOT NULL DEFAULT 'NOT_STARTED'
    CHECK (student_status IN ('NOT_STARTED','IN_PROGRESS','COMPLETED','REVISED')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(student_id,topic_id)
);
CREATE INDEX IF NOT EXISTS idx_student_syllabus_progress_topic
  ON student_syllabus_progress(topic_id,student_status);

CREATE TABLE IF NOT EXISTS syllabus_class_coverage (
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_name VARCHAR(24) NOT NULL,
  section VARCHAR(40) NOT NULL DEFAULT '',
  topic_id UUID NOT NULL REFERENCES curriculum_topics(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'NOT_COVERED'
    CHECK (status IN ('NOT_COVERED','IN_PROGRESS','COVERED')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(school_id,class_name,section,topic_id)
);
CREATE INDEX IF NOT EXISTS idx_syllabus_class_coverage_topic
  ON syllabus_class_coverage(topic_id,status);

-- Explicit scope metadata for legacy content_items. NULL scope retains existing
-- public catalogue behavior; restricted visibility requires a complete scope.
ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS visibility VARCHAR(24) NOT NULL DEFAULT 'PUBLIC'
    CHECK (visibility IN ('PUBLIC','CLASS_RESTRICTED','SCHOOL_PRIVATE')),
  ADD COLUMN IF NOT EXISTS board_id UUID REFERENCES education_boards(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS grade_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS syllabus_topic_id UUID REFERENCES curriculum_topics(id) ON DELETE SET NULL;
DO $fix$ BEGIN
  ALTER TABLE content_items ADD CONSTRAINT content_items_restricted_scope_check
    CHECK ((visibility='PUBLIC') OR
      (visibility='CLASS_RESTRICTED' AND board_id IS NOT NULL AND grade_code IS NOT NULL AND subject_id IS NOT NULL) OR
      (visibility='SCHOOL_PRIVATE' AND school_id IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL;
END $fix$;
CREATE INDEX IF NOT EXISTS idx_content_items_visibility_scope
  ON content_items(visibility,board_id,grade_code,subject_id,school_id,status);

-- Reversible migration guidance is in 055_syllabus_publication_progress.rollback.sql.
COMMIT;



-- 056 curriculum framework manager, kept in sync with migrations/056_curriculum_framework_manager.sql
-- 056: Add explicit unit -> chapter -> topic framework without replacing the
-- stable curriculum UUIDs or the existing syllabus/content publication workflow.
BEGIN;

CREATE TABLE IF NOT EXISTS curriculum_chapters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  curriculum_unit_id UUID NOT NULL REFERENCES curriculum_units(id) ON DELETE CASCADE,
  title VARCHAR(220) NOT NULL,
  title_hi VARCHAR(220),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (curriculum_unit_id, title)
);

ALTER TABLE curriculum_topics
  ADD COLUMN IF NOT EXISTS chapter_id UUID REFERENCES curriculum_chapters(id) ON DELETE SET NULL;

-- Existing units functioned as chapters. Preserve every topic UUID and make its
-- current location explicit, so old syllabus pages and progress remain intact.
INSERT INTO curriculum_chapters(curriculum_unit_id,title,sort_order)
SELECT DISTINCT ON (cu.id) cu.id,cu.title,cu.sort_order
FROM curriculum_units cu
ORDER BY cu.id,cu.sort_order
ON CONFLICT (curriculum_unit_id,title) DO NOTHING;

UPDATE curriculum_topics ct
SET chapter_id=cc.id
FROM curriculum_chapters cc
WHERE ct.chapter_id IS NULL
  AND cc.curriculum_unit_id=ct.curriculum_unit_id
  AND cc.title=(SELECT cu.title FROM curriculum_units cu WHERE cu.id=ct.curriculum_unit_id);

DROP INDEX IF EXISTS uq_curriculum_versions_year_version;
CREATE UNIQUE INDEX IF NOT EXISTS uq_curriculum_versions_year_medium_version
  ON curriculum_versions(board_id,academic_year,medium,version_number);

UPDATE syllabus_documents
SET medium=CASE WHEN language ILIKE 'hi%' THEN 'hi' WHEN language ILIKE 'en%' THEN 'en' ELSE medium END
WHERE language ILIKE 'hi%' OR language ILIKE 'en%';

ALTER TABLE curriculum_versions
  ADD COLUMN IF NOT EXISTS source_hash VARCHAR(64)
    CHECK (source_hash IS NULL OR source_hash ~ '^[a-f0-9]{64}$');

CREATE TABLE IF NOT EXISTS curriculum_version_evidence (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  curriculum_version_id UUID NOT NULL REFERENCES curriculum_versions(id) ON DELETE CASCADE,
  syllabus_document_id UUID NOT NULL REFERENCES syllabus_documents(id) ON DELETE RESTRICT,
  attached_by UUID REFERENCES users(id) ON DELETE SET NULL,
  attached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (curriculum_version_id, syllabus_document_id)
);
CREATE INDEX IF NOT EXISTS idx_curriculum_version_evidence_version
  ON curriculum_version_evidence(curriculum_version_id,attached_at DESC);

COMMENT ON COLUMN curriculum_versions.source_hash IS
  'SHA-256 of the reviewed framework import source; UUID primary keys on curriculum nodes remain stable identifiers.';
COMMENT ON TABLE curriculum_version_evidence IS
  'Official source PDFs attached as evidence to a curriculum version; source PDF rights remain governed by syllabus_documents.';
COMMIT;

-- Keep the psql migration entry point current with additive migrations after 056.
\ir migrations/057_curriculum_topic_assets.sql
\ir migrations/058_learning_asset_governance_analytics.sql
\ir migrations/059_syllabus_content_handoff.sql
