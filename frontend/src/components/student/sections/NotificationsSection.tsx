'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getNotifications, markAllNotificationsRead, markNotifRead } from '@/services/studentService';
import { apiErrorText } from '@/utils/errors';
import type { ParentNotification } from '@/types/api';
import type { StudentSectionId, StudentSectionProps } from '@/types/studentPortal';
import styles from '../StudentPortal.module.css';

interface StudentNotification extends ParentNotification {
  channel?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
  delivery_status?: string | null;
  read_at?: string | null;
}

function iconFor(type: string): string {
  if (type.startsWith('HOMEWORK')) return '📝';
  if (type.includes('ATTENDANCE')) return '📅';
  if (type.includes('FEE')) return '💰';
  if (type.includes('EXAM')) return '🏆';
  if (type.includes('ANNOUNCEMENT')) return '📢';
  if (type.includes('DOUBT')) return '💬';
  if (type.includes('REPORT') || type.includes('RESULT')) return '📄';
  if (type.includes('LEARNING')) return '📚';
  return '🔔';
}

function createdText(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function destinationFor(item: StudentNotification): StudentSectionId | null {
  const referenceType = String(item.reference_type || '').toUpperCase();
  const type = String(item.type || '').toUpperCase();
  if (referenceType === 'HOMEWORK' || type.includes('HOMEWORK')) return 'homework';
  if (referenceType.includes('EXAM') || type.includes('EXAM') || type.includes('COMPETITION')) return 'exams';
  if (referenceType.includes('DOUBT') || type.includes('DOUBT')) return 'doubts';
  if (referenceType.includes('ATTENDANCE') || type.includes('ATTENDANCE')) return 'attendance';
  if (referenceType.includes('REPORT') || referenceType.includes('RESULT') || type.includes('REPORT') || type.includes('RESULT')) return 'report';
  if (referenceType.includes('LEARNING') || type.includes('LEARNING') || type.includes('CONTENT')) return 'subjects';
  if (referenceType.includes('SCHOOL') || type.includes('ANNOUNCEMENT') || type.includes('SCHOOL') || type.includes('FEE')) return 'school';
  return null;
}

export default function NotificationsSection({ notify, goSection }: StudentSectionProps) {
  const qc = useQueryClient();
  const [view, setView] = useState<'ALL' | 'UNREAD'>('ALL');
  const notificationsQuery = useQuery<StudentNotification[]>({
    queryKey: ['student-notifications'],
    queryFn: async () => ((await getNotifications()).data.data || []) as StudentNotification[],
    staleTime: 10_000,
  });

  const markMutation = useMutation({
    mutationFn: (id: string) => markNotifRead(id),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['student-notifications'] }),
        qc.invalidateQueries({ queryKey: ['student-dashboard'] }),
      ]);
    },
    onError: (error: unknown) => notify(`⚠️ ${apiErrorText(error, 'Could not update notification')}`),
  });

  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: async (response) => {
      const updated = Number(response.data.data?.updatedCount || 0);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['student-notifications'] }),
        qc.invalidateQueries({ queryKey: ['student-dashboard'] }),
      ]);
      notify(updated ? `✅ Marked ${updated} notification${updated === 1 ? '' : 's'} as read.` : '✅ You are already all caught up.');
    },
    onError: (error: unknown) => notify(`⚠️ ${apiErrorText(error, 'Could not mark notifications as read')}`),
  });

  const all = notificationsQuery.data || [];
  const unread = useMemo(() => all.filter(item => !item.is_read), [all]);
  const visible = view === 'UNREAD' ? unread : all;

  async function openNotification(item: StudentNotification): Promise<void> {
    if (!item.is_read) {
      try {
        await markMutation.mutateAsync(item.id);
      } catch (_error: unknown) {
        // A read-state failure must not block the learner from opening the referenced workspace.
      }
    }
    const destination = destinationFor(item);
    if (destination) goSection(destination);
  }

  return (
    <>
      <div className={styles.sectionHeader}>
        <div>
          <h1 className={styles.title}>🔔 Notifications</h1>
          <div className={styles.subtitle}>Homework, School, attendance, exam and learning updates for this Student account.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div style={{ padding: '8px 12px', borderRadius: 999, background: unread.length ? '#FFF4E8' : '#EEF8F1', fontWeight: 700, fontSize: 13 }}>
            {unread.length} unread
          </div>
          {unread.length > 0 && (
            <button className={styles.secondary} disabled={markAllMutation.isPending} onClick={() => markAllMutation.mutate()}>
              {markAllMutation.isPending ? 'Updating…' : 'Mark all read'}
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button className={view === 'ALL' ? styles.primary : styles.secondary} onClick={() => setView('ALL')}>All ({all.length})</button>
        <button className={view === 'UNREAD' ? styles.primary : styles.secondary} onClick={() => setView('UNREAD')}>Unread ({unread.length})</button>
      </div>

      {notificationsQuery.isLoading && <div className={styles.loading}>Loading notifications…</div>}
      {notificationsQuery.isError && <div className={styles.error}>{apiErrorText(notificationsQuery.error, 'Could not load notifications')}</div>}

      <div className={styles.card}>
        {visible.map(item => {
          const destination = destinationFor(item);
          return (
            <button
              key={item.id}
              onClick={() => void openNotification(item)}
              style={{
                width: '100%', display: 'grid', gridTemplateColumns: '42px minmax(0,1fr) auto', gap: 12,
                alignItems: 'start', textAlign: 'left', border: 'none', borderBottom: '1px solid #EDF0F5',
                background: item.is_read ? '#fff' : '#FFF9F2', padding: '15px 10px', cursor: 'pointer', color: '#17233B',
              }}
            >
              <div style={{ width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center', background: item.is_read ? '#F2F5F9' : '#FFE8CC', fontSize: 19 }}>
                {iconFor(item.type)}
              </div>
              <div>
                <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
                  <b>{item.title || item.type.replaceAll('_', ' ')}</b>
                  {!item.is_read && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#FF8A00' }} />}
                </div>
                <div style={{ fontSize: 13, opacity: .76, lineHeight: 1.55, marginTop: 5 }}>{item.body || item.message || ''}</div>
                <div style={{ fontSize: 11, opacity: .5, marginTop: 6 }}>{createdText(item.created_at)}{item.channel ? ` · ${item.channel}` : ''}</div>
              </div>
              <div style={{ fontSize: 12, opacity: .55, paddingTop: 3 }}>{destination ? 'Open →' : item.is_read ? '' : 'Mark read'}</div>
            </button>
          );
        })}
        {!notificationsQuery.isLoading && !visible.length && <div className={styles.empty}>{view === 'UNREAD' ? 'You are all caught up.' : 'No notifications yet.'}</div>}
      </div>
    </>
  );
}
