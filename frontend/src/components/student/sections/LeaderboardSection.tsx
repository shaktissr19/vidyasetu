'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getLeaderboard } from '@/services/studentService';
import styles from '../StudentPortal.module.css';

const data = r => r?.data?.data;
const err = e => e?.response?.data?.error?.message || e?.message || 'Leaderboard could not be loaded';

export default function LeaderboardSection({ student }) {
  const [scope, setScope] = useState('class');
  const leaderboardQuery = useQuery({
    queryKey: ['student-leaderboard', scope],
    queryFn: async () => data(await getLeaderboard(scope)) || [],
  });

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
      {leaderboardQuery.isError && <div className={styles.error}>{err(leaderboardQuery.error)}</div>}
      <div className={styles.card}>
        {(leaderboardQuery.data || []).map(row => (
          <div className={`${styles.leaderRow} ${row.is_me ? styles.leaderMe : ''}`} key={row.student_id}>
            <div className={styles.rank}>{Number(row.rank) === 1 ? '🥇' : Number(row.rank) === 2 ? '🥈' : Number(row.rank) === 3 ? '🥉' : `#${row.rank}`}</div>
            <div className={styles.leaderAvatar}>{row.name?.toLowerCase().includes('priya') || row.name?.toLowerCase().includes('ananya') ? '👧' : '👦'}</div>
            <div className={styles.leaderName}>{row.name}{row.is_me ? ' (You)' : ''}<div className={styles.leaderSub}>Class {row.class_name}-{row.section} · Level {row.xp_level} · 🔥 {row.streak_current || 0}</div></div>
            <div className={styles.leaderXP}>{Number(row.xp_total || 0).toLocaleString('en-IN')} XP</div>
          </div>
        ))}
        {!leaderboardQuery.isLoading && !(leaderboardQuery.data || []).length && <div className={styles.empty}>No ranked students found.</div>}
      </div>
    </>
  );
}
