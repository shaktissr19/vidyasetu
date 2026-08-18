'use client';

import styles from '../StudentPortal.module.css';

function formatExamDate(value) {
  if (!value) return 'Date TBA';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

export default function DashboardSection({ dashboard, student, greeting, goSection }) {
  const attendance = dashboard?.monthlyAttendance || {};
  const academic = dashboard?.academic || {};
  const subjects = dashboard?.subjectProgress || [];
  const exams = dashboard?.upcomingExams || [];
  const recentResults = dashboard?.recentResults || [];
  const announcements = dashboard?.announcements || [];
  const weakest = [...subjects].sort((a, b) => Number(a.progress_pct || 0) - Number(b.progress_pct || 0))[0];
  const totalItems = subjects.reduce((sum, subject) => sum + Number(subject.total_items || 0), 0);
  const completedItems = subjects.reduce((sum, subject) => sum + Number(subject.completed_items || 0), 0);
  const learningProgress = totalItems ? Math.round((completedItems / totalItems) * 100) : 0;

  const today = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date());

  return (
    <>
      <div className={styles.sectionHeader}>
        <div>
          <h1 className={styles.title}>{greeting}, {student?.name?.split(' ')[0]}! 👋</h1>
          <div className={styles.subtitle}>{today} · {student?.classLabel}{student?.schoolName ? ` · ${student.schoolName}` : ' · Independent VidyaSetu Student'}</div>
        </div>
        <button className={styles.primary} onClick={() => goSection('exams')}>📝 Exams & Tests</button>
      </div>

      {student?.schoolLinkStatus === 'PENDING' && (
        <div className={styles.card} style={{ borderLeft: '4px solid #F5A623' }}>
          <div className={styles.cardTitle}>⏳ School verification pending</div>
          <div className={styles.muted}>Your learning account is active. Official attendance, school tests, timetable and report-card data become authoritative after {student?.schoolName || 'your selected school'} approves your enrollment request.</div>
          <button className={styles.secondary} style={{ marginTop: 12 }} onClick={() => goSection('school')}>View School Request →</button>
        </div>
      )}

      <div className={styles.statGrid}>
        <div className={styles.stat} style={{ '--accent': '#1565C0' }}>
          <div className={styles.statLabel}>Academic Average</div>
          <div className={styles.statValue}>{academic.average != null ? `${academic.average}%` : '—'}</div>
          <div className={styles.statSub}>{academic.scoredSchoolTests || 0} scored school tests</div>
        </div>
        <div className={styles.stat} style={{ '--accent': '#138808' }}>
          <div className={styles.statLabel}>Attendance</div>
          <div className={styles.statValue}>{attendance.percentage != null ? `${Number(attendance.percentage).toFixed(0)}%` : '—'}</div>
          <div className={styles.statSub}>{student?.schoolLinkStatus === 'APPROVED' ? `${attendance.present_days || 0}/${attendance.working_days || 0} working days this month` : 'Available after school approval'}</div>
        </div>
        <div className={styles.stat} style={{ '--accent': '#7B1FA2' }}>
          <div className={styles.statLabel}>Academic Rank</div>
          <div className={styles.statValue}>{academic.classRank ? `#${academic.classRank}` : '—'}</div>
          <div className={styles.statSub}>{academic.schoolRank ? `School rank #${academic.schoolRank}` : 'Based on scored school tests'}</div>
        </div>
        <div className={styles.stat} style={{ '--accent': '#FF6B00' }}>
          <div className={styles.statLabel}>Learning Progress</div>
          <div className={styles.statValue}>{learningProgress}%</div>
          <div className={styles.statSub}>{completedItems}/{totalItems} published learning items completed</div>
        </div>
      </div>

      <div className={styles.twoCol}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>📚 Subject Progress</div>
          {subjects.length ? subjects.map(subject => (
            <div className={styles.subjectProgress} key={subject.subject_id}>
              <span className={styles.subjectProgressName}>{subject.name}</span>
              <div className={styles.smallTrack}><div className={styles.smallFill} style={{ width: `${Number(subject.progress_pct || 0)}%`, background: subject.color_hex || '#ff6b00' }} /></div>
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
              <div><div className={styles.activityText}>{exam.status === 'LIVE' ? 'Live now: ' : 'Upcoming: '}{exam.title}</div><div className={styles.activityMeta}>{formatExamDate(exam.start_time)} · {exam.duration_mins} mins</div></div>
            </div>
          ))}
          {weakest && Number(weakest.progress_pct || 0) < 100 && (
            <div className={styles.activity}>
              <span className={styles.activityDot} style={{ background: '#1976d2' }} />
              <div><div className={styles.activityText}>Continue {weakest.name} — {Number(weakest.progress_pct || 0)}% complete</div><div className={styles.activityMeta}>{Number(weakest.completed_items || 0)} of {Number(weakest.total_items || 0)} learning items completed</div></div>
            </div>
          )}
          {announcements.slice(0, 2).map(item => (
            <div className={styles.activity} key={item.id}>
              <span className={styles.activityDot} style={{ background: '#7B1FA2' }} />
              <div><div className={styles.activityText}>School: {item.title}</div><div className={styles.activityMeta}>{item.body}</div></div>
            </div>
          ))}
          {Number(dashboard?.unreadNotifications || 0) > 0 && (
            <div className={styles.activity}><span className={styles.activityDot} style={{ background: '#C62828' }} /><div><div className={styles.activityText}>{dashboard.unreadNotifications} unread notification{dashboard.unreadNotifications === 1 ? '' : 's'}</div><div className={styles.activityMeta}>Open My School / account alerts to review them.</div></div></div>
          )}
          {!exams.length && !weakest && !announcements.length && !dashboard?.unreadNotifications && <div className={styles.empty}>You are all caught up.</div>}
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>📊 Recent Results</div>
        {recentResults.slice(0, 5).map(result => (
          <div className={styles.activity} key={result.id}>
            <span className={styles.activityDot} style={{ background: result.type === 'SCHOOL_TEST' ? '#1565C0' : '#FF6B00' }} />
            <div style={{ flex: 1 }}><div className={styles.activityText}>{result.title} · <b>{Number(result.percentage || 0).toFixed(1)}%</b></div><div className={styles.activityMeta}>{result.type?.replaceAll('_', ' ')} · {Number(result.total_marks || 0)}/{Number(result.max_marks || 0)} marks{result.rank_school ? ` · School rank #${result.rank_school}` : ''}{result.rank_overall ? ` · Overall rank #${result.rank_overall}` : ''}</div></div>
          </div>
        ))}
        {!recentResults.length && <div className={styles.empty}>Your scored test and exam results will appear here.</div>}
      </div>
    </>
  );
}
