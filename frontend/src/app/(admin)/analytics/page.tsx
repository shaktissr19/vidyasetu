'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAnalytics, updateSchoolStatus } from '@/services/adminService';
import { StatCard } from '@/components/ui/index';
import { formatCurrency } from '@/utils/formatters';
import toast from 'react-hot-toast';

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export default function AdminAnalytics() {
  const qc = useQueryClient();
  const { data: analytics, isLoading } = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: () => getAnalytics().then((r) => r.data.data),
    refetchInterval: 60000,
  });

  const approveMut = useMutation({
    mutationFn: ({ id }: { id: string }) => updateSchoolStatus(id, 'ACTIVE'),
    onSuccess: async () => { toast.success('✅ School approved!'); await qc.invalidateQueries({ queryKey: ['admin-analytics'] }); await qc.invalidateQueries({ queryKey: ['admin-schools'] }); },
  });

  function exportReport() {
    if (!analytics) return;
    const rows: Array<[string, unknown]> = [
      ['Metric', 'Value'], ['Total Students', analytics.students?.total || 0], ['New Students This Month', analytics.students?.new_this_month || 0],
      ['Active Schools', analytics.schools?.active || 0], ['New Schools This Month', analytics.schools?.new_this_month || 0], ['Paid Schools', analytics.schools?.paid || 0],
      ['MRR', analytics.mrr || 0], ['DAU', analytics.dau || 0],
    ];
    for (const role of analytics.roleBreakdown || []) rows.push([`Active ${role.role}`, role.count]);
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `vidyasetu-platform-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
    toast.success('📊 Platform report exported');
  }

  if (isLoading) return (
    <div><div className="skeleton h-8 w-64 mb-6 rounded" style={{ background: 'rgba(255,255,255,0.1)' }} /><div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">{[...Array(4)].map((_, i) => <div key={i} className="skeleton h-28 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)' }} />)}</div></div>
  );

  const students = analytics?.students || {};
  const schools = analytics?.schools || {};
  const today = new Intl.DateTimeFormat('en-IN', { dateStyle: 'long' }).format(new Date());

  return (
    <div className="animate-fade-up">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="font-display font-extrabold text-2xl text-white">📊 Platform Analytics</h1><p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Real-time · {today}</p></div>
        <button className="btn-primary" onClick={exportReport}>📥 Export Report</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 stagger">
        <StatCard dark label="Total Students" value={Number(students.total || 0).toLocaleString('en-IN')} sub={`↑ ${students.new_this_month || 0} this month`} />
        <StatCard dark label="Active Schools" value={Number(schools.active || 0).toLocaleString('en-IN')} sub={`↑ ${schools.new_this_month || 0} new`} />
        <StatCard dark label="MRR" value={formatCurrency(analytics?.mrr || 0)} sub={`${schools.paid || 0} paid schools`} />
        <StatCard dark label="DAU" value={Number(analytics?.dau || 0).toLocaleString('en-IN')} sub="Daily active students" />
      </div>

      <div className="grid md:grid-cols-2 gap-5 mb-5">
        <div className="card-navy">
          <h3 className="font-display font-bold text-base text-white mb-4">🌐 Top States by Enrollment</h3>
          <div className="space-y-3">
            {(analytics?.topStates || []).map((state) => {
              const max = Number(analytics?.topStates?.[0]?.student_count || 1);
              const pct = Math.round((Number(state.student_count) / max) * 100);
              return <div key={state.state}><div className="flex justify-between text-sm mb-1"><span style={{ color: 'rgba(255,255,255,0.7)' }}>{state.state}</span><span style={{ color: 'var(--saffron-light)', fontWeight: 700 }}>{Number(state.student_count).toLocaleString('en-IN')}</span></div><div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}><div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: 'var(--saffron-light)' }} /></div></div>;
            })}
          </div>
        </div>

        <div className="card-navy">
          <h3 className="font-display font-bold text-base text-white mb-4">⏳ Pending School Approvals</h3>
          {(analytics?.pendingSchools || []).length === 0 ? <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>All caught up! ✅</p> : <div className="space-y-3">{(analytics?.pendingSchools || []).slice(0, 5).map((school) => <div key={school.id} className="flex items-center justify-between gap-3"><div className="flex-1 min-w-0"><p className="text-sm font-semibold text-white truncate">{school.name}</p><p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{school.district}, {school.state}</p></div><button className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all flex-shrink-0" style={{ background: 'rgba(19,136,8,0.2)', color: '#A5D6A7', border: '1px solid rgba(19,136,8,0.3)' }} disabled={approveMut.isPending} onClick={() => approveMut.mutate({ id: school.id })}>Approve ✓</button></div>)}</div>}
        </div>
      </div>
    </div>
  );
}
