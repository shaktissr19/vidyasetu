'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getChildren, getChildDashboard } from '@/services/parentService';
import { StatCard, ProgressBar, CardSkeleton } from '@/components/ui/index';
import { formatDate, gradeFromScore, timeAgo } from '@/utils/formatters';
import useLanguageStore from '@/store/languageStore';
import useAuthStore from '@/store/authStore';
import toast from 'react-hot-toast';

const NOTIF_ICONS: Record<string, string> = {
  ATTENDANCE_ABSENT: '📅', ATTENDANCE_LATE: '⏰', FEE_DUE: '💰', FEE_OVERDUE: '🔴',
  FEE_RECEIVED: '✅', EXAM_REMINDER: '📝', RESULT_PUBLISHED: '📊', ANNOUNCEMENT: '📢',
  BADGE_EARNED: '🏅', DOUBT_ANSWERED: '💬', OLYMPIAD_REMINDER: '🏆',
};

export default function ParentDashboard() {
  const { t } = useLanguageStore();
  const { user } = useAuthStore();
  const [selectedChild, setSelectedChild] = useState<string | null>(null);

  const { data: children = [], isLoading: childrenLoading } = useQuery({
    queryKey: ['parent-children'],
    queryFn: () => getChildren().then((r) => r.data.data),
  });

  useEffect(() => {
    if (children.length && !selectedChild) setSelectedChild(children[0]?.id || null);
  }, [children, selectedChild]);

  const { data: dash, isLoading: dashLoading } = useQuery({
    queryKey: ['parent-child-dash', selectedChild],
    queryFn: async () => {
      if (!selectedChild) throw new Error('No child selected');
      return getChildDashboard(selectedChild).then((r) => r.data.data);
    },
    enabled: !!selectedChild,
  });

  const student = dash?.student;
  const attendance = dash?.attendance;
  const progress = dash?.subjectProgress || [];
  const exams = dash?.recentExams || [];
  const fees = dash?.fees || [];
  const notifications = dash?.notifications || [];
  const pendingFees = fees.filter((fee) => ['PENDING', 'OVERDUE', 'PARTIAL'].includes(fee.status));
  const isLoading = childrenLoading || dashLoading;
  const firstName = user?.name?.split(' ')[0] || t('अभिभावक', 'Parent');

  return (
    <div className="animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="font-display font-extrabold text-2xl" style={{ color: 'var(--forest)' }}>
            🙏 {t(`नमस्ते, ${firstName} जी!`, `Namaste, ${firstName}!`)}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--slate)' }}>
            {t('अपने बच्चे की प्रगति देखें', "Track your child's progress")}
          </p>
        </div>
        <button className="btn-green" onClick={() => toast(`📲 ${student?.name || 'Student'} progress summary ready to share on WhatsApp`)}>
          📲 {t('प्रगति शेयर करें', 'Share Progress')}
        </button>
      </div>

      {children.length > 0 && (
        <div className="flex gap-2 mb-5 flex-wrap">
          {children.map((child) => (
            <button key={child.id} onClick={() => setSelectedChild(child.id)}
              className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
              style={{
                background: selectedChild === child.id ? 'var(--forest)' : 'white',
                color: selectedChild === child.id ? 'white' : 'var(--slate)',
                border: `1.5px solid ${selectedChild === child.id ? 'var(--forest)' : 'var(--border)'}`,
              }}>
              {child.profile_photo ? '👤' : child.name.toLowerCase().includes('priya') ? '👧' : '👦'} {child.name.split(' ')[0]} ({t('कक्षा', 'Class')} {child.class_name})
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : !dash ? (
        <div className="card text-center py-12" style={{ color: 'var(--slate)' }}>{t('कोई लिंक किया हुआ बच्चा नहीं मिला', 'No linked child found')}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 stagger">
            <StatCard
              label={t('आज की उपस्थिति', "Today's Attendance")}
              value={dash.todayAttendance?.status === 'PRESENT' ? '✅ Present' : dash.todayAttendance?.status === 'ABSENT' ? '❌ Absent' : dash.todayAttendance?.status === 'LATE' ? '⏰ Late' : '—'}
              sub={dash.todayAttendance?.created_at ? `${t('चिह्नित', 'Marked')} ${new Date(dash.todayAttendance.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : t('अभी तक नहीं', 'Not yet')}
              accent="var(--forest)" />
            <StatCard
              label={t('मासिक उपस्थिति', 'Monthly Attendance')}
              value={`${Number(attendance?.percentage || 0).toFixed(Number(attendance?.percentage || 0) % 1 ? 1 : 0)}%`}
              sub={`${attendance?.present_days || 0}/${attendance?.working_days || 0} ${t('स्कूल दिन', 'school days')}`}
              accent="var(--saffron)" />
            <StatCard
              label={t('कक्षा रैंक', 'Class Rank')}
              value={dash.academicRanking?.rank ? `#${dash.academicRanking.rank}` : '—'}
              sub={dash.academicRanking?.average != null ? `${Number(dash.academicRanking.average).toFixed(1)}% ${t('औसत', 'average')}` : t('स्कोर की गई स्कूल परीक्षाओं पर', 'Based on scored school tests')}
              accent="var(--navy)" />
            <StatCard
              label={t('फीस स्थिति', 'Fee Status')}
              value={pendingFees.length ? '⏳ Pending' : '✅ Paid'}
              sub={dash.nextFee?.due_date ? `${t('अगली देय', 'Next due')}: ${formatDate(dash.nextFee.due_date)}` : t('कोई बकाया नहीं', 'No outstanding due')}
              accent="var(--gold)" />
          </div>

          <div className="grid md:grid-cols-2 gap-5 mb-5">
            <div className="card" style={{ borderLeft: '4px solid var(--forest)' }}>
              <h3 className="font-display font-bold text-base mb-4" style={{ color: 'var(--forest)' }}>
                📊 {student?.name ? `${student.name.split(' ')[0]}'s ` : ''}{t('प्रदर्शन', 'Performance')}
              </h3>
              <div className="space-y-3">
                {progress.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--slate)' }}>{t('डेटा उपलब्ध नहीं', 'No data available')}</p>
                ) : progress.map((subject) => {
                  const pct = Number(subject.progress_pct || 0);
                  return <ProgressBar key={subject.code} label={subject.name} pct={pct} color={pct >= 75 ? 'var(--forest)' : 'var(--saffron)'} />;
                })}
              </div>
            </div>

            <div className="card" style={{ borderLeft: '4px solid var(--forest)' }}>
              <h3 className="font-display font-bold text-base mb-4" style={{ color: 'var(--forest)' }}>
                📝 {t('हाल के परीक्षा परिणाम', 'Recent Exam Results')}
              </h3>
              {exams.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--slate)' }}>{t('कोई परिणाम नहीं', 'No results yet')}</p>
              ) : exams.slice(0, 4).map((exam, i) => {
                const score = Number(exam.total_marks || exam.score || 0);
                const totalMarks = Number(exam.max_marks || 0);
                const { grade, color } = gradeFromScore(score, totalMarks || 1);
                return (
                  <div key={exam.exam_id || `${exam.title}-${i}`} className="flex items-center justify-between py-3" style={{ borderBottom: i < Math.min(exams.length, 4) - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: 'var(--navy)' }}>{exam.exam_name || exam.title}</p>
                      <p className="text-xs" style={{ color: 'var(--slate)' }}>{formatDate(exam.submitted_at)}{exam.rank_school ? ` · Rank #${exam.rank_school}` : ''}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-display font-extrabold text-lg" style={{ color }}>{grade}</p>
                      <p className="text-xs" style={{ color: 'var(--slate)' }}>{score}/{totalMarks}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card" style={{ borderLeft: '4px solid var(--forest)' }}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="font-display font-bold text-base" style={{ color: 'var(--forest)' }}>🔔 {t('हाल की गतिविधि', 'Recent Activity')}</h3>
              {dash.classTeacher && <span className="text-xs" style={{ color: 'var(--slate)' }}>👩‍🏫 {t('कक्षा शिक्षक', 'Class Teacher')}: {dash.classTeacher.name}</span>}
            </div>
            {notifications.length === 0 ? <p className="text-sm" style={{ color: 'var(--slate)' }}>{t('कोई हाल की सूचना नहीं', 'No recent notifications')}</p> : (
              <div className="space-y-1">
                {notifications.slice(0, 5).map((notification) => (
                  <div key={notification.id} className="flex items-start gap-3 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
                    <span className="text-lg">{NOTIF_ICONS[notification.type] || '🔔'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold" style={{ color: 'var(--navy)' }}>{notification.title || notification.type.replaceAll('_', ' ')}</div>
                      {notification.body && <div className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>{notification.body}</div>}
                    </div>
                    <span className="text-xs whitespace-nowrap" style={{ color: 'var(--slate)' }}>{timeAgo(notification.created_at || notification.sent_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
