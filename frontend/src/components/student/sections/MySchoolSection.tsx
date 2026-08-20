'use client';

import type { StudentDashboard } from '@/types/api';
import type { StudentSectionProps } from '@/types/studentPortal';
import styles from '../StudentPortal.module.css';

const DAY_LABEL: Record<string, string> = { MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday' };

interface SchoolLinkSummary {
  school_note?: string | null;
  request_status?: string | null;
  requested_at?: string | null;
  parent_linked?: boolean;
  parent_link_pending?: boolean;
}

interface PortalTimetableRow {
  id: string;
  day: string;
  start_time?: string | null;
  end_time?: string | null;
  is_break?: boolean;
  break_label?: string | null;
  subject_code?: string | null;
  teacher_name?: string | null;
  room_number?: string | null;
}

interface PortalAnnouncement {
  id: string;
  is_pinned?: boolean;
  title?: string | null;
  body?: string | null;
  published_at?: string | null;
}

type PortalDashboard = Omit<StudentDashboard, 'timetable' | 'announcements'> & {
  schoolLink?: SchoolLinkSummary;
  timetable?: PortalTimetableRow[];
  announcements?: PortalAnnouncement[];
};

export default function MySchoolSection({ dashboard }: StudentSectionProps) {
  const portalDashboard = dashboard as PortalDashboard | undefined;
  const student = portalDashboard?.student;
  const link = portalDashboard?.schoolLink;
  const timetable = portalDashboard?.timetable || [];
  const announcements = portalDashboard?.announcements || [];
  const days = [...new Set(timetable.map(row => row.day))];

  return (
    <>
      <div className={styles.sectionHeader}>
        <div>
          <h1 className={styles.title}>🏫 My School</h1>
          <div className={styles.subtitle}>School affiliation, parent connection, timetable and official announcements.</div>
        </div>
      </div>

      <div className={styles.twoCol}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>School Link</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>{student?.schoolName || 'Independent VidyaSetu Student'}</div>
          <div className={styles.muted}>Student ID: <b>{student?.studentCode}</b></div>
          <div className={styles.muted}>Class: {student?.classLabel || `Class ${student?.gradeLevel || '—'}`}</div>
          <div style={{ marginTop: 14 }}>
            {student?.schoolLinkStatus === 'APPROVED' && <span className={styles.statusResolved}>✅ Approved by school</span>}
            {student?.schoolLinkStatus === 'PENDING' && <span className={styles.status}>⏳ Pending school approval</span>}
            {student?.schoolLinkStatus === 'REJECTED' && <span className={styles.error}>School request was not approved{link?.school_note ? `: ${link.school_note}` : ''}</span>}
            {student?.schoolLinkStatus === 'NOT_REQUESTED' && <span className={styles.muted}>No school affiliation requested.</span>}
          </div>
          {link?.request_status === 'PENDING' && <div className={styles.muted} style={{ marginTop: 10 }}>Requested {link.requested_at ? new Date(link.requested_at).toLocaleString('en-IN') : ''}. The school will see this request in its enrollment queue.</div>}
        </div>

        <div className={styles.card}>
          <div className={styles.cardTitle}>Parent / Guardian Link</div>
          {link?.parent_linked ? (
            <><div style={{ fontSize: 30 }}>👨‍👩‍👧</div><div style={{ fontWeight: 800, marginTop: 8 }}>Connected</div><div className={styles.muted}>Your linked Parent account can view your school and academic information.</div></>
          ) : link?.parent_link_pending ? (
            <><div style={{ fontSize: 30 }}>🔗</div><div style={{ fontWeight: 800, marginTop: 8 }}>Pending claim</div><div className={styles.muted}>The relationship will activate when the Parent signs in using the matching mobile/email.</div></>
          ) : (
            <><div style={{ fontSize: 30 }}>👤</div><div style={{ fontWeight: 800, marginTop: 8 }}>Not linked</div><div className={styles.muted}>A Parent/Guardian connection can be added from your account profile.</div></>
          )}
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>📅 Weekly Timetable</div>
        {student?.schoolLinkStatus !== 'APPROVED' ? (
          <div className={styles.empty}>Timetable becomes available after your school approves your enrollment.</div>
        ) : days.length ? (
          days.map(day => (
            <div key={day} style={{ marginBottom: 18 }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>{DAY_LABEL[day] || day}</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {timetable.filter(row => row.day === day).map(row => (
                  <div key={row.id} className={styles.activity}>
                    <div style={{ minWidth: 82, fontWeight: 700 }}>{String(row.start_time || '').slice(0, 5)}–{String(row.end_time || '').slice(0, 5)}</div>
                    <div>
                      <div className={styles.activityText}>{row.is_break ? (row.break_label || 'Break') : (row.subject_code || 'Class')}</div>
                      <div className={styles.activityMeta}>{row.teacher_name || ''}{row.room_number ? ` · Room ${row.room_number}` : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : <div className={styles.empty}>Your school has not published a timetable yet.</div>}
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>📢 School Announcements</div>
        {announcements.map(item => (
          <div className={styles.activity} key={item.id}>
            <span className={styles.activityDot} style={{ background: item.is_pinned ? '#ff6b00' : '#1565c0' }} />
            <div><div className={styles.activityText}>{item.is_pinned ? '📌 ' : ''}{item.title}</div><div className={styles.activityMeta}>{item.body}<br />{item.published_at ? new Date(item.published_at).toLocaleString('en-IN') : '—'}</div></div>
          </div>
        ))}
        {!announcements.length && <div className={styles.empty}>{student?.schoolLinkStatus === 'APPROVED' ? 'No current school announcements.' : 'School announcements activate after approval.'}</div>}
      </div>
    </>
  );
}
