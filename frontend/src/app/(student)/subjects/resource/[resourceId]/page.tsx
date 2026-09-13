'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getCanonicalLearningResource } from '@/services/canonicalLearningService';
import {
  bookmarkLearningResource,
  removeLearningResourceBookmark,
  updateStudentLearningProgress,
} from '@/services/studentService';
import useLanguageStore from '@/store/languageStore';
import { CardSkeleton, EmptyState, ProgressBar } from '@/components/ui/index';

function renderBody(body?: string | null) {
  if (!body) return null;
  return body.split('\n').map((raw, index) => {
    const line = raw.trim();
    if (!line) return <div key={`sp-${index}`} style={{ height: 8 }} />;
    if (line.startsWith('## ')) return <h2 key={`h2-${index}`} className="font-display font-bold text-xl mt-6 mb-2" style={{ color: 'var(--navy)' }}>{line.slice(3)}</h2>;
    if (line.startsWith('# ')) return <h2 key={`h1-${index}`} className="font-display font-bold text-xl mt-6 mb-2" style={{ color: 'var(--navy)' }}>{line.slice(2)}</h2>;
    if (line.startsWith('- ')) return <p key={`li-${index}`} className="text-sm ml-4 my-1" style={{ color: 'var(--slate)' }}>• {line.slice(2)}</p>;
    return <p key={`p-${index}`} className="text-sm leading-7 my-2" style={{ color: 'var(--slate)' }}>{line}</p>;
  });
}

