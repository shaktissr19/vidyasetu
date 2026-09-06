'use client';

import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import { listMyExams, registerExam } from '@/services/competitionService';
import { CardSkeleton } from '@/components/ui/index';
import { formatDate, formatCurrency } from '@/utils/formatters';
import { apiErrorText } from '@/utils/errors';
import useLanguageStore from '@/store/languageStore';
import toast from 'react-hot-toast';

const ACTIVE_STATUSES = ['REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'LIVE', 'SCORING'] as const;

function statusCopy(status: string, t: (hi: string, en: string) => string): string {
  switch (status) {
    case 'LIVE': return t('🟢 लाइव', '🟢 LIVE');
    case 'REGISTRATION_OPEN': return t('📋 रजिस्ट्रेशन खुला', '📋 Registration open');
    case 'REGISTRATION_CLOSED': return t('🔒 रजिस्ट्रेशन बंद', '🔒 Registration closed');
    case 'SCORING': return t('⏳ परिणाम तैयार हो रहे हैं', '⏳ Results being prepared');
    case 'COMPLETED': return t('✅ परिणाम जारी', '✅ Results released');
    default: return status;
  }
}

export default function ExamsPage() {
  const { t } = useLanguageStore();
  const { data: exams = [], isLoading, refetch } = useQuery({
    queryKey: ['student-competitions-v2'],
    queryFn: () => listMyExams().then((response) => response.data.data),
  });

  const registerMut = useMutation({
    mutationFn: (examId: string) => registerExam(examId),
    onSuccess: async () => {
      toast.success(t('✅ रजिस्ट्रेशन सफल रहा', '✅ Registered successfully'));
      await refetch();
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Failed to register')),
  });

  const current = exams.filter((exam) => ACTIVE_STATUSES.includes(exam.status as (typeof ACTIVE_STATUSES)[number]));
  const completed = exams.filter((exam) => exam.status === 'COMPLETED');

  if (isLoading) return <div className="space-y-3">{[...Array(3)].map((_, index) => <CardSkeleton key={index} />)}</div>;

  return (
    <div className="animate-fade-up">
      <div style={{ marginBottom: 22 }}>
        <h1 className="font-display font-extrabold text-2xl" style={{ color: 'var(--navy)' }}>🏆 {t('प्रतियोगिताएँ', 'Competitions & Challenges')}</h1>
        <p style={{ color: 'var(--slate)', fontSize: 13, marginTop: 5 }}>{t('प्रतिस्पर्धा करें, अपनी ताकत पहचानें और परिणाम को अगले सीखने वाले कदम में बदलें।', 'Compete, discover your strengths, and turn every result into a useful next learning step.')}</p>
      </div>

      {current.length > 0 && (
        <section className="mb-6">
          <h2 className="font-display font-bold text-base mb-3" style={{ color: 'var(--navy)' }}>🚀 {t('अभी और आगामी', 'Current & upcoming')}</h2>
          <div className="space-y-3 stagger">
            {current.map((exam) => {
              const registered = Boolean(exam.registration_id || exam.registered);
              const submitted = exam.attempt_status === 'SCORED';
              const inProgress = exam.attempt_status === 'IN_PROGRESS';
              return (
                <div key={exam.id} className="card animate-fade-up" style={{ borderLeft: `4px solid ${exam.status === 'LIVE' ? 'var(--forest)' : exam.status === 'SCORING' ? '#5B6EA6' : 'var(--saffron)'}` }}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-display font-bold text-base" style={{ color: 'var(--navy)' }}>{exam.title}</h3>
                        <span className={`badge ${exam.status === 'LIVE' ? 'badge-green' : exam.status === 'SCORING' ? 'badge-blue' : 'badge-orange'}`}>{statusCopy(exam.status, t)}</span>
                      </div>
                      {exam.subtitle && <p style={{ color: 'var(--slate)', fontSize: 13, marginBottom: 6 }}>{exam.subtitle}</p>}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--slate)' }}>
                        <span>📅 {formatDate(exam.start_time)}</span>
                        <span>⏱ {exam.duration_mins || 0} min</span>
                        <span>📝 {exam.total_questions || 0} questions</span>
                        {Number(exam.prize_pool || 0) > 0 && <span style={{ color: 'var(--saffron)' }}>🏆 {formatCurrency(exam.prize_pool)} {t('मान्यता/पुरस्कार', 'recognition/prize')}</span>}
                        <span>🎓 {exam.class_names?.length ? `Class ${exam.class_names.join(', ')}` : t('सभी कक्षाएँ', 'All classes')}</span>
                        {exam.subject_codes?.length ? <span>📚 {exam.subject_codes.join(', ')}</span> : null}
                      </div>
                    </div>

                    <div className="flex gap-2 items-center flex-wrap">
                      {submitted ? (
                        <span className="badge badge-blue">✅ {exam.status === 'COMPLETED' ? t('परिणाम तैयार', 'Result ready') : t('जमा · परिणाम लंबित', 'Submitted · results pending')}</span>
                      ) : exam.status === 'LIVE' && registered ? (
                        <Link href={`/exams/${exam.id}`} className="btn-primary" style={{ background: 'linear-gradient(135deg, var(--forest), var(--forest-light))' }}>
                          {inProgress ? t('प्रयास जारी रखें →', 'Resume challenge →') : t('प्रतियोगिता शुरू करें →', 'Start competition →')}
                        </Link>
                      ) : registered ? (
                        <span className="badge badge-green">✅ {t('रजिस्टर्ड', 'Registered')}</span>
                      ) : exam.status === 'REGISTRATION_OPEN' ? (
                        <button className="btn-primary" disabled={registerMut.isPending} onClick={() => registerMut.mutate(exam.id)}>{t('मुफ़्त रजिस्टर करें', 'Register free')}</button>
                      ) : (
                        <span className="badge badge-blue">{statusCopy(exam.status, t)}</span>
                      )}
                    </div>
                  </div>
                  {submitted && exam.attempt_id && (
                    <div style={{ marginTop: 12 }}>
                      <Link href={`/exams/results/${exam.attempt_id}`} className="btn-outline">{exam.status === 'COMPLETED' ? t('आधिकारिक परिणाम और सीखने की प्रतिक्रिया देखें', 'View official result & learning feedback') : t('परिणाम स्थिति देखें', 'View result status')}</Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {completed.length > 0 && (
        <section>
          <h2 className="font-display font-bold text-base mb-3" style={{ color: 'var(--slate)' }}>✅ {t('पिछली प्रतियोगिताएँ', 'Past competitions')}</h2>
          <div className="space-y-2 stagger">
            {completed.map((exam) => (
              <div key={exam.id} className="card flex flex-wrap items-center justify-between gap-3 animate-fade-up">
                <div>
                  <p className="font-semibold text-sm" style={{ color: 'var(--navy)' }}>{exam.title}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>{formatDate(exam.start_time)}{exam.participant_count != null ? ` · ${exam.participant_count} ${t('प्रतिभागी', 'participants')}` : ''}</p>
                </div>
                {exam.attempt_id ? (
                  <div className="flex items-center gap-3 flex-wrap">
                    {exam.rank_overall != null && <span className="badge badge-green">🏅 #{exam.rank_overall}</span>}
                    <Link href={`/exams/results/${exam.attempt_id}`} className="btn-primary">{t('मेरा परिणाम', 'My result')}</Link>
                    <Link href={`/competition/${exam.id}/leaderboard`} className="btn-outline">{t('लीडरबोर्ड', 'Leaderboard')}</Link>
                  </div>
                ) : (
                  <Link href={`/competition/${exam.id}/leaderboard`} className="btn-outline">{t('लीडरबोर्ड देखें', 'View leaderboard')}</Link>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {exams.length === 0 && (
        <div className="card text-center py-16">
          <div className="text-5xl mb-4">🏆</div>
          <p className="font-display font-bold text-lg" style={{ color: 'var(--navy)' }}>{t('अभी कोई प्रतियोगिता नहीं', 'No competitions yet')}</p>
          <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>{t('नई शैक्षणिक चुनौतियाँ यहाँ दिखाई देंगी।', 'New academic challenges will appear here.')}</p>
        </div>
      )}
    </div>
  );
}
