-- ============================================================
-- 018_groups_collaboration.sql
-- Private, moderated collaboration Groups for Students, Parents,
-- Teachers and School Admins. Group creation is platform-approved;
-- membership is owner/moderator-controlled; invitations require consent.
-- ============================================================

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'GROUP_APPROVED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'GROUP_REJECTED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'GROUP_JOIN_REQUEST';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'GROUP_JOIN_APPROVED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'GROUP_JOIN_REJECTED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'GROUP_INVITATION';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'GROUP_INVITE_APPROVED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'GROUP_INVITE_REJECTED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'GROUP_POST';

DO $$ BEGIN
  CREATE TYPE collaboration_group_kind AS ENUM ('STUDENT', 'PARENT', 'TEACHER', 'MIXED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE collaboration_group_scope AS ENUM ('PRIVATE', 'SCHOOL', 'CLASS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE collaboration_group_status AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE collaboration_member_role AS ENUM ('OWNER', 'MODERATOR', 'MEMBER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE collaboration_member_status AS ENUM ('ACTIVE', 'LEFT', 'REMOVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE collaboration_join_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE collaboration_invite_status AS ENUM (
    'PENDING_OWNER_APPROVAL', 'PENDING_RECIPIENT', 'ACCEPTED', 'DECLINED', 'REJECTED', 'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE collaboration_post_status AS ENUM ('ACTIVE', 'REMOVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE collaboration_report_status AS ENUM ('OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

BEGIN;

CREATE TABLE IF NOT EXISTS collaboration_groups (
  id                UUID                       PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              VARCHAR(160)               NOT NULL,
  description       TEXT,
  kind              collaboration_group_kind   NOT NULL,
  scope             collaboration_group_scope  NOT NULL DEFAULT 'PRIVATE',
  school_id         UUID                       REFERENCES schools(id) ON DELETE CASCADE,
  class_id          UUID                       REFERENCES school_classes(id) ON DELETE CASCADE,
  created_by        UUID                       NOT NULL REFERENCES users(id),
  owner_id          UUID                       NOT NULL REFERENCES users(id),
  status            collaboration_group_status NOT NULL DEFAULT 'PENDING',
  max_members       INTEGER                    NOT NULL DEFAULT 100 CHECK (max_members BETWEEN 2 AND 500),
  admin_note        TEXT,
  approved_by       UUID                       REFERENCES users(id),
  approved_at       TIMESTAMPTZ,
  rejected_at       TIMESTAMPTZ,
  suspended_at      TIMESTAMPTZ,
  archived_at       TIMESTAMPTZ,
  settings          JSONB                      NOT NULL DEFAULT '{"allow_member_nominations":true,"allow_member_posts":true,"allow_member_comments":true}'::jsonb,
  created_at        TIMESTAMPTZ                NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ                NOT NULL DEFAULT NOW(),
  CHECK ((scope = 'PRIVATE' AND class_id IS NULL) OR scope <> 'PRIVATE'),
  CHECK ((scope = 'CLASS' AND school_id IS NOT NULL AND class_id IS NOT NULL) OR scope <> 'CLASS'),
  CHECK ((scope = 'SCHOOL' AND school_id IS NOT NULL AND class_id IS NULL) OR scope <> 'SCHOOL')
);

CREATE INDEX IF NOT EXISTS idx_cg_status ON collaboration_groups(status);
CREATE INDEX IF NOT EXISTS idx_cg_kind ON collaboration_groups(kind);
CREATE INDEX IF NOT EXISTS idx_cg_scope ON collaboration_groups(scope);
CREATE INDEX IF NOT EXISTS idx_cg_school ON collaboration_groups(school_id);
CREATE INDEX IF NOT EXISTS idx_cg_class ON collaboration_groups(class_id);
CREATE INDEX IF NOT EXISTS idx_cg_owner ON collaboration_groups(owner_id);
CREATE INDEX IF NOT EXISTS idx_cg_created_at ON collaboration_groups(created_at DESC);

CREATE OR REPLACE TRIGGER trg_collaboration_groups_updated_at
  BEFORE UPDATE ON collaboration_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS collaboration_group_members (
  id          UUID                        PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id    UUID                        NOT NULL REFERENCES collaboration_groups(id) ON DELETE CASCADE,
  user_id     UUID                        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        collaboration_member_role   NOT NULL DEFAULT 'MEMBER',
  status      collaboration_member_status NOT NULL DEFAULT 'ACTIVE',
  approved_by UUID                        REFERENCES users(id),
  joined_at   TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),
  left_at     TIMESTAMPTZ,
  removed_at  TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cgm_active_owner
  ON collaboration_group_members(group_id)
  WHERE role = 'OWNER' AND status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_cgm_user ON collaboration_group_members(user_id, status);
CREATE INDEX IF NOT EXISTS idx_cgm_group ON collaboration_group_members(group_id, status);

CREATE OR REPLACE TRIGGER trg_collaboration_group_members_updated_at
  BEFORE UPDATE ON collaboration_group_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS collaboration_group_join_requests (
  id          UUID                      PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id    UUID                      NOT NULL REFERENCES collaboration_groups(id) ON DELETE CASCADE,
  user_id     UUID                      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message     VARCHAR(500),
  status      collaboration_join_status NOT NULL DEFAULT 'PENDING',
  decided_by  UUID                      REFERENCES users(id),
  decided_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ               NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cgjr_pending
  ON collaboration_group_join_requests(group_id, user_id)
  WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_cgjr_group_status ON collaboration_group_join_requests(group_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cgjr_user_status ON collaboration_group_join_requests(user_id, status, created_at DESC);

CREATE OR REPLACE TRIGGER trg_collaboration_group_join_requests_updated_at
  BEFORE UPDATE ON collaboration_group_join_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS collaboration_group_invitations (
  id             UUID                        PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id       UUID                        NOT NULL REFERENCES collaboration_groups(id) ON DELETE CASCADE,
  invitee_user_id UUID                       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proposed_by    UUID                        NOT NULL REFERENCES users(id),
  owner_approved_by UUID                     REFERENCES users(id),
  owner_approved_at TIMESTAMPTZ,
  status         collaboration_invite_status NOT NULL,
  message        VARCHAR(500),
  responded_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ                 NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cgi_open
  ON collaboration_group_invitations(group_id, invitee_user_id)
  WHERE status IN ('PENDING_OWNER_APPROVAL', 'PENDING_RECIPIENT');
CREATE INDEX IF NOT EXISTS idx_cgi_group_status ON collaboration_group_invitations(group_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cgi_invitee_status ON collaboration_group_invitations(invitee_user_id, status, created_at DESC);

CREATE OR REPLACE TRIGGER trg_collaboration_group_invitations_updated_at
  BEFORE UPDATE ON collaboration_group_invitations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS collaboration_group_posts (
  id             UUID                      PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id       UUID                      NOT NULL REFERENCES collaboration_groups(id) ON DELETE CASCADE,
  author_id      UUID                      NOT NULL REFERENCES users(id),
  body           TEXT                      NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  attachment_url TEXT,
  is_announcement BOOLEAN                  NOT NULL DEFAULT FALSE,
  is_pinned      BOOLEAN                   NOT NULL DEFAULT FALSE,
  status         collaboration_post_status NOT NULL DEFAULT 'ACTIVE',
  removed_by     UUID                      REFERENCES users(id),
  removed_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ               NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cgp_group_created ON collaboration_group_posts(group_id, status, is_pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cgp_author ON collaboration_group_posts(author_id, created_at DESC);

CREATE OR REPLACE TRIGGER trg_collaboration_group_posts_updated_at
  BEFORE UPDATE ON collaboration_group_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS collaboration_group_comments (
  id          UUID                      PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id     UUID                      NOT NULL REFERENCES collaboration_group_posts(id) ON DELETE CASCADE,
  group_id    UUID                      NOT NULL REFERENCES collaboration_groups(id) ON DELETE CASCADE,
  author_id   UUID                      NOT NULL REFERENCES users(id),
  body        TEXT                      NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  status      collaboration_post_status NOT NULL DEFAULT 'ACTIVE',
  removed_by  UUID                      REFERENCES users(id),
  removed_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ               NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cgc_post_created ON collaboration_group_comments(post_id, status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_cgc_group_created ON collaboration_group_comments(group_id, created_at DESC);

CREATE OR REPLACE TRIGGER trg_collaboration_group_comments_updated_at
  BEFORE UPDATE ON collaboration_group_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS collaboration_group_reports (
  id           UUID                        PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id     UUID                        NOT NULL REFERENCES collaboration_groups(id) ON DELETE CASCADE,
  reported_by  UUID                        NOT NULL REFERENCES users(id),
  target_type  VARCHAR(20)                 NOT NULL CHECK (target_type IN ('GROUP','POST','COMMENT','MEMBER')),
  target_id    UUID                        NOT NULL,
  reason       VARCHAR(100)                NOT NULL,
  details      VARCHAR(1000),
  status       collaboration_report_status NOT NULL DEFAULT 'OPEN',
  reviewed_by  UUID                        REFERENCES users(id),
  resolution   VARCHAR(1000),
  reviewed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ                 NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cgr_status ON collaboration_group_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cgr_group ON collaboration_group_reports(group_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cgr_reported_by ON collaboration_group_reports(reported_by, created_at DESC);

CREATE OR REPLACE TRIGGER trg_collaboration_group_reports_updated_at
  BEFORE UPDATE ON collaboration_group_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO platform_config (key, value, description) VALUES
  ('GROUPS_ENABLED', 'true', 'Enable private moderated VidyaSetu Groups'),
  ('GROUP_DEFAULT_MAX_MEMBERS', '100', 'Default member capacity for a new Group'),
  ('GROUP_MAX_MEMBERS_LIMIT', '500', 'Absolute maximum members allowed in one Group')
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE collaboration_groups IS 'Private moderated Groups. Creation requires platform approval before ACTIVE status.';
COMMENT ON TABLE collaboration_group_members IS 'Owner, moderator and member relationships for approved Groups.';
COMMENT ON TABLE collaboration_group_join_requests IS 'User-initiated membership requests decided by Group owner/moderator.';
COMMENT ON TABLE collaboration_group_invitations IS 'Owner invitations or member nominations; recipient consent is always required.';
COMMENT ON TABLE collaboration_group_posts IS 'Private Group feed posts and owner/moderator announcements.';
COMMENT ON TABLE collaboration_group_comments IS 'Comments on Group posts.';
COMMENT ON TABLE collaboration_group_reports IS 'Member reports reviewed by platform administrators.';

COMMIT;
