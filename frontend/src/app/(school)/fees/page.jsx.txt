'use client';
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getFeeOverview, sendFeeReminders } from '@/services/schoolService';
import { SectionHeader, StatCard, CardSkeleton, StatusBadge } from '@/components/ui/index';
import { formatCurrency, formatDate } from '@/utils/formatters';
import useLanguageStore from '@/store/languageStore';
import toast from 'react-hot-toast';

export default function SchoolFeesPage() {
  const { t } = useLanguageStore();
  const [filter, setFilter] = useState('ALL');

  const { data: fees = [], isLoading, refetch } = useQuery({
    queryKey: ['school-fees'],
    queryFn:  () => getFeeOverview().then(r => r.data.data),
  });

  const reminderMut = useMutation({
    mutationFn: sendFeeReminders,
    onSuccess: (res) => toast.success(`📲 Reminder sent to ${res.data.data.sent} parents!`),
    onError:   () => toast.error('Failed to send reminders'),
  });

  // Summary stats
  const totalCollected = fees.filter(f => f.status === 'PAID').reduce((s, f) => s + parseFloat(f.amount_due || 0), 0);
  const totalPending   = fees.filter(f => ['PENDING','OVERDUE'].includes(f.status)).reduce((s, f) => s + parseFloat(f.amount_due || 0), 0);
  const paidCount      = fees.filter(f => f.status === 'PAID').length;
  const pendingCount   = fees.filter(f => ['PENDING','OVERDUE'].includes(f.status)).length;

  const filtered = filter === 'ALL' ? fees : fees.filter(f => f.status === filter);

  return (
    <div className="animate-fade-up">
      <SectionHeader title={`💰 ${t('फीस प्रबंधन', 'Fee Management')}`}>
        <button className="btn-outline text-sm" onClick={() => toast('📤 Fee report exported')}>📤 {t('एक्सपोर्ट', 'Export')}</button>
        <button className="btn-primary text-sm" disabled={reminderMut.isPending} onClick={() => reminderMut.mutate()}>
          📲 {t('रिमाइंडर भेजें', 'Send Reminders')}
        </button>
      </SectionHeader>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 stagger">
        <StatCard label={t('संग्रहित', 'Collected')}   value={formatCurrency(totalCollected)} sub={`${paidCount} students`}    accent="var(--forest)" />
        <StatCard label={t('लंबित',    'Pending')}      value={formatCurrency(totalPending)}   sub={`${pendingCount} students`}  accent="var(--saffron)" />
        <StatCard label={t('कुल छात्र','Total')}        value={fees.length}                    sub={t('इस वर्ष', 'This year')}  accent="var(--navy)" />
        <StatCard label={t('संग्रह %','Collection %')} value={fees.length ? `${Math.round((paidCount/fees.length)*100)}%` : '0%'} sub={t('दर', 'rate')} accent="var(--gold)" />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {[['ALL', t('सभी', 'All')], ['PAID', t('भुगतान', 'Paid')], ['PENDING', t('लंबित', 'Pending')], ['OVERDUE', t('अतिदेय', 'Overdue')]].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)}
            className="px-4 py-1.5 rounded-full text-sm font-bold transition-all"
            style={{ background: filter === k ? 'var(--navy)' : '#F0F4F8', color: filter === k ? 'white' : 'var(--slate)' }}>
            {l}
          </button>
        ))}
      </div>

      {/* Fee list */}
      <div className="card">
        {isLoading ? <div className="space-y-3">{[...Array(6)].map((_, i) => <div key={i} className="skeleton h-16 rounded-xl" />)}</div> : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t('छात्र', 'Student')}</th>
                  <th>{t('कक्षा', 'Class')}</th>
                  <th>{t('देय राशि', 'Due Amount')}</th>
                  <th>{t('भुगतान', 'Paid')}</th>
                  <th>{t('नियत तिथि', 'Due Date')}</th>
                  <th>{t('स्थिति', 'Status')}</th>
                  <th>{t('कार्रवाई', 'Action')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 50).map(f => (
                  <tr key={f.student_id + f.invoice_number}>
                    <td className="font-semibold">{f.name}</td>
                    <td>Class {f.class_name}{f.section ? `-${f.section}` : ''}</td>
                    <td className="font-bold">{formatCurrency(f.amount_due)}</td>
                    <td style={{ color: 'var(--forest)', fontWeight: 600 }}>{formatCurrency(f.amount_paid)}</td>
                    <td className="text-sm">{formatDate(f.due_date)}</td>
                    <td><StatusBadge status={f.status} /></td>
                    <td>
                      {f.status !== 'PAID' ? (
                        <button className="text-xs font-semibold px-3 py-1 rounded-lg"
                          style={{ background: 'var(--saffron-pale)', color: 'var(--saffron)' }}
                          onClick={() => toast(`💰 Opening payment form for ${f.name}`)}>
                          {t('जमा करें', 'Collect')}
                        </button>
                      ) : (
                        <button className="text-xs font-semibold px-3 py-1 rounded-lg"
                          style={{ background: 'var(--forest-pale)', color: 'var(--forest)' }}
                          onClick={() => toast('📄 Receipt downloaded')}>
                          {t('रसीद', 'Receipt')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > 50 && (
              <p className="text-xs text-center py-3" style={{ color: 'var(--slate)' }}>
                Showing 50 of {filtered.length} records. Use export for full list.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
