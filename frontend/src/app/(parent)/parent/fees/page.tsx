'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getChildren, getChildFees } from '@/services/parentService';
import { SectionHeader, StatusBadge } from '@/components/ui/index';
import { formatCurrency, formatDate } from '@/utils/formatters';
import useLanguageStore from '@/store/languageStore';
import toast from 'react-hot-toast';

export default function ParentFeesPage() {
  const { t } = useLanguageStore();
  const [selectedChild, setSelectedChild] = useState<string | null>(null);

  const { data: children = [] } = useQuery({
    queryKey: ['parent-children'],
    queryFn: () => getChildren().then((r) => r.data.data),
  });

  useEffect(() => {
    if (children.length && !selectedChild) setSelectedChild(children[0]?.id || null);
  }, [children, selectedChild]);

  const { data: fees = [], isLoading } = useQuery({
    queryKey: ['parent-fees', selectedChild],
    queryFn: async () => {
      if (!selectedChild) throw new Error('No child selected');
      return getChildFees(selectedChild).then((r) => r.data.data);
    },
    enabled: !!selectedChild,
  });

  const totalDue = fees
    .filter((fee) => ['PENDING', 'OVERDUE'].includes(fee.status))
    .reduce((sum, fee) => sum + (Number(fee.amount_due) - Number(fee.amount_paid)), 0);
  const totalPaid = fees
    .filter((fee) => fee.status === 'PAID')
    .reduce((sum, fee) => sum + Number(fee.amount_paid), 0);

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
          {children.map((child) => (
            <button key={child.id} onClick={() => setSelectedChild(child.id)}
              className="px-4 py-1.5 rounded-full text-sm font-bold transition-all"
              style={{ background: selectedChild === child.id ? 'var(--forest)' : 'white', color: selectedChild === child.id ? 'white' : 'var(--slate)', border: `1.5px solid ${selectedChild === child.id ? 'var(--forest)' : 'var(--border)'}` }}>
              {child.name.split(' ')[0]}
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
                {fees.map((fee, i) => (
                  <tr key={fee.id || i}>
                    <td className="font-semibold">{t('टर्म', 'Term')} {fee.term}</td>
                    <td className="font-bold">{formatCurrency(fee.amount_due)}</td>
                    <td style={{ color: 'var(--forest)', fontWeight: 600 }}>{formatCurrency(fee.amount_paid)}</td>
                    <td>{formatDate(fee.due_date)}</td>
                    <td><StatusBadge status={fee.status} /></td>
                    <td>
                      {fee.status === 'PAID' ? (
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
