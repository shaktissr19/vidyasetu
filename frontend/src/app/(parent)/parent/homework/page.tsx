'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ParentChildSwitcher from '@/components/parent/ParentChildSwitcher';
import { useParentChildContext } from '@/hooks/useParentChildContext';
import { getChildHomework, type ParentHomeworkStatus } from '@/services/parentWorkflowService';
import useLanguageStore from '@/store/languageStore';
import { formatDate } from '@/utils/formatters';

const FILTERS: Array<'ALL' | ParentHomeworkStatus> = ['ALL', 'PENDING', 'SUBMITTED', 'REVIEWED'];

export default function ParentHomeworkPage() {
  const { t } = useLanguageStore();
  const { children, selectedChildId, selectedChild, setSelectedChildId, isLoading: childrenLoading } = useParentChildContext();
  const [filter, setFilter] = useState<'ALL' | ParentHomeworkStatus>('ALL');

  const homeworkQuery = useQuery({
    queryKey: ['parent-homework', selectedChildId, filter],
    queryFn: async () => {
      if (!selectedChildId) return [];
      return getChildHomework(selectedChildId, filter).then((response) => response.data.data);
    },
    enabled: Boolean(selectedChildId),
  });

  const homework = homeworkQuery.data || [];

  return (
    <div className="animate-fade-up">
      <div className="mb-5">
        <h1 className="font-display font-extrabold text-2xl" style={{ color: 'var(--forest)' }}>📚 {t('होमवर्क', 'Homework')}</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>
          {t('असाइनमेंट, जमा स्थिति और शिक्षक की प्रतिक्रिया देखें', 'View assignments, submission status and teacher feedback')}
        </p>
      </div>

      <ParentChildSwitcher
        children={children}
        selectedChildId={selectedChildId}
        onSelect={setSelectedChildId}
        className="mb-4"
      />

      <div className="flex gap-2 flex-wrap mb-5">
        {FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold"
            style={{
              background: filter === value ? 'var(--forest)' : 'white',
              color: filter === value ? 'white' : 'var(--slate)',
              border: '1px solid var(--border)',
            }}
          >
            {value === 'ALL' ? t('सभी', 'All') : value === 'PENDING' ? t('बाकी', 'Pending') : value === 'SUBMITTED' ? t('जमा', 'Submitted') : t('जाँचा गया', 'Reviewed')}
          </button>
        ))}
      </div>

      {childrenLoading || homeworkQuery.isLoading ? (
        <div className="grid md:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((item) => <div key={item} className="skeleton h-40 rounded-xl" />)}
        </div>
      ) : !selectedChild ? (
        <div className="card text-center py-10" style={{ color: 'var(--slate)' }}>{t('कोई लिंक किया हुआ बच्चा नहीं मिला', 'No linked child found')}</div>
      ) : homework.length === 0 ? (
        <div className="card text-center py-10" style={{ color: 'var(--slate)' }}>{t('इस फ़िल्टर में कोई होमवर्क नहीं है', 'No homework in this filter')}</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {homework.map((item) => {
            const overdue = item.learner_status === 'PENDING' && new Date(item.due_at).getTime() < Date.now();
            const statusColor = item.learner_status === 'REVIEWED' ? 'var(--forest)' : item.learner_status === 'SUBMITTED' ? 'var(--navy)' : overdue ? '#C62828' : 'var(--saffron)';
            return (
              <article key={item.id} className="card" style={{ borderLeft: `4px solid ${statusColor}` }}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="text-xs font-bold uppercase" style={{ color: 'var(--slate)' }}>{item.subject_name || item.subject_code}</div>
                    <h2 className="font-display font-bold text-base" style={{ color: 'var(--navy)' }}>{item.title}</h2>
                  </div>
                  <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ color: statusColor, background: `${statusColor}12` }}>
                    {overdue ? t('समय पार', 'Overdue') : item.learner_status}
                  </span>
                </div>
                <p className="text-sm mb-3" style={{ color: 'var(--slate)' }}>{item.description}</p>
                <div className="text-xs space-y-1" style={{ color: 'var(--slate)' }}>
                  <div>📅 {t('देय', 'Due')}: {formatDate(item.due_at)}</div>
                  {item.max_marks != null && <div>📝 {t('अधिकतम अंक', 'Max marks')}: {item.max_marks}</div>}
                  {item.submitted_at && <div>✅ {t('जमा', 'Submitted')}: {formatDate(item.submitted_at)}</div>}
                  {item.marks_awarded != null && <div>🏅 {t('प्राप्त अंक', 'Marks awarded')}: {item.marks_awarded}/{item.max_marks ?? '—'}</div>}
                </div>
                {item.feedback && (
                  <div className="mt-3 p-3 rounded-lg text-sm" style={{ background: 'var(--cream)', color: 'var(--navy)' }}>
                    <strong>{t('शिक्षक प्रतिक्रिया', 'Teacher feedback')}:</strong> {item.feedback}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
