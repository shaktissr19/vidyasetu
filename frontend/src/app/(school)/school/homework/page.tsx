'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SectionHeader } from '@/components/ui/index';
import {
  closeSchoolHomework,
  createSchoolHomework,
  getHomeworkSubmissions,
  getHomeworkTargets,
  getSchoolHomework,
  publishSchoolHomework,
  reviewHomeworkSubmission,
  type HomeworkSubmissionRow,
  type HomeworkTarget,
  type SchoolHomeworkItem,
} from '@/services/homeworkService';
import useAuthStore from '@/store/authStore';
import useLanguageStore from '@/store/languageStore';
import { apiErrorText } from '@/utils/errors';
import toast from 'react-hot-toast';

const EMPTY = {
  classId: '', subjectCode: '', title: '', description: '', instructions: '',
  attachmentUrl: '', dueAt: '', maxMarks: '',
};

function dueText(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function SubmissionReview({ homework, row, onDone }: { homework: SchoolHomeworkItem; row: HomeworkSubmissionRow; onDone: () => Promise<unknown> }) {
  const [marks, setMarks] = useState(row.marks_awarded === null || row.marks_awarded === undefined ? '' : String(row.marks_awarded));
  const [feedback, setFeedback] = useState(row.feedback || '');
  const mutation = useMutation({
    mutationFn: (returnForRevision: boolean) => {
      if (!row.submission_id) throw new Error('No submission to review');
      return reviewHomeworkSubmission(homework.id, row.submission_id, {
        marksAwarded: marks.trim() === '' ? null : Number(marks),
        feedback: feedback.trim() || null,
        returnForRevision,
      });
    },
    onSuccess: async (_, returned) => {
      toast.success(returned ? 'Returned to Student for revision' : 'Homework review saved');
      await onDone();
    },
    onError: (error: unknown) => toast.error(apiErrorText(error)),
  });

  if (!row.submission_id) return <span className="text-xs" style={{ color: 'var(--slate)' }}>Not submitted</span>;
  return (
    <div className="grid gap-2" style={{ minWidth: 260 }}>
      {homework.max_marks !== null && homework.max_marks !== undefined && (
        <input className="input" type="number" min="0" max={Number(homework.max_marks)} step="0.5" value={marks} onChange={(e) => setMarks(e.target.value)} placeholder={`Marks / ${homework.max_marks}`} />
      )}
      <textarea className="input" rows={2} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Teacher feedback" style={{ resize: 'vertical' }} />
      <div className="flex gap-2 flex-wrap">
        <button className="btn-primary" disabled={mutation.isPending} onClick={() => mutation.mutate(false)}>✅ Save review</button>
        <button className="btn-secondary" disabled={mutation.isPending || !feedback.trim()} onClick={() => mutation.mutate(true)}>↩ Return for revision</button>
      </div>
    </div>
  );
}

export default function SchoolHomeworkPage() {
  const { user } = useAuthStore();
  const { t } = useLanguageStore();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'ALL' | 'DRAFT' | 'PUBLISHED' | 'CLOSED'>('ALL');
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);

  const homeworkQ = useQuery({
    queryKey: ['school-homework', filter],
    queryFn: async () => (await getSchoolHomework(filter === 'ALL' ? undefined : filter)).data.data || [],
  });
  const targetsQ = useQuery({
    queryKey: ['school-homework-targets'],
    queryFn: async () => (await getHomeworkTargets()).data.data || [],
  });
  const submissionsQ = useQuery({
    queryKey: ['school-homework-submissions', selectedId],
    queryFn: async () => (await getHomeworkSubmissions(selectedId!)).data.data,
    enabled: Boolean(selectedId),
  });

  const targets = (targetsQ.data || []) as HomeworkTarget[];
  const classOptions = useMemo(() => {
    const map = new Map<string, HomeworkTarget>();
    targets.forEach(target => { if (!map.has(target.class_id)) map.set(target.class_id, target); });
    return [...map.values()];
  }, [targets]);
  const subjectOptions = useMemo(() => targets.filter(target => !form.classId || target.class_id === form.classId), [targets, form.classId]);

  const createMut = useMutation({
    mutationFn: () => createSchoolHomework({
      classId: form.classId,
      subjectCode: form.subjectCode,
      title: form.title.trim(),
      description: form.description.trim(),
      instructions: form.instructions.trim() || null,
      attachmentUrl: form.attachmentUrl.trim() || null,
      dueAt: new Date(form.dueAt).toISOString(),
      maxMarks: form.maxMarks.trim() === '' ? null : Number(form.maxMarks),
    }),
    onSuccess: async () => {
      toast.success('Homework draft created');
      setForm(EMPTY);
      setShowForm(false);
      await qc.invalidateQueries({ queryKey: ['school-homework'] });
    },
    onError: (error: unknown) => toast.error(apiErrorText(error)),
  });

  const publishMut = useMutation({
    mutationFn: publishSchoolHomework,
    onSuccess: async () => {
      toast.success('Homework published and Students notified');
      await qc.invalidateQueries({ queryKey: ['school-homework'] });
    },
    onError: (error: unknown) => toast.error(apiErrorText(error)),
  });
  const closeMut = useMutation({
    mutationFn: closeSchoolHomework,
    onSuccess: async () => {
      toast.success('Homework closed');
      await qc.invalidateQueries({ queryKey: ['school-homework'] });
    },
    onError: (error: unknown) => toast.error(apiErrorText(error)),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.classId || !form.subjectCode) return toast.error('Select a class and subject');
    if (form.title.trim().length < 3) return toast.error('Enter a homework title');
    if (form.description.trim().length < 5) return toast.error('Add clear homework details');
    if (!form.dueAt) return toast.error('Choose a due date');
    const due = new Date(form.dueAt);
    if (Number.isNaN(due.getTime()) || due.getTime() <= Date.now()) return toast.error('Due date must be in the future');
    createMut.mutate();
  }

  const homework = (homeworkQ.data || []) as SchoolHomeworkItem[];
  const selected = homework.find(item => item.id === selectedId) || null;

  return (
    <div className="animate-fade-up">
      <SectionHeader
        title={`📝 ${t('होमवर्क', 'Homework')}`}
        sub={t('कक्षा कार्य बनाएँ, प्रकाशित करें और छात्र जमा कार्य की समीक्षा करें', 'Create, publish and review class homework with Student submission tracking')}
      >
        <button className="btn-primary" onClick={() => setShowForm(v => !v)}>{showForm ? '✕ Cancel' : `+ ${t('नया होमवर्क', 'New Homework')}`}</button>
      </SectionHeader>

      <div className="card mb-5 text-sm" style={{ borderLeft: '4px solid var(--saffron)', color: 'var(--slate)' }}>
        {user?.role === 'TEACHER'
          ? 'Teacher access is limited to the class + subject combinations assigned to your Teacher profile.'
          : 'School Admin can create Homework for active School classes. Drafts stay private until explicitly published.'}
      </div>

      {showForm && (
        <form onSubmit={submit} className="card mb-5 animate-fade-up" style={{ border: '2px solid var(--saffron)' }}>
          <h3 className="font-display font-bold text-base mb-4" style={{ color: 'var(--navy)' }}>✍️ Create Homework Draft</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div><label className="text-xs font-bold mb-1.5 block">Class *</label><select className="input select" required value={form.classId} onChange={e => setForm(f => ({ ...f, classId: e.target.value, subjectCode: '' }))}><option value="">Select class</option>{classOptions.map(target => <option key={target.class_id} value={target.class_id}>{target.class_name}{target.section ? `-${target.section}` : ''}</option>)}</select></div>
            <div><label className="text-xs font-bold mb-1.5 block">Subject *</label><select className="input select" required value={form.subjectCode} onChange={e => setForm(f => ({ ...f, subjectCode: e.target.value }))} disabled={!form.classId}><option value="">Select subject</option>{subjectOptions.map(target => <option key={`${target.class_id}-${target.subject_code}`} value={target.subject_code}>{target.subject_name}</option>)}</select></div>
            <div className="md:col-span-2"><label className="text-xs font-bold mb-1.5 block">Title *</label><input className="input" maxLength={220} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Linear equations — Exercise 3" /></div>
            <div className="md:col-span-2"><label className="text-xs font-bold mb-1.5 block">Homework details *</label><textarea className="input" rows={4} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe the questions, task or expected work…" style={{ resize: 'vertical' }} /></div>
            <div className="md:col-span-2"><label className="text-xs font-bold mb-1.5 block">Instructions <span className="font-normal">(optional)</span></label><textarea className="input" rows={2} value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))} placeholder="Format, steps, notebook/page instructions…" /></div>
            <div><label className="text-xs font-bold mb-1.5 block">Due date & time *</label><input className="input" type="datetime-local" value={form.dueAt} onChange={e => setForm(f => ({ ...f, dueAt: e.target.value }))} /></div>
            <div><label className="text-xs font-bold mb-1.5 block">Maximum marks <span className="font-normal">(optional)</span></label><input className="input" type="number" min="0" step="0.5" value={form.maxMarks} onChange={e => setForm(f => ({ ...f, maxMarks: e.target.value }))} /></div>
            <div className="md:col-span-2"><label className="text-xs font-bold mb-1.5 block">Attachment link <span className="font-normal">(optional)</span></label><input className="input" value={form.attachmentUrl} onChange={e => setForm(f => ({ ...f, attachmentUrl: e.target.value }))} placeholder="https://…" /></div>
          </div>
          <div className="text-xs my-4 p-3 rounded-xl" style={{ background: '#F7F8FA', color: 'var(--slate)' }}>Creating saves a private DRAFT. Students receive nothing until you press Publish.</div>
          <button className="btn-primary w-full justify-center py-3" disabled={createMut.isPending}>{createMut.isPending ? 'Creating…' : 'Save Homework Draft'}</button>
        </form>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        {(['ALL','DRAFT','PUBLISHED','CLOSED'] as const).map(value => <button key={value} onClick={() => { setFilter(value); setSelectedId(null); }} className="px-4 py-1.5 rounded-full text-sm font-bold" style={{ background: filter === value ? 'var(--navy)' : '#F0F4F8', color: filter === value ? 'white' : 'var(--slate)' }}>{value.charAt(0) + value.slice(1).toLowerCase()}</button>)}
      </div>

      {homeworkQ.isLoading ? <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-32 rounded-xl" />)}</div> : homeworkQ.isError ? <div className="card" style={{ color: '#C62828' }}>{apiErrorText(homeworkQ.error)}</div> : homework.length === 0 ? <div className="card text-center py-12"><div className="text-4xl mb-3">📝</div><b>No homework in this view</b></div> : (
        <div className="space-y-3">{homework.map(item => (
          <div key={item.id} className="card" style={{ borderLeft: `4px solid ${item.status === 'DRAFT' ? '#94A3B8' : item.status === 'PUBLISHED' ? 'var(--forest)' : '#64748B'}` }}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0 flex-1"><div className="flex items-center gap-2 flex-wrap"><h3 className="font-display font-bold" style={{ color: 'var(--navy)' }}>{item.title}</h3><span className={`badge ${item.status === 'PUBLISHED' ? 'badge-green' : item.status === 'DRAFT' ? 'badge-orange' : ''}`}>{item.status}</span></div><div className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{item.class_name}{item.section ? `-${item.section}` : ''} · {item.subject_name || item.subject_code} · Due {dueText(item.due_at)}</div><p className="text-sm mt-2" style={{ color: 'var(--slate)' }}>{item.description}</p><div className="text-xs mt-3" style={{ color: 'var(--slate)' }}>{item.submitted_count}/{item.class_student_count} submitted · {item.reviewed_count} reviewed · by {item.created_by_name || 'School staff'}</div></div>
              <div className="flex gap-2 flex-wrap">{item.status === 'DRAFT' && <button className="btn-primary" disabled={publishMut.isPending} onClick={() => publishMut.mutate(item.id)}>📢 Publish</button>}{item.status === 'PUBLISHED' && <button className="btn-secondary" disabled={closeMut.isPending} onClick={() => closeMut.mutate(item.id)}>🔒 Close</button>}{item.status !== 'DRAFT' && <button className="btn-secondary" onClick={() => setSelectedId(item.id)}>👀 {selectedId === item.id ? 'Hide submissions' : 'Submissions'}</button>}</div>
            </div>
          </div>
        ))}</div>
      )}

      {selectedId && selected && (
        <div className="card mt-5 animate-fade-up" style={{ border: '2px solid var(--border)' }}>
          <div className="flex items-center justify-between gap-3 mb-4"><div><h3 className="font-display font-bold text-lg" style={{ color: 'var(--navy)' }}>Student submissions — {selected.title}</h3><p className="text-xs" style={{ color: 'var(--slate)' }}>Review submitted work, award marks and return revisions when needed.</p></div><button className="btn-secondary" onClick={() => setSelectedId(null)}>Close</button></div>
          {submissionsQ.isLoading ? <div className="skeleton h-40 rounded-xl" /> : submissionsQ.isError ? <div style={{ color: '#C62828' }}>{apiErrorText(submissionsQ.error)}</div> : (
            <div className="space-y-3">{(submissionsQ.data?.students || []).map(row => (
              <div key={row.student_id} className="p-4 rounded-xl grid lg:grid-cols-[minmax(170px,.7fr)_minmax(240px,1.3fr)_minmax(260px,1fr)] gap-4 items-start" style={{ border: '1px solid var(--border)', background: row.submission_id ? '#fff' : '#F8FAFC' }}>
                <div><b>{row.student_name}</b><div className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{row.student_code || 'Student'} · {row.submission_status}</div>{row.submitted_at && <div className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{new Date(row.submitted_at).toLocaleString('en-IN')}</div>}</div>
                <div className="text-sm" style={{ color: 'var(--slate)' }}>{row.answer_text ? <div style={{ whiteSpace: 'pre-wrap' }}>{row.answer_text}</div> : row.submission_id ? <span>No written answer</span> : <span>Waiting for submission</span>}{row.attachment_url && <div className="mt-2"><a href={row.attachment_url} target="_blank" rel="noreferrer">📎 Open Student attachment</a></div>}</div>
                <SubmissionReview homework={selected} row={row} onDone={async () => { await Promise.all([qc.invalidateQueries({ queryKey: ['school-homework-submissions', selectedId] }), qc.invalidateQueries({ queryKey: ['school-homework'] })]); }} />
              </div>
            ))}</div>
          )}
        </div>
      )}
    </div>
  );
}
