'use client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getAnalytics, updateSchoolStatus } from '@/services/adminService';
import { StatCard } from '@/components/ui/index';
import { formatCurrency } from '@/utils/formatters';
import toast from 'react-hot-toast';

export default function AdminAnalytics() {
  const { data: analytics, isLoading } = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: () => getAnalytics().then((r) => r.data.data),
    refetchInterval: 60000,
  });

  const approveMut = useMutation({
    mutationFn: ({ id }: { id: string }) => updateSchoolStatus(id, 'ACTIVE'),
    onSuccess: () => { toast.success('✅ School approved!'); },
  });

  if (isLoading) return (
    <div>
      <div className="skeleton h-8 w-64 mb-6 rounded" style={{ background: 'rgba(255,255,255,0.1)' }} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-28 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)' }} />)}
      </div>
    </div>
  );

  const students = analytics?.students || {};
  const schools = analytics?.schools || {};

  return (
    <div className="animate-fade-up">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-white">📊 Platform Analytics</h1>
          <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Real-time · March 29, 2026</p>
        </div>
        <button className="btn-primary" onClick={() => toast('📊 Monthly report downloaded!')}>📥 Export Report</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 stagger">
        <StatCard dark label="Total Students" value={Number(students.total || 0).toLocaleString('en-IN')} sub={`↑ ${students.new_this_month || 0} this month`} />
        <StatCard dark label="Active Schools" value={Number(schools.active || 0).toLocaleString('en-IN')} sub={`↑ ${schools.new_this_month || 0} new`} />
        <StatCard dark label="MRR" value={formatCurrency(analytics?.mrr || 0)} sub={`${schools.paid || 0} paid schools`} />
        <StatCard dark label="DAU" value={Number(analytics?.dau || 0).toLocaleString('en-IN')} sub="Daily active users" />
      </div>

      <div className="grid md:grid-cols-2 gap-5 mb-5">
        <div className="card-navy">
          <h3 className="font-display font-bold text-base text-white mb-4">🌐 Top States by Enrollment</h3>
          <div className="space-y-3">
            {(analytics?.topStates || []).map((s) => {
              const max = Number(analytics?.topStates?.[0]?.student_count || 1);
              const pct = Math.round((Number(s.student_count) / max) * 100);
              return (
                <div key={s.state}>
                  <div className="flex justify-between text-sm mb-1">
                    <span style={{ color: 'rgba(255,255,255,0.7)' }}>{s.state}</span>
                    <span style={{ color: 'var(--saffron-light)', fontWeight: 700 }}>{Number(s.student_count).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: 'var(--saffron-light)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card-navy">
          <h3 className="font-display font-bold text-base text-white mb-4">⏳ Pending School Approvals</h3>
          {(analytics?.pendingSchools || []).length === 0 ? (
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>All caught up! ✅</p>
          ) : (
            <div className="space-y-3">
              {(analytics?.pendingSchools || []).slice(0, 5).map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{s.name}</p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{s.district}, {s.state}</p>
                  </div>
                  <button className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all flex-shrink-0"
                    style={{ background: 'rgba(19,136,8,0.2)', color: '#A5D6A7', border: '1px solid rgba(19,136,8,0.3)' }}
                    disabled={approveMut.isPending}
                    onClick={() => approveMut.mutate({ id: s.id })}>
                    Approve ✓
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
