'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listCompetitions as listAdminCompetitions } from '@/services/adminService';
import { createExam, updateExamStatus } from '@/services/competitionService';
import { SectionHeader, StatusBadge } from '@/components/ui/index';
import { formatDate, formatCurrency } from '@/utils/formatters';
import { useState } from 'react';
import toast from 'react-hot-toast';

const STATUS_NEXT: Record<string, string> = { DRAFT: 'REGISTRATION_OPEN', REGISTRATION_OPEN: 'LIVE', LIVE: 'COMPLETED' };
const STATUS_ACTION: Record<string, string> = { DRAFT: 'Open Registration', REGISTRATION_OPEN: 'Go Live', LIVE: 'End Exam' };
const CLASS_GROUPS: Record<string, string[]> = {
  'Class 5–8': ['5','6','7','8'],
  'Class 6–10': ['6','7','8','9','10'],
  'Class 8–12': ['8','9','10','11','12'],
  'All Classes': ['1','2','3','4','5','6','7','8','9','10','11','12'],
};
const SUBJECTS = [
  ['MATH', 'Mathematics'], ['SCI', 'Science'], ['ENG', 'English'], ['HIN', 'Hindi'],
  ['SST', 'Social Science'], ['SAN', 'Sanskrit'], ['GK', 'General Knowledge'],
] as const;

