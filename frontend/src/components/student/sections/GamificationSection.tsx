'use client';

import { useQuery } from '@tanstack/react-query';
import { getBadges } from '@/services/studentService';
import { apiErrorText } from '@/utils/errors';
import type { StudentBadge } from '@/types/api';
import type { StudentSectionProps } from '@/types/studentPortal';
import styles from '../StudentPortal.module.css';

const ICON: Record<string, string> = {
  FIRST_STEP: '👣', CURIOUS_MIND: '📚', WEEK_WARRIOR: '🔥', MONTH_MASTER: '🗓️',
  XP_500: '⭐', XP_2000: '🎓', XP_5000: '🛡️', XP_10000: '👑', QUIZ_MASTER: '🧠', EXAM_TOPPER: '🏆',
};

export default function GamificationSection({ dashboard, student }: StudentSectionProps) {
  const badgesQuery = useQuery<StudentBadge[]>({
    queryKey: ['student-badges'],
    queryFn: async () => (await getBadges()).data.data || [],
  });

  const xp = Number(student?.xpTotal || 0);
  const level = Number(student?.xpLevel || 1);
  const levelStart = Math.max(0, (level - 1) * 500);
  const nextLevel = level * 500;
  const pct = Math.max(0, Math.min(100, Math.round(((xp - levelStart) / 500) * 100)));
  const badges = badgesQuery.data || [];
  const earned = badges.filter(badge => badge.earned).length;
  const recentXP = dashboard?.recentXP || [];

  return (
    <>
      <div className={styles.sectionHeader}>
        <div><h1 className={styles.title}>🎮 Badges & XP</h1><div className={styles.subtitle}>Every XP entry is recorded in the append-only Student XP ledger.</div></div>
      </div>

      {badgesQuery.isError && <div className={styles.error}>{apiErrorText(badgesQuery.error, 'Badges could not be loaded')}</div>}
      <div className={styles.card}>
        <div className={styles.cardTitle}>⭐ Your XP Journey</div>
        <div className={styles.twoCol}>
          <div>
            <div style={{ fontFamily: "'Baloo 2',cursive", fontSize: 48, fontWeight: 800, color: '#ff6b00', lineHeight: 1 }}>{xp.toLocaleString('en-IN')}</div>
            <div className={styles.muted}>Total XP · Level {level}</div>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}><b>Level {level}</b><span>{Math.max(0, nextLevel - xp)} XP to Level {level + 1}</span></div>
            <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: `${pct}%` }} /></div>
          </div>
        </div>
        <div className={styles.statGrid} style={{ marginTop: 22, marginBottom: 0 }}>
          <div className={styles.stat} style={{ '--accent': '#f5c518' }}><div className={styles.statLabel}>Badges Earned</div><div className={styles.statValue}>{earned}</div><div className={styles.statSub}>of {badges.length} available</div></div>
          <div className={styles.stat} style={{ '--accent': '#ff6b00' }}><div className={styles.statLabel}>Current Streak</div><div className={styles.statValue}>{student?.streakCurrent || 0}🔥</div><div className={styles.statSub}>Best {student?.streakBest || 0} days</div></div>
          <div className={styles.stat} style={{ '--accent': '#7b1fa2' }}><div className={styles.statLabel}>Class Rank</div><div className={styles.statValue}>{dashboard?.ranking?.classRank ? `#${dashboard.ranking.classRank}` : '—'}</div><div className={styles.statSub}>Based on XP</div></div>
          <div className={styles.stat} style={{ '--accent': '#138808' }}><div className={styles.statLabel}>Recent XP</div><div className={styles.statValue}>+{recentXP.reduce((sum, event) => sum + Number(event.xp_amount || 0), 0)}</div><div className={styles.statSub}>Last {recentXP.length} events</div></div>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>🏅 Badge Collection</div>
        {badgesQuery.isLoading ? <div className={styles.loading}>Loading badges…</div> : (
          <div className={styles.badgeGrid}>
            {badges.map(badge => (
              <div key={badge.id || badge.code} className={`${styles.badge} ${badge.earned ? styles.badgeEarned : styles.badgeLocked}`} title={badge.description || ''}>
                <div className={styles.badgeIcon}>{ICON[badge.code || badge.badge_code || ''] || '🏅'}</div>
                <div className={styles.badgeName}>{badge.name}</div>
                <div className={styles.badgeDesc}>{badge.description || `${badge.criteria_type || 'Goal'}: ${badge.criteria_value ?? '—'}`}</div>
                <div style={{ fontSize: 11, fontWeight: 800, color: badge.earned ? '#138808' : '#7b8498', marginTop: 6 }}>{badge.earned ? `Earned · ${badge.tier || ''}` : `Locked · ${badge.tier || ''}`}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>⚡ Recent XP Activity</div>
        {recentXP.map((event, index) => (
          <div className={styles.activity} key={`${event.created_at || index}-${index}`}>
            <span className={styles.activityDot} style={{ background: '#ff6b00' }} />
            <div style={{ flex: 1 }}><div className={styles.activityText}><b>+{event.xp_amount || 0} XP</b> · {event.description || event.event_type?.replaceAll('_', ' ') || 'Activity'}</div><div className={styles.activityMeta}>{event.created_at ? new Date(event.created_at).toLocaleString('en-IN') : '—'} · {event.event_type || 'XP'}</div></div>
          </div>
        ))}
        {!recentXP.length && <div className={styles.empty}>Complete a lesson or exam to start earning XP.</div>}
      </div>
    </>
  );
}
