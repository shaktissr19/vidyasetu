'use client';
import { useQuery } from '@tanstack/react-query';
import { getRevenue } from '@/services/adminService';
import { StatCard } from '@/components/ui/index';
import { formatCurrency } from '@/utils/formatters';

export default function AdminRevenuePage() {
  const { data: rev, isLoading } = useQuery({ queryKey: ['admin-revenue'], queryFn: () => getRevenue().then(r => r.data.data) });

  return (
    <div className="animate-fade-up">
      <h1 className="font-display font-extrabold text-2xl text-white mb-6">💰 Revenue Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 stagger">
        <StatCard dark label="MRR"    value={formatCurrency(rev?.mrr || 0)}   sub="Monthly recurring" />
        <StatCard dark label="ARR"    value={formatCurrency(rev?.arr || 0)}   sub="Annualized" />
        <StatCard dark label="Paid Schools" value={rev?.planBreakdown?.reduce((s,p) => s + parseInt(p.school_count||0), 0) || 0} sub="Active subscriptions" />
        <StatCard dark label="Avg ARPU" value={formatCurrency(rev?.mrr && rev?.planBreakdown ? Math.round(rev.mrr / Math.max(1, rev.planBreakdown.reduce((s,p) => s + parseInt(p.school_count||0), 0))) : 0)} sub="Per school/month" />
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div className="card-navy">
          <h3 className="font-display font-bold text-base text-white mb-4">📋 Plan Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="tbl" style={{ color: 'rgba(255,255,255,0.7)' }}>
              <thead>
                <tr>
                  {['Plan','Schools','Monthly Revenue'].map(h => <th key={h} style={{ color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.05)' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {(rev?.planBreakdown || []).map(p => (
                  <tr key={p.plan} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <td className="font-semibold text-white">{p.plan}</td>
                    <td>{p.school_count}</td>
                    <td style={{ color: 'var(--saffron-light)', fontWeight: 700 }}>{formatCurrency(p.monthly_revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card-navy">
          <h3 className="font-display font-bold text-base text-white mb-4">📈 Monthly Trend</h3>
          <div className="space-y-3">
            {(rev?.monthlyTrend || []).slice(-6).map(m => {
              const max = Math.max(...(rev.monthlyTrend || []).map(x => parseFloat(x.revenue || 0)));
              const pct = max > 0 ? Math.round((parseFloat(m.revenue) / max) * 100) : 0;
              return (
                <div key={m.month}>
                  <div className="flex justify-between text-xs mb-1">
                    <span style={{ color: 'rgba(255,255,255,0.6)' }}>{m.month}</span>
                    <span style={{ color: 'var(--saffron-light)', fontWeight: 700 }}>{formatCurrency(m.revenue)}</span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(to right, var(--saffron), var(--saffron-light))' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