export default function AdminCompetitionsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [classGroup, setClassGroup] = useState('Class 5–8');
  const [subjectCode, setSubjectCode] = useState('SCI');
  const [form, setForm] = useState({
    title: '', startTime: '', endTime: '', durationMins: 60, totalQuestions: 50,
    marksPerQuestion: 2, negativeMarks: 0, prizePool: '', instructions: '',
  });

  const { data: exams = [], isLoading } = useQuery({
    queryKey: ['admin-competitions-list'],
    queryFn: () => listAdminCompetitions().then((r) => r.data.data),
  });

  const createMut = useMutation({
    mutationFn: () => createExam({
      title: form.title,
      type: 'OLYMPIAD',
      classNames: CLASS_GROUPS[classGroup] || [],
      subjectCodes: subjectCode === 'ALL' ? [] : [subjectCode],
      startTime: form.startTime,
      endTime: form.endTime,
      durationMins: form.durationMins,
      totalQuestions: form.totalQuestions,
      marksPerQuestion: form.marksPerQuestion,
      negativeMarks: form.negativeMarks,
      prizePool: Number(form.prizePool) || 0,
      instructions: form.instructions || undefined,
      status: 'DRAFT',
    }),
    onSuccess: async () => {
      toast.success('🏆 Competition created as draft');
      await qc.invalidateQueries({ queryKey: ['admin-competitions-list'] });
      setShowForm(false);
      setForm({ title: '', startTime: '', endTime: '', durationMins: 60, totalQuestions: 50, marksPerQuestion: 2, negativeMarks: 0, prizePool: '', instructions: '' });
    },
    onError: () => toast.error('Failed to create competition'),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateExamStatus(id, status),
    onSuccess: async () => { toast.success('Status updated!'); await qc.invalidateQueries({ queryKey: ['admin-competitions-list'] }); },
    onError: () => toast.error('Failed to update competition status'),
  });

  return (
    <div className="animate-fade-up">
      <SectionHeader title="🏆 Competition Manager" sub={`${exams.length} Olympiad competitions`}>
        <button className="btn-primary" onClick={() => setShowForm((value) => !value)}>{showForm ? '✕ Cancel' : '+ Create Competition'}</button>
      </SectionHeader>

      {showForm && (
        <div className="card-navy mb-5 animate-fade-up">
          <h3 className="font-display font-bold text-base text-white mb-4">Create New Competition</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <label className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>Exam Title *
              <input value={form.title} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} placeholder="e.g., May Science Olympiad 2026" className="input mt-1.5" style={{ background: 'rgba(255,255,255,0.06)', color: 'white' }} />
            </label>
            <label className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>Target Classes
              <select value={classGroup} onChange={(e) => setClassGroup(e.target.value)} className="input select mt-1.5" style={{ background: '#111a32', color: 'white' }}>{Object.keys(CLASS_GROUPS).map((group) => <option key={group}>{group}</option>)}</select>
            </label>
            <label className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>Subject
              <select value={subjectCode} onChange={(e) => setSubjectCode(e.target.value)} className="input select mt-1.5" style={{ background: '#111a32', color: 'white' }}>
                {SUBJECTS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}<option value="ALL">All Subjects</option>
              </select>
            </label>
            <label className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>Prize Pool (₹)
              <input type="number" min={0} value={form.prizePool} onChange={(e) => setForm((current) => ({ ...current, prizePool: e.target.value }))} placeholder="500000" className="input mt-1.5" style={{ background: 'rgba(255,255,255,0.06)', color: 'white' }} />
            </label>
            <label className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>Start Time *
              <input type="datetime-local" value={form.startTime} onChange={(e) => setForm((current) => ({ ...current, startTime: e.target.value }))} className="input mt-1.5" style={{ background: 'rgba(255,255,255,0.06)', color: 'white' }} />
            </label>
            <label className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>End Time *
              <input type="datetime-local" value={form.endTime} onChange={(e) => setForm((current) => ({ ...current, endTime: e.target.value }))} className="input mt-1.5" style={{ background: 'rgba(255,255,255,0.06)', color: 'white' }} />
            </label>
            <label className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>Duration (minutes)
              <input type="number" min={1} value={form.durationMins} onChange={(e) => setForm((current) => ({ ...current, durationMins: Number(e.target.value) }))} className="input mt-1.5" style={{ background: 'rgba(255,255,255,0.06)', color: 'white' }} />
            </label>
            <label className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>Questions
              <input type="number" min={1} value={form.totalQuestions} onChange={(e) => setForm((current) => ({ ...current, totalQuestions: Number(e.target.value) }))} className="input mt-1.5" style={{ background: 'rgba(255,255,255,0.06)', color: 'white' }} />
            </label>
            <label className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>Marks / Question
              <input type="number" min={0.25} step="0.25" value={form.marksPerQuestion} onChange={(e) => setForm((current) => ({ ...current, marksPerQuestion: Number(e.target.value) }))} className="input mt-1.5" style={{ background: 'rgba(255,255,255,0.06)', color: 'white' }} />
            </label>
            <label className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>Negative Marks
              <input type="number" min={0} step="0.25" value={form.negativeMarks} onChange={(e) => setForm((current) => ({ ...current, negativeMarks: Number(e.target.value) }))} className="input mt-1.5" style={{ background: 'rgba(255,255,255,0.06)', color: 'white' }} />
            </label>
            <label className="text-xs font-bold md:col-span-2" style={{ color: 'rgba(255,255,255,0.5)' }}>Instructions
              <textarea value={form.instructions} onChange={(e) => setForm((current) => ({ ...current, instructions: e.target.value }))} rows={3} className="input mt-1.5" style={{ background: 'rgba(255,255,255,0.06)', color: 'white', resize: 'vertical' }} />
            </label>
          </div>
          <button className="btn-primary mt-4" disabled={!form.title.trim() || !form.startTime || !form.endTime || createMut.isPending} onClick={() => createMut.mutate()}>{createMut.isPending ? 'Creating...' : '🏆 Create Draft Competition'}</button>
        </div>
      )}

      <div className="space-y-3">
        {exams.map((exam) => (
          <div key={exam.id} className="card-navy">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1"><h3 className="font-display font-bold text-white">{exam.title}</h3><StatusBadge status={exam.status} /></div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  <span>📅 {formatDate(exam.start_time)}</span><span>⏱ {exam.duration_mins} min</span><span>📝 {exam.total_questions} questions</span>
                  {exam.prize_pool != null && Number(exam.prize_pool) > 0 && <span style={{ color: 'var(--saffron-light)' }}>🏆 {formatCurrency(exam.prize_pool)}</span>}
                  <span>🎓 {exam.class_names?.length ? `Class ${exam.class_names.join(', ')}` : 'All Classes'}</span>
                  <span>📚 {exam.subject_codes?.length ? exam.subject_codes.join(', ') : 'All Subjects'}</span>
                </div>
              </div>
              <div className="flex gap-2">
                {STATUS_NEXT[exam.status] && <button className="btn-primary text-sm" disabled={statusMut.isPending} onClick={() => statusMut.mutate({ id: exam.id, status: STATUS_NEXT[exam.status] })}>{STATUS_ACTION[exam.status]} →</button>}
                {!['COMPLETED','CANCELLED'].includes(exam.status) && <button className="text-xs font-bold px-3 py-2 rounded-lg" style={{ background: 'rgba(194,40,40,0.18)', color: '#EF9A9A', border: '1px solid rgba(194,40,40,0.2)' }} onClick={() => statusMut.mutate({ id: exam.id, status: 'CANCELLED' })}>Cancel</button>}
              </div>
            </div>
          </div>
        ))}
        {exams.length === 0 && !isLoading && <div className="card-navy text-center py-10"><div className="text-4xl mb-3">🏆</div><p className="font-display font-bold text-white">No competitions yet</p></div>}
      </div>
    </div>
  );
}
