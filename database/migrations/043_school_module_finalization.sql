-- ============================================================
-- 043_school_module_finalization.sql
-- School module finalization: notification inbox integrity.
-- Safe and idempotent for existing production databases.
-- ============================================================

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS dedupe_key VARCHAR(200),
  ADD COLUMN IF NOT EXISTS action_path VARCHAR(300);

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_user_dedupe
  ON notifications(user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_sent_at
  ON notifications(user_id, sent_at DESC);

COMMENT ON COLUMN notifications.dedupe_key IS
  'Optional producer-owned idempotency key scoped to a recipient user. Prevents duplicate operational notifications.';

COMMENT ON COLUMN notifications.action_path IS
  'Optional authenticated VidyaSetu route opened from the notification inbox.';
