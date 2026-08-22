'use client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { listCompetitions, registerExam } from '@/services/competitionService';
import { CardSkeleton } from '@/components/ui/index';
import { formatDate, formatCurrency } from '@/utils/formatters';
import { apiErrorText } from '@/utils/errors';
import useLanguageStore from '@/store/languageStore';
import toast from 'react-hot-toast';

export default function ExamsPage() {
  const { t } = useLanguageStore();
  const router = useRouter();

  const { data: exams = [], isLoading, refetch } = useQuery({
    queryKey: ['competitions-list'],
    queryFn: () => listCompetitions().then(r => r.data.data),
  });

  const registerMut = useMutation({
    mutationFn: (examId: string) => registerExam(examId),
    onSuccess: async () => { toast.success('✅ Registered successfully!'); await refetch(); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Failed to register')),
  });

  const upcoming = exams.filter(e => ['REGISTRATION_OPEN', 'LIVE'].includes(e.status));
  const completed = exams.filter(e => e.status === 'COMPLETED');

  if (isLoading) return <div className="space-y-3">{[...Array(3)].map((_, i) => <CardSkeleton key={i} />)}</div>;

  return (
    <div className="animate-fade-up">
      <h1 className="font-display font-extrabold text-2xl mb-5" style={{ color: 'var(--navy)' }}>🏆 {t('प्रतियोगिताएँ', 'Competitions & Challenges')}</h1>

      {upcoming.length > 0 && (
        <div className="mb-6">
          <h2 className="font-display font-bold text-base mb-3" style={{ color: 'var(--navy)' }}>🔴 {t('आगामी प्रतियोगिताएँ', 'Upcoming Competitions')}</h2>
          <div className="space-y-3 stagger">
            {upcoming.map(exam => (
              <div key={exam.id} className="card animate-fade-up" style={{ borderLeft: `4px solid ${exam.status === 'LIVE' ? 'var(--forest)' : 'var(--saffron)'}` }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-display font-bold text-base truncate" style={{ color: 'var(--navy)' }}>{exam.title}</h3>
                      <span className={`badge ${exam.status === 'LIVE' ? 'badge-green' : 'badge-orange'} flex-shrink-0`}>{exam.status === 'LIVE' ? '🟢 LIVE' : '📋 Registration Open'}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--slate)' }}>
                      <span>📅 {formatDate(exam.start_time)}</span>
                      <span>⏱ {exam.duration_mins || 0} min</span>
                      <span>📝 {exam.total_questions || 0} questions</span>
                      {exam.prize_pool && <span style={{ color: 'var(--saffron)' }}>🏆 {formatCurrency(exam.prize_pool)} prize</span>}
                      <span>🎓 Class {exam.class_names?.join(', ') || 'All'}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {exam.registration_id || exam.registered ? (
                      exam.status === 'LIVE' ? (
                        <button className="btn-primary" style={{ background: 'linear-gradient(135deg, var(--forest), var(--forest-light))' }} onClick={() => router.push(`/exams/${exam.id}`)}>Start Challenge →</button>
                      ) : <span className="badge badge-green">✅ Registered</span>
                    ) : (
                      <button className="btn-primary" disabled={registerMut.isPending} onClick={() => registerMut.mutate(exam.id)}>Register Free</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {completed.length > 0 && (
        <div>
          <h2 className="font-display font-bold text-base mb-3" style={{ color: 'var(--slate)' }}>✅ {t('पिछली प्रतियोगिताएँ', 'Past Competitions')}</h2>
          <div className="space-y-2 stagger">
            {completed.map(exam => (
              <div key={exam.id} className="card flex flex-wrap items-center justify-between gap-3 animate-fade-up">
                <div>
                  <p className="font-semibold text-sm" style={{ color: 'var(--navy)' }}>{exam.title}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>{formatDate(exam.start_time)}</p>
                </div>
                {exam.attempt_status === 'EVALUATED' ? (
                  <div className="text-right">
                    <p className="font-display font-extrabold text-xl" style={{ color: 'var(--saffron)' }}>{exam.score ?? '—'}/{exam.total_marks ?? '—'}</p>
                    <button className="text-xs mt-0.5" style={{ color: 'var(--saffron)' }} onClick={() => router.push(`/competition/${exam.id}/leaderboard`)}>View Leaderboard →</button>
                  </div>
                ) : <span className="badge badge-blue">Not attempted</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {exams.length === 0 && (
        <div className="card text-center py-16">
          <div className="text-5xl mb-4">🏆</div>
          <p className="font-display font-bold text-lg" style={{ color: 'var(--navy)' }}>{t('अभी कोई प्रतियोगिता नहीं', 'No competitions yet')}</p>
          <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>{t('नई शैक्षणिक चुनौतियाँ जल्द आएंगी।', 'New academic challenges are coming soon.')}</p>
        </div>
      )}
    </div>
  );
}
