'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import useLanguageStore from '@/store/languageStore';
import { apiErrorText } from '@/utils/errors';
import type { StudentSectionProps } from '@/types/studentPortal';
import {
  cancelStudentLeave,
  createStudentLeave,
  getStudentCalendar,
  getStudentLeaves,
  type LeaveStatus,
} from '@/services/absenceCalendarService';

const STATUS: Record<LeaveStatus, { label: string; bg: string; color: string }> = {
  PENDING: { label: 'Pending review', bg: '#FFF7E8', color: '#9A6500' },
  APPROVED: { label: 'Approved', bg: '#ECF8F0', color: '#176B3A' },
  REJECTED: { label: 'Declined', bg: '#FFF0F0', color: '#B42318' },
  CANCELLED: { label: 'Cancelled', bg: '#F4F6F9', color: '#64748B' },
};

export default function LeaveCalendarSection({ notify }: StudentSectionProps) {
  const { t } = useLanguageStore();
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [reason, setReason] = useState('');

  const leaveQ = useQuery({ queryKey: ['student-leave'], queryFn: async () => (await getStudentLeaves()).data.data || [] });
  const calendarQ = useQuery({ queryKey: ['student-calendar'], queryFn: async () => (await getStudentCalendar()).data.data || [] });

  const createM = useMutation({
    mutationFn: () => createStudentLeave({ startDate, endDate, reason }),
    onSuccess: async () => {
      setReason('');
      notify(t('छुट्टी का अनुरोध समीक्षा के लिए भेज दिया गया है।', 'Leave request sent for review.'));
      await qc.invalidateQueries({ queryKey: ['student-leave'] });
    },
    onError: (error: unknown) => notify(apiErrorText(error, 'Could not submit leave request')),
  });
  const cancelM = useMutation({
    mutationFn: (leaveId: string) => cancelStudentLeave(leaveId),
    onSuccess: async () => { notify(t('अनुरोध रद्द कर दिया गया।', 'Leave request cancelled.')); await qc.invalidateQueries({ queryKey: ['student-leave'] }); },
    onError: (error: unknown) => notify(apiErrorText(error, 'Could not cancel leave request')),
  });

  const leaves = leaveQ.data || [];
  const events = calendarQ.data || [];

  return <div className="space-y-5">
    <div>
      <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--saffron)' }}>{t('उपस्थिति सहायता', 'Attendance support')}</div>
      <h1 className="font-display text-2xl font-black mt-1" style={{ color: 'var(--navy)' }}>{t('छुट्टी और स्कूल कैलेंडर', 'Leave & School Calendar')}</h1>
      <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>{t('अनुपस्थिति की जानकारी पहले से दें और स्कूल की महत्वपूर्ण तारीखें देखें।', 'Tell your School about an absence in advance and keep track of important School dates.')}</p>
    </div>

    <div className="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,.9fr)] gap-4">
      <div className="card">
        <h2 className="font-bold mb-4" style={{ color: 'var(--navy)' }}>{t('नया छुट्टी अनुरोध', 'New leave request')}</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className="text-xs font-bold block mb-1">{t('शुरू होने की तारीख', 'Start date')}</label><input className="input" type="date" min={today} value={startDate} onChange={(e) => { setStartDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value); }} /></div>
          <div><label className="text-xs font-bold block mb-1">{t('अंतिम तारीख', 'End date')}</label><input className="input" type="date" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
        </div>
        <div className="mt-3"><label className="text-xs font-bold block mb-1">{t('कारण', 'Reason')}</label><textarea className="input min-h-24" maxLength={1200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('जैसे: बुखार के कारण आराम की आवश्यकता है', 'For example: need rest due to fever')} /></div>
        <div className="flex items-start gap-2 mt-3 p-3 rounded-xl text-xs" style={{ background: '#EEF4FF', color: '#2457A6' }}><span>ℹ️</span><span>{t('मंजूर छुट्टी उपस्थिति में “Excused” के रूप में अलग दिखाई देगी; इसे Present नहीं माना जाएगा।', 'Approved leave is shown separately as “Excused” attendance; it is not counted as Present.')}</span></div>
        <button className="btn-primary mt-4" disabled={createM.isPending || reason.trim().length < 5 || endDate < startDate} onClick={() => createM.mutate()}>{createM.isPending ? t('भेज रहे हैं…', 'Sending…') : t('समीक्षा के लिए भेजें', 'Send for review')}</button>
      </div>

      <div className="card">
        <h2 className="font-bold mb-3" style={{ color: 'var(--navy)' }}>{t('आने वाली स्कूल तिथियाँ', 'Upcoming School dates')}</h2>
        {calendarQ.isLoading ? <div className="skeleton h-32 rounded-xl" /> : calendarQ.isError ? <div className="text-sm" style={{ color: '#B42318' }}>{apiErrorText(calendarQ.error, 'Could not load School calendar')}</div> : events.length ? <div className="space-y-2">{events.slice(0, 6).map((event) => <div key={event.id} className="p-3 rounded-xl" style={{ border: '1px solid var(--border)', background: event.is_school_closed ? '#FFF7E8' : '#F8FAFC' }}><div className="flex justify-between gap-2"><b className="text-sm" style={{ color: 'var(--navy)' }}>{event.title}</b><span className="text-[11px] font-bold" style={{ color: event.is_school_closed ? '#9A6500' : 'var(--slate)' }}>{event.event_type.replace('_', ' ')}</span></div><div className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{event.start_date.slice(0,10)}{event.end_date.slice(0,10) !== event.start_date.slice(0,10) ? ` → ${event.end_date.slice(0,10)}` : ''}{event.is_school_closed ? ' · School closed' : ''}</div></div>)}</div> : <div className="text-sm py-8 text-center" style={{ color: 'var(--slate)' }}>{t('कोई आगामी स्कूल कार्यक्रम नहीं है।', 'No upcoming School events are listed.')}</div>}
      </div>
    </div>

    <div className="card">
      <div className="flex items-center justify-between gap-3 mb-4"><h2 className="font-bold" style={{ color: 'var(--navy)' }}>{t('मेरे छुट्टी अनुरोध', 'My leave requests')}</h2><span className="text-xs" style={{ color: 'var(--slate)' }}>{leaves.length} {t('अनुरोध', 'requests')}</span></div>
      {leaveQ.isLoading ? <div className="space-y-2"><div className="skeleton h-16 rounded-xl" /><div className="skeleton h-16 rounded-xl" /></div> : leaveQ.isError ? <div style={{ color: '#B42318' }}>{apiErrorText(leaveQ.error, 'Could not load leave requests')}</div> : !leaves.length ? <div className="text-center py-8" style={{ color: 'var(--slate)' }}>{t('अभी तक कोई छुट्टी अनुरोध नहीं है।', 'No leave requests yet.')}</div> : <div className="space-y-2">{leaves.map((leave) => { const meta = STATUS[leave.status]; return <div key={leave.id} className="p-4 rounded-xl flex flex-col sm:flex-row sm:items-center gap-3" style={{ border: '1px solid var(--border)' }}><div className="flex-1"><div className="flex gap-2 items-center flex-wrap"><b style={{ color: 'var(--navy)' }}>{leave.start_date.slice(0,10)} → {leave.end_date.slice(0,10)}</b><span className="px-2 py-1 rounded-full text-[11px] font-bold" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span></div><div className="text-sm mt-1" style={{ color: 'var(--slate)' }}>{leave.reason}</div>{leave.review_note && <div className="text-xs mt-1">{t('स्कूल नोट', 'School note')}: {leave.review_note}</div>}</div>{leave.status === 'PENDING' && <button className="btn-ghost text-xs" disabled={cancelM.isPending} onClick={() => cancelM.mutate(leave.id)}>{t('रद्द करें', 'Cancel')}</button>}</div>; })}</div>}
    </div>
  </div>;
}
