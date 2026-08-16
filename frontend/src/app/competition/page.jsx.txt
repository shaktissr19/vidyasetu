'use client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { listCompetitions, registerExam, getLeaderboard } from '@/services/competitionService';
import { LBRow, CardSkeleton } from '@/components/ui/index';
import { formatCurrency, formatDate } from '@/utils/formatters';
import useAuthStore from '@/store/authStore';
import useLanguageStore from '@/store/languageStore';
import Navbar from '@/components/layout/Navbar';
import toast from 'react-hot-toast';
import { useState } from 'react';

export default function CompetitionPage() {
  const { isLoggedIn } = useAuthStore();
  const { t } = useLanguageStore();
  const router = useRouter();
  const [lbExamId, setLbExamId] = useState(null);

  const { data: exams = [], isLoading, refetch } = useQuery({
    queryKey: ['competitions-list'],
    queryFn:  () => listCompetitions().then(r => r.data.data),
  });

  const { data: leaderboard = [] } = useQuery({
    queryKey: ['exam-lb', lbExamId],
    queryFn:  () => getLeaderboard(lbExamId).then(r => r.data.data),
    enabled:  !!lbExamId,
  });

  const registerMut = useMutation({
    mutationFn: (examId) => registerExam(examId),
    onSuccess:  () => { toast.success('✅ Registered successfully!'); refetch(); },
    onError:    (err) => {
      if (!isLoggedIn) { toast('Please login to register'); router.push('/login'); return; }
      toast.error(err.response?.data?.error?.message || 'Failed to register');
    },
  });

  const STATUS_COLOR  = { REGISTRATION_OPEN: 'var(--saffron)', LIVE: 'var(--forest)', COMPLETED: 'var(--slate)' };
  const STATUS_LABEL  = { REGISTRATION_OPEN: 'Registration Open', LIVE: '🟢 LIVE', COMPLETED: 'Completed' };

  return (
    <>
      <Navbar />
      <div style={{ paddingTop: 62 }}>
        {/* Hero */}
        <div style={{ background: 'linear-gradient(135deg, #1a0533, #2d0a52)', padding: '60px 32px 40px', textAlign: 'center' }}>
          <h1 className="font-display" style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', fontWeight: 800, color: 'white', marginBottom: 12 }}>
            🏆 {t('मासिक ओलंपियाड परीक्षाएँ', 'Monthly Olympiad Exams')}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.65)', maxWidth: 500, margin: '0 auto' }}>
            {t('छात्रवृत्ति जीतें, प्रमाणपत्र अर्जित करें, पूरे भारत के छात्रों से प्रतिस्पर्धा करें!', 'Win scholarships, earn certificates, compete with students across Bharat!')}
          </p>
        </div>

        {/* Exam cards */}
        <div className="max-w-5xl mx-auto" style={{ padding: '32px 32px 0' }}>
          {isLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
              {[...Array(3)].map((_, i) => <CardSkeleton key={i} />)}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
              {exams.map(exam => (
                <div key={exam.id} className="card" style={{ overflow: 'hidden', border: 'none', padding: 0, boxShadow: '0 4px 24px rgba(13,27,62,0.12)' }}>
                  {/* Card header */}
                  <div style={{ background: exam.status === 'LIVE' ? 'linear-gradient(135deg, var(--forest), #0A6B06)' : 'linear-gradient(135deg, var(--navy), var(--navy-mid))', padding: '20px' }}>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-display" style={{ fontWeight: 700, color: 'white', fontSize: '1.05rem' }}>{exam.title}</h3>
                    </div>
                    <span style={{ background: `rgba(255,255,255,0.15)`, color: 'rgba(255,255,255,0.85)', fontSize: '0.75rem', padding: '3px 10px', borderRadius: 20 }}>
                      {STATUS_LABEL[exam.status] || exam.status} · Class {exam.class_names?.join(', ')}
                    </span>
                  </div>

                  {/* Card body */}
                  <div style={{ padding: '20px' }}>
                    {[
                      ['📅 Date', formatDate(exam.start_time)],
                      ['⏱ Duration', `${exam.duration_mins} minutes`],
                      ['📝 Questions', `${exam.total_questions} MCQs`],
                      ['🏆 Prize Pool', formatCurrency(exam.prize_pool)],
                    ].map(([label, value]) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '0.85rem' }}>
                        <span style={{ color: 'var(--slate)' }}>{label}</span>
                        <span style={{ fontWeight: 700, color: label.includes('Prize') ? 'var(--saffron)' : 'var(--navy)' }}>{value}</span>
                      </div>
                    ))}

                    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                      {exam.status === 'COMPLETED' ? (
                        <button className="btn-outline w-full justify-center" onClick={() => setLbExamId(exam.id === lbExamId ? null : exam.id)}>
                          {lbExamId === exam.id ? 'Hide Leaderboard' : 'View Leaderboard'}
                        </button>
                      ) : exam.registration_id ? (
                        exam.status === 'LIVE' ? (
                          <button className="btn-primary w-full justify-center" style={{ background: 'linear-gradient(135deg, var(--forest), var(--forest-light))' }}
                            onClick={() => isLoggedIn ? router.push(`/exams/${exam.id}`) : router.push('/login')}>
                            Start Exam Now →
                          </button>
                        ) : (
                          <button className="w-full py-3 rounded-xl font-display font-bold text-sm" style={{ background: 'var(--forest-pale)', color: 'var(--forest)' }} disabled>
                            ✅ Registered
                          </button>
                        )
                      ) : (
                        <button className="btn-primary w-full justify-center" disabled={registerMut.isPending}
                          onClick={() => isLoggedIn ? registerMut.mutate(exam.id) : router.push('/login')}>
                          Register Free →
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Leaderboard */}
        {lbExamId && (
          <div className="max-w-2xl mx-auto" style={{ padding: '32px' }}>
            <h2 className="font-display text-center mb-5" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--navy)' }}>
              🏅 Leaderboard
            </h2>
            <div className="stagger">
              {leaderboard.slice(0, 10).map((row, i) => (
                <div key={i} className="animate-fade-up">
                  <LBRow rank={row.rank} name={row.name} school={`${row.school_name} · ${row.state}`} score={`${row.score}`} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <footer style={{ background: 'var(--navy)', color: 'rgba(255,255,255,0.5)', padding: '30px 32px', textAlign: 'center', fontSize: '0.82rem', marginTop: 64 }}>
          © 2026 VidyaSetu · <span style={{ color: 'var(--saffron-light)' }}>vidyasetu.in</span>
        </footer>
      </div>
    </>
  );
}
