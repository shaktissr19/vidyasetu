'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SectionHeader } from '@/components/ui/index';
import useAuthStore from '@/store/authStore';
import useLanguageStore from '@/store/languageStore';
import { getClasses } from '@/services/schoolService';
import {
  archiveSchoolCalendar,
  createSchoolCalendar,
  getSchoolCalendar,
  getSchoolLeaves,
  reviewSchoolLeave,
  type CalendarEventType,
  type LeaveStatus,
} from '@/services/absenceCalendarService';
import { apiErrorText } from '@/utils/errors';
import toast from 'react-hot-toast';

type Tab = 'leave' | 'calendar';
const LEAVE_FILTERS: Array<'ALL' | LeaveStatus> = ['ALL','PENDING','APPROVED','REJECTED','CANCELLED'];
const EVENT_TYPES: CalendarEventType[] = ['HOLIDAY','SCHOOL_EVENT','PTM','EXAM','ACTIVITY','OTHER'];

export default function SchoolAbsencePage() {
  const { user } = useAuthStore();
  const { t } = useLanguageStore();
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [tab, setTab] = useState<Tab>('leave');
  const [filter, setFilter] = useState<'ALL' | LeaveStatus>('PENDING');
  const [note, setNote] = useState<Record<string,string>>({});
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventType, setEventType] = useState<CalendarEventType>('HOLIDAY');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [closed, setClosed] = useState(false);
  const [classIds, setClassIds] = useState<string[]>([]);
  const isAdmin = user?.role === 'SCHOOL_ADMIN' || user?.role === 'SUPER_ADMIN';

  const leavesQ = useQuery({ queryKey: ['school-leave', filter], queryFn: async () => (await getSchoolLeaves(filter === 'ALL' ? undefined : filter)).data.data || [] });
  const calendarQ = useQuery({ queryKey: ['school-calendar'], queryFn: async () => (await getSchoolCalendar()).data.data || [] });
  const classesQ = useQuery({ queryKey: ['school-classes'], queryFn: async () => (await getClasses()).data.data || [], enabled: isAdmin });

  const reviewM = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'APPROVE'|'REJECT' }) => reviewSchoolLeave(id, action, note[id]),
    onSuccess: async (_res, vars) => { toast.success(vars.action === 'APPROVE' ? t('छुट्टी मंजूर की गई।', 'Leave approved.') : t('छुट्टी अनुरोध अस्वीकार किया गया।', 'Leave request declined.')); await Promise.all([qc.invalidateQueries({ queryKey: ['school-leave'] }), qc.invalidateQueries({ queryKey: ['attendance-roster'] }), qc.invalidateQueries({ queryKey: ['attendance-summary'] })]); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not review leave request')),
  });
  const createCalendarM = useMutation({
    mutationFn: () => createSchoolCalendar({ title, description, eventType, startDate, endDate, isSchoolClosed: closed, classIds }),
    onSuccess: async () => { setTitle(''); setDescription(''); setClosed(false); setClassIds([]); toast.success(t('कैलेंडर कार्यक्रम जोड़ा गया।', 'Calendar event added.')); await qc.invalidateQueries({ queryKey: ['school-calendar'] }); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not add calendar event')),
  });
  const archiveM = useMutation({
    mutationFn: (id: string) => archiveSchoolCalendar(id),
    onSuccess: async () => { toast.success(t('कैलेंडर कार्यक्रम हटाया गया।', 'Calendar event archived.')); await qc.invalidateQueries({ queryKey: ['school-calendar'] }); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not archive calendar event')),
  });

  const leaves = leavesQ.data || [];
  const events = calendarQ.data || [];
  const classes = classesQ.data || [];

  return <div className="animate-fade-up">
    <SectionHeader title={`🩺 ${t('अनुपस्थिति और स्कूल कैलेंडर', 'Absence & School Calendar')}`} sub={t('छुट्टी अनुरोधों की समीक्षा करें, स्वीकृत अनुपस्थिति को Attendance से जोड़ें और स्कूल की महत्वपूर्ण तिथियाँ संचालित करें', 'Review leave requests, connect approved absence to Attendance, and manage important School dates')}>
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--saffron-pale)' }}><button className="px-4 py-1.5 rounded-lg text-sm font-bold" style={{ background: tab === 'leave' ? '#fff' : 'transparent', color: tab === 'leave' ? 'var(--saffron)' : 'var(--slate)' }} onClick={() => setTab('leave')}>{t('छुट्टी अनुरोध', 'Leave requests')}</button><button className="px-4 py-1.5 rounded-lg text-sm font-bold" style={{ background: tab === 'calendar' ? '#fff' : 'transparent', color: tab === 'calendar' ? 'var(--saffron)' : 'var(--slate)' }} onClick={() => setTab('calendar')}>{t('स्कूल कैलेंडर', 'School calendar')}</button></div>
    </SectionHeader>

    {tab === 'leave' ? <>
      <div className="card mb-4">
        <div className="flex gap-2 flex-wrap items-center"><div className="text-sm font-bold mr-2" style={{ color: 'var(--navy)' }}>{t('स्थिति', 'Status')}</div>{LEAVE_FILTERS.map((item) => <button key={item} className="px-3 py-1.5 rounded-full text-xs font-bold" style={{ background: filter === item ? 'var(--navy)' : '#F4F6F9', color: filter === item ? '#fff' : 'var(--slate)' }} onClick={() => setFilter(item)}>{item.replace('_',' ')}</button>)}</div>
        {user?.role === 'TEACHER' && <div className="text-xs mt-3 p-2 rounded-lg" style={{ background: '#EEF4FF', color: '#2457A6' }}>{t('शिक्षक केवल उन कक्षाओं के अनुरोध देख और निर्णय कर सकते हैं जहाँ वे Class Teacher हैं।', 'Teachers can see and decide requests only for classes where they are the assigned Class Teacher.')}</div>}
      </div>
      {leavesQ.isLoading ? <div className="space-y-3"><div className="skeleton h-28 rounded-xl" /><div className="skeleton h-28 rounded-xl" /></div> : leavesQ.isError ? <div className="card" style={{ color: '#B42318' }}>{apiErrorText(leavesQ.error, 'Could not load leave requests')}</div> : !leaves.length ? <div className="card text-center py-12" style={{ color: 'var(--slate)' }}>{t('इस फ़िल्टर में कोई छुट्टी अनुरोध नहीं है।', 'No leave requests match this filter.')}</div> : <div className="space-y-3">{leaves.map((leave) => <div key={leave.id} className="card" style={{ borderLeft: `4px solid ${leave.status === 'PENDING' ? '#F59E0B' : leave.status === 'APPROVED' ? '#16A34A' : leave.status === 'REJECTED' ? '#DC2626' : '#94A3B8'}` }}><div className="flex flex-col lg:flex-row gap-4"><div className="flex-1"><div className="flex gap-2 items-center flex-wrap"><h3 className="font-bold" style={{ color: 'var(--navy)' }}>{leave.student_name}</h3><span className="text-xs px-2 py-1 rounded-full font-bold" style={{ background: '#F4F6F9', color: 'var(--slate)' }}>Class {leave.class_name}{leave.section ? `-${leave.section}` : ''}</span><span className="text-xs font-bold" style={{ color: leave.status === 'PENDING' ? '#9A6500' : leave.status === 'APPROVED' ? '#176B3A' : leave.status === 'REJECTED' ? '#B42318' : '#64748B' }}>{leave.status}</span></div><div className="font-semibold mt-2">{leave.start_date.slice(0,10)} → {leave.end_date.slice(0,10)}</div><p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>{leave.reason}</p><div className="text-xs mt-2" style={{ color: 'var(--slate)' }}>{t('अनुरोधकर्ता', 'Requested by')}: {leave.requester_name || leave.requester_role}{leave.reviewer_name ? ` · ${t('समीक्षक', 'Reviewed by')}: ${leave.reviewer_name}` : ''}</div>{leave.review_note && <div className="text-xs mt-2 p-2 rounded-lg" style={{ background: '#F8FAFC' }}>{t('समीक्षा नोट', 'Review note')}: {leave.review_note}</div>}</div>{leave.status === 'PENDING' && <div className="lg:w-80"><textarea className="input min-h-20 text-sm" maxLength={1200} value={note[leave.id] || ''} onChange={(e) => setNote((current) => ({ ...current, [leave.id]: e.target.value }))} placeholder={t('वैकल्पिक समीक्षा नोट', 'Optional review note')} /><div className="flex gap-2 mt-2"><button className="btn-primary flex-1 justify-center" disabled={reviewM.isPending} onClick={() => reviewM.mutate({ id: leave.id, action: 'APPROVE' })}>✓ {t('मंजूर', 'Approve')}</button><button className="btn-ghost flex-1 justify-center" disabled={reviewM.isPending} onClick={() => reviewM.mutate({ id: leave.id, action: 'REJECT' })}>✕ {t('अस्वीकार', 'Decline')}</button></div></div>}</div></div>)}</div>}
    </> : <div className="grid lg:grid-cols-[minmax(320px,.8fr)_minmax(0,1.2fr)] gap-4">
      {isAdmin ? <div className="card h-fit">
        <h2 className="font-display font-bold text-lg" style={{ color: 'var(--navy)' }}>{t('कैलेंडर कार्यक्रम जोड़ें', 'Add calendar event')}</h2>
        <div className="mt-4 space-y-3"><div><label className="text-xs font-bold block mb-1">{t('शीर्षक', 'Title')}</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div><div><label className="text-xs font-bold block mb-1">{t('प्रकार', 'Type')}</label><select className="input select" value={eventType} onChange={(e) => { const next = e.target.value as CalendarEventType; setEventType(next); if (next !== 'HOLIDAY') setClosed(false); }}>{EVENT_TYPES.map((item) => <option key={item} value={item}>{item.replace('_',' ')}</option>)}</select></div><div className="grid grid-cols-2 gap-2"><div><label className="text-xs font-bold block mb-1">{t('शुरू', 'Start')}</label><input className="input" type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value); }} /></div><div><label className="text-xs font-bold block mb-1">{t('अंत', 'End')}</label><input className="input" type="date" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div></div><div><label className="text-xs font-bold block mb-1">{t('विवरण', 'Description')}</label><textarea className="input min-h-20" value={description} onChange={(e) => setDescription(e.target.value)} /></div><div><label className="text-xs font-bold block mb-1">{t('लक्षित कक्षाएँ', 'Target classes')}</label><div className="text-[11px] mb-2" style={{ color: 'var(--slate)' }}>{t('कुछ नहीं चुनने पर पूरा स्कूल', 'Select none for the whole School')}</div><div className="max-h-36 overflow-auto space-y-1">{classes.map((schoolClass) => <label key={schoolClass.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={classIds.includes(schoolClass.id)} onChange={(e) => setClassIds((current) => e.target.checked ? [...current, schoolClass.id] : current.filter((id) => id !== schoolClass.id))} />Class {schoolClass.class_name}-{schoolClass.section}</label>)}</div></div>{eventType === 'HOLIDAY' && <label className="flex gap-2 items-center text-sm font-semibold"><input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} />{t('इस दिन स्कूल बंद है', 'School is closed on this date')}</label>}<button className="btn-primary w-full justify-center" disabled={createCalendarM.isPending || title.trim().length < 3 || endDate < startDate} onClick={() => createCalendarM.mutate()}>{createCalendarM.isPending ? t('जोड़ रहे हैं…', 'Adding…') : t('कैलेंडर में जोड़ें', 'Add to calendar')}</button></div>
      </div> : <div className="card h-fit"><h2 className="font-bold" style={{ color: 'var(--navy)' }}>{t('स्कूल कैलेंडर', 'School calendar')}</h2><p className="text-sm mt-2" style={{ color: 'var(--slate)' }}>{t('कैलेंडर कार्यक्रम School Admin द्वारा संचालित किए जाते हैं। शिक्षक उन्हें यहाँ देख सकते हैं।', 'Calendar events are managed by the School Admin. Teachers can view them here.')}</p></div>}
      <div className="card"><h2 className="font-display font-bold text-lg mb-4" style={{ color: 'var(--navy)' }}>{t('आगामी और निर्धारित तिथियाँ', 'Upcoming & scheduled dates')}</h2>{calendarQ.isLoading ? <div className="skeleton h-40 rounded-xl" /> : calendarQ.isError ? <div style={{ color: '#B42318' }}>{apiErrorText(calendarQ.error, 'Could not load School calendar')}</div> : !events.length ? <div className="text-center py-10" style={{ color: 'var(--slate)' }}>{t('अभी कोई कैलेंडर कार्यक्रम नहीं है।', 'No calendar events yet.')}</div> : <div className="space-y-2">{events.map((event) => <div key={event.id} className="p-4 rounded-xl flex gap-3 items-start" style={{ border: '1px solid var(--border)', background: event.is_school_closed ? '#FFF7E8' : '#fff' }}><div className="w-11 h-11 rounded-xl grid place-items-center text-lg" style={{ background: event.is_school_closed ? '#FFE5B8' : '#EEF4FF' }}>{event.event_type === 'HOLIDAY' ? '🏖️' : event.event_type === 'PTM' ? '👪' : event.event_type === 'EXAM' ? '📝' : '📌'}</div><div className="flex-1"><div className="flex gap-2 flex-wrap items-center"><b style={{ color: 'var(--navy)' }}>{event.title}</b><span className="text-[11px] font-bold" style={{ color: 'var(--slate)' }}>{event.event_type.replace('_',' ')}</span>{event.is_school_closed && <span className="text-[11px] font-bold" style={{ color: '#9A6500' }}>{t('स्कूल बंद', 'School closed')}</span>}</div><div className="text-sm mt-1" style={{ color: 'var(--slate)' }}>{event.start_date.slice(0,10)}{event.end_date.slice(0,10) !== event.start_date.slice(0,10) ? ` → ${event.end_date.slice(0,10)}` : ''}</div>{event.class_labels?.length ? <div className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{event.class_labels.join(', ')}</div> : <div className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{t('पूरा स्कूल', 'Whole School')}</div>}{event.description && <p className="text-sm mt-2">{event.description}</p>}</div>{isAdmin && <button className="btn-ghost text-xs" disabled={archiveM.isPending} onClick={() => archiveM.mutate(event.id)}>{t('हटाएँ', 'Archive')}</button>}</div>)}</div>}</div>
    </div>}
  </div>;
}
