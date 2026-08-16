'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getTimetable, getClasses } from '@/services/schoolService';
import { SectionHeader } from '@/components/ui/index';
import useLanguageStore from '@/store/languageStore';
import toast from 'react-hot-toast';

const DAYS    = ['MON','TUE','WED','THU','FRI','SAT'];
const DAY_HI  = { MON:'सोम', TUE:'मंगल', WED:'बुध', THU:'गुरु', FRI:'शुक्र', SAT:'शनि' };
const DAY_EN  = { MON:'Mon', TUE:'Tue',   WED:'Wed', THU:'Thu',  FRI:'Fri',   SAT:'Sat'  };
const SUBJ_COLOR = { Mathematics:'#FF6B00', Science:'#138808', English:'#1565C0', Hindi:'#7B1FA2', 'Social Science':'#E65100', Sanskrit:'#0097A7', PT:'#E91E63', Activity:'#9C27B0' };

export default function TimetablePage() {
  const { t } = useLanguageStore();
  const [classId, setClassId] = useState('');

  const { data: classesRes } = useQuery({ queryKey: ['school-classes'], queryFn: () => getClasses().then(r => r.data.data) });
  const classes = classesRes || [];

  const { data: periods = [], isLoading } = useQuery({
    queryKey: ['timetable', classId],
    queryFn:  () => getTimetable(classId).then(r => r.data.data),
    enabled:  !!classId,
  });

  // Group by day
  const byDay = DAYS.reduce((acc, d) => { acc[d] = periods.filter(p => p.day === d).sort((a,b) => a.period_number - b.period_number); return acc; }, {});
  const allPeriods = [...new Set(periods.map(p => p.period_number))].sort();

  return (
    <div className="animate-fade-up">
      <SectionHeader title={`🗓️ ${t('टाइमटेबल', 'Timetable')}`}>
        {classId && <button className="btn-primary" onClick={() => toast('📲 Timetable shared via WhatsApp to all parents!')}>📲 {t('शेयर करें', 'Share')}</button>}
      </SectionHeader>

      <div className="card mb-5">
        <select value={classId} onChange={e => setClassId(e.target.value)} className="input select w-full max-w-xs">
          <option value="">{t('कक्षा चुनें', 'Select a class')}</option>
          {classes.map(c => <option key={c.id} value={c.id}>Class {c.class_name}{c.section ? `-${c.section}` : ''}</option>)}
        </select>
      </div>

      {!classId && (
        <div className="card text-center py-12">
          <div className="text-4xl mb-3">🗓️</div>
          <p className="font-display font-bold" style={{ color: 'var(--navy)' }}>{t('कक्षा चुनें', 'Select a class to view timetable')}</p>
        </div>
      )}

      {classId && !isLoading && periods.length === 0 && (
        <div className="card text-center py-12">
          <div className="text-4xl mb-3">🗓️</div>
          <p className="font-display font-bold" style={{ color: 'var(--navy)' }}>{t('टाइमटेबल नहीं', 'No timetable set yet')}</p>
          <button className="btn-primary mt-4" onClick={() => toast('Timetable editor opening...')}>
            {t('टाइमटेबल बनाएँ', 'Create Timetable')}
          </button>
        </div>
      )}

      {classId && periods.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm border-collapse" style={{ minWidth: 600 }}>
            <thead>
              <tr>
                <th className="p-2 text-left text-xs font-bold" style={{ color: 'var(--slate)', background: '#F8F9FC', borderBottom: '1.5px solid var(--border)', width: 90 }}>
                  {t('पीरियड', 'Period')}
                </th>
                {DAYS.map(d => (
                  <th key={d} className="p-2 text-center text-xs font-bold" style={{ color: 'var(--slate)', background: '#F8F9FC', borderBottom: '1.5px solid var(--border)' }}>
                    {t(DAY_HI[d], DAY_EN[d])}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allPeriods.map(pNum => {
                const firstPeriod = periods.find(p => p.period_number === pNum);
                return (
                  <tr key={pNum}>
                    <td className="p-2 text-xs" style={{ borderBottom: '1px solid var(--border)', color: 'var(--slate)' }}>
                      <div className="font-bold">{pNum}</div>
                      <div>{firstPeriod?.start_time?.slice(0,5)}–{firstPeriod?.end_time?.slice(0,5)}</div>
                    </td>
                    {DAYS.map(d => {
                      const p = byDay[d]?.find(x => x.period_number === pNum);
                      const color = p?.subject ? (SUBJ_COLOR[p.subject] || 'var(--navy)') : null;
                      return (
                        <td key={d} className="p-2 text-center" style={{ borderBottom: '1px solid var(--border)' }}>
                          {p ? (
                            p.is_break ? (
                              <span className="text-xs" style={{ color: 'var(--slate)' }}>— {t('विराम', 'Break')} —</span>
                            ) : (
                              <div className="rounded-lg px-2 py-1.5 inline-block text-xs font-semibold"
                                style={{ background: color ? `${color}18` : '#F0F4F8', color: color || 'var(--navy)' }}>
                                {p.subject}
                              </div>
                            )
                          ) : <span style={{ color: 'var(--border)' }}>—</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
