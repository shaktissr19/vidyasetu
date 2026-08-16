'use client';
import { useQuery } from '@tanstack/react-query';
import { getOverview } from '@/services/schoolService';
import useLanguageStore from '@/store/languageStore';
import toast from 'react-hot-toast';

const STEPS = [
  { num: 1, title: 'Register School & Verify UDISE', hi: 'स्कूल पंजीकरण और UDISE सत्यापन', desc: 'School registered. UDISE code verified. ERP access activated.', descHi: 'स्कूल पंजीकृत। UDISE कोड सत्यापित। ERP एक्सेस सक्रिय।' },
  { num: 2, title: 'Add Teachers & Configure Classes', hi: 'शिक्षक जोड़ें और कक्षाएँ कॉन्फ़िगर करें', desc: 'Add teacher profiles, assign subjects and classes.', descHi: 'शिक्षक प्रोफ़ाइल जोड़ें, विषय और कक्षाएँ असाइन करें।' },
  { num: 3, title: 'Import Students & Set Fee Structure', hi: 'छात्र आयात करें और फीस संरचना सेट करें', desc: 'Upload student data via Excel template. Set class-wise fees.', descHi: 'Excel टेम्पलेट से छात्र डेटा अपलोड करें। कक्षावार फीस सेट करें।' },
  { num: 4, title: 'Go Live — Share with Parents', hi: 'लाइव हों — अभिभावकों से शेयर करें', desc: 'Share the VidyaSetu invite link with parents via WhatsApp.', descHi: 'VidyaSetu इनवाइट लिंक अभिभावकों के साथ WhatsApp पर शेयर करें।' },
];

export default function OnboardingPage() {
  const { t } = useLanguageStore();
  const { data: overview } = useQuery({ queryKey: ['school-overview'], queryFn: () => getOverview().then(r => r.data.data) });
  const onboardingStep = overview?.school?.onboarding_step || 1;

  return (
    <div className="animate-fade-up max-w-2xl">
      <div className="mb-6">
        <h1 className="font-display font-extrabold text-2xl" style={{ color: 'var(--navy)' }}>
          🚀 {t('स्कूल सेटअप गाइड', 'School Setup Guide')}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>
          {t('4 आसान चरणों में VidyaSetu सेटअप करें', 'Set up VidyaSetu in 4 easy steps')}
        </p>
      </div>

      {/* Progress bar */}
      <div className="card mb-6">
        <div className="flex justify-between text-xs mb-2 font-semibold">
          <span style={{ color: 'var(--navy)' }}>{t('प्रगति', 'Progress')}</span>
          <span style={{ color: 'var(--saffron)' }}>{Math.min(onboardingStep - 1, 4)}/4 {t('पूर्ण', 'complete')}</span>
        </div>
        <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
          <div className="h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.min(((onboardingStep - 1) / 4) * 100, 100)}%`, background: 'linear-gradient(to right, var(--saffron), var(--saffron-light))' }} />
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-4">
        {STEPS.map((step) => {
          const isDone   = step.num < onboardingStep;
          const isActive = step.num === onboardingStep;
          const isLocked = step.num > onboardingStep;

          return (
            <div key={step.num} className="card transition-all"
              style={{
                borderLeft: `4px solid ${isDone ? 'var(--forest)' : isActive ? 'var(--saffron)' : 'var(--border)'}`,
                opacity: isLocked ? 0.6 : 1,
              }}>
              <div className="flex items-start gap-4">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-extrabold text-sm flex-shrink-0 transition-all`}
                  style={{
                    background: isDone ? 'var(--forest)' : isActive ? 'var(--saffron)' : 'var(--border)',
                    color: isDone || isActive ? 'white' : 'var(--slate)',
                  }}>
                  {isDone ? '✓' : step.num}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-display font-bold text-base" style={{ color: 'var(--navy)' }}>
                    {t(step.hi, step.title)}
                  </h3>
                  <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--slate)' }}>
                    {t(step.descHi, step.desc)}
                  </p>
                  {isDone && <p className="text-xs mt-2 font-semibold" style={{ color: 'var(--forest)' }}>✅ {t('पूर्ण', 'Completed')}</p>}
                  {isActive && (
                    <button className="btn-primary mt-3 text-sm"
                      onClick={() => {
                        if (step.num === 3) toast('📥 Downloading student import template...');
                        else if (step.num === 4) toast('📲 Copying WhatsApp invite link...');
                        else toast(`Opening step ${step.num}...`);
                      }}>
                      {step.num === 3 ? '📥 Download Template' : step.num === 4 ? '📲 Share Invite Link' : `Start Step ${step.num} →`}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {onboardingStep > 4 && (
        <div className="card mt-6 text-center py-8" style={{ background: 'var(--forest-pale)', border: '2px solid var(--forest)' }}>
          <div className="text-4xl mb-3">🎉</div>
          <h3 className="font-display font-extrabold text-xl" style={{ color: 'var(--forest)' }}>
            {t('सेटअप पूर्ण!', 'Setup Complete!')}
          </h3>
          <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>
            {t('आपका स्कूल VidyaSetu पर लाइव है।', 'Your school is live on VidyaSetu.')}
          </p>
        </div>
      )}
    </div>
  );
}
