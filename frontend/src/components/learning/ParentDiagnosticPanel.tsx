'use client';

import { useQuery } from '@tanstack/react-query';
import { getParentDiagnosticInsight } from '@/services/learningVisibilityService';
import useLanguageStore from '@/store/languageStore';
import { apiErrorText } from '@/utils/errors';

export default function ParentDiagnosticPanel({ studentId }: { studentId: string }) {
  const { t } = useLanguageStore();
  const diagnosticQ = useQuery({
    queryKey: ['parent-diagnostic-insight', studentId],
    queryFn: () => getParentDiagnosticInsight(studentId).then((r) => r.data.data),
    enabled: Boolean(studentId),
    staleTime: 20_000,
  });

  if (diagnosticQ.isLoading) return <div className="card"><div className="skeleton h-44 rounded-xl" /></div>;
  if (diagnosticQ.isError) return <div className="card" style={{ color: '#B42318' }}>{apiErrorText(diagnosticQ.error, 'Could not load learning diagnostic guidance')}</div>;
  const data = diagnosticQ.data;
  if (!data) return null;

  return (
    <div className="card" style={{ borderLeft: '4px solid var(--saffron)' }}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="font-display font-bold text-lg" style={{ color: 'var(--navy)' }}>🧠 {t('समझ और रिविज़न मार्गदर्शन', 'Understanding & Revision Guidance')}</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>{data.headline}</p>
        </div>
        <span className="text-xs px-3 py-1.5 rounded-full font-bold" style={{ background: '#F4F6F9', color: 'var(--slate)' }}>{t('माता-पिता के लिए सरल सार', 'Parent-friendly summary')}</span>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="p-3 rounded-xl" style={{ background: '#F4F6F9' }}><div className="text-2xl font-black" style={{ color: 'var(--navy)' }}>{data.summary.conceptsAssessed}</div><div className="text-xs">{t('जाँचे गए कॉन्सेप्ट', 'Concepts assessed')}</div></div>
        <div className="p-3 rounded-xl" style={{ background: '#ECF8F0' }}><div className="text-2xl font-black" style={{ color: '#176B3A' }}>{data.summary.strongConcepts}</div><div className="text-xs">{t('मज़बूत', 'Strong')}</div></div>
        <div className="p-3 rounded-xl" style={{ background: '#FFF0F0' }}><div className="text-2xl font-black" style={{ color: '#B42318' }}>{data.summary.needsSupport}</div><div className="text-xs">{t('अतिरिक्त सहायता', 'Need support')}</div></div>
        <div className="p-3 rounded-xl" style={{ background: '#EEF4FF' }}><div className="text-2xl font-black" style={{ color: '#2457A6' }}>{data.summary.reviewDue}</div><div className="text-xs">{t('रिविज़न ड्यू', 'Review due')}</div></div>
        <div className="p-3 rounded-xl" style={{ background: '#FFF7E8' }}><div className="text-2xl font-black" style={{ color: '#9A6500' }}>{data.summary.misconceptionSignals}</div><div className="text-xs">{t('बार-बार दिखती गलतफहमियाँ', 'Misconception signals')}</div></div>
      </div>

      {data.guidance.length > 0 ? (
        <div className="mt-4 p-4 rounded-xl" style={{ background: '#FFF8EE' }}>
          <b style={{ color: 'var(--navy)' }}>{t('इस सप्ताह आप क्या कर सकते हैं', 'What you can do this week')}</b>
          <ul className="mt-2 space-y-1 text-sm" style={{ color: 'var(--slate)', paddingLeft: 18 }}>
            {data.guidance.map((item, index) => <li key={index}>{item}</li>)}
          </ul>
        </div>
      ) : null}

      {data.misconceptionSignals.length > 0 ? (
        <div className="mt-4">
          <b style={{ color: 'var(--navy)' }}>{t('ध्यान देने योग्य learning pattern', 'Learning pattern to watch')}</b>
          <div className="grid md:grid-cols-2 gap-2 mt-2">
            {data.misconceptionSignals.slice(0, 4).map((signal) => (
              <div key={`${signal.conceptId}-${signal.misconceptionCode}`} className="p-3 rounded-xl" style={{ border: '1px solid var(--border)' }}>
                <div className="font-semibold">{signal.conceptName}</div>
                <div className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{signal.misconceptionCode}</div>
                <div className="text-xs mt-2" style={{ color: '#7A4E00' }}>{t('इसे गलत उत्तर के रूप में नहीं, एक समझ की कमी के रूप में देखें। VidyaSetu targeted revision सुझाएगा।', 'Treat this as a gap in understanding, not simply a bad score. VidyaSetu will recommend targeted revision.')}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="text-xs mt-4 p-3 rounded-xl" style={{ background: '#F4F6F9', color: 'var(--slate)' }}>
        {t('Proficiency और confidence अलग हैं: एक अच्छा स्कोर भी कम confidence के साथ हो सकता है यदि प्रमाण बहुत कम हो। Mastery मिलने के बाद revision due होने से mastery हटती नहीं है।', 'Proficiency and confidence are separate: a good score can still have low confidence when evidence is thin. A review-due signal never removes previously earned mastery.')}
      </div>
    </div>
  );
}
