'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getChildren, getChildHomework } from '@/services/parentService';
import useLanguageStore from '@/store/languageStore';

const STATUS_META = {
  PENDING: { icon: '🕒', label: 'Pending', hi: 'लंबित', tone: '#92400e', bg: '#fffbeb' },
  OVERDUE: { icon: '⚠️', label: 'Overdue', hi: 'समय सीमा पार', tone: '#b91c1c', bg: '#fef2f2' },
  SUBMITTED: { icon: '📤', label: 'Submitted', hi: 'जमा किया', tone: '#1d4ed8', bg: '#eff6ff' },
  REVIEWED: { icon: '✅', label: 'Reviewed', hi: 'जाँचा गया', tone: '#166534', bg: '#f0fdf4' },
} as const;

export default function ParentHomeworkPage() {
  const { t } = useLanguageStore();
  const [selectedChild, setSelectedChild] = useState<string | null>(null);

  const { data: children = [], isLoading: childrenLoading } = useQuery({
    queryKey: ['parent-children'],
    queryFn: () => getChildren().then((r) => r.data.data),
  });

  useEffect(() => {
    if (children.length && !selectedChild) setSelectedChild(children[0]?.id || null);
  }, [children, selectedChild]);

  const { data, isLoading } = useQuery({
    queryKey: ['parent-homework', selectedChild],
    queryFn: () => getChildHomework(selectedChild as string).then((r) => r.data.data),
    enabled: Boolean(selectedChild),
  });

  const summary = data?.summary || { pending: 0, submitted: 0, reviewed: 0, overdue: 0 };

  return (
    <div className="animate-fade-up space-y-5">
      <div>
        <h1 className="font-display font-extrabold text-2xl" style={{ color: 'var(--forest)' }}>
          📚 {t('होमवर्क', 'Homework')}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>
          {t('बच्चे के होमवर्क, जमा करने की स्थिति और शिक्षक की प्रतिक्रिया देखें', 'See homework, submission status and teacher feedback for each child')}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {children.map((child) => (
          <button
            key={child.id}
            onClick={() => setSelectedChild(child.id)}
            className="px-4 py-2 rounded-xl text-sm font-bold"
            style={{
              background: selectedChild === child.id ? 'var(--forest)' : 'white',
              color: selectedChild === child.id ? 'white' : 'var(--slate)',
              border: `1px solid ${selectedChild === child.id ? 'var(--forest)' : 'var(--border)'}`,
            }}
          >
            {child.name} · {t('कक्षा', 'Class')} {child.class_name}
          </button>
        ))}
      </div>

      {(childrenLoading || isLoading) ? (
        <div className="card py-12 text-center" style={{ color: 'var(--slate)' }}>{t('लोड हो रहा है…', 'Loading…')}</div>
      ) : !data ? (
        <div className="card py-12 text-center" style={{ color: 'var(--slate)' }}>{t('कोई लिंक किया हुआ बच्चा नहीं मिला', 'No linked child found')}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ['🕒', t('लंबित', 'Pending'), summary.pending],
              ['⚠️', t('समय सीमा पार', 'Overdue'), summary.overdue],
              ['📤', t('जमा किया', 'Submitted'), summary.submitted],
              ['✅', t('जाँचा गया', 'Reviewed'), summary.reviewed],
            ].map(([icon, label, value]) => (
              <div key={String(label)} className="card p-4">
                <div className="text-xl">{icon}</div>
                <div className="font-display font-extrabold text-2xl mt-1" style={{ color: 'var(--navy)' }}>{value}</div>
                <div className="text-xs font-semibold" style={{ color: 'var(--slate)' }}>{label}</div>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            {data.items.length === 0 ? (
              <div className="card py-12 text-center" style={{ color: 'var(--slate)' }}>
                {t('इस बच्चे के लिए अभी कोई प्रकाशित होमवर्क नहीं है', 'There is no published homework for this child yet')}
              </div>
            ) : data.items.map((item) => {
              const meta = STATUS_META[item.learner_status] || STATUS_META.PENDING;
              return (
                <article key={item.id} className="card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ color: 'var(--forest)', background: '#f0fdf4' }}>
                          {item.subject_name || item.subject_code}
                        </span>
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ color: meta.tone, background: meta.bg }}>
                          {meta.icon} {t(meta.hi, meta.label)}
                        </span>
                      </div>
                      <h2 className="font-display font-bold text-lg" style={{ color: 'var(--navy)' }}>{item.title}</h2>
                      {item.description && <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>{item.description}</p>}
                    </div>
                    <div className="text-right text-xs" style={{ color: 'var(--slate)' }}>
                      <div className="font-semibold">{t('अंतिम तिथि', 'Due')}</div>
                      <div>{new Date(item.due_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-3 mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                    <div>
                      <div className="text-xs" style={{ color: 'var(--slate)' }}>{t('जमा किया', 'Submitted')}</div>
                      <div className="text-sm font-semibold" style={{ color: 'var(--navy)' }}>{item.submitted_at ? new Date(item.submitted_at).toLocaleString('en-IN') : '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs" style={{ color: 'var(--slate)' }}>{t('अंक', 'Marks')}</div>
                      <div className="text-sm font-semibold" style={{ color: 'var(--navy)' }}>{item.marks_awarded ?? '—'}{item.max_marks != null ? ` / ${item.max_marks}` : ''}</div>
                    </div>
                    <div>
                      <div className="text-xs" style={{ color: 'var(--slate)' }}>{t('शिक्षक प्रतिक्रिया', 'Teacher feedback')}</div>
                      <div className="text-sm font-semibold" style={{ color: 'var(--navy)' }}>{item.feedback || '—'}</div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
