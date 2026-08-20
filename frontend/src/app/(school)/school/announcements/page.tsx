'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAnnouncements, getClasses, publishAnnouncement } from '@/services/schoolService';
import { SectionHeader } from '@/components/ui/index';
import useAuthStore from '@/store/authStore';
import useLanguageStore from '@/store/languageStore';
import { apiErrorText } from '@/utils/errors';
import toast from 'react-hot-toast';

const AUDIENCES = [
  { value: 'ALL', label: 'Everyone', hi: 'सभी' },
  { value: 'PARENTS', label: 'Parents', hi: 'अभिभावक' },
  { value: 'STUDENTS', label: 'Students', hi: 'छात्र' },
  { value: 'TEACHERS', label: 'Teachers', hi: 'शिक्षक' },
];

function audienceLabel(value?: string | null): string {
  return AUDIENCES.find((item) => item.value === value)?.label || value || 'Everyone';
}

export default function SchoolAnnouncementsPage() {
  const { user } = useAuthStore();
  const { t } = useLanguageStore();
  const qc = useQueryClient();
  const canPublish = Boolean(user?.role && ['SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(user.role));
  const [filter, setFilter] = useState('ALL');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', audience: 'ALL', targetClass: '', sendWhatsapp: true, isPinned: false, expiresAt: '' });

  const announcementsQ = useQuery({
    queryKey: ['school-announcements'],
    queryFn: () => getAnnouncements().then((r) => r.data.data || []),
  });
  const classesQ = useQuery({
    queryKey: ['school-classes'],
    queryFn: () => getClasses().then((r) => r.data.data || []),
  });

  const publishMut = useMutation({
    mutationFn: () => publishAnnouncement({
      title: form.title.trim(), body: form.body.trim(), audience: form.audience,
      targetClass: form.targetClass || undefined, sendWhatsapp: form.sendWhatsapp,
      isPinned: form.isPinned, expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
    }),
    onSuccess: async () => {
      toast.success('Announcement published and queued for recipients');
      setForm({ title: '', body: '', audience: 'ALL', targetClass: '', sendWhatsapp: true, isPinned: false, expiresAt: '' });
      setShowForm(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['school-announcements'] }),
        qc.invalidateQueries({ queryKey: ['school-overview'] }),
      ]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error)),
  });

  const announcements = announcementsQ.data || [];
  const classNames = useMemo(() => [...new Set((classesQ.data || []).map((row) => row.class_name))].sort((a, b) => Number(a) - Number(b)), [classesQ.data]);
  const visible = filter === 'ALL' ? announcements : announcements.filter((announcement) => announcement.audience === filter);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form.title.trim().length < 3) return toast.error('Enter an announcement title');
    if (form.body.trim().length < 10) return toast.error('Announcement message must be at least 10 characters');
    publishMut.mutate();
  }

  return (
    <div className="animate-fade-up">
      <SectionHeader title={`📢 ${t('घोषणाएँ', 'Announcements')}`} sub={t('छात्र, अभिभावक और शिक्षकों तक स्कूल अपडेट पहुँचाएँ', 'Publish School updates to Students, Parents and Teachers')}>
        {canPublish && <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>{showForm ? '✕ Cancel' : `+ ${t('नई घोषणा', 'New Announcement')}`}</button>}
      </SectionHeader>

      {!canPublish && <div className="card mb-5 text-sm" style={{ borderLeft: '4px solid var(--saffron)', color: 'var(--slate)' }}>Teacher access is read-only. Announcements are published by the School Administrator.</div>}

      {showForm && canPublish && (
        <form onSubmit={submit} className="card mb-5 animate-fade-up" style={{ border: '2px solid var(--saffron)' }}>
          <h3 className="font-display font-bold text-base mb-4" style={{ color: 'var(--navy)' }}>✍️ {t('नई घोषणा बनाएँ', 'Create Announcement')}</h3>
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div className="md:col-span-2"><label className="text-xs font-bold mb-1.5 block" style={{ color: 'var(--slate)' }}>Title *</label><input className="input" maxLength={300} required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Parent-Teacher Meeting — 28 August" /></div>
            <div className="md:col-span-2"><label className="text-xs font-bold mb-1.5 block" style={{ color: 'var(--slate)' }}>Message *</label><textarea className="input" rows={4} required value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} placeholder="Write the complete notice for recipients…" style={{ resize: 'vertical' }} /></div>
            <div><label className="text-xs font-bold mb-1.5 block" style={{ color: 'var(--slate)' }}>Audience</label><select className="input select" value={form.audience} onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}>{AUDIENCES.map((audience) => <option key={audience.value} value={audience.value}>{audience.label}</option>)}</select></div>
            <div><label className="text-xs font-bold mb-1.5 block" style={{ color: 'var(--slate)' }}>Class / Grade <span className="font-normal">(optional)</span></label><select className="input select" value={form.targetClass} onChange={(e) => setForm((f) => ({ ...f, targetClass: e.target.value }))}><option value="">All classes</option>{classNames.map((className) => <option key={className} value={className}>Class {className}</option>)}</select></div>
            <div><label className="text-xs font-bold mb-1.5 block" style={{ color: 'var(--slate)' }}>Expiry <span className="font-normal">(optional)</span></label><input className="input" type="datetime-local" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} /></div>
            <div className="flex flex-col justify-end gap-2 pb-1"><label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={form.isPinned} onChange={(e) => setForm((f) => ({ ...f, isPinned: e.target.checked }))} /> Pin announcement</label><label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={form.sendWhatsapp} onChange={(e) => setForm((f) => ({ ...f, sendWhatsapp: e.target.checked }))} /> Send WhatsApp to targeted Parents</label></div>
          </div>
          <div className="text-xs mb-4 p-3 rounded-xl" style={{ background: '#F7F8FA', color: 'var(--slate)' }}>Every targeted VidyaSetu account receives an in-app notification. WhatsApp is additionally sent to targeted Parent accounts when enabled.</div>
          <button className="btn-primary w-full justify-center py-3" disabled={publishMut.isPending}>{publishMut.isPending ? 'Publishing…' : '📢 Publish & Notify'}</button>
        </form>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">{AUDIENCES.map((audience) => <button key={audience.value} onClick={() => setFilter(audience.value)} className="px-4 py-1.5 rounded-full text-sm font-bold" style={{ background: filter === audience.value ? 'var(--navy)' : '#F0F4F8', color: filter === audience.value ? 'white' : 'var(--slate)' }}>{audience.label}</button>)}</div>

      {announcementsQ.isLoading ? <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="skeleton h-28 rounded-xl" />)}</div> : announcementsQ.isError ? <div className="card" style={{ color: '#C62828' }}>{apiErrorText(announcementsQ.error)}</div> : visible.length === 0 ? <div className="card text-center py-12"><div className="text-4xl mb-3">📢</div><p className="font-display font-bold" style={{ color: 'var(--navy)' }}>No announcements found</p></div> : (
        <div className="space-y-3 stagger">{visible.map((announcement) => {
          const expired = Boolean(announcement.expires_at && new Date(announcement.expires_at) < new Date());
          return <div key={announcement.id} className="card animate-fade-up" style={{ borderLeft: `4px solid ${announcement.is_pinned ? 'var(--gold)' : 'var(--saffron)'}`, opacity: expired ? 0.7 : 1 }}><div className="flex items-start justify-between gap-3"><div className="flex-1 min-w-0"><div className="flex items-center gap-2 flex-wrap"><h3 className="font-semibold text-base" style={{ color: 'var(--navy)' }}>{announcement.title}</h3>{announcement.is_pinned && <span className="badge badge-orange">📌 Pinned</span>}{expired && <span className="badge badge-red">Expired</span>}</div><p className="text-sm mt-1 leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--slate)' }}>{announcement.body}</p></div><div className="text-right flex-shrink-0"><p className="text-xs font-semibold" style={{ color: 'var(--saffron)' }}>{audienceLabel(announcement.audience)}</p>{(announcement.target_classes || []).length > 0 && <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>Class {(announcement.target_classes || []).join(', ')}</p>}</div></div><div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-2" style={{ borderTop: '1px solid var(--border)' }}><p className="text-xs" style={{ color: 'var(--slate)' }}>By {announcement.created_by_name} · {new Date(announcement.published_at).toLocaleString('en-IN')}</p><div className="flex gap-3 text-xs font-semibold"><span style={{ color: 'var(--forest)' }}>✅ {Number(announcement.sent_count || 0)} in-app delivered</span>{announcement.send_whatsapp && <span style={{ color: 'var(--saffron)' }}>📲 Parent WhatsApp enabled</span>}</div></div></div>;
        })}</div>
      )}
    </div>
  );
}
