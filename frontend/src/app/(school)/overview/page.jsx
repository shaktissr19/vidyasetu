'use client';
import { useQuery } from '@tanstack/react-query';
import { getOverview } from '@/services/schoolService';
import { StatCard, CardSkeleton, ProgressBar, SectionHeader } from '@/components/ui/index';
import { formatCurrency } from '@/utils/formatters';
import useLanguageStore from '@/store/languageStore';
import toast from 'react-hot-toast';

export default function SchoolOverview() {
  const { t } = useLanguageStore();
  const { data: overview, isLoading } = useQuery({
    queryKey: ['school-overview'],
    queryFn:  () => getOverview().then(r => r.data.data),
  });

  if (isLoading) return (
    <div>
      <div className="skeleton h-8 w-64 mb-6 rounded" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => <CardSkeleton key={i} />)}
      </div>
    </div>
  );

  const school  = overview?.school    || {};
  const stats   = overview?.stats     || {};
  const fee     = overview?.feeStats  || {};
  const classes = overview?.classSummary || [];

  return (
    <div className="animate-fade-up">
      <SectionHeader
        title={`🏫 ${school.name || 'School Dashboard'}`}
        sub={`UDISE: ${school.udise_code || '—'} · ${school.district}, ${school.state}`}>
        <button className="btn-primary" onClick={() => toast('📲 WhatsApp circular sent to all parents!')}>
          📲 {t('सर्कुलर भेजें', 'Send Circular')}
        </button>
      </SectionHeader>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 stagger">
        <StatCard label={t('कुल छात्र',   'Total Students')}    value={stats.total_students?.toLocaleString() || 0} sub="Active" accent="var(--saffron)" />
        <StatCard label={t('आज उपस्थिति','Today Attendance')}   value={`${stats.avg_attendance || 0}%`} sub={t('औसत', 'Average')} accent="var(--forest)" />
        <StatCard label={t('फीस संग्रह',  'Fees Collected')}     value={formatCurrency(fee.collected || 0)} sub={t('इस वर्ष', 'This year')} accent="var(--navy)" />
        <StatCard label={t('शिक्षक',       'Teachers')}           value={stats.total_teachers || 0} sub={t('सक्रिय', 'Active')} accent="var(--gold)" />
      </div>

      <div className="grid md:grid-cols-2 gap-5 mb-5">
        {/* Class-wise attendance */}
        <div className="card">
          <h3 className="font-display font-bold text-base mb-4" style={{ color: 'var(--navy)' }}>
            📅 {t('कक्षावार उपस्थिति', 'Class-wise Attendance Today')}
          </h3>
          {classes.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--slate)' }}>No attendance data for today</p>
          ) : (
            <div className="space-y-3">
              {classes.map((cls) => {
                const pct = cls.total > 0 ? Math.round((cls.present / cls.total) * 100) : 0;
                return (
                  <div key={`${cls.class_name}-${cls.section}`}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-semibold" style={{ color: 'var(--navy)' }}>
                        Class {cls.class_name}{cls.section ? `-${cls.section}` : ''}
                      </span>
                      <span style={{ color: pct >= 85 ? 'var(--forest)' : 'var(--saffron)' }}>
                        {cls.present}/{cls.total} ({pct}%)
                      </span>
                    </div>
                    <ProgressBar pct={pct} color={pct >= 85 ? 'var(--forest)' : 'var(--saffron)'} height={6} showPct={false} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Fee status */}
        <div className="card">
          <h3 className="font-display font-bold text-base mb-4" style={{ color: 'var(--navy)' }}>
            💰 {t('फीस स्थिति', 'Fee Status')}
          </h3>
          <div className="space-y-3">
            {[
              { label: `✅ ${t('भुगतान', 'Paid')}`,     count: fee.paid_count || 0,    color: 'var(--forest)',  bg: 'var(--forest-pale)'  },
              { label: `⏳ ${t('लंबित', 'Pending')}`,   count: fee.pending_count || 0, color: 'var(--saffron)', bg: 'var(--saffron-pale)' },
            ].map(({ label, count, color, bg }) => (
              <div key={label} className="flex items-center justify-between p-3 rounded-xl"
                style={{ background: bg }}>
                <span className="font-semibold text-sm">{label}</span>
                <span className="font-display font-extrabold text-lg" style={{ color }}>{count} {t('छात्र', 'students')}</span>
              </div>
            ))}
            <button className="btn-primary w-full justify-center mt-2"
              onClick={() => toast('📲 Fee reminder sent via WhatsApp to pending parents!')}>
              📲 {t('रिमाइंडर भेजें', 'Send Reminders')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
