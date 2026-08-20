'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import useAuthStore from '@/store/authStore';
import { getChapters, getContentItems, markComplete } from '@/services/contentService';
import { ProgressBar, CardSkeleton, EmptyState } from '@/components/ui/index';
import { formatDuration } from '@/utils/formatters';
import useLanguageStore from '@/store/languageStore';
import toast from 'react-hot-toast';

const TYPE_ICON: Record<string, string> = { VIDEO: '🎬', PDF: '📄', QUIZ: '📝', NOTES: '📓', AUDIO: '🎧' };
const TYPE_LABEL: Record<string, string> = { VIDEO: 'Watch', PDF: 'Read', QUIZ: 'Attempt', NOTES: 'Read', AUDIO: 'Listen' };

export default function SubjectDetailPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const { t } = useLanguageStore();
  const { user } = useAuthStore();
  const className = user?.className || '8';
  const router = useRouter();
  const qc = useQueryClient();
  const [openChapter, setOpenChapter] = useState<string | null>(null);

  const { data: chapters = [], isLoading } = useQuery({
    queryKey: ['chapters', subjectId],
    queryFn: () => getChapters(subjectId, className).then(r => r.data.data),
  });

  const { data: items = [], isFetching: itemsLoading } = useQuery({
    queryKey: ['content-items', openChapter],
    queryFn: () => openChapter ? getContentItems(openChapter).then(r => r.data.data) : Promise.resolve([]),
    enabled: Boolean(openChapter),
  });

  const progressMut = useMutation({
    mutationFn: ({ contentItemId }: { contentItemId: string }) => markComplete(contentItemId),
    onSuccess: async () => {
      toast.success('+10 XP 🎉');
      await qc.invalidateQueries({ queryKey: ['content-items', openChapter] });
    },
  });

  const subjectInfo = chapters[0];

  return (
    <div className="animate-fade-up">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => router.push('/subjects')} className="btn-ghost" style={{ padding: '8px 12px' }}>← Back</button>
        <div>
          <h1 className="font-display font-extrabold text-2xl" style={{ color: 'var(--navy)' }}>
            📚 {subjectInfo ? t(subjectInfo.subject_name_hi || '', subjectInfo.subject_name || subjectInfo.title) : 'Subject'}
          </h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--slate)', marginTop: 2 }}>{chapters.length} {t('अध्याय', 'chapters')}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <CardSkeleton key={i} lines={2} />)}</div>
      ) : chapters.length === 0 ? (
        <EmptyState icon="📚" title={t('कोई अध्याय नहीं', 'No chapters yet')} sub={t('जल्द आएगा', 'Content coming soon')} />
      ) : (
        <div className="space-y-3">
          {chapters.map((ch, idx) => {
            const isOpen = openChapter === ch.id;
            const totalItems = Number(ch.total_items || ch.item_count || 0);
            const completedItems = items.filter(item => item.is_completed).length;
            const pct = totalItems > 0 && isOpen ? Math.round((completedItems / totalItems) * 100) : 0;

            return (
              <div key={ch.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <button
                  onClick={() => setOpenChapter(isOpen ? null : ch.id)}
                  style={{ width: '100%', padding: '16px 20px', background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: isOpen ? 'var(--saffron)' : 'var(--saffron-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Baloo 2', cursive", fontWeight: 800, fontSize: '0.9rem', color: isOpen ? 'white' : 'var(--saffron)' }}>{idx + 1}</div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--navy)' }}>{t(ch.title_hi || '', ch.title)}</p>
                    <p style={{ fontSize: '0.72rem', color: 'var(--slate)', marginTop: 3 }}>
                      {Number(ch.video_count || 0) > 0 && `🎬 ${ch.video_count} videos `}
                      {Number(ch.pdf_count || 0) > 0 && `📄 ${ch.pdf_count} PDFs `}
                      {Number(ch.quiz_count || 0) > 0 && `📝 ${ch.quiz_count} quizzes`}
                    </p>
                  </div>

                  {isOpen && pct > 0 && <div style={{ width: 120, flexShrink: 0 }}><ProgressBar pct={pct} label="" showPct height={5} /></div>}
                  <span style={{ color: 'var(--slate)', fontSize: 12, flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
                </button>

                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--border)' }}>
                    {itemsLoading ? (
                      <div style={{ padding: 16 }}><CardSkeleton lines={1} /></div>
                    ) : items.length === 0 ? (
                      <p style={{ padding: 20, textAlign: 'center', color: 'var(--slate)', fontSize: '0.8rem' }}>{t('सामग्री जल्द आएगी', 'Content coming soon')}</p>
                    ) : items.map((item, index) => {
                      const duration = item.duration_secs ?? item.duration_seconds;
                      return (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: index < items.length - 1 ? '1px solid var(--border)' : 'none', background: item.is_completed ? 'var(--forest-pale)' : 'white', transition: 'background 0.2s' }}>
                          <div style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0, background: item.is_completed ? 'var(--forest-pale)' : 'var(--saffron-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{TYPE_ICON[item.type] || '📚'}</div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t(item.title_hi || '', item.title)}</p>
                            <div style={{ display: 'flex', gap: 8, marginTop: 3, alignItems: 'center' }}>
                              {duration && <span style={{ fontSize: '0.7rem', color: 'var(--slate)' }}>⏱ {formatDuration(duration)}</span>}
                              <span style={{ fontSize: '0.7rem', color: 'var(--saffron)', fontWeight: 700 }}>+{item.xp_reward || 0} XP</span>
                              {item.is_completed && item.quiz_score != null && <span style={{ fontSize: '0.7rem', color: 'var(--forest)', fontWeight: 700 }}>Score: {item.quiz_score}%</span>}
                            </div>
                          </div>

                          {item.is_completed ? (
                            <span style={{ fontSize: 18 }}>✅</span>
                          ) : (
                            <button className="btn-primary" style={{ padding: '6px 14px', fontSize: '0.75rem', flexShrink: 0 }} disabled={progressMut.isPending} onClick={() => progressMut.mutate({ contentItemId: item.id })}>
                              {TYPE_LABEL[item.type] || 'Open'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
