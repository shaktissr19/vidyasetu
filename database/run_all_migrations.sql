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
-- ============================================================
-- 011_notifications.sql
-- Tables: announcements, notifications, teacher_parent_messages
-- ============================================================

DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM (
    'ATTENDANCE_ABSENT', 'ATTENDANCE_LATE',
    'FEE_REMINDER', 'FEE_OVERDUE', 'FEE_PAID',
    'EXAM_REGISTERED', 'EXAM_STARTING', 'EXAM_RESULT',
    'ANNOUNCEMENT', 'BADGE_EARNED', 'STREAK_BROKEN',
    'NEW_CONTENT', 'DOUBT_ANSWERED', 'SYSTEM'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE notification_channel AS ENUM ('IN_APP', 'WHATSAPP', 'SMS', 'PUSH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── announcements ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS announcements (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id      UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  created_by     UUID        NOT NULL REFERENCES users(id),
  title          VARCHAR(300) NOT NULL,
  body           TEXT        NOT NULL,
  target_classes TEXT[]      NOT NULL DEFAULT '{}',  -- empty = all classes
  target_roles   TEXT[]      NOT NULL DEFAULT '{"PARENT","STUDENT"}',
  is_pinned      BOOLEAN     NOT NULL DEFAULT FALSE,
  send_whatsapp  BOOLEAN     NOT NULL DEFAULT TRUE,
  published_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ann_school_id    ON announcements(school_id);
CREATE INDEX IF NOT EXISTS idx_ann_published_at ON announcements(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_ann_is_pinned    ON announcements(is_pinned) WHERE is_pinned = TRUE;

COMMENT ON TABLE  announcements              IS 'School announcements; optionally broadcast via WhatsApp';
COMMENT ON COLUMN announcements.target_classes IS 'Empty array = all classes; specific = e.g. [''9'',''10'']';

-- ── notifications ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id               UUID                 PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID                 NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_id        UUID                 REFERENCES schools(id),
  type             notification_type    NOT NULL,
  channel          notification_channel NOT NULL DEFAULT 'IN_APP',
  title            VARCHAR(300)         NOT NULL,
  body             TEXT                 NOT NULL,
  reference_id     UUID,        -- linked entity (exam_id, fee_invoice_id, etc.)
  reference_type   VARCHAR(50),
  is_read          BOOLEAN              NOT NULL DEFAULT FALSE,
  sent_at          TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  read_at          TIMESTAMPTZ,
  -- External delivery status
  delivery_status  VARCHAR(20)          NOT NULL DEFAULT 'SENT',  -- SENT | DELIVERED | FAILED
  external_msg_id  VARCHAR(200)         -- WhatsApp/SMS provider message ID
);

CREATE INDEX IF NOT EXISTS idx_notif_user_id   ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_is_read   ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notif_type      ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notif_sent_at   ON notifications(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_school_id ON notifications(school_id);

COMMENT ON TABLE  notifications              IS 'All in-app and delivery-tracked notifications per user';
COMMENT ON COLUMN notifications.reference_id IS 'Polymorphic ref: exam_id, fee_invoice_id, announcement_id, etc.';

-- ── teacher_parent_messages ───────────────────────────────────

CREATE TABLE IF NOT EXISTS teacher_parent_messages (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id    UUID        NOT NULL REFERENCES schools(id),
  student_id   UUID        NOT NULL REFERENCES students(id),
  sender_id    UUID        NOT NULL REFERENCES users(id),
  receiver_id  UUID        NOT NULL REFERENCES users(id),
  body         TEXT        NOT NULL,
  attachment_url TEXT,
  is_read      BOOLEAN     NOT NULL DEFAULT FALSE,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tpm_student_id   ON teacher_parent_messages(student_id);
CREATE INDEX IF NOT EXISTS idx_tpm_sender_id    ON teacher_parent_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_tpm_receiver_id  ON teacher_parent_messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_tpm_created_at   ON teacher_parent_messages(created_at DESC);

COMMENT ON TABLE teacher_parent_messages IS 'Direct 1-to-1 messages between teacher and parent for a student';
-- ============================================================
-- 012_timetable.sql
-- Table: timetable_periods
-- ============================================================

DO $$ BEGIN
  CREATE TYPE day_of_week AS ENUM ('MON','TUE','WED','THU','FRI','SAT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── timetable_periods ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS timetable_periods (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id       UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id        UUID        NOT NULL REFERENCES school_classes(id) ON DELETE CASCADE,
  teacher_id      UUID        REFERENCES teachers(id),
  subject_code    VARCHAR(20),
  day             day_of_week NOT NULL,
  period_number   SMALLINT    NOT NULL CHECK (period_number BETWEEN 1 AND 12),
  start_time      TIME        NOT NULL,
  end_time        TIME        NOT NULL,
  room_number     VARCHAR(20),
  academic_year   VARCHAR(10) NOT NULL DEFAULT '2025-26',
  is_break        BOOLEAN     NOT NULL DEFAULT FALSE,  -- lunch, recess
  break_label     VARCHAR(50),  -- 'Lunch', 'Recess'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (class_id, day, period_number, academic_year),

  CONSTRAINT chk_time_range CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_tp_school_id ON timetable_periods(school_id);
CREATE INDEX IF NOT EXISTS idx_tp_class_id  ON timetable_periods(class_id);
CREATE INDEX IF NOT EXISTS idx_tp_teacher_id ON timetable_periods(teacher_id);
CREATE INDEX IF NOT EXISTS idx_tp_day       ON timetable_periods(day);

CREATE OR REPLACE TRIGGER trg_timetable_periods_updated_at
  BEFORE UPDATE ON timetable_periods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE  timetable_periods          IS 'Weekly class timetable; fully replaced on each PUT from school admin';
COMMENT ON COLUMN timetable_periods.is_break IS 'TRUE for lunch/recess periods; teacher_id and subject_code are NULL';
-- ============================================================
-- 013_admin_platform.sql
-- Tables: platform_config, subscription_events,
--         support_tickets, audit_log
-- ============================================================

DO $$ BEGIN
  CREATE TYPE ticket_status AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ticket_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── platform_config ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform_config (
  key         VARCHAR(100) PRIMARY KEY,
  value       TEXT         NOT NULL,
  description TEXT,
  updated_by  UUID         REFERENCES users(id),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE platform_config IS 'Key-value store for super-admin controlled platform settings';

-- Seed default config values
INSERT INTO platform_config (key, value, description) VALUES
  ('XP_PER_LESSON',              '10',   'Base XP awarded per lesson completion'),
  ('XP_PER_QUIZ_PASS',           '20',   'XP for passing a quiz (>=60%)'),
  ('XP_PER_QUIZ_PERFECT',        '50',   'XP for 100% quiz score'),
  ('XP_STREAK_BONUS_7D',         '100',  'Bonus XP for 7-day streak'),
  ('XP_STREAK_BONUS_30D',        '500',  'Bonus XP for 30-day streak'),
  ('OTP_EXPIRY_MINUTES',         '10',   'OTP validity window in minutes'),
  ('OTP_MAX_ATTEMPTS',           '3',    'Max wrong OTP attempts before lockout'),
  ('LOCKOUT_DURATION_MINUTES',   '60',   'Duration of OTP lockout in minutes'),
  ('FREE_PLAN_MAX_STUDENTS',     '50',   'Max students on free plan'),
  ('BASIC_PLAN_MAX_STUDENTS',    '200',  'Max students on basic plan'),
  ('PRO_PLAN_MAX_STUDENTS',      '1000', 'Max students on pro plan'),
  ('RAZORPAY_FEE_PCT',           '2',    'Razorpay transaction fee percentage'),
  ('WHATSAPP_DAILY_LIMIT',       '1000', 'Max WhatsApp messages per school per day'),
  ('CONTENT_MAX_SIZE_MB',        '500',  'Max upload size per content item in MB'),
  ('OFFLINE_SYNC_INTERVAL_MINS', '30',   'How often offline content delta is packaged')
ON CONFLICT (key) DO NOTHING;

-- ── subscription_events ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS subscription_events (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id        UUID         NOT NULL REFERENCES schools(id),
  event_type       VARCHAR(50)  NOT NULL,  -- 'TRIAL_START', 'UPGRADED', 'DOWNGRADED', 'CANCELLED', 'RENEWED'
  from_plan        school_plan,
  to_plan          school_plan,
  amount_paid      NUMERIC(10,2) DEFAULT 0,
  razorpay_payment_id VARCHAR(100),
  valid_from       TIMESTAMPTZ  NOT NULL,
  valid_until      TIMESTAMPTZ,
  notes            TEXT,
  created_by       UUID         REFERENCES users(id),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_se_school_id   ON subscription_events(school_id);
CREATE INDEX IF NOT EXISTS idx_se_event_type  ON subscription_events(event_type);
CREATE INDEX IF NOT EXISTS idx_se_created_at  ON subscription_events(created_at DESC);

COMMENT ON TABLE subscription_events IS 'Append-only ledger of all subscription changes per school';

-- ── support_tickets ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS support_tickets (
  id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id       UUID            REFERENCES schools(id),
  raised_by       UUID            NOT NULL REFERENCES users(id),
  assigned_to     UUID            REFERENCES users(id),
  subject         VARCHAR(300)    NOT NULL,
  description     TEXT            NOT NULL,
  status          ticket_status   NOT NULL DEFAULT 'OPEN',
  priority        ticket_priority NOT NULL DEFAULT 'MEDIUM',
  category        VARCHAR(100),   -- 'BILLING', 'TECHNICAL', 'CONTENT', 'FEATURE_REQUEST'
  resolution      TEXT,
  closed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_st_school_id   ON support_tickets(school_id);
CREATE INDEX IF NOT EXISTS idx_st_status      ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_st_priority    ON support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_st_raised_by   ON support_tickets(raised_by);
CREATE INDEX IF NOT EXISTS idx_st_created_at  ON support_tickets(created_at DESC);

CREATE OR REPLACE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE support_tickets IS 'Customer support tickets from schools and users';

-- ── audit_log ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id      UUID        REFERENCES users(id),
  actor_role    user_role,
  school_id     UUID        REFERENCES schools(id),
  action        VARCHAR(100) NOT NULL,   -- 'SCHOOL_APPROVED', 'USER_SUSPENDED', 'FEE_WAIVED'
  entity_type   VARCHAR(50),             -- 'school', 'user', 'fee_invoice'
  entity_id     UUID,
  old_value     JSONB,
  new_value     JSONB,
  ip_address    VARCHAR(45),
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- Append-only: no updates, no deletes
);

CREATE INDEX IF NOT EXISTS idx_al_actor_id    ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_al_school_id   ON audit_log(school_id);
CREATE INDEX IF NOT EXISTS idx_al_action      ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_al_entity      ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_al_created_at  ON audit_log(created_at DESC);

COMMENT ON TABLE audit_log IS 'Immutable audit trail of all admin and sensitive actions across the platform';
