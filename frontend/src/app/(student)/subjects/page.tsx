'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { getSubjects, getChapters } from '@/services/contentService';
import { getDashboard } from '@/services/studentService';
import { ProgressBar, EmptyState, CardSkeleton } from '@/components/ui/index';
import type { ContentSubject } from '@/types/api';
import useLanguageStore from '@/store/languageStore';

const SUBJECT_COLORS: Record<string, string> = {
  MATH: '#FF6B00', SCI: '#138808', ENG: '#1565C0',
  HIN: '#7B1FA2', SST: '#E65100', SAN: '#0097A7',
};
const SUBJECT_ICONS: Record<string, string> = { MATH:'🔢', SCI:'🔬', ENG:'📖', HIN:'🅗', SST:'🌍', SAN:'🕉️' };

export default function SubjectsPage() {
  const { t } = useLanguageStore();
  const router = useRouter();
  const [selected, setSelected] = useState<ContentSubject | null>(null);

  const { data: dash } = useQuery({ queryKey: ['student-dashboard'], queryFn: () => getDashboard().then(r => r.data.data) });
  const className = dash?.student?.className?.split('-')[0] || dash?.student?.class_name?.split('-')[0] || '8';

  const { data: subjects = [], isLoading } = useQuery({
    queryKey: ['subjects', className],
    queryFn: () => getSubjects(className).then(r => r.data.data),
    enabled: !!className,
  });

  const selectedId = selected?.id || '';
  const { data: chapters = [], isLoading: chapLoading } = useQuery({
    queryKey: ['chapters', selectedId, className],
    queryFn: () => getChapters(selectedId, className).then(r => r.data.data),
    enabled: Boolean(selectedId),
  });

  const subjectProgress = dash?.subjectProgress || [];
  const progressMap: Record<string, ContentSubject> = Object.fromEntries(subjectProgress.map(s => [s.code, s]));

  if (isLoading) return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {[...Array(6)].map((_, i) => <CardSkeleton key={i} />)}
    </div>
  );

  return (
    <div className="animate-fade-up">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-extrabold text-2xl" style={{ color: 'var(--navy)' }}>📚 {t('मेरे विषय', 'My Subjects')}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--slate)' }}>{t(`कक्षा ${className}`, `Class ${className}`)} · {subjects.length} {t('विषय', 'subjects')}</p>
        </div>
        {selected && <button onClick={() => setSelected(null)} className="btn-ghost text-sm">← {t('वापस', 'Back')}</button>}
      </div>

      {!selected ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 stagger">
          {subjects.map(sub => {
            const prog = progressMap[sub.code];
            const pct = Number(prog?.progress_pct || 0);
            const color = SUBJECT_COLORS[sub.code] || 'var(--saffron)';
            return (
              <button key={sub.id} onClick={() => setSelected(sub)} className="card text-left transition-all hover:shadow-lg hover:-translate-y-1 animate-fade-up" style={{ borderTop: `3px solid ${color}` }}>
                <div className="text-3xl mb-3">{SUBJECT_ICONS[sub.code] || '📚'}</div>
                <h3 className="font-display font-bold text-base mb-0.5" style={{ color: 'var(--navy)' }}>{sub.name}</h3>
                {sub.name_hi && <p className="text-xs mb-3 font-devanagari" style={{ color: 'var(--slate)' }}>{sub.name_hi}</p>}
                <ProgressBar pct={pct} color={color} height={6} label={`${sub.chapter_count || 0} chapters`} />
                <p className="text-xs mt-1" style={{ color }}>{pct > 0 ? `${Math.round(pct)}% complete` : 'Not started'}</p>
              </button>
            );
          })}
        </div>
      ) : (
        <div>
          <div className="card mb-5" style={{ borderLeft: `4px solid ${SUBJECT_COLORS[selected.code] || 'var(--saffron)'}` }}>
            <h2 className="font-display font-bold text-lg" style={{ color: 'var(--navy)' }}>{t(selected.name_hi || '', selected.name)}</h2>
            <p className="text-sm" style={{ color: 'var(--slate)' }}>{selected.chapter_count || 0} {t('अध्याय', 'chapters')} · {t(`कक्षा ${className}`, `Class ${className}`)}</p>
          </div>

          {chapLoading ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <CardSkeleton key={i} />)}</div>
          ) : chapters.length === 0 ? (
            <EmptyState icon="📭" title={t('अभी कोई अध्याय नहीं', 'No chapters yet')} subtitle={t('सामग्री जल्द आएगी', 'Content coming soon!')} />
          ) : (
            <div className="space-y-3 stagger">
              {chapters.map(ch => (
                <div
                  key={ch.id}
                  className="card flex items-center gap-4 hover:shadow-md transition-all cursor-pointer animate-fade-up"
                  onClick={() => router.push(`/subjects/${selected.id}?chapter=${ch.id}`)}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center font-display font-extrabold text-lg flex-shrink-0" style={{ background: 'var(--saffron-pale)', color: 'var(--saffron)' }}>{ch.chapter_number}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm" style={{ color: 'var(--navy)' }}>{t(ch.title_hi || '', ch.title)}</p>
                    {ch.title_hi && <p className="text-xs font-devanagari" style={{ color: 'var(--slate)' }}>{ch.title_hi}</p>}
                    <div className="flex items-center gap-3 mt-1">
                      {Number(ch.video_count || 0) > 0 && <span className="text-xs" style={{ color: 'var(--slate)' }}>🎥 {ch.video_count} {t('वीडियो', 'videos')}</span>}
                      {Number(ch.quiz_count || 0) > 0 && <span className="text-xs" style={{ color: 'var(--slate)' }}>📝 {ch.quiz_count} {t('क्विज़', 'quizzes')}</span>}
                      {ch.estimated_mins && <span className="text-xs" style={{ color: 'var(--slate)' }}>⏱ {ch.estimated_mins} {t('मिनट', 'min')}</span>}
                    </div>
                  </div>
                  <span className="text-gray-300 text-lg">›</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}