-- Give each Platform Admin explicit module access. Existing operators retain
-- their current operational access until the Super Admin reviews and narrows it.
BEGIN;

CREATE TABLE IF NOT EXISTS platform_admin_permissions (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL CHECK (permission IN ('SCHOOLS','USERS','CONTENT_ANALYTICS','COMPETITIONS','SUPPORT')),
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, permission)
);

CREATE INDEX IF NOT EXISTS idx_platform_admin_permissions_permission
  ON platform_admin_permissions(permission,user_id);

INSERT INTO platform_admin_permissions(user_id,permission,granted_by)
SELECT u.id,permission,NULL
FROM users u
CROSS JOIN UNNEST(ARRAY['SCHOOLS','USERS','CONTENT_ANALYTICS','COMPETITIONS','SUPPORT']::text[]) AS permission
WHERE u.role='PLATFORM_ADMIN'
ON CONFLICT(user_id,permission) DO NOTHING;

COMMENT ON TABLE platform_admin_permissions IS
  'Explicit module permissions for Platform Admin accounts. Super Admin authority is role based and is not represented in this table.';

COMMIT;
