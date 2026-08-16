'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAnnouncements, publishAnnouncement } from '@/services/schoolService';
import { SectionHeader } from '@/components/ui/index';
import { formatDate, timeAgo } from '@/utils/formatters';
import useLanguageStore from '@/store/languageStore';
import toast from 'react-hot-toast';

const AUDIENCES = [
  { value: 'ALL',      label: 'Everyone', hi: 'सभी' },
  { value: 'PARENTS',  label: 'Parents',  hi: 'अभिभावक' },
  { value: 'STUDENTS', label: 'Students', hi: 'छात्र' },
  { value: 'TEACHERS', label: 'Teachers', hi: 'शिक्षक' },
];

export default function AnnouncementsPage() {
  const { t } = useLanguageStore();
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: '', body: '', audience: 'ALL', sendWhatsapp: true });
  const [showForm, setShowForm] = useState(false);

  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ['announcements'],
    queryFn:  () => getAnnouncements().then(r => r.data.data),
  });

  const publishMut = useMutation({
    mutationFn: publishAnnouncement,
    onSuccess: () => {
      toast.success('📢 Announcement published! WhatsApp sent to parents.');
      qc.invalidateQueries(['announcements']);
      setForm({ title: '', body: '', audience: 'ALL', sendWhatsapp: true });
      setShowForm(false);
    },
    onError: (err) => toast.error(err.response?.data?.error?.message || 'Failed to publish'),
  });

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) { toast.error('Title and message are required'); return; }
    publishMut.mutate(form);
  }

  return (
    <div className="animate-fade-up">
      <SectionHeader title={`📢 ${t('घोषणाएँ', 'Announcements')}`}>
        <button className="btn-primary" onClick={() => setShowForm(v => !v)}>
          {showForm ? '✕ Cancel' : `+ ${t('नई घोषणा', 'New Announcement')}`}
        </button>
      </SectionHeader>

      {/* New announcement form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="card mb-5 animate-fade-up"
          style={{ border: '2px solid var(--saffron)' }}>
          <h3 className="font-display font-bold text-base mb-4" style={{ color: 'var(--navy)' }}>
            ✍️ {t('नई घोषणा बनाएँ', 'Create Announcement')}
          </h3>
          <div className="mb-4">
            <label className="text-xs font-bold mb-1.5 block" style={{ color: 'var(--slate)' }}>{t('शीर्षक', 'Title')} *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder={t('जैसे: वार्षिक खेल दिवस 2026', 'e.g., Annual Sports Day 2026')}
              className="input" maxLength={200} required />
          </div>
          <div className="mb-4">
            <label className="text-xs font-bold mb-1.5 block" style={{ color: 'var(--slate)' }}>{t('संदेश', 'Message')} *</label>
            <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              placeholder={t('अभिभावकों और छात्रों के लिए संदेश...', 'Message for parents and students...')}
              className="input" rows={4} style={{ resize: 'vertical' }} required />
          </div>
          <div className="flex flex-wrap gap-4 mb-4">
            <div>
              <label className="text-xs font-bold mb-1.5 block" style={{ color: 'var(--slate)' }}>{t('भेजें', 'Send to')}</label>
              <div className="flex gap-2 flex-wrap">
                {AUDIENCES.map(a => (
                  <button key={a.value} type="button" onClick={() => setForm(f => ({ ...f, audience: a.value }))}
                    className="px-3 py-1.5 rounded-full text-xs font-bold transition-all"
                    style={{ background: form.audience === a.value ? 'var(--navy)' : '#F0F4F8', color: form.audience === a.value ? 'white' : 'var(--slate)' }}>
                    {t(a.hi, a.label)}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.sendWhatsapp} onChange={e => setForm(f => ({ ...f, sendWhatsapp: e.target.checked }))}
                className="w-4 h-4 accent-orange-500" />
              <span style={{ color: 'var(--navy)' }}>📲 {t('WhatsApp पर भेजें', 'Send on WhatsApp')}</span>
            </label>
          </div>
          <button type="submit" className="btn-primary w-full justify-center py-3" disabled={publishMut.isPending}>
            {publishMut.isPending ? 'Publishing...' : `📢 ${t('प्रकाशित करें', 'Publish & Notify')}`}
          </button>
        </form>
      )}

      {/* Past announcements */}
      {isLoading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="skeleton h-24 rounded-xl" />)}</div>
      ) : announcements.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-4xl mb-3">📢</div>
          <p className="font-display font-bold" style={{ color: 'var(--navy)' }}>{t('कोई घोषणा नहीं', 'No announcements yet')}</p>
        </div>
      ) : (
        <div className="space-y-3 stagger">
          {announcements.map(ann => (
            <div key={ann.id} className="card animate-fade-up" style={{ borderLeft: '4px solid var(--saffron)' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-base" style={{ color: 'var(--navy)' }}>{ann.title}</h3>
                  <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--slate)' }}>{ann.body}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-semibold" style={{ color: 'var(--saffron)' }}>
                    {AUDIENCES.find(a => a.value === ann.audience)?.[t('hi', 'label')] || ann.audience}
                  </p>
                  {ann.send_whatsapp && <p className="text-xs mt-0.5" style={{ color: 'var(--forest)' }}>📲 WhatsApp</p>}
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                <p className="text-xs" style={{ color: 'var(--slate)' }}>{t('द्वारा', 'By')} {ann.created_by_name} · {timeAgo(ann.created_at)}</p>
                {ann.sent_count > 0 && (
                  <p className="text-xs font-semibold" style={{ color: 'var(--forest)' }}>✅ {ann.sent_count} notified</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
