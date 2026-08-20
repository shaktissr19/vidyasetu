'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getOverview, sendFeeReminders } from '@/services/schoolService';
import { StatCard, CardSkeleton, ProgressBar, SectionHeader } from '@/components/ui/index';
import { formatCurrency } from '@/utils/formatters';
import useAuthStore from '@/store/authStore';
import useLanguageStore from '@/store/languageStore';
import toast from 'react-hot-toast';

const errorText = e => e?.response?.data?.error?.message || e?.message || 'Request failed';

export default function SchoolOverview() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const { t } = useLanguageStore();
  const canAdmin = ['SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(user?.role);

  const { data: overview, isLoading, isError, error } = useQuery({
    queryKey: ['school-overview'],
    queryFn: () => getOverview().then(r => r.data.data),
  });

  const reminderMut = useMutation({
    mutationFn: sendFeeReminders,
    onSuccess: async res => {
      toast.success(`Fee reminder sent to ${res.data?.data?.sent || 0} parent(s)`);
      await qc.invalidateQueries({ queryKey: ['school-overview'] });
    },
    onError: e => toast.error(errorText(e)),
  });

  if (isLoading) return (
    <div>
      <div className="skeleton h-8 w-64 mb-6 rounded" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => <CardSkeleton key={i} />)}
      </div>
    </div>
  );

  if (isError) return <div className="card" style={{ color: '#C62828' }}>{errorText(error)}</div>;

  const school = overview?.school || {};
  const stats = overview?.stats || {};
  const fee = overview?.feeStats || {};
  const classes = overview?.classSummary || [];
  const announcements = overview?.announcements || [];
  const onboarding = overview?.onboarding || {};

  return (
    <div className="animate-fade-up">
      <SectionHeader
        title={`🏫 ${school.name || 'School Dashboard'}`}
        sub={`UDISE: ${school.udise_code || '—'} · ${school.academic_year || '—'} · ${school.district || ''}${school.state ? `, ${school.state}` : ''}`}>
        <button className="btn-primary" onClick={() => router.push('/school/announcements')}>
          📢 {t('घोषणा भेजें', 'New Announcement')}
        </button>
      </SectionHeader>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 stagger">
        <StatCard label={t('कुल छात्र', 'Total Students')} value={Number(stats.total_students || 0).toLocaleString()} sub={`${stats.pending_enrollment_requests || 0} pending enrollment`} accent="var(--saffron)" />
        <StatCard label={t('आज उपस्थिति', 'Today Attendance')} value={`${Number(stats.today_attendance || 0)}%`} sub={`${stats.attended_today || 0}/${stats.attendance_denominator || 0} marked present`} accent="var(--forest)" />
        <StatCard label={t('फीस संग्रह', 'Fees Collected')} value={formatCurrency(fee.collected || 0)} sub={`${fee.pending_count || 0} pending invoice(s)`} accent="var(--navy)" />
        <StatCard label={t('शिक्षक', 'Teachers')} value={stats.total_teachers || 0} sub={`${stats.total_classes || 0} active classes`} accent="var(--gold)" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          ['/school/enrollments', '✅', 'Enrollment Requests', stats.pending_enrollment_requests || 0],
          ['/school/students', '👨‍🎓', 'Student Roster', stats.total_students || 0],
          ['/school/classes', '🏷️', 'Classes & Sections', stats.total_classes || 0],
          ['/school/exams', '📝', 'Upcoming Exams', stats.upcoming_exams || 0],
        ].map(([href, icon, label, value]) => (
          <button key={href} onClick={() => router.push(href)} className="card text-left p-4 transition-all hover:-translate-y-0.5">
            <div className="text-xl mb-1">{icon}</div>
            <div className="font-display font-bold text-lg" style={{ color: 'var(--navy)' }}>{value}</div>
            <div className="text-xs" style={{ color: 'var(--slate)' }}>{label}</div>
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-5 mb-5">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-bold text-base" style={{ color: 'var(--navy)' }}>📅 {t('कक्षावार उपस्थिति', 'Class-wise Attendance Today')}</h3>
            <button className="text-xs font-bold" style={{ color: 'var(--saffron)' }} onClick={() => router.push('/school/attendance')}>Open Attendance →</button>
          </div>
          {classes.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--slate)' }}>No active classes found.</p>
          ) : (
            <div className="space-y-3">
              {classes.map(cls => {
                const total = Number(cls.total || 0);
                const present = Number(cls.present || 0);
                const pct = total > 0 ? Math.round((present / total) * 100) : 0;
                return (
                  <div key={cls.id || `${cls.class_name}-${cls.section}`}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-semibold" style={{ color: 'var(--navy)' }}>Class {cls.class_name}{cls.section ? `-${cls.section}` : ''}</span>
                      <span style={{ color: pct >= 85 ? 'var(--forest)' : 'var(--saffron)' }}>{present}/{total} ({pct}%)</span>
                    </div>
                    <ProgressBar pct={pct} color={pct >= 85 ? 'var(--forest)' : 'var(--saffron)'} height={6} showPct={false} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-bold text-base" style={{ color: 'var(--navy)' }}>💰 {t('फीस स्थिति', 'Fee Status')}</h3>
            {canAdmin && <button className="text-xs font-bold" style={{ color: 'var(--saffron)' }} onClick={() => router.push('/school/fees')}>Manage Fees →</button>}
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'var(--forest-pale)' }}>
              <span className="font-semibold text-sm">✅ {t('भुगतान', 'Paid')}</span>
              <span className="font-display font-extrabold text-lg" style={{ color: 'var(--forest)' }}>{fee.paid_count || 0}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'var(--saffron-pale)' }}>
              <span className="font-semibold text-sm">⏳ {t('लंबित', 'Pending')}</span>
              <span className="font-display font-extrabold text-lg" style={{ color: 'var(--saffron)' }}>{fee.pending_count || 0}</span>
            </div>
            {canAdmin && <button className="btn-primary w-full justify-center mt-2" disabled={reminderMut.isPending} onClick={() => reminderMut.mutate()}>
              {reminderMut.isPending ? 'Sending…' : `📲 ${t('रिमाइंडर भेजें', 'Send Fee Reminders')}`}
            </button>}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-bold" style={{ color: 'var(--navy)' }}>📢 Recent Announcements</h3>
            <button className="text-xs font-bold" style={{ color: 'var(--saffron)' }} onClick={() => router.push('/school/announcements')}>View all →</button>
          </div>
          {announcements.length === 0 ? <p className="text-sm" style={{ color: 'var(--slate)' }}>No announcements yet.</p> : announcements.map(a => (
            <div key={a.id} className="py-2" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="font-semibold text-sm" style={{ color: 'var(--navy)' }}>{a.title}</div>
              <div className="text-xs" style={{ color: 'var(--slate)' }}>{new Date(a.published_at).toLocaleString('en-IN')}</div>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-bold" style={{ color: 'var(--navy)' }}>🚀 Setup Readiness</h3>
            <span className="font-bold" style={{ color: onboarding.isComplete ? 'var(--forest)' : 'var(--saffron)' }}>{onboarding.completed || 0}/{onboarding.total || 5}</span>
          </div>
          <div className="space-y-2">
            {Object.entries(onboarding.checks || {}).map(([key, done]) => (
              <div key={key} className="flex justify-between text-sm"><span className="capitalize">{key}</span><span style={{ color: done ? 'var(--forest)' : 'var(--saffron)', fontWeight: 700 }}>{done ? '✓ Ready' : '○ Pending'}</span></div>
            ))}
          </div>
          {canAdmin && !onboarding.isComplete && <button className="btn-outline w-full justify-center mt-4" onClick={() => router.push('/school/profile')}>Complete School Setup</button>}
        </div>
      </div>
    </div>
  );
}
