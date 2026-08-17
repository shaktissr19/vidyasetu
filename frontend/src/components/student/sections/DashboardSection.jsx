'use client';

import styles from '../StudentPortal.module.css';

function formatExamDate(value) {
  if (!value) return 'Date TBA';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

export default function DashboardSection({ dashboard, student, greeting, goSection }) {
  const attendance = dashboard?.monthlyAttendance || {};
  const classRank = dashboard?.ranking?.classRank;
  const xp = Number(student?.xpTotal || 0);
  const level = Number(student?.xpLevel || 1);
  const levelStart = Math.max(0, (level - 1) * 500);
  const nextLevelXp = level * 500;
  const progress = Math.max(0, Math.min(100, Math.round(((xp - levelStart) / 500) * 100)));
  const subjects = dashboard?.subjectProgress || [];
  const exams = dashboard?.upcomingExams || [];
  const weakest = [...subjects].sort((a, b) => Number(a.progress_pct || 0) - Number(b.progress_pct || 0))[0];

  const today = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date());

  return (
    <>
      <div className={styles.sectionHeader}>
        <div>
          <h1 className={styles.title}>{greeting}, {student?.name?.split(' ')[0]}! 👋</h1>
          <div className={styles.subtitle}>{today} · Class {student?.classLabel} · {student?.schoolName}</div>
        </div>
        <button className={styles.primary} onClick={() => goSection('exams')}>📝 Take Exam</button>
      </div>

      <div className={styles.statGrid}>
        <div className={styles.stat} style={{ '--accent': '#ff6b00' }}>
          <div className={styles.statLabel}>XP Points</div>
          <div className={styles.statValue}>{xp.toLocaleString('en-IN')}</div>
          <div className={styles.statSub}>Level {level} · {Math.max(0, nextLevelXp - xp)} XP to next</div>
        </div>
        <div className={styles.stat} style={{ '--accent': '#138808' }}>
          <div className={styles.statLabel}>Attendance</div>
          <div className={styles.statValue}>{attendance.percentage != null ? `${Number(attendance.percentage).toFixed(0)}%` : '—'}</div>
          <div className={styles.statSub}>{attendance.present_days || 0}/{attendance.working_days || 0} working days this month</div>
        </div>
        <div className={styles.stat} style={{ '--accent': '#0d1b3e' }}>
          <div className={styles.statLabel}>Class Rank</div>
          <div className={styles.statValue}>{classRank ? `#${classRank}` : '—'}</div>
          <div className={styles.statSub}>School rank {dashboard?.ranking?.schoolRank ? `#${dashboard.ranking.schoolRank}` : '—'}</div>
        </div>
        <div className={styles.stat} style={{ '--accent': '#f5c518' }}>
          <div className={styles.statLabel}>🔥 Streak</div>
          <div className={styles.statValue}>{student?.streakCurrent || 0} days</div>
          <div className={styles.statSub}>Personal best: {student?.streakBest || 0} days</div>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>⭐ Level Progress — Level {level} → {level + 1}</div>
        <div className={styles.progressRow}>
          <span className={styles.muted}>{xp.toLocaleString('en-IN')} XP</span>
          <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: `${progress}%` }} /></div>
          <span className={styles.muted}>{nextLevelXp.toLocaleString('en-IN')} XP</span>
        </div>
      </div>

      <div className={styles.twoCol}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>📚 Subject Progress</div>
          {subjects.length ? subjects.map(subject => (
            <div className={styles.subjectProgress} key={subject.subject_id}>
              <span className={styles.subjectProgressName}>{subject.name}</span>
              <div className={styles.smallTrack}>
                <div className={styles.smallFill} style={{ width: `${Number(subject.progress_pct || 0)}%`, background: subject.color_hex || '#ff6b00' }} />
              </div>
              <span className={styles.subjectPct}>{Number(subject.progress_pct || 0)}%</span>
            </div>
          )) : <div className={styles.empty}>Learning progress will appear as you complete lessons.</div>}
          <button className={styles.secondary} onClick={() => goSection('subjects')}>Open My Subjects →</button>
        </div>

        <div className={styles.card}>
          <div className={styles.cardTitle}>🔔 Today’s Focus</div>
          {exams.slice(0, 2).map(exam => (
            <div className={styles.activity} key={exam.id}>
              <span className={styles.activityDot} style={{ background: exam.status === 'LIVE' ? '#138808' : '#ff6b00' }} />
              <div>
                <div className={styles.activityText}>{exam.status === 'LIVE' ? 'Live now: ' : 'Upcoming: '}{exam.title}</div>
                <div className={styles.activityMeta}>{formatExamDate(exam.start_time)} · {exam.duration_mins} mins</div>
              </div>
            </div>
          ))}
          {weakest && Number(weakest.progress_pct || 0) < 100 && (
            <div className={styles.activity}>
              <span className={styles.activityDot} style={{ background: '#1976d2' }} />
              <div>
                <div className={styles.activityText}>Continue {weakest.name} — {Number(weakest.progress_pct || 0)}% complete</div>
                <div className={styles.activityMeta}>{Number(weakest.completed_items || 0)} of {Number(weakest.total_items || 0)} learning items completed</div>
              </div>
            </div>
          )}
          {(dashboard?.recentXP || []).slice(0, 2).map((event, index) => (
            <div className={styles.activity} key={`${event.created_at}-${index}`}>
              <span className={styles.activityDot} style={{ background: '#7b1fa2' }} />
              <div>
                <div className={styles.activityText}>+{event.xp_amount} XP · {event.description || event.event_type}</div>
                <div className={styles.activityMeta}>{new Date(event.created_at).toLocaleString('en-IN')}</div>
              </div>
            </div>
          ))}
          {!exams.length && !weakest && !(dashboard?.recentXP || []).length && <div className={styles.empty}>You are all caught up.</div>}
        </div>
      </div>
    </>
  );
}
