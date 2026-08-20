'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getLeaderboard } from '@/services/studentService';
import { apiErrorText } from '@/utils/errors';
import type { LeaderboardRow } from '@/types/api';
import type { StudentSectionProps } from '@/types/studentPortal';
import styles from '../StudentPortal.module.css';

type Scope = 'class' | 'school';

export default function LeaderboardSection({ student }: StudentSectionProps) {
  const [scope, setScope] = useState<Scope>('class');
  const leaderboardQuery = useQuery<LeaderboardRow[]>({
    queryKey: ['student-leaderboard', scope],
    queryFn: async () => (await getLeaderboard(scope)).data.data || [],
  });

  const rows = leaderboardQuery.data || [];

  return (
    <>
      <div className={styles.sectionHeader}>
        <div><h1 className={styles.title}>🏆 Leaderboard</h1><div className={styles.subtitle}>XP ranking from real Student records.</div></div>
      </div>
      <div className={styles.scopeTabs}>
        <button className={scope === 'class' ? styles.scopeActive : ''} onClick={() => setScope('class')}>Class {student?.classLabel}</button>
        <button className={scope === 'school' ? styles.scopeActive : ''} onClick={() => setScope('school')}>Whole School</button>
      </div>
      {leaderboardQuery.isLoading && <div className={styles.loading}>Calculating rankings…</div>}
      {leaderboardQuery.isError && <div className={styles.error}>{apiErrorText(leaderboardQuery.error, 'Leaderboard could not be loaded')}</div>}
      <div className={styles.card}>
        {rows.map((row, index) => {
          const rank = Number(row.rank || index + 1);
          const name = row.name || row.student_name || 'Student';
          return (
            <div className={`${styles.leaderRow} ${row.is_me || row.is_current_user ? styles.leaderMe : ''}`} key={row.student_id || row.id || `${rank}-${name}`}>
              <div className={styles.rank}>{rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}</div>
              <div className={styles.leaderAvatar}>{name.toLowerCase().includes('priya') || name.toLowerCase().includes('ananya') ? '👧' : '👦'}</div>
              <div className={styles.leaderName}>{name}{row.is_me || row.is_current_user ? ' (You)' : ''}<div className={styles.leaderSub}>Class {row.class_name || '—'}{row.section ? `-${row.section}` : ''} · Level {row.xp_level || '—'} · 🔥 {row.streak_current || 0}</div></div>
              <div className={styles.leaderXP}>{Number(row.xp_total ?? row.xp ?? 0).toLocaleString('en-IN')} XP</div>
            </div>
          );
        })}
        {!leaderboardQuery.isLoading && !rows.length && <div className={styles.empty}>No ranked students found.</div>}
      </div>
    </>
  );
}
