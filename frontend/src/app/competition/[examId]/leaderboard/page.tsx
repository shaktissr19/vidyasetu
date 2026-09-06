'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { getLeaderboard } from '@/services/competitionService';
import { apiErrorText } from '@/utils/errors';
import GlobalTopbar from '@/components/layout/GlobalTopbar';
import useLanguageStore from '@/store/languageStore';

export default function CompetitionLeaderboardPage() {
  const params = useParams<{ examId: string }>();
  const examId = typeof params?.examId === 'string' ? params.examId : '';
  const { t } = useLanguageStore();
  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ['competition-leaderboard-page', examId],
    queryFn: () => getLeaderboard(examId).then((response) => response.data.data),
    enabled: Boolean(examId),
    retry: false,
  });

  return (
    <>
      <GlobalTopbar />
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '34px 24px 64px' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 46 }}>🏅</div>
          <h1 className="font-display font-extrabold text-2xl" style={{ color: 'var(--navy)', marginTop: 6 }}>{t('आधिकारिक प्रतियोगिता लीडरबोर्ड', 'Official Competition Leaderboard')}</h1>
          <p style={{ color: 'var(--slate)', fontSize: 13, marginTop: 6 }}>{t('विद्यार्थियों की गोपनीयता के लिए सार्वजनिक नाम सीमित रखे जाते हैं। केवल clean, आधिकारिक रूप से जारी प्रयास रैंक किए जाते हैं।', 'Public names are limited to protect student privacy. Only clean, officially released attempts are ranked.')}</p>
        </div>

        {isLoading ? <div className="card" style={{ textAlign: 'center', padding: 32 }}>{t('लीडरबोर्ड लोड हो रहा है…', 'Loading leaderboard…')}</div> : error ? (
          <div className="card" style={{ padding: 32, textAlign: 'center' }}>
            <strong style={{ color: 'var(--navy)' }}>{t('लीडरबोर्ड अभी उपलब्ध नहीं है', 'Leaderboard is not available yet')}</strong>
            <p style={{ color: 'var(--slate)', marginTop: 8 }}>{apiErrorText(error, 'Leaderboard becomes available after official results are released.')}</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 32 }}>{t('अभी कोई रैंक्ड परिणाम नहीं है।', 'No ranked results are available.')}</div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {rows.map((row, index) => (
              <div key={`${row.rank || index}-${row.name || 'student'}`} style={{ display: 'grid', gridTemplateColumns: '70px minmax(0,1fr) 130px 120px', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: index === rows.length - 1 ? 'none' : '1px solid var(--border)', background: index < 3 ? '#FFFDF6' : 'white' }}>
                <strong style={{ color: index === 0 ? 'var(--saffron)' : 'var(--navy)', fontSize: index < 3 ? 20 : 15 }}>#{row.rank ?? index + 1}</strong>
                <div>
                  <strong style={{ color: 'var(--navy)' }}>{row.name || row.student_name || t('विद्यार्थी', 'Student')}</strong>
                  <div style={{ color: 'var(--slate)', fontSize: 12, marginTop: 2 }}>{row.school_name || t('स्वतंत्र विद्यार्थी', 'Independent learner')}{row.state ? ` · ${row.state}` : ''}</div>
                </div>
                <div style={{ textAlign: 'right' }}><strong style={{ color: 'var(--navy)' }}>{row.score ?? '—'}</strong><div style={{ fontSize: 11, color: 'var(--slate)' }}>{t('स्कोर', 'score')}</div></div>
                <div style={{ textAlign: 'right' }}><strong style={{ color: 'var(--forest)' }}>{row.percentile != null ? `${row.percentile}%` : '—'}</strong><div style={{ fontSize: 11, color: 'var(--slate)' }}>{t('प्रतिशतक', 'percentile')}</div></div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 24 }}>
          <Link href="/competition" className="btn-primary">{t('प्रतियोगिताएँ देखें', 'Explore competitions')}</Link>
          <Link href="/learn" className="btn-outline">{t('सीखना जारी रखें', 'Continue learning')}</Link>
        </div>
      </main>
    </>
  );
}
