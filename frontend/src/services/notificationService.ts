import api from './api';

export interface NotificationInboxItem {
  id: string;
  school_id: string | null;
  type: string;
  channel: string;
  title: string;
  body: string;
  reference_id: string | null;
  reference_type: string | null;
  action_path: string | null;
  is_read: boolean;
  read_at: string | null;
  delivery_status: string;
  sent_at: string;
}

interface Envelope<T> {
  success: boolean;
  data: T;
}

export function getNotificationInbox(options: { limit?: number; unreadOnly?: boolean } = {}) {
  return api.get<Envelope<NotificationInboxItem[]>>('/notifications', { params: options });
}

export function getUnreadNotificationCount() {
  return api.get<Envelope<{ count: number }>>('/notifications/unread-count');
}

export function markNotificationRead(notificationId: string) {
  return api.patch<Envelope<{ id: string; is_read: boolean; read_at: string | null }>>(`/notifications/${notificationId}/read`);
}

export function markAllNotificationsRead() {
  return api.patch<Envelope<{ updatedCount: number }>>('/notifications/read-all');
}
