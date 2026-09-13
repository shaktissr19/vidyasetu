-- ============================================================
-- 044_learning_entitlements_canonical_runtime.sql
-- VidyaSetu Learning Platform — canonical learner runtime access
--
-- Separates content visibility from commercial entitlement.
-- PUBLIC/REGISTERED/CLASS_ONLY/SCHOOL_ONLY continue to describe
-- audience/scope; access_requirement describes whether the learner
-- needs a paid/ licensed Learning entitlement.
--
-- Additive/idempotent. No destructive data reset and no seed dependency.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE learning_access_requirement AS ENUM ('PUBLIC','REGISTERED','SUBSCRIBER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE learning_entitlement_status AS ENUM ('ACTIVE','EXPIRED','REVOKED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

BEGIN;

ALTER TABLE learning_resources
  ADD COLUMN IF NOT EXISTS access_requirement learning_access_requirement;

UPDATE learning_resources
SET access_requirement = CASE
  WHEN visibility = 'PUBLIC' THEN 'PUBLIC'::learning_access_requirement
  ELSE 'REGISTERED'::learning_access_requirement
END
WHERE access_requirement IS NULL;

ALTER TABLE learning_resources
  ALTER COLUMN access_requirement SET DEFAULT 'REGISTERED'::learning_access_requirement,
  ALTER COLUMN access_requirement SET NOT NULL;

ALTER TABLE learning_assessments
  ADD COLUMN IF NOT EXISTS access_requirement learning_access_requirement;

UPDATE learning_assessments
SET access_requirement = CASE
  WHEN visibility = 'PUBLIC' THEN 'PUBLIC'::learning_access_requirement
  ELSE 'REGISTERED'::learning_access_requirement
END
WHERE access_requirement IS NULL;

ALTER TABLE learning_assessments
  ALTER COLUMN access_requirement SET DEFAULT 'REGISTERED'::learning_access_requirement,
  ALTER COLUMN access_requirement SET NOT NULL;

CREATE TABLE IF NOT EXISTS learning_entitlements (
  id               UUID                        PRIMARY KEY DEFAULT uuid_generate_v4(),
  entitlement_code VARCHAR(80)                 NOT NULL,
  user_id          UUID                        REFERENCES users(id) ON DELETE CASCADE,
  school_id        UUID                        REFERENCES schools(id) ON DELETE CASCADE,
  status           learning_entitlement_status NOT NULL DEFAULT 'ACTIVE',
  starts_at        TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),
  ends_at          TIMESTAMPTZ,
  source           VARCHAR(60)                 NOT NULL DEFAULT 'MANUAL',
  source_reference VARCHAR(180),
  metadata         JSONB                       NOT NULL DEFAULT '{}'::jsonb,
  created_by       UUID                        REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),
  CHECK ((user_id IS NOT NULL)::int + (school_id IS NOT NULL)::int = 1),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_learning_entitlements_user_active
  ON learning_entitlements(user_id, entitlement_code, starts_at, ends_at)
  WHERE status='ACTIVE' AND user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_learning_entitlements_school_active
  ON learning_entitlements(school_id, entitlement_code, starts_at, ends_at)
  WHERE status='ACTIVE' AND school_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_learning_entitlements_active_user_code
  ON learning_entitlements(user_id, entitlement_code)
  WHERE status='ACTIVE' AND user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_learning_entitlements_active_school_code
  ON learning_entitlements(school_id, entitlement_code)
  WHERE status='ACTIVE' AND school_id IS NOT NULL;

CREATE OR REPLACE TRIGGER trg_learning_entitlements_updated_at
  BEFORE UPDATE ON learning_entitlements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON COLUMN learning_resources.access_requirement IS
  'Commercial access requirement, independent of visibility/scope. SUBSCRIBER may be satisfied by an individual Learning subscription or a licensed school.';

COMMENT ON COLUMN learning_assessments.access_requirement IS
  'Commercial access requirement, independent of visibility/scope. SUBSCRIBER may be satisfied by an individual Learning subscription or a licensed school.';

COMMENT ON TABLE learning_entitlements IS
  'Access grants for VidyaSetu Learning. LEARNING_SUBSCRIBER grants an individual learner subscription; LEARNING_SCHOOL_LICENSE grants subscriber Learning access to active students of a licensed school.';

COMMIT;