export default function StudentLearningResourcePage() {
  const { resourceId } = useParams<{ resourceId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { lang, t } = useLanguageStore();

  const resourceQuery = useQuery({
    queryKey: ['canonical-learning-resource', resourceId],
    queryFn: () => getCanonicalLearningResource(resourceId).then((response) => response.data.data),
    enabled: Boolean(resourceId),
    staleTime: 20_000,
  });

  const progressMutation = useMutation({
    mutationFn: (progressPct: number) => updateStudentLearningProgress(resourceId, progressPct),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['canonical-learning-resource', resourceId] }),
        queryClient.invalidateQueries({ queryKey: ['canonical-learning-catalogue'] }),
        queryClient.invalidateQueries({ queryKey: ['student-learning-home'] }),
      ]);
    },
    onError: () => toast.error(t('प्रगति अपडेट नहीं हुई', 'Could not update progress')),
  });

  const bookmarkMutation = useMutation({
    mutationFn: async (bookmarked: boolean) => bookmarked
      ? removeLearningResourceBookmark(resourceId)
      : bookmarkLearningResource(resourceId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['canonical-learning-resource', resourceId] });
    },
    onError: () => toast.error(t('बुकमार्क अपडेट नहीं हुआ', 'Could not update bookmark')),
  });

  const resource = resourceQuery.data;
  const body = useMemo(() => {
    if (!resource) return null;
    return lang === 'hi' && resource.body_markdown_hi ? resource.body_markdown_hi : resource.body_markdown;
  }, [lang, resource]);

  if (resourceQuery.isLoading) return <div className="space-y-3"><CardSkeleton lines={4} /><CardSkeleton lines={5} /></div>;

  if (resourceQuery.isError || !resource) {
    return (
      <EmptyState
        icon="🔒"
        title={t('यह लर्निंग संसाधन उपलब्ध नहीं है', 'This learning resource is unavailable')}
        sub={t('यह आपके ग्रेड, बोर्ड या Learning access में शामिल नहीं हो सकता।', 'It may not be included in your grade, board or Learning access.')}
      />
    );
  }

  const title = lang === 'hi' && resource.title_hi ? resource.title_hi : resource.title;
  const summary = lang === 'hi' && resource.summary_hi ? resource.summary_hi : resource.summary;
  const externalUrl = resource.external_url || resource.source_url;
  const mediaUrl = resource.content_url;
  const progress = Math.round(Number(resource.progress_pct || 0));

  return (
    <div className="animate-fade-up" style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
        <button onClick={() => resource.subject_id ? router.push(`/subjects/${resource.subject_id}`) : router.push('/subjects')} className="btn-ghost">
          ← {t('विषय पर वापस', 'Back to subject')}
        </button>
        <button
          className="btn-ghost"
          disabled={bookmarkMutation.isPending}
          onClick={() => bookmarkMutation.mutate(Boolean(resource.bookmarked))}
        >
          {resource.bookmarked ? '★ ' + t('बुकमार्क किया', 'Bookmarked') : '☆ ' + t('बुकमार्क', 'Bookmark')}
        </button>
      </div>

      <section className="card" style={{ padding: 24 }}>
        <div className="flex items-center gap-2 flex-wrap text-xs font-bold mb-3" style={{ color: 'var(--slate)' }}>
          <span>{resource.subject_name || resource.subject_code || 'Learning'}</span>
          <span>·</span>
          <span>{resource.resource_type.replaceAll('_', ' ')}</span>
          <span>·</span>
          <span>{resource.source_name}</span>
          {resource.access_requirement === 'SUBSCRIBER' && <span className="rounded-full px-2 py-1" style={{ background: '#fff4df', color: '#9a5b00' }}>Subscriber</span>}
        </div>

        <h1 className="font-display font-extrabold text-3xl" style={{ color: 'var(--navy)' }}>{title}</h1>
        {summary && <p className="text-base mt-3 leading-7" style={{ color: 'var(--slate)' }}>{summary}</p>}

        {resource.concepts?.length > 0 && (
          <div className="flex gap-2 flex-wrap mt-4">
            {resource.concepts.map((concept) => (
              <span key={concept.id} className="text-xs rounded-full px-3 py-1.5" style={{ background: 'var(--saffron-pale)', color: 'var(--navy)' }}>
                🎯 {concept.name}{concept.journeyStage ? ` · ${concept.journeyStage}` : ''}
              </span>
            ))}
          </div>
        )}

        <div className="mt-5">
          <ProgressBar pct={progress} height={7} label={resource.is_completed ? t('पूर्ण', 'Completed') : t('आपकी प्रगति', 'Your progress')} />
        </div>
      </section>

      <section className="card mt-4" style={{ padding: 24 }}>
        {mediaUrl && resource.resource_type === 'VIDEO' && (
          <div className="mb-6">
            <video controls preload="metadata" style={{ width: '100%', borderRadius: 14, background: '#071126' }} src={mediaUrl}>
              {t('आपका ब्राउज़र वीडियो चला नहीं सकता।', 'Your browser cannot play this video.')}
            </video>
          </div>
        )}

        {mediaUrl && resource.resource_type === 'AUDIO' && (
          <div className="mb-6 rounded-xl p-4" style={{ background: '#f6f7f9' }}>
            <audio controls preload="metadata" style={{ width: '100%' }} src={mediaUrl}>
              {t('आपका ब्राउज़र ऑडियो चला नहीं सकता।', 'Your browser cannot play this audio.')}
            </audio>
          </div>
        )}

        {mediaUrl && ['PDF', 'WORKSHEET', 'QUESTION_PAPER'].includes(resource.resource_type) && (
          <div className="mb-6">
            <a className="btn-primary inline-block" href={mediaUrl} target="_blank" rel="noopener noreferrer">
              {resource.resource_type === 'PDF' ? t('PDF खोलें', 'Open PDF') : t('दस्तावेज़ खोलें', 'Open document')} ↗
            </a>
            <p className="text-xs mt-2" style={{ color: 'var(--slate)' }}>
              {t('लिंक सीमित समय के लिए सुरक्षित रूप से साइन किया गया है।', 'The link is securely signed for a limited time.')}
            </p>
          </div>
        )}

        {body ? (
          <div>{renderBody(body)}</div>
        ) : mediaUrl ? (
          <p className="text-sm" style={{ color: 'var(--slate)' }}>
            {t('ऊपर दिया गया मीडिया इस पाठ का मुख्य लर्निंग संसाधन है।', 'The media above is the primary learning resource for this lesson.')}
          </p>
        ) : externalUrl ? (
          <div>
            <h2 className="font-display font-bold text-xl" style={{ color: 'var(--navy)' }}>{t('मूल संसाधन खोलें', 'Open learning resource')}</h2>
            <p className="text-sm mt-2 mb-4" style={{ color: 'var(--slate)' }}>
              {t('यह सत्यापित बाहरी लर्निंग संसाधन है। स्रोत और लाइसेंस जानकारी नीचे रखी गई है।', 'This is a verified external learning resource. Source and licence information is retained below.')}
            </p>
            <a className="btn-primary inline-block" href={externalUrl} target="_blank" rel="noopener noreferrer">{t('संसाधन खोलें', 'Open resource')} ↗</a>
          </div>
        ) : (
          <div className="rounded-xl p-4" style={{ background: '#f6f7f9', color: 'var(--slate)' }}>
            {t('इस संसाधन की मीडिया प्रस्तुति तैयार की जा रही है।', 'The media presentation for this resource is being prepared.')}
          </div>
        )}

        <div className="mt-7 pt-5" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="font-bold text-sm" style={{ color: 'var(--navy)' }}>{t('स्रोत और लाइसेंस', 'Source & licence')}</div>
          <p className="text-xs mt-1 leading-6" style={{ color: 'var(--slate)' }}>
            {resource.source_name} ({resource.source_code}) · {resource.licence.replaceAll('_', ' ')}
            {resource.attribution_text ? ` · ${resource.attribution_text}` : ''}
          </p>
        </div>
      </section>

      <div className="flex justify-end gap-3 mt-4 mb-6 flex-wrap">
        {progress < 50 && (
          <button className="btn-secondary" disabled={progressMutation.isPending} onClick={() => progressMutation.mutate(50)}>
            {t('पढ़ना जारी रखा', 'Mark in progress')}
          </button>
        )}
        {!resource.is_completed && (
          <button className="btn-primary" disabled={progressMutation.isPending} onClick={() => progressMutation.mutate(100)}>
            ✓ {t('पूर्ण किया', 'Mark complete')}
          </button>
        )}
        {resource.public_slug && resource.visibility === 'PUBLIC' && (
          <Link href={`/learn/resource/${resource.public_slug}`} target="_blank" className="btn-ghost">{t('पब्लिक दृश्य', 'Public view')} ↗</Link>
        )}
      </div>
    </div>
  );
}
