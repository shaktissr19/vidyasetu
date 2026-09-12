'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getChildren, getChildAchievements } from '@/services/parentService';
import useLanguageStore from '@/store/languageStore';

export default function ParentAchievementsPage() {
  const { t } = useLanguageStore();
  const [selectedChild, setSelectedChild] = useState<string | null>(null);

  const { data: children = [], isLoading: childrenLoading } = useQuery({
    queryKey: ['parent-children'],
    queryFn: () => getChildren().then((r) => r.data.data),
  });

  useEffect(() => {
    if (children.length && !selectedChild) setSelectedChild(children[0]?.id || null);
  }, [children, selectedChild]);

  const { data, isLoading } = useQuery({
    queryKey: ['parent-achievements', selectedChild],
    queryFn: () => getChildAchievements(selectedChild as string).then((r) => r.data.data),
    enabled: Boolean(selectedChild),
  });

  return (
    <div className="animate-fade-up space-y-5">
      <div>
        <h1 className="font-display font-extrabold text-2xl" style={{ color: 'var(--forest)' }}>
          🏆 {t('प्रतियोगिताएँ और उपलब्धियाँ', 'Competitions & Achievements')}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>
          {t('भागीदारी, परिणाम और रैंक एक जगह देखें', 'See participation, results and ranks in one place')}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {children.map((child) => (
          <button
            key={child.id}
            onClick={() => setSelectedChild(child.id)}
            className="px-4 py-2 rounded-xl text-sm font-bold"
            style={{
              background: selectedChild === child.id ? 'var(--forest)' : 'white',
              color: selectedChild === child.id ? 'white' : 'var(--slate)',
              border: `1px solid ${selectedChild === child.id ? 'var(--forest)' : 'var(--border)'}`,
            }}
          >
            {child.name} · {t('कक्षा', 'Class')} {child.class_name}
          </button>
        ))}
      </div>

      {(childrenLoading || isLoading) ? (
        <div className="card py-12 text-center" style={{ color: 'var(--slate)' }}>{t('लोड हो रहा है…', 'Loading…')}</div>
      ) : !data ? (
        <div className="card py-12 text-center" style={{ color: 'var(--slate)' }}>{t('कोई लिंक किया हुआ बच्चा नहीं मिला', 'No linked child found')}</div>
      ) : (
        <>
          <section className="card p-5" style={{ borderLeft: '4px solid var(--gold)' }}>
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="font-display font-bold text-lg" style={{ color: 'var(--navy)' }}>🏅 {t('उपलब्धियाँ', 'Achievements')}</h2>
              <span className="text-sm font-bold" style={{ color: 'var(--forest)' }}>{data.achievements.length}</span>
            </div>
            {data.achievements.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--slate)' }}>{t('स्कोर की गई प्रतियोगिता उपलब्धियाँ अभी उपलब्ध नहीं हैं', 'No scored competition achievements yet')}</p>
            ) : (
              <div className="grid md:grid-cols-2 gap-3">
                {data.achievements.map((item) => (
                  <div key={`${item.exam_id}-${item.attempt_id || 'achievement'}`} className="rounded-xl p-4" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
                    <div className="text-xs font-bold uppercase tracking-wide" style={{ color: '#92400e' }}>{item.type}</div>
                    <div className="font-display font-bold mt-1" style={{ color: 'var(--navy)' }}>{item.title}</div>
                    <div className="flex flex-wrap gap-4 mt-3 text-sm">
                      <span><strong>{item.percentage ?? '—'}%</strong> {t('स्कोर', 'score')}</span>
                      {item.rank_school != null && <span>🏫 #{item.rank_school} {t('स्कूल', 'school')}</span>}
                      {item.rank_overall != null && <span>🌐 #{item.rank_overall} {t('कुल', 'overall')}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card p-5">
            <h2 className="font-display font-bold text-lg mb-4" style={{ color: 'var(--navy)' }}>🎯 {t('प्रतियोगिता इतिहास और आगामी अवसर', 'Competition history & upcoming opportunities')}</h2>
            {data.competitions.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--slate)' }}>{t('इस कक्षा के लिए कोई प्रतियोगिता नहीं मिली', 'No competitions found for this class')}</p>
            ) : (
              <div className="space-y-3">
                {data.competitions.map((item) => (
                  <div key={item.exam_id} className="flex flex-wrap items-center justify-between gap-3 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: '#f0fdf4', color: 'var(--forest)' }}>{item.type}</span>
                        <span className="text-xs font-semibold" style={{ color: 'var(--slate)' }}>{item.status.replaceAll('_', ' ')}</span>
                      </div>
                      <div className="font-semibold mt-1" style={{ color: 'var(--navy)' }}>{item.title}</div>
                      <div className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{new Date(item.start_time).toLocaleString('en-IN')}</div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="font-bold" style={{ color: item.attempt_status ? 'var(--forest)' : 'var(--slate)' }}>
                        {item.attempt_status ? item.attempt_status.replaceAll('_', ' ') : t('अभी भाग नहीं लिया', 'Not participated yet')}
                      </div>
                      {item.percentage != null && <div style={{ color: 'var(--slate)' }}>{item.percentage}%</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
