'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getChildren, getChildDashboard } from '@/services/parentService';
import { StatCard, ProgressBar, CardSkeleton } from '@/components/ui/index';
import { formatDate, gradeFromScore } from '@/utils/formatters';
import useLanguageStore from '@/store/languageStore';
import toast from 'react-hot-toast';

export default function ParentDashboard() {
  const { t } = useLanguageStore();
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

  const isLoading = childrenLoading || dashLoading;

  return (
    <div className="animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="font-display font-extrabold text-2xl" style={{ color: 'var(--forest)' }}>
            🙏 {t('नमस्ते!', 'Namaste!')}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--slate)' }}>
            {t('अपने बच्चे की प्रगति देखें', "Track your child's progress")}
          </p>
        </div>
        <button className="btn-green" onClick={() => toast('📲 Sharing progress report on WhatsApp...')}>
          📲 {t('प्रगति शेयर करें', 'Share Progress')}
        </button>
      </div>

      {children.length > 1 && (
        <div className="flex gap-2 mb-5 flex-wrap">
          {children.map((child) => (
            <button key={child.id} onClick={() => setSelectedChild(child.id)}
              className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
              style={{
                background: selectedChild === child.id ? 'var(--forest)' : 'white',
                color: selectedChild === child.id ? 'white' : 'var(--slate)',
                border: `1.5px solid ${selectedChild === child.id ? 'var(--forest)' : 'var(--border)'}`,
              }}>
              {child.name.split(' ')[0]} ({t('कक्षा', 'Class')} {child.class_name})
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 stagger">
            <StatCard
              label={t('आज की उपस्थिति', "Today's Attendance")}
              value={dash?.todayAttendance?.status === 'PRESENT' ? '✅ Present' : dash?.todayAttendance?.status === 'ABSENT' ? '❌ Absent' : '—'}
              sub={dash?.todayAttendance ? t('चिह्नित', 'Marked') : t('अभी तक नहीं', 'Not yet')}
              accent="var(--forest)" />
            <StatCard label={t('मासिक उपस्थिति', 'Monthly Attendance')} value={`${attendance?.percentage || 0}%`} sub={`${attendance?.present_days || 0}/${(attendance?.present_days || 0) + (attendance?.absent_days || 0)} days`} accent="var(--navy)" />
            <StatCard label={t('फीस स्थिति', 'Fee Status')} value={fees.some((fee) => ['PENDING', 'OVERDUE'].includes(fee.status)) ? '⏳ Pending' : '✅ Paid'} sub={t('इस वर्ष', 'This year')} accent="var(--gold)" />
            <StatCard label="XP Level" value={`Level ${student?.xp_level || 1}`} sub={`${student?.xp_total || 0} XP`} accent="var(--saffron)" />
          </div>

          <div className="grid md:grid-cols-2 gap-5 mb-5">
            <div className="card">
              <h3 className="font-display font-bold text-base mb-4" style={{ color: 'var(--forest)' }}>
                📊 {t('विषय प्रगति', 'Subject Progress')}
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

            <div className="card">
              <h3 className="font-display font-bold text-base mb-4" style={{ color: 'var(--forest)' }}>
                📝 {t('हाल के परीक्षा परिणाम', 'Recent Exam Results')}
              </h3>
              {exams.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--slate)' }}>{t('कोई परिणाम नहीं', 'No results yet')}</p>
              ) : exams.map((exam, i) => {
                const score = Number(exam.score || 0);
                const totalMarks = Number(exam.total_marks || 0);
                const { grade, color } = gradeFromScore(score, totalMarks);
                return (
                  <div key={i} className="flex items-center justify-between py-3" style={{ borderBottom: i < exams.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: 'var(--navy)' }}>{exam.exam_name || exam.title}</p>
                      <p className="text-xs" style={{ color: 'var(--slate)' }}>{formatDate(exam.submitted_at)}</p>
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
        </>
      )}
    </div>
  );
}
