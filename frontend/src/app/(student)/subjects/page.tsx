'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  getCanonicalLearningCatalogue,
  type CanonicalLearningSubject,
} from '@/services/canonicalLearningService';
import { ProgressBar, EmptyState, CardSkeleton } from '@/components/ui/index';
import useLanguageStore from '@/store/languageStore';

const SUBJECT_COLORS: Record<string, string> = {
  MATH: '#FF6B00', SCI: '#138808', ENG: '#1565C0',
  HIN: '#7B1FA2', SST: '#E65100', SAN: '#0097A7',
};

const SUBJECT_ICONS: Record<string, string> = {
  MATH: '∑', SCI: '⚗', ENG: 'Aa', HIN: 'अ', SST: '◎', SAN: 'सं',
};

function accessLabel(tier: string, schoolLicensed: boolean, t: (hi: string, en: string) => string): string {
  if (schoolLicensed) return t('स्कूल लर्निंग लाइसेंस सक्रिय', 'School Learning licence active');
  if (tier === 'SUBSCRIBER') return t('लर्निंग सब्सक्रिप्शन सक्रिय', 'Learning subscription active');
  return t('फ्री स्टूडेंट लर्निंग', 'Free student learning');
}

function SubjectCard({ subject, onOpen }: { subject: CanonicalLearningSubject; onOpen: () => void }) {
  const color = SUBJECT_COLORS[subject.code] || 'var(--saffron)';
  const pct = Math.round(Number(subject.progress_pct || 0));
  const locked = Math.max(0, Number(subject.resource_count || 0) - Number(subject.accessible_resource_count || 0));

  return (
    <button
      onClick={onOpen}
      className="card text-left transition-all hover:shadow-lg hover:-translate-y-1 animate-fade-up"
      style={{ borderTop: `3px solid ${color}`, minHeight: 190 }}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center font-display font-extrabold text-lg"
          style={{ background: `${color}16`, color }}
        >
          {SUBJECT_ICONS[subject.code] || '◆'}
        </div>
        {locked > 0 && (
          <span className="text-[11px] font-bold rounded-full px-2.5 py-1" style={{ background: '#fff4df', color: '#9a5b00' }}>
            🔒 {locked} subscriber
          </span>
        )}
      </div>

      <h3 className="font-display font-bold text-base mb-0.5" style={{ color: 'var(--navy)' }}>{subject.name}</h3>
      {subject.name_hi && <p className="text-xs mb-4 font-devanagari" style={{ color: 'var(--slate)' }}>{subject.name_hi}</p>}

      <ProgressBar
        pct={pct}
        color={color}
        height={6}
        label={`${subject.accessible_resource_count || 0} learning resources`}
      />
      <div className="flex items-center justify-between mt-2 gap-3">
        <p className="text-xs" style={{ color }}>{pct > 0 ? `${pct}% progress` : 'Ready to start'}</p>
        <p className="text-xs" style={{ color: 'var(--slate)' }}>{subject.completed_resource_count || 0} completed</p>
      </div>
    </button>
  );
}

export default function SubjectsPage() {
  const { t } = useLanguageStore();
  const router = useRouter();
  const catalogueQuery = useQuery({
    queryKey: ['canonical-learning-catalogue'],
    queryFn: () => getCanonicalLearningCatalogue().then((response) => response.data.data),
    staleTime: 30_000,
  });

  if (catalogueQuery.isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => <CardSkeleton key={i} />)}
      </div>
    );
  }

  if (catalogueQuery.isError || !catalogueQuery.data) {
    return (
      <EmptyState
        icon="⚠️"
        title={t('लर्निंग लाइब्रेरी लोड नहीं हुई', 'Learning library could not be loaded')}
        subtitle={t('कृपया फिर से प्रयास करें।', 'Please try again.')}
      />
    );
  }

  const { learner, access, subjects } = catalogueQuery.data;

  return (
    <div className="animate-fade-up">
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div>
          <h1 className="font-display font-extrabold text-2xl" style={{ color: 'var(--navy)' }}>📚 {t('मेरे विषय', 'My Subjects')}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--slate)' }}>
            {learner.gradeLabel} · {learner.boardName} · {subjects.length} {t('विषय', 'subjects')}
          </p>
        </div>
        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: access.subscriberAccess ? 'var(--forest-pale)' : 'var(--saffron-pale)', color: access.subscriberAccess ? 'var(--forest)' : 'var(--navy)' }}>
          <div className="font-bold">{accessLabel(access.tier, access.schoolLicensed, t)}</div>
          <div className="text-xs mt-0.5 opacity-75">
            {access.subscriberAccess
              ? t('सब्सक्राइबर लर्निंग कंटेंट अनलॉक है।', 'Subscriber learning content is unlocked.')
              : t('फ्री कंटेंट उपलब्ध है; सब्सक्राइबर कंटेंट लॉक दिखेगा।', 'Free content is available; subscriber content will appear locked.')}
          </div>
        </div>
      </div>

      <div className="card mb-5" style={{ padding: 14, borderLeft: '4px solid var(--saffron)' }}>
        <div className="text-sm font-bold" style={{ color: 'var(--navy)' }}>{t('एक ही लर्निंग सिस्टम', 'One canonical learning system')}</div>
        <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>
          {t(
            'अब ये विषय Learning Studio में रिव्यू और पब्लिश किए गए उसी कंटेंट, कॉन्सेप्ट और प्रोग्रेस सिस्टम से आते हैं।',
            'These subjects now come from the same reviewed Learning Studio catalogue, concepts and progress system used across VidyaSetu.',
          )}
        </p>
      </div>

      {subjects.length === 0 ? (
        <EmptyState
          icon="📭"
          title={t('अभी कोई पब्लिश्ड विषय नहीं', 'No published subjects yet')}
          subtitle={t('आपकी कक्षा और बोर्ड के लिए कंटेंट रिव्यू के बाद यहाँ दिखेगा।', 'Reviewed content for your grade and board will appear here.')}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
          {subjects.map((subject) => (
            <SubjectCard
              key={subject.id}
              subject={subject}
              onOpen={() => router.push(`/subjects/${subject.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
