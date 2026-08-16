'use client';
import { useQuery } from '@tanstack/react-query';
import { getChildren, getChildFees } from '@/services/parentService';
import { useState } from 'react';
import { SectionHeader, StatusBadge } from '@/components/ui/index';
import { formatCurrency, formatDate } from '@/utils/formatters';
import useLanguageStore from '@/store/languageStore';
import toast from 'react-hot-toast';

export default function ParentFeesPage() {
  const { t } = useLanguageStore();
  const [selectedChild, setSelectedChild] = useState(null);

  const { data: children = [] } = useQuery({
    queryKey: ['parent-children'],
    queryFn:  () => getChildren().then(r => r.data.data),
    onSuccess: d => { if (d.length && !selectedChild) setSelectedChild(d[0]?.id); },
  });

  const { data: fees = [], isLoading } = useQuery({
    queryKey: ['parent-fees', selectedChild],
    queryFn:  () => getChildFees(selectedChild).then(r => r.data.data),
    enabled:  !!selectedChild,
  });

  const totalDue  = fees.filter(f => ['PENDING','OVERDUE'].includes(f.status)).reduce((s, f) => s + parseFloat(f.amount_due - f.amount_paid), 0);
  const totalPaid = fees.filter(f => f.status === 'PAID').reduce((s, f) => s + parseFloat(f.amount_paid), 0);

  return (
    <div className="animate-fade-up">
      <SectionHeader title={`💰 ${t('फीस', 'Fees')}`}>
        {totalDue > 0 && (
          <button className="btn-green" onClick={() => toast('Opening online payment — UPI/Card/Net Banking')}>
            💳 {t('ऑनलाइन भुगतान करें', 'Pay Online')}
          </button>
        )}
      </SectionHeader>

      {children.length > 1 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {children.map(c => (
            <button key={c.id} onClick={() => setSelectedChild(c.id)}
              className="px-4 py-1.5 rounded-full text-sm font-bold transition-all"
              style={{ background: selectedChild === c.id ? 'var(--forest)' : 'white', color: selectedChild === c.id ? 'white' : 'var(--slate)', border: `1.5px solid ${selectedChild === c.id ? 'var(--forest)' : 'var(--border)'}` }}>
              {c.name.split(' ')[0]}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="card" style={{ borderLeft: '4px solid var(--forest)' }}>
          <p className="text-xs font-bold uppercase" style={{ color: 'var(--slate)' }}>{t('कुल भुगतान', 'Total Paid')}</p>
          <p className="font-display font-extrabold text-2xl mt-1" style={{ color: 'var(--forest)' }}>{formatCurrency(totalPaid)}</p>
        </div>
        <div className="card" style={{ borderLeft: `4px solid ${totalDue > 0 ? 'var(--saffron)' : 'var(--forest)'}` }}>
          <p className="text-xs font-bold uppercase" style={{ color: 'var(--slate)' }}>{t('बकाया', 'Outstanding')}</p>
          <p className="font-display font-extrabold text-2xl mt-1" style={{ color: totalDue > 0 ? 'var(--saffron)' : 'var(--forest)' }}>
            {totalDue > 0 ? formatCurrency(totalDue) : '✅ Nil'}
          </p>
        </div>
      </div>

      <div className="card">
        {isLoading ? <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-14 rounded-lg" />)}</div> : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t('टर्म', 'Term')}</th>
                  <th>{t('देय', 'Due')}</th>
                  <th>{t('भुगतान', 'Paid')}</th>
                  <th>{t('नियत तिथि', 'Due Date')}</th>
                  <th>{t('स्थिति', 'Status')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {fees.map((f, i) => (
                  <tr key={i}>
                    <td className="font-semibold">{t('टर्म', 'Term')} {f.term}</td>
                    <td className="font-bold">{formatCurrency(f.amount_due)}</td>
                    <td style={{ color: 'var(--forest)', fontWeight: 600 }}>{formatCurrency(f.amount_paid)}</td>
                    <td>{formatDate(f.due_date)}</td>
                    <td><StatusBadge status={f.status} /></td>
                    <td>
                      {f.status === 'PAID' ? (
                        <button className="text-xs font-semibold px-2 py-1 rounded-lg" style={{ background: 'var(--forest-pale)', color: 'var(--forest)' }}
                          onClick={() => toast('📄 Downloading receipt...')}>
                          {t('रसीद', 'Receipt')}
                        </button>
                      ) : (
                        <button className="text-xs font-semibold px-2 py-1 rounded-lg" style={{ background: 'var(--saffron-pale)', color: 'var(--saffron)' }}
                          onClick={() => toast('Opening payment...')}>
                          {t('भुगतान', 'Pay')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
