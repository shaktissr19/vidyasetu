'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getNotifications, markAllNotificationsRead, markNotificationRead } from '@/services/parentService';
import { NotifItem } from '@/components/ui/index';
import { timeAgo } from '@/utils/formatters';
import useLanguageStore from '@/store/languageStore';

const NOTIF_ICONS: Record<string, string> = {
  ATTENDANCE_ABSENT: '📅', ATTENDANCE_LATE: '⏰',
  FEE_DUE: '💰', FEE_OVERDUE: '🔴', FEE_RECEIVED: '✅',
  EXAM_REMINDER: '📝', RESULT_PUBLISHED: '📊',
  ANNOUNCEMENT: '📢', BADGE_EARNED: '🏅',
  DOUBT_ANSWERED: '💬', OLYMPIAD_REMINDER: '🏆',
};

export default function NotificationsPage() {
  const { t } = useLanguageStore();
  const qc = useQueryClient();
  const { data: notifs = [], isLoading } = useQuery({
    queryKey: ['parent-notifications'],
    queryFn: () => getNotifications().then((r) => r.data.data),
  });

  const markOne = useMutation({
    mutationFn: (notificationId: string) => markNotificationRead(notificationId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parent-notifications'] }),
  });
  const markAll = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parent-notifications'] }),
  });

  const unreadCount = notifs.filter((notification) => !notification.read_at).length;

  return (
    <div className="animate-fade-up">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="font-display font-extrabold text-2xl" style={{ color: 'var(--forest)' }}>
            🔔 {t('सूचनाएँ', 'Notifications')}
          </h1>
          {unreadCount > 0 && (
            <p className="text-sm mt-0.5" style={{ color: 'var(--saffron)' }}>
              {unreadCount} {t('नई सूचनाएँ', 'new notifications')}
            </p>
          )}
        </div>
        {unreadCount > 0 && (
          <button className="btn-green" disabled={markAll.isPending} onClick={() => markAll.mutate()}>
            ✓ {t('सभी पढ़ा हुआ', 'Mark all read')}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />)}</div>
      ) : notifs.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-4xl mb-3">🔔</div>
          <p className="font-display font-bold" style={{ color: 'var(--navy)' }}>{t('कोई सूचना नहीं', 'No notifications yet')}</p>
        </div>
      ) : (
        <div className="stagger">
          {notifs.map((notification) => (
            <button key={notification.id} type="button"
              className="animate-fade-up block w-full text-left"
              disabled={Boolean(notification.read_at) || markOne.isPending}
              onClick={() => !notification.read_at && markOne.mutate(notification.id)}>
              <NotifItem
                icon={NOTIF_ICONS[notification.type] || '🔔'}
                title={notification.title}
                body={notification.body}
                time={timeAgo(notification.created_at || notification.sent_at)}
                unread={!notification.read_at}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
