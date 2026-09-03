'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SectionHeader } from '@/components/ui/index';
import { getChildren } from '@/services/parentService';
import {
  cancelParentLeave,
  createParentLeave,
  getParentCalendar,
  getParentLeaves,
  type LeaveStatus,
} from '@/services/absenceCalendarService';
import useLanguageStore from '@/store/languageStore';
import { apiErrorText } from '@/utils/errors';
import toast from 'react-hot-toast';

const STATUS: Record<LeaveStatus, { label: string; bg: string; color: string }> = {
  PENDING: { label: 'Pending review', bg: '#FFF7E8', color: '#9A6500' },
  APPROVED: { label: 'Approved', bg: '#ECF8F0', color: '#176B3A' },
  REJECTED: { label: 'Declined', bg: '#FFF0F0', color: '#B42318' },
  CANCELLED: { label: 'Cancelled', bg: '#F4F6F9', color: '#64748B' },
};

export default function ParentLeavePage() {
  const { t } = useLanguageStore();
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [studentId, setStudentId] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [reason, setReason] = useState('');

  const childrenQ = useQuery({ queryKey: ['parent-children'], queryFn: async () => (await getChildren()).data.data || [] });
  const children = childrenQ.data || [];
  useEffect(() => { if (!studentId && children.length) setStudentId(children[0].id); }, [children, studentId]);

  const leavesQ = useQuery({ queryKey: ['parent-leave', studentId], queryFn: async () => (await getParentLeaves(studentId)).data.data || [], enabled: Boolean(studentId) });
  const calendarQ = useQuery({ queryKey: ['parent-calendar', studentId], queryFn: async () => (await getParentCalendar(studentId)).data.data || [], enabled: Boolean(studentId) });

  const createM = useMutation({
    mutationFn: () => createParentLeave(studentId, { startDate, endDate, reason }),
    onSuccess: async () => { setReason(''); toast.success(t('छुट्टी का अनुरोध भेज दिया गया।', 'Leave request sent for review.')); await qc.invalidateQueries({ queryKey: ['parent-leave', studentId] }); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not submit leave request')),
  });
  const cancelM = useMutation({
    mutationFn: (leaveId: string) => cancelParentLeave(studentId, leaveId),
    onSuccess: async () => { toast.success(t('अनुरोध रद्द कर दिया गया।', 'Leave request cancelled.')); await qc.invalidateQueries({ queryKey: ['parent-leave', studentId] }); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not cancel leave request')),
  });

  const selectedChild = children.find((child) => child.id === studentId);
  const leaves = leavesQ.data || [];
  const events = calendarQ.data || [];

  return <div className="animate-fade-up">
    <SectionHeader title={`🩺 ${t('छुट्टी और स्कूल कैलेंडर', 'Leave & School Calendar')}`} sub={t('जुड़े हुए बच्चे के लिए छुट्टी का अनुरोध करें और स्कूल की आगामी तिथियाँ देखें', 'Request leave for a linked child and view upcoming School dates')} />

    <div className="card mb-5">
      <label className="text-xs font-bold block mb-1">{t('बच्चा चुनें', 'Select child')}</label>
      <select className="input select max-w-md" value={studentId} onChange={(e) => setStudentId(e.target.value)}><option value="">{t('बच्चा चुनें', 'Select child')}</option>{children.map((child) => <option key={child.id} value={child.id}>{child.name} · Class {child.class_name}{child.section ? `-${child.section}` : ''}</option>)}</select>
    </div>

    {!studentId ? <div className="card text-center py-12" style={{ color: 'var(--slate)' }}>{childrenQ.isLoading ? t('जुड़े हुए बच्चे लोड हो रहे हैं…', 'Loading linked children…') : t('कोई जुड़ा हुआ बच्चा उपलब्ध नहीं है।', 'No linked child is available.')}</div> : <>
      <div className="grid lg:grid-cols-[1.05fr_.95fr] gap-4 mb-5">
        <div className="card">
          <div className="text-xs font-bold" style={{ color: 'var(--forest)' }}>{selectedChild?.name}</div>
          <h2 className="font-display font-bold text-lg mt-1" style={{ color: 'var(--navy)' }}>{t('नया छुट्टी अनुरोध', 'New leave request')}</h2>
          <div className="grid sm:grid-cols-2 gap-3 mt-4"><div><label className="text-xs font-bold block mb-1">{t('शुरू होने की तारीख', 'Start date')}</label><input className="input" type="date" min={today} value={startDate} onChange={(e) => { setStartDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value); }} /></div><div><label className="text-xs font-bold block mb-1">{t('अंतिम तारीख', 'End date')}</label><input className="input" type="date" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div></div>
          <div className="mt-3"><label className="text-xs font-bold block mb-1">{t('कारण', 'Reason')}</label><textarea className="input min-h-24" maxLength={1200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('स्कूल को अनुपस्थिति का संक्षिप्त कारण बताएं', 'Give the School a short reason for the absence')} /></div>
          <div className="mt-3 p-3 rounded-xl text-xs" style={{ background: '#EEF4FF', color: '#2457A6' }}>{t('मंजूर छुट्टी “Excused” के रूप में दर्ज होती है। यह Present नहीं मानी जाती और unexcused Absence से अलग रहती है।', 'Approved leave is recorded as “Excused”. It is not counted as Present and remains separate from unexcused Absence.')}</div>
          <button className="btn-primary mt-4" disabled={createM.isPending || reason.trim().length < 5 || endDate < startDate} onClick={() => createM.mutate()}>{createM.isPending ? t('भेज रहे हैं…', 'Sending…') : t('समीक्षा के लिए भेजें', 'Send for review')}</button>
        </div>

        <div className="card">
          <h2 className="font-display font-bold text-lg mb-3" style={{ color: 'var(--navy)' }}>{t('स्कूल कैलेंडर', 'School calendar')}</h2>
          {calendarQ.isLoading ? <div className="skeleton h-32 rounded-xl" /> : calendarQ.isError ? <div style={{ color: '#B42318' }}>{apiErrorText(calendarQ.error, 'Could not load School calendar')}</div> : events.length ? <div className="space-y-2">{events.slice(0, 7).map((event) => <div key={event.id} className="p-3 rounded-xl" style={{ background: event.is_school_closed ? '#FFF7E8' : '#F8FAFC', border: '1px solid var(--border)' }}><div className="flex justify-between gap-2"><b className="text-sm" style={{ color: 'var(--navy)' }}>{event.title}</b><span className="text-[11px] font-bold" style={{ color: event.is_school_closed ? '#9A6500' : 'var(--slate)' }}>{event.event_type.replace('_', ' ')}</span></div><div className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{event.start_date.slice(0,10)}{event.end_date.slice(0,10) !== event.start_date.slice(0,10) ? ` → ${event.end_date.slice(0,10)}` : ''}{event.is_school_closed ? ` · ${t('स्कूल बंद', 'School closed')}` : ''}</div></div>)}</div> : <div className="text-center py-8 text-sm" style={{ color: 'var(--slate)' }}>{t('कोई आगामी स्कूल कार्यक्रम नहीं है।', 'No upcoming School events are listed.')}</div>}
        </div>
      </div>

      <div className="card">
        <div className="flex justify-between items-center gap-3 mb-4"><h2 className="font-display font-bold text-lg" style={{ color: 'var(--navy)' }}>{t('छुट्टी अनुरोध इतिहास', 'Leave request history')}</h2><span className="text-xs" style={{ color: 'var(--slate)' }}>{leaves.length} {t('अनुरोध', 'requests')}</span></div>
        {leavesQ.isLoading ? <div className="skeleton h-28 rounded-xl" /> : leavesQ.isError ? <div style={{ color: '#B42318' }}>{apiErrorText(leavesQ.error, 'Could not load leave requests')}</div> : !leaves.length ? <div className="text-center py-8" style={{ color: 'var(--slate)' }}>{t('अभी कोई छुट्टी अनुरोध नहीं है।', 'No leave requests yet.')}</div> : <div className="space-y-2">{leaves.map((leave) => { const meta = STATUS[leave.status]; return <div key={leave.id} className="p-4 rounded-xl flex flex-col sm:flex-row sm:items-center gap-3" style={{ border: '1px solid var(--border)' }}><div className="flex-1"><div className="flex gap-2 items-center flex-wrap"><b style={{ color: 'var(--navy)' }}>{leave.start_date.slice(0,10)} → {leave.end_date.slice(0,10)}</b><span className="px-2 py-1 rounded-full text-[11px] font-bold" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span></div><div className="text-sm mt-1" style={{ color: 'var(--slate)' }}>{leave.reason}</div><div className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{t('अनुरोधकर्ता', 'Requested by')}: {leave.requester_name || leave.requester_role}</div>{leave.review_note && <div className="text-xs mt-1">{t('स्कूल नोट', 'School note')}: {leave.review_note}</div>}</div>{leave.status === 'PENDING' && leave.requested_by && <button className="btn-ghost text-xs" disabled={cancelM.isPending} onClick={() => cancelM.mutate(leave.id)}>{t('यदि आपने भेजा है तो रद्द करें', 'Cancel if submitted by you')}</button>}</div>; })}</div>}
      </div>
    </>}
  </div>;
}
