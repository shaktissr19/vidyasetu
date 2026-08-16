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
