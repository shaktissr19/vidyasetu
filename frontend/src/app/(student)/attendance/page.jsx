'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAttendance } from '@/services/studentService';
import { StatCard, CardSkeleton } from '@/components/ui/index';
import useLanguageStore from '@/store/languageStore';

const MONTHS_HI = ['', 'जनवरी','फ़रवरी','मार्च','अप्रैल','मई','जून','जुलाई','अगस्त','सितंबर','अक्तूबर','नवंबर','दिसंबर'];
const MONTHS_EN = ['', 'January','February','March','April','May','June','July','August','September','October','November','December'];

export default function AttendancePage() {
  const { t } = useLanguageStore();
  const now    = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data, isLoading } = useQuery({
    queryKey: ['attendance', year, month],
    queryFn:  () => getAttendance(year, month).then(r => r.data.data),
  });

  const records = data?.records || [];
  const summary = data?.summary || {};

  // Build a date → status map
  const statusMap = Object.fromEntries(records.map(r => [r.date.split('T')[0], r.status]));

  // Get first day of month and days in month
  const firstDay   = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  const adjustedFirst = firstDay === 0 ? 6 : firstDay - 1; // Mon-first

  const statusColor = { PRESENT: '#138808', ABSENT: '#C62828', LATE: '#E65100', HOLIDAY: '#9CA3AF', HALF_DAY: '#F59E0B' };
  const statusLabel = { PRESENT: '✓', ABSENT: '✗', LATE: '⏰', HOLIDAY: 'H', HALF_DAY: '½' };

  function changeMonth(delta) {
    let m = month + delta, y = year;
    if (m > 12) { m = 1; y++; }
    if (m < 1)  { m = 12; y--; }
    setMonth(m); setYear(y);
  }

  return (
    <div className="animate-fade-up">
      <h1 className="font-display font-extrabold text-2xl mb-5" style={{ color: 'var(--navy)' }}>
        📅 {t('उपस्थिति', 'Attendance')}
      </h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 stagger">
        <StatCard label={t('उपस्थित', 'Present')}  value={summary.present_days || 0}  sub={t('दिन',    'days')} accent="var(--forest)" />
        <StatCard label={t('अनुपस्थित','Absent')}  value={summary.absent_days  || 0}  sub={t('दिन',    'days')} accent="#C62828" />
        <StatCard label={t('प्रतिशत',  'Percentage')} value={`${summary.percentage || 0}%`} sub={t('इस महीने','This month')} accent="var(--navy)" />
        <StatCard label={t('कुल दिन',  'Total Days')} value={summary.total_days || 0} sub={t('स्कूल',   'school days')} accent="var(--gold)" />
      </div>

      {/* Calendar */}
      <div className="card">
        {/* Month nav */}
        <div className="flex items-center justify-between mb-5">
          <button onClick={() => changeMonth(-1)} className="btn-ghost px-3">‹</button>
          <h2 className="font-display font-bold text-lg" style={{ color: 'var(--navy)' }}>
            {t(MONTHS_HI[month], MONTHS_EN[month])} {year}
          </h2>
          <button onClick={() => changeMonth(1)} className="btn-ghost px-3" disabled={year === now.getFullYear() && month === now.getMonth() + 1}>›</button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 mb-2">
          {(t('सो,मं,बु,गु,शु,श,र', 'Mon,Tue,Wed,Thu,Fri,Sat,Sun')).split(',').map(d => (
            <div key={d} className="text-center text-xs font-bold py-1" style={{ color: 'var(--slate)' }}>{d}</div>
          ))}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-7 gap-2">
            {[...Array(35)].map((_, i) => <div key={i} className="skeleton h-9 rounded-lg" />)}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1.5">
            {/* Empty cells before month start */}
            {[...Array(adjustedFirst)].map((_, i) => <div key={`e${i}`} />)}
            {/* Day cells */}
            {[...Array(daysInMonth)].map((_, i) => {
              const day    = i + 1;
              const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
              const status  = statusMap[dateStr];
              const isToday = dateStr === now.toISOString().split('T')[0];
              return (
                <div key={day} className="h-10 rounded-lg flex flex-col items-center justify-center text-xs font-bold transition-all"
                  style={{
                    background: status ? `${statusColor[status]}18` : isToday ? 'var(--saffron-pale)' : '#F8F9FC',
                    border: isToday ? '2px solid var(--saffron)' : '1.5px solid transparent',
                    color: status ? statusColor[status] : isToday ? 'var(--saffron)' : 'var(--slate)',
                  }}>
                  <span>{day}</span>
                  {status && <span style={{ fontSize: '0.6rem' }}>{statusLabel[status]}</span>}
                </div>
              );
            })}
          </div>
        )}

        {/* Legend */}
        <div className="flex gap-4 mt-4 flex-wrap">
          {Object.entries(statusColor).map(([s, c]) => (
            <div key={s} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--slate)' }}>
              <div className="w-3 h-3 rounded-sm" style={{ background: `${c}30`, border: `1.5px solid ${c}` }} />
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
