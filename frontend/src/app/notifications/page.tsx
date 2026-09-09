'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getNotificationInbox, markAllNotificationsRead, markNotificationRead, type NotificationInboxItem } from '@/services/notificationService';
import useAuthStore from '@/store/authStore';
import useLanguageStore from '@/store/languageStore';
import { apiErrorText } from '@/utils/errors';
import toast from 'react-hot-toast';

function notificationIcon(type: string): string {
  if (type.startsWith('ATTENDANCE')) return '📅';
  if (type.startsWith('FEE')) return '💰';
  if (type.startsWith('EXAM')) return '📝';
  if (type === 'ANNOUNCEMENT') return '📢';
  if (type.includes('BADGE')) return '🏅';
  if (type.includes('DOUBT')) return '💬';
  if (type.includes('CONTENT')) return '📚';
  return '🔔';
}

function formatNotificationTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function NotificationsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isLoggedIn } = useAuthStore();
  const { t } = useLanguageStore();
  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('ALL');

  const inboxQuery = useQuery({
    queryKey: ['notification-inbox', filter],
    queryFn: () => getNotificationInbox({ limit: 100, unreadOnly: filter === 'UNREAD' }).then((response) => response.data.data || []),
    enabled: isLoggedIn,
    staleTime: 10_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  const markOne = useMutation({
    mutationFn: (notificationId: string) => markNotificationRead(notificationId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['notification-inbox'] }),
        queryClient.invalidateQueries({ queryKey: ['notification-unread-count'] }),
      ]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error)),
  });

  const markAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: async (response) => {
      const count = Number(response.data.data?.updatedCount || 0);
      if (count > 0) toast.success(t(`${count} सूचनाएँ पढ़ी गईं`, `${count} notifications marked as read`));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['notification-inbox'] }),
        queryClient.invalidateQueries({ queryKey: ['notification-unread-count'] }),
      ]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error)),
  });

  const items = inboxQuery.data || [];
  const unreadCount = useMemo(() => items.filter((item) => !item.is_read).length, [items]);

  if (!isLoggedIn) {
    return <main className="mx-auto max-w-4xl px-4 py-10"><div className="card text-center py-12"><div className="text-4xl mb-3">🔒</div><h1 className="font-display font-bold text-xl" style={{ color: 'var(--navy)' }}>{t('सूचनाएँ देखने के लिए लॉगिन करें', 'Log in to view notifications')}</h1><button className="btn-primary mt-5" onClick={() => router.push('/login')}>{t('लॉगिन', 'Login')}</button></div></main>;
  }

  async function openNotification(item: NotificationInboxItem) {
    if (!item.is_read) await markOne.mutateAsync(item.id);
    if (item.action_path?.startsWith('/')) router.push(item.action_path);
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 md:py-10">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--saffron)' }}>{t('आपका इनबॉक्स', 'Your inbox')}</p>
          <h1 className="font-display font-bold text-3xl mt-1" style={{ color: 'var(--navy)' }}>🔔 {t('सूचनाएँ', 'Notifications')}</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>{t('स्कूल, सीखने और खाते से जुड़ी महत्वपूर्ण अपडेट एक जगह।', 'Important School, Learning and account updates in one place.')}</p>
        </div>
        <button className="btn-outline" disabled={markAll.isPending || unreadCount === 0} onClick={() => markAll.mutate()}>{markAll.isPending ? t('अपडेट हो रहा है…', 'Updating…') : t('सभी पढ़ी हुई करें', 'Mark all read')}</button>
      </div>

      <div className="flex gap-2 mb-5">
        <button className="px-4 py-2 rounded-full text-sm font-bold" style={{ background: filter === 'ALL' ? 'var(--navy)' : '#F0F4F8', color: filter === 'ALL' ? '#fff' : 'var(--slate)' }} onClick={() => setFilter('ALL')}>{t('सभी', 'All')}</button>
        <button className="px-4 py-2 rounded-full text-sm font-bold" style={{ background: filter === 'UNREAD' ? 'var(--navy)' : '#F0F4F8', color: filter === 'UNREAD' ? '#fff' : 'var(--slate)' }} onClick={() => setFilter('UNREAD')}>{t('अपठित', 'Unread')}</button>
      </div>

      {inboxQuery.isLoading ? <div className="space-y-3">{Array.from({ length: 5 }, (_, index) => <div key={index} className="skeleton h-28 rounded-2xl" />)}</div> : inboxQuery.isError ? <div className="card" style={{ color: '#C62828' }}>{apiErrorText(inboxQuery.error)}</div> : items.length === 0 ? <div className="card text-center py-14"><div className="text-5xl mb-3">🔔</div><h2 className="font-display font-bold text-lg" style={{ color: 'var(--navy)' }}>{filter === 'UNREAD' ? t('कोई अपठित सूचना नहीं', 'No unread notifications') : t('अभी कोई सूचना नहीं', 'No notifications yet')}</h2><p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>{t('नई महत्वपूर्ण अपडेट यहाँ दिखाई देंगी।', 'New important updates will appear here.')}</p></div> : (
        <div className="space-y-3">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => void openNotification(item)}
              className="card w-full text-left transition-transform hover:-translate-y-0.5"
              style={{ borderLeft: `4px solid ${item.is_read ? '#D9DEE8' : 'var(--saffron)'}`, background: item.is_read ? '#fff' : '#FFF9F3', cursor: item.action_path ? 'pointer' : 'default' }}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl grid place-items-center text-xl flex-shrink-0" style={{ background: item.is_read ? '#F2F4F7' : 'var(--saffron-pale)' }}>{notificationIcon(item.type)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div><h2 className="font-bold" style={{ color: 'var(--navy)' }}>{item.title}</h2><p className="text-xs mt-0.5 uppercase font-bold tracking-wide" style={{ color: 'var(--slate)' }}>{item.type.replaceAll('_', ' ')}</p></div>
                    {!item.is_read && <span className="badge badge-orange">{t('नया', 'New')}</span>}
                  </div>
                  <p className="text-sm mt-2 whitespace-pre-wrap" style={{ color: 'var(--slate)' }}>{item.body}</p>
                  <div className="flex flex-wrap items-center justify-between gap-2 mt-3"><span className="text-xs" style={{ color: '#7A8499' }}>{formatNotificationTime(item.sent_at)}</span>{item.action_path && <span className="text-xs font-bold" style={{ color: 'var(--saffron)' }}>{t('खोलें →', 'Open →')}</span>}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}
