'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { listCompetitions, listMyExams, registerExam, getLeaderboard } from '@/services/competitionService';
import { LBRow, CardSkeleton } from '@/components/ui/index';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { apiErrorText } from '@/utils/errors';
import useAuthStore from '@/store/authStore';
import useLanguageStore from '@/store/languageStore';
import GlobalTopbar from '@/components/layout/GlobalTopbar';
import ImageHero from '@/components/public/ImageHero';
import { HERO_IMAGES, HERO_POSITIONS } from '@/components/public/heroAssets';
import toast from 'react-hot-toast';

const STATUS_LABEL: Record<string, string> = {
  REGISTRATION_OPEN: 'Registration Open',
  REGISTRATION_CLOSED: 'Registration Closed',
  LIVE: '🟢 LIVE',
  SCORING: 'Results Processing',
  COMPLETED: 'Results Released',
};

export default function CompetitionPage() {
  const { isLoggedIn, user } = useAuthStore();
  const { t } = useLanguageStore();
  const router = useRouter();
  const isStudent = isLoggedIn && user?.role === 'STUDENT';
  const [lbExamId, setLbExamId] = useState<string | null>(null);
  const activeLbExamId = lbExamId || '';

  const { data: exams = [], isLoading, refetch } = useQuery({
    queryKey: ['competition-discovery-v2', isStudent ? 'student' : 'public'],
    queryFn: () => (isStudent ? listMyExams() : listCompetitions()).then((response) => response.data.data),
  });
  const { data: leaderboard = [], error: leaderboardError } = useQuery({
    queryKey: ['competition-public-lb-v2', activeLbExamId],
    queryFn: () => getLeaderboard(activeLbExamId).then((response) => response.data.data),
    enabled: Boolean(activeLbExamId),
    retry: false,
  });

  const goToStudentLogin = () => router.push('/login?role=student');
  const registerMut = useMutation({
    mutationFn: (examId: string) => registerExam(examId),
    onSuccess: async () => {
      toast.success(t('रजिस्ट्रेशन सफल रहा', 'Registered successfully'));
      await refetch();
    },
    onError: (error: unknown) => {
      if (!isStudent) {
        toast(t('रजिस्टर करने के लिए Student account से लॉगिन करें।', 'Login with a Student account to register.'));
        goToStudentLogin();
        return;
      }
      toast.error(apiErrorText(error, 'Failed to register'));
    },
  });

  return <>
    <GlobalTopbar />
    <div>
      <ImageHero
        variant="compact"
        image={HERO_IMAGES.competition}
        imagePosition={HERO_POSITIONS.competition}
        eyebrow="Academic Competitions"
        title="Give talent somewhere to go."
        description="Compete fairly, earn recognition and turn every result into a useful next learning step."
        theme="rose"
        actions={[{ label: 'Explore competitions', href: '#competition-list' }, { label: 'Student login', href: '/login?role=student', variant: 'secondary' }]}
      />

      <div id="competition-list" className="max-w-5xl mx-auto" style={{ padding: '32px 32px 0', scrollMarginTop: 96 }}>
        <div style={{ background: '#FFF8EF', border: '1px solid #FFD7B5', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
          <div>
            <strong style={{ color: 'var(--navy)' }}>{t('प्रतियोगिता सीखने का हिस्सा है, सिर्फ रैंक का नहीं।', 'Competition is part of learning, not just ranking.')}</strong>
            <div style={{ fontSize: 13, color: 'var(--slate)', marginTop: 3 }}>{t('हर Platform Competition governed bilingual Question Bank से बनती है। आधिकारिक परिणाम जारी होने तक स्कोर और सही उत्तर छिपे रहते हैं।', 'Platform competitions are built from the governed bilingual Question Bank. Scores and correct answers stay private until official results are released.')}</div>
          </div>
          {!isStudent && <button className="btn-primary" onClick={goToStudentLogin}>{t('Student Dashboard में लॉगिन', 'Login to Student Dashboard')}</button>}
        </div>

        {isLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>{[...Array(3)].map((_, index) => <CardSkeleton key={index} />)}</div>
        ) : exams.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 38, marginBottom: 10 }}>🏆</div>
            <h2 className="font-display" style={{ fontWeight: 800, color: 'var(--navy)' }}>{t('अभी कोई प्रकाशित प्रतियोगिता नहीं है', 'No published competitions right now')}</h2>
            <p style={{ color: 'var(--slate)', marginTop: 8 }}>{t('नई governed शैक्षणिक प्रतियोगिता प्रकाशित होने पर वह यहाँ दिखाई देगी।', 'New governed academic competitions will appear here when published.')}</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
            {exams.map((exam) => {
              const registered = Boolean(exam.registration_id || exam.registered);
              const submitted = exam.attempt_status === 'SCORED';
              const participantCount = Number(exam.participant_count || 0);
              const registrationCount = Number(exam.registration_count || 0);
              return (
                <div key={exam.id} className="card" style={{ overflow: 'hidden', border: 'none', padding: 0, boxShadow: '0 4px 24px rgba(13,27,62,0.12)' }}>
                  <div style={{ background: exam.status === 'LIVE' ? 'linear-gradient(135deg, var(--forest), #0A6B06)' : 'linear-gradient(135deg, var(--navy), var(--navy-mid))', padding: 20 }}>
                    <div className="flex items-center justify-between mb-2"><h3 className="font-display" style={{ fontWeight: 700, color: 'white', fontSize: '1.05rem' }}>{exam.title}</h3></div>
                    <span style={{ background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.85)', fontSize: '0.75rem', padding: '3px 10px', borderRadius: 20 }}>{STATUS_LABEL[exam.status] || exam.status} · Class {exam.class_names?.join(', ') || 'All'}</span>
                  </div>
                  <div style={{ padding: 20 }}>
                    {exam.subtitle && <p style={{ color: 'var(--slate)', fontSize: 13, marginBottom: 10 }}>{exam.subtitle}</p>}
                    {[
                      ['📅 Date', formatDate(exam.start_time)],
                      ['⏱ Duration', `${exam.duration_mins || 0} minutes`],
                      ['📝 Questions', `${exam.total_questions || 0} MCQs`],
                      ['🏆 Recognition / Prize', formatCurrency(exam.prize_pool)],
                    ].map(([label, value]) => <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '0.85rem' }}><span style={{ color: 'var(--slate)' }}>{label}</span><span style={{ fontWeight: 700, color: label.includes('Recognition') ? 'var(--saffron)' : 'var(--navy)' }}>{value}</span></div>)}
                    <div style={{ fontSize: 12, color: 'var(--slate)', marginTop: 8 }}>{exam.status === 'COMPLETED' ? `${participantCount} participants` : `${registrationCount} registered`}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                      {exam.status === 'COMPLETED' ? (
                        <>
                          {submitted && exam.attempt_id ? <button className="btn-primary w-full justify-center" onClick={() => router.push(`/exams/results/${exam.attempt_id}`)}>{t('मेरा परिणाम', 'My Result')}</button> : null}
                          <button className="btn-outline w-full justify-center" onClick={() => setLbExamId(exam.id === lbExamId ? null : exam.id)}>{lbExamId === exam.id ? t('लीडरबोर्ड छिपाएँ', 'Hide Leaderboard') : t('लीडरबोर्ड देखें', 'View Leaderboard')}</button>
                        </>
                      ) : submitted ? (
                        <button className="w-full py-3 rounded-xl font-display font-bold text-sm" style={{ background: '#EEF2F7', color: 'var(--navy)' }} disabled>✅ {t('जमा · परिणाम लंबित', 'Submitted · results pending')}</button>
                      ) : exam.status === 'LIVE' && registered ? (
                        <button className="btn-primary w-full justify-center" style={{ background: 'linear-gradient(135deg, var(--forest), var(--forest-light))' }} onClick={() => isStudent ? router.push(`/exams/${exam.id}`) : goToStudentLogin()}>{exam.attempt_status === 'IN_PROGRESS' ? t('प्रयास जारी रखें', 'Resume Competition') : t('प्रतियोगिता शुरू करें', 'Start Competition')}</button>
                      ) : registered ? (
                        <button className="w-full py-3 rounded-xl font-display font-bold text-sm" style={{ background: 'var(--forest-pale)', color: 'var(--forest)' }} disabled>✅ {t('रजिस्टर्ड', 'Registered')}</button>
                      ) : exam.status === 'REGISTRATION_OPEN' ? (
                        <button className="btn-primary w-full justify-center" disabled={registerMut.isPending} onClick={() => isStudent ? registerMut.mutate(exam.id) : goToStudentLogin()}>{t('रजिस्टर करें', 'Register')}</button>
                      ) : (
                        <button className="w-full py-3 rounded-xl font-display font-bold text-sm" style={{ background: '#F5F7FA', color: 'var(--slate)' }} disabled>{STATUS_LABEL[exam.status] || exam.status}</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {lbExamId && (
        <div className="max-w-2xl mx-auto" style={{ padding: 32 }}>
          <h2 className="font-display text-center mb-5" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--navy)' }}>🏅 {t('आधिकारिक लीडरबोर्ड', 'Official Leaderboard')}</h2>
          {leaderboardError ? <div className="card" style={{ textAlign: 'center', color: 'var(--slate)' }}>{apiErrorText(leaderboardError, 'Leaderboard is not available until official results are released.')}</div> : (
            <div className="stagger">{leaderboard.slice(0, 10).map((row, index) => <div key={`${row.rank || index}-${row.name || row.student_name || 'student'}`} className="animate-fade-up"><LBRow rank={row.rank ?? index + 1} name={row.name || row.student_name || ''} school={row.school_name || ''} score={row.score ?? '—'} /></div>)}</div>
          )}
        </div>
      )}

      <footer style={{ background: 'var(--navy)', color: 'rgba(255,255,255,0.5)', padding: '30px 32px', textAlign: 'center', fontSize: '0.82rem', marginTop: 64 }}>© 2026 VidyaSetu · <button onClick={() => router.push('/')} style={{ border: 0, background: 'transparent', color: 'var(--saffron-light)', cursor: 'pointer', fontWeight: 700 }}>Back to Home</button></footer>
    </div>
  </>;
}
