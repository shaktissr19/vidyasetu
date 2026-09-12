'use client';

import { useQuery } from '@tanstack/react-query';
import ParentChildSwitcher from '@/components/parent/ParentChildSwitcher';
import { useParentChildContext } from '@/hooks/useParentChildContext';
import { getChildAchievements } from '@/services/parentWorkflowService';
import useLanguageStore from '@/store/languageStore';
import { formatDate } from '@/utils/formatters';

export default function ParentAchievementsPage() {
  const { t } = useLanguageStore();
  const { children, selectedChildId, selectedChild, setSelectedChildId, isLoading: childrenLoading } = useParentChildContext();

  const achievementsQuery = useQuery({
    queryKey: ['parent-achievements', selectedChildId],
    queryFn: async () => {
      if (!selectedChildId) return [];
      return getChildAchievements(selectedChildId).then((response) => response.data.data);
    },
    enabled: Boolean(selectedChildId),
  });

  const achievements = achievementsQuery.data || [];
  const completed = achievements.filter((item) => item.attempt_status && item.attempt_status !== 'IN_PROGRESS');
  const registered = achievements.filter((item) => item.registered_at && !item.submitted_at);

  return (
    <div className="animate-fade-up">
      <div className="mb-5">
        <h1 className="font-display font-extrabold text-2xl" style={{ color: 'var(--forest)' }}>🏆 {t('प्रतियोगिताएँ और उपलब्धियाँ', 'Competitions & Achievements')}</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>
          {t('पंजीकरण, परिणाम, प्रतिशत और रैंक एक जगह देखें', 'See registrations, results, percentile and ranks in one place')}
        </p>
      </div>

      <ParentChildSwitcher
        children={children}
        selectedChildId={selectedChildId}
        onSelect={setSelectedChildId}
        className="mb-5"
      />

      {selectedChild && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
          <div className="card"><div className="text-xs" style={{ color: 'var(--slate)' }}>{t('कुल भागीदारी', 'Total participation')}</div><div className="text-2xl font-extrabold" style={{ color: 'var(--forest)' }}>{achievements.length}</div></div>
          <div className="card"><div className="text-xs" style={{ color: 'var(--slate)' }}>{t('पूर्ण परिणाम', 'Completed results')}</div><div className="text-2xl font-extrabold" style={{ color: 'var(--navy)' }}>{completed.length}</div></div>
          <div className="card"><div className="text-xs" style={{ color: 'var(--slate)' }}>{t('आगामी / पंजीकृत', 'Upcoming / registered')}</div><div className="text-2xl font-extrabold" style={{ color: 'var(--saffron)' }}>{registered.length}</div></div>
        </div>
      )}

      {childrenLoading || achievementsQuery.isLoading ? (
        <div className="grid md:grid-cols-2 gap-4">{[0, 1, 2, 3].map((item) => <div key={item} className="skeleton h-44 rounded-xl" />)}</div>
      ) : !selectedChild ? (
        <div className="card text-center py-10" style={{ color: 'var(--slate)' }}>{t('कोई लिंक किया हुआ बच्चा नहीं मिला', 'No linked child found')}</div>
      ) : achievements.length === 0 ? (
        <div className="card text-center py-10" style={{ color: 'var(--slate)' }}>{t('अभी कोई प्रतियोगिता भागीदारी नहीं है', 'No competition participation yet')}</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {achievements.map((item) => {
            const scored = item.total_marks != null;
            return (
              <article key={item.exam_id} className="card" style={{ borderLeft: `4px solid ${scored ? 'var(--gold)' : 'var(--navy)'}` }}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="text-xs font-bold uppercase" style={{ color: 'var(--slate)' }}>{item.type.replaceAll('_', ' ')}</div>
                    <h2 className="font-display font-bold" style={{ color: 'var(--navy)' }}>{item.title}</h2>
                  </div>
                  <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: scored ? '#FFF8E1' : '#EEF3FF', color: scored ? '#8A6100' : 'var(--navy)' }}>
                    {scored ? t('परिणाम', 'Result') : item.status.replaceAll('_', ' ')}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-xs block" style={{ color: 'var(--slate)' }}>{t('स्कोर', 'Score')}</span><strong>{scored ? `${item.total_marks}/${item.max_marks ?? '—'}` : '—'}</strong></div>
                  <div><span className="text-xs block" style={{ color: 'var(--slate)' }}>{t('प्रतिशत', 'Percentage')}</span><strong>{item.percentage != null ? `${item.percentage}%` : '—'}</strong></div>
                  <div><span className="text-xs block" style={{ color: 'var(--slate)' }}>{t('स्कूल रैंक', 'School rank')}</span><strong>{item.rank_school ? `#${item.rank_school}` : '—'}</strong></div>
                  <div><span className="text-xs block" style={{ color: 'var(--slate)' }}>{t('समग्र रैंक', 'Overall rank')}</span><strong>{item.rank_overall ? `#${item.rank_overall}` : '—'}</strong></div>
                  <div><span className="text-xs block" style={{ color: 'var(--slate)' }}>{t('प्रतिशतक', 'Percentile')}</span><strong>{item.percentile != null ? item.percentile : '—'}</strong></div>
                  <div><span className="text-xs block" style={{ color: 'var(--slate)' }}>{t('तिथि', 'Date')}</span><strong>{formatDate(item.submitted_at || item.registered_at || item.start_time)}</strong></div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
