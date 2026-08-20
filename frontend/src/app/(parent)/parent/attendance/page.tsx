'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getChildren, getChildAttendance, type ParentAttendanceRecord } from '@/services/parentService';
import { StatCard } from '@/components/ui/index';
import useLanguageStore from '@/store/languageStore';

const MONTHS_EN = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const STATUS_COLOR: Record<string, string> = { PRESENT: '#138808', ABSENT: '#C62828', LATE: '#E65100', HOLIDAY: '#9CA3AF' };
const STATUS_LABEL: Record<string, string> = { PRESENT: '✓', ABSENT: '✗', LATE: '⏰', HOLIDAY: 'H' };

export default function ParentAttendancePage() {
  const { t } = useLanguageStore();
  const now = new Date();
  const [selectedChild, setSelectedChild] = useState<string | null>(null);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data: children = [] } = useQuery({
    queryKey: ['parent-children'],
    queryFn: () => getChildren().then((r) => r.data.data),
  });

  useEffect(() => {
    if (children.length && !selectedChild) setSelectedChild(children[0]?.id || null);
  }, [children, selectedChild]);

  const { data, isLoading } = useQuery({
    queryKey: ['parent-attendance', selectedChild, year, month],
    queryFn: async () => {
      if (!selectedChild) throw new Error('No child selected');
      return getChildAttendance(selectedChild, year, month).then((r) => r.data.data);
    },
    enabled: !!selectedChild,
  });

  const records = data?.records || [];
  const summary = data?.summary;
  const statusMap: Record<string, ParentAttendanceRecord> = {};
  for (const record of records) statusMap[record.date.split('T')[0]] = record;

  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const adjustedFirst = firstDay === 0 ? 6 : firstDay - 1;

  function changeMonth(delta: number) {
    let nextMonth = month + delta;
    let nextYear = year;
    if (nextMonth > 12) { nextMonth = 1; nextYear++; }
    if (nextMonth < 1) { nextMonth = 12; nextYear--; }
    setMonth(nextMonth);
    setYear(nextYear);
  }

  return (
    <div className="animate-fade-up">
      <h1 className="font-display font-extrabold text-2xl mb-5" style={{ color: 'var(--forest)' }}>
        📅 {t('उपस्थिति', 'Attendance')}
      </h1>

      {children.length > 1 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {children.map((child) => (
            <button key={child.id} onClick={() => setSelectedChild(child.id)}
              className="px-3 py-1.5 rounded-full text-xs font-bold transition-all"
              style={{ background: selectedChild === child.id ? 'var(--forest)' : 'white', color: selectedChild === child.id ? 'white' : 'var(--slate)', border: `1.5px solid ${selectedChild === child.id ? 'var(--forest)' : 'var(--border)'}` }}>
              {child.name.split(' ')[0]}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <StatCard label={t('उपस्थित', 'Present')} value={summary?.present_days || 0} sub="days" accent="var(--forest)" />
        <StatCard label={t('अनुपस्थित', 'Absent')} value={summary?.absent_days || 0} sub="days" accent="#C62828" />
        <StatCard label={t('प्रतिशत', 'Percentage')} value={`${summary?.percentage || 0}%`} accent="var(--navy)" />
        <StatCard label={t('कुल दिन', 'Total')} value={summary?.total_days || summary?.working_days || 0} sub="school days" accent="var(--gold)" />
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <button onClick={() => changeMonth(-1)} className="btn-ghost px-3">‹</button>
          <h2 className="font-display font-bold text-lg" style={{ color: 'var(--navy)' }}>{MONTHS_EN[month]} {year}</h2>
          <button onClick={() => changeMonth(1)} className="btn-ghost px-3" disabled={year === now.getFullYear() && month === now.getMonth() + 1}>›</button>
        </div>

        <div className="grid grid-cols-7 mb-2">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
            <div key={day} className="text-center text-xs font-bold py-1" style={{ color: 'var(--slate)' }}>{day}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {[...Array(adjustedFirst)].map((_, i) => <div key={`e${i}`} />)}
          {[...Array(daysInMonth)].map((_, i) => {
            const day = i + 1;
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const rec = statusMap[dateStr];
            const isToday = dateStr === now.toISOString().split('T')[0];
            const statusColor = rec ? STATUS_COLOR[rec.status] || 'var(--slate)' : undefined;
            return (
              <div key={day} className="h-10 rounded-lg flex flex-col items-center justify-center text-xs font-bold"
                style={{
                  background: rec ? `${statusColor}18` : isToday ? 'var(--saffron-pale)' : '#F8F9FC',
                  border: isToday ? '2px solid var(--saffron)' : '1.5px solid transparent',
                  color: rec ? statusColor : isToday ? 'var(--saffron)' : 'var(--slate)',
                }}>
                <span>{day}</span>
                {rec && <span style={{ fontSize: '0.6rem' }}>{STATUS_LABEL[rec.status] || ''}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
