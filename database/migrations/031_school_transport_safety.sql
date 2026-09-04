-- ============================================================
-- 031_school_transport_safety.sql
-- School-managed transport, Student assignment and audited pickup/drop events.
-- Additive/idempotent. No live-GPS claims; location is static route/stop metadata only.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE transport_vehicle_status AS ENUM ('ACTIVE','MAINTENANCE','INACTIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE transport_route_status AS ENUM ('ACTIVE','INACTIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE transport_event_type AS ENUM
    ('PICKED_UP','DROPPED_AT_SCHOOL','BOARDED_RETURN','DROPPED_HOME','MISSED_BUS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'TRANSPORT_PICKED_UP';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'TRANSPORT_DROPPED_AT_SCHOOL';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'TRANSPORT_BOARDED_RETURN';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'TRANSPORT_DROPPED_HOME';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'TRANSPORT_ALERT';

CREATE TABLE IF NOT EXISTS transport_vehicles (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id           UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  registration_number VARCHAR(30) NOT NULL,
  label               VARCHAR(80) NOT NULL,
  vehicle_type        VARCHAR(20) NOT NULL DEFAULT 'BUS'
                      CHECK (vehicle_type IN ('BUS','VAN','AUTO','OTHER')),
  capacity            SMALLINT NOT NULL CHECK (capacity BETWEEN 1 AND 100),
  driver_name         VARCHAR(120) NOT NULL,
  driver_phone        VARCHAR(20) NOT NULL,
  attendant_name      VARCHAR(120),
  attendant_phone     VARCHAR(20),
  status              transport_vehicle_status NOT NULL DEFAULT 'ACTIVE',
  created_by          UUID NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, registration_number)
);

CREATE INDEX IF NOT EXISTS idx_transport_vehicle_school_status
  ON transport_vehicles(school_id,status,label);
DROP TRIGGER IF EXISTS trg_transport_vehicle_updated_at ON transport_vehicles;
CREATE TRIGGER trg_transport_vehicle_updated_at
  BEFORE UPDATE ON transport_vehicles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS transport_routes (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  vehicle_id       UUID REFERENCES transport_vehicles(id) ON DELETE SET NULL,
  route_code       VARCHAR(30) NOT NULL,
  name             VARCHAR(120) NOT NULL,
  morning_start    TIME,
  afternoon_start  TIME,
  status           transport_route_status NOT NULL DEFAULT 'ACTIVE',
  created_by       UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, route_code)
);

CREATE INDEX IF NOT EXISTS idx_transport_route_school_status
  ON transport_routes(school_id,status,name);
DROP TRIGGER IF EXISTS trg_transport_route_updated_at ON transport_routes;
CREATE TRIGGER trg_transport_route_updated_at
  BEFORE UPDATE ON transport_routes FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS transport_stops (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  route_id      UUID NOT NULL REFERENCES transport_routes(id) ON DELETE CASCADE,
  name          VARCHAR(120) NOT NULL,
  address       VARCHAR(300),
  sequence_no   SMALLINT NOT NULL CHECK (sequence_no BETWEEN 1 AND 200),
  pickup_time   TIME,
  drop_time     TIME,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (route_id, sequence_no)
);

CREATE INDEX IF NOT EXISTS idx_transport_stop_route
  ON transport_stops(route_id,is_active,sequence_no);
DROP TRIGGER IF EXISTS trg_transport_stop_updated_at ON transport_stops;
CREATE TRIGGER trg_transport_stop_updated_at
  BEFORE UPDATE ON transport_stops FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS student_transport_assignments (
  id                         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id                  UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id                 UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  route_id                   UUID NOT NULL REFERENCES transport_routes(id),
  stop_id                    UUID NOT NULL REFERENCES transport_stops(id),
  authorized_pickup_name     VARCHAR(120),
  authorized_pickup_phone    VARCHAR(20),
  authorized_pickup_relation VARCHAR(60),
  is_active                  BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_by                UUID NOT NULL REFERENCES users(id),
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id)
);

CREATE INDEX IF NOT EXISTS idx_student_transport_school_route
  ON student_transport_assignments(school_id,route_id,is_active);
DROP TRIGGER IF EXISTS trg_student_transport_assignment_updated_at ON student_transport_assignments;
CREATE TRIGGER trg_student_transport_assignment_updated_at
  BEFORE UPDATE ON student_transport_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS transport_student_events (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL REFERENCES student_transport_assignments(id) ON DELETE CASCADE,
  event_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  event_type    transport_event_type NOT NULL,
  event_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note          VARCHAR(300),
  recorded_by   UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id,event_date,event_type)
);

CREATE INDEX IF NOT EXISTS idx_transport_event_school_date
  ON transport_student_events(school_id,event_date DESC,event_at DESC);
CREATE INDEX IF NOT EXISTS idx_transport_event_student_date
  ON transport_student_events(student_id,event_date DESC,event_at DESC);

COMMENT ON TABLE transport_vehicles IS 'School-owned transport roster; driver/attendant data is operational, not a user identity model.';
COMMENT ON TABLE transport_routes IS 'Static School transport route and schedule metadata. Does not represent live GPS tracking.';
COMMENT ON TABLE student_transport_assignments IS 'One current transport assignment per Student with optional authorized pickup contact.';
COMMENT ON TABLE transport_student_events IS 'Audited Student pickup/drop safety milestones recorded by an authenticated School administrator.';
