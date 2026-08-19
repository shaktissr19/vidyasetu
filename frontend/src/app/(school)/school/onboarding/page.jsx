'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { getOverview } from '@/services/schoolService';
import useLanguageStore from '@/store/languageStore';

const STEPS = [
  { key: 'profile', num: 1, title: 'Complete School Profile', hi: 'स्कूल प्रोफ़ाइल पूर्ण करें', desc: 'Confirm School name, UDISE, board, address, principal and current academic year.', href: '/school/profile', action: 'Open School Profile' },
  { key: 'classes', num: 2, title: 'Configure Classes & Teachers', hi: 'कक्षाएँ और शिक्षक कॉन्फ़िगर करें', desc: 'Create active class-sections and add Teacher accounts with subject/class assignments.', href: '/school/classes', action: 'Manage Classes' },
  { key: 'students', num: 3, title: 'Build the Official Student Roster', hi: 'आधिकारिक छात्र सूची बनाएँ', desc: 'Approve self-registration requests or add/import Students directly into approved classes.', href: '/school/students', action: 'Manage Students' },
  { key: 'fees', num: 4, title: 'Configure Operational Records', hi: 'ऑपरेशनल रिकॉर्ड कॉन्फ़िगर करें', desc: 'Set fee structures and invoices, then use Attendance, Timetable, Exams and Announcements for daily operations.', href: '/school/fees', action: 'Configure Fees' },
];

export default function SchoolOnboardingPage() {
  const router = useRouter();
  const { t } = useLanguageStore();
  const { data: overview, isLoading, isError } = useQuery({
    queryKey: ['school-overview'],
    queryFn: () => getOverview().then(r => r.data.data),
  });

  if (isLoading) return <div className="space-y-4">{[...Array(4)].map((_, i) => <div key={i} className="skeleton h-28 rounded-xl" />)}</div>;
  if (isError) return <div className="card" style={{ color: '#C62828' }}>Could not load School setup status.</div>;

  const onboarding = overview?.onboarding || { checks: {}, completed: 0, total: 5, isComplete: false };
  const checks = onboarding.checks || {};
  const teacherReady = !!checks.teachers;

  return (
    <div className="animate-fade-up max-w-3xl">
      <div className="mb-6">
        <h1 className="font-display font-extrabold text-2xl" style={{ color: 'var(--navy)' }}>🚀 {t('स्कूल सेटअप गाइड', 'School Setup Guide')}</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>{t('VidyaSetu पर दैनिक स्कूल संचालन शुरू करने के लिए आवश्यक चरण', 'Complete the operational foundation required to run your School on VidyaSetu.')}</p>
      </div>

      <div className="card mb-6">
        <div className="flex justify-between text-xs mb-2 font-semibold"><span style={{ color: 'var(--navy)' }}>Setup readiness</span><span style={{ color: onboarding.isComplete ? 'var(--forest)' : 'var(--saffron)' }}>{onboarding.completed}/{onboarding.total} checks ready</span></div>
        <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}><div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min((Number(onboarding.completed || 0) / Number(onboarding.total || 5)) * 100, 100)}%`, background: onboarding.isComplete ? 'var(--forest)' : 'linear-gradient(to right, var(--saffron), var(--saffron-light))' }} /></div>
      </div>

      <div className="space-y-4">
        {STEPS.map(step => {
          const done = step.key === 'classes' ? !!checks.classes && teacherReady : !!checks[step.key];
          return <div key={step.key} className="card" style={{ borderLeft: `4px solid ${done ? 'var(--forest)' : 'var(--saffron)'}` }}>
            <div className="flex items-start gap-4">
              <div className="w-9 h-9 rounded-full flex items-center justify-center font-extrabold text-sm flex-shrink-0" style={{ background: done ? 'var(--forest)' : 'var(--saffron)', color: 'white' }}>{done ? '✓' : step.num}</div>
              <div className="flex-1 min-w-0">
                <h3 className="font-display font-bold text-base" style={{ color: 'var(--navy)' }}>{t(step.hi, step.title)}</h3>
                <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--slate)' }}>{step.desc}</p>
                {step.key === 'classes' && <p className="text-xs mt-2" style={{ color: teacherReady ? 'var(--forest)' : 'var(--saffron)' }}>{checks.classes ? '✓ Classes configured' : '○ Classes required'} · {teacherReady ? '✓ Teachers configured' : '○ Teachers required'}</p>}
                <button className={done ? 'btn-outline mt-3 text-sm' : 'btn-primary mt-3 text-sm'} onClick={() => router.push(step.href)}>{done ? 'Review' : step.action} →</button>
              </div>
            </div>
          </div>;
        })}
      </div>

      <div className="card mt-5">
        <h3 className="font-display font-bold mb-3" style={{ color: 'var(--navy)' }}>Daily operations</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            ['/school/attendance','📅','Attendance'],['/school/timetable','🗓️','Timetable'],['/school/exams','📝','Exams'],['/school/announcements','📢','Announcements'],
          ].map(([href, icon, label]) => <button key={href} onClick={() => router.push(href)} className="p-3 rounded-xl text-left" style={{ background: '#F7F8FA' }}><div>{icon}</div><div className="text-xs font-bold mt-1" style={{ color: 'var(--navy)' }}>{label}</div></button>)}
        </div>
      </div>

      {onboarding.isComplete && <div className="card mt-6 text-center py-8" style={{ background: 'var(--forest-pale)', border: '2px solid var(--forest)' }}><div className="text-4xl mb-3">🎉</div><h3 className="font-display font-extrabold text-xl" style={{ color: 'var(--forest)' }}>School foundation ready</h3><p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>Core profile, classes, staff, Students and fee records are configured. Daily School operations can now run from the sidebar.</p></div>}
    </div>
  );
}
