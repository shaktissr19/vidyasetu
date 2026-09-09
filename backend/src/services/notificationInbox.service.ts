import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';

export interface NotificationInboxItem extends QueryResultRow {
  id: UUID;
  school_id: UUID | null;
  type: string;
  channel: string;
  title: string;
  body: string;
  reference_id: UUID | null;
  reference_type: string | null;
  action_path: string | null;
  is_read: boolean;
  read_at: string | Date | null;
  delivery_status: string;
  sent_at: string | Date;
}

interface CountRow extends QueryResultRow {
  count: number;
}

interface ReadRow extends QueryResultRow {
  id: UUID;
  is_read: boolean;
  read_at: string | Date | null;
}

export interface NotificationInboxOptions {
  limit?: number;
  unreadOnly?: boolean;
}

export async function listNotifications(
  userId: UUID,
  options: NotificationInboxOptions = {},
): Promise<NotificationInboxItem[]> {
  const limit = Math.min(Math.max(Number(options.limit || 50), 1), 100);
  const { rows } = await query<NotificationInboxItem>(
    `SELECT id, school_id, type, channel, title, body, reference_id, reference_type,
            action_path, is_read, read_at, delivery_status, sent_at
     FROM notifications
     WHERE user_id = $1
       AND ($2::boolean = FALSE OR is_read = FALSE)
     ORDER BY sent_at DESC, id DESC
     LIMIT $3`,
    [userId, Boolean(options.unreadOnly), limit],
  );
  return rows;
}

export async function getUnreadCount(userId: UUID): Promise<number> {
  const { rows: [row] } = await query<CountRow>(
    `SELECT COUNT(*)::INT AS count
     FROM notifications
     WHERE user_id = $1 AND is_read = FALSE`,
    [userId],
  );
  return Number(row?.count || 0);
}

export async function markRead(userId: UUID, notificationId: UUID): Promise<ReadRow | null> {
  const { rows: [row] } = await query<ReadRow>(
    `UPDATE notifications
     SET is_read = TRUE, read_at = COALESCE(read_at, NOW())
     WHERE id = $1 AND user_id = $2
     RETURNING id, is_read, read_at`,
    [notificationId, userId],
  );
  return row || null;
}

export async function markAllRead(userId: UUID): Promise<number> {
  const result = await query(
    `UPDATE notifications
     SET is_read = TRUE, read_at = COALESCE(read_at, NOW())
     WHERE user_id = $1 AND is_read = FALSE`,
    [userId],
  );
  return result.rowCount || 0;
}
