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
