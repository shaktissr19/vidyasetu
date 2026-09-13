'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import {
  getCanonicalSubjectResources,
  type CanonicalLearningResourceSummary,
} from '@/services/canonicalLearningService';
import { ProgressBar, CardSkeleton, EmptyState } from '@/components/ui/index';
import useLanguageStore from '@/store/languageStore';

const TYPE_ICON: Record<string, string> = {
  ARTICLE: '📘', VIDEO: '🎬', AUDIO: '🎧', PDF: '📄', WORKSHEET: '📝',
  QUIZ: '✅', QUESTION_PAPER: '📋', INTERACTIVE: '🧩', EXTERNAL_LINK: '↗',
};

function durationLabel(seconds?: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

function ResourceRow({ resource, onOpen }: { resource: CanonicalLearningResourceSummary; onOpen: () => void }) {
  const duration = durationLabel(resource.duration_secs);
  const pct = Math.round(Number(resource.progress_pct || 0));

  return (
    <div className="card" style={{ padding: 16, opacity: resource.is_accessible ? 1 : 0.8 }}>
      <div className="flex items-start gap-4">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
          style={{ background: resource.is_accessible ? 'var(--saffron-pale)' : '#f3f4f6' }}
        >
          {resource.is_accessible ? (TYPE_ICON[resource.resource_type] || '📚') : '🔒'}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-display font-bold text-base" style={{ color: 'var(--navy)' }}>{resource.title}</h3>
              {resource.title_hi && <p className="text-xs font-devanagari mt-0.5" style={{ color: 'var(--slate)' }}>{resource.title_hi}</p>}
            </div>
            <div className="flex gap-2 flex-wrap">
              <span className="text-[11px] font-bold rounded-full px-2.5 py-1" style={{ background: '#f6f7f9', color: 'var(--slate)' }}>
                {resource.resource_type.replaceAll('_', ' ')}
              </span>
              {resource.access_requirement === 'SUBSCRIBER' && (
                <span className="text-[11px] font-bold rounded-full px-2.5 py-1" style={{ background: '#fff4df', color: '#9a5b00' }}>
                  Subscriber
                </span>
              )}
            </div>
          </div>

          {resource.summary && <p className="text-sm mt-2" style={{ color: 'var(--slate)' }}>{resource.summary}</p>}

          <div className="flex gap-3 flex-wrap mt-2 text-xs" style={{ color: 'var(--slate)' }}>
            <span>{resource.source_name}</span>
            {duration && <span>⏱ {duration}</span>}
            {resource.concept_names?.length > 0 && <span>🎯 {resource.concept_names.slice(0, 2).join(' · ')}</span>}
          </div>

          {resource.is_accessible ? (
            <div className="mt-3">
              <ProgressBar pct={pct} height={5} label={resource.is_completed ? 'Completed' : pct > 0 ? `${pct}% complete` : 'Not started'} />
              <div className="flex justify-end mt-3">
                <button className="btn-primary text-sm" onClick={onOpen}>
                  {resource.is_completed ? 'Review' : pct > 0 ? 'Continue' : 'Start learning'} →
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 rounded-lg px-3 py-2 text-xs" style={{ background: '#fff8ea', color: '#8a5700' }}>
              🔒 {resource.lock_reason || 'Subscriber Learning access required'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SubjectDetailPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const router = useRouter();
  const { t } = useLanguageStore();

  const subjectQuery = useQuery({
    queryKey: ['canonical-learning-subject', subjectId],
    queryFn: () => getCanonicalSubjectResources(subjectId).then((response) => response.data.data),
    enabled: Boolean(subjectId),
    staleTime: 20_000,
  });

  if (subjectQuery.isLoading) {
    return <div className="space-y-3">{[...Array(5)].map((_, i) => <CardSkeleton key={i} lines={2} />)}</div>;
  }

  if (subjectQuery.isError || !subjectQuery.data) {
    return (
      <EmptyState
        icon="⚠️"
        title={t('विषय लोड नहीं हुआ', 'Subject could not be loaded')}
        subtitle={t('कृपया वापस जाकर फिर से प्रयास करें।', 'Please go back and try again.')}
      />
    );
  }

  const { subject, access, resources } = subjectQuery.data;
  const accessible = resources.filter((resource) => resource.is_accessible).length;
  const locked = resources.length - accessible;

  return (
    <div className="animate-fade-up">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => router.push('/subjects')} className="btn-ghost" style={{ padding: '8px 12px' }}>← {t('वापस', 'Back')}</button>
        <div>
          <h1 className="font-display font-extrabold text-2xl" style={{ color: 'var(--navy)' }}>📚 {t(subject.name_hi || '', subject.name)}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--slate)' }}>
            {accessible} {t('उपलब्ध संसाधन', 'available resources')}{locked > 0 ? ` · ${locked} subscriber` : ''}
          </p>
        </div>
      </div>

      {!access.subscriberAccess && locked > 0 && (
        <div className="card mb-5" style={{ borderLeft: '4px solid #d99000', background: '#fffaf0' }}>
          <div className="font-bold text-sm" style={{ color: 'var(--navy)' }}>🔒 {t('सब्सक्राइबर कंटेंट उपलब्ध है', 'Subscriber learning is available')}</div>
          <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>
            {t(
              'फ्री संसाधन तुरंत पढ़ें। सब्सक्राइबर संसाधन व्यक्तिगत Learning subscription या स्कूल Learning licence से अनलॉक होंगे।',
              'Use free resources now. Subscriber resources unlock through an individual Learning subscription or an active school Learning licence.',
            )}
          </p>
        </div>
      )}

      {resources.length === 0 ? (
        <EmptyState
          icon="📭"
          title={t('अभी कोई पब्लिश्ड संसाधन नहीं', 'No published resources yet')}
          subtitle={t('Learning Studio में रिव्यू और पब्लिश होने के बाद सामग्री यहाँ दिखेगी।', 'Resources will appear here after Learning Studio review and publication.')}
        />
      ) : (
        <div className="space-y-3">
          {resources.map((resource) => (
            <ResourceRow
              key={resource.id}
              resource={resource}
              onOpen={() => router.push(`/subjects/resource/${resource.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
