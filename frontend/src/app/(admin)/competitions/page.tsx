'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listCompetitions, createExam, updateExamStatus } from '@/services/competitionService';
import { SectionHeader, StatusBadge } from '@/components/ui/index';
import { formatDate, formatCurrency } from '@/utils/formatters';
import { useState } from 'react';
import toast from 'react-hot-toast';

const STATUS_NEXT: Record<string, string> = {
  DRAFT: 'REGISTRATION_OPEN',
  REGISTRATION_OPEN: 'LIVE',
  LIVE: 'COMPLETED',
};
const STATUS_ACTION: Record<string, string> = {
  DRAFT: 'Open Registration',
  REGISTRATION_OPEN: 'Go Live',
  LIVE: 'End Exam',
};

export default function AdminCompetitionsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: '', classNames: ['6', '7', '8', '9', '10'], startTime: '', endTime: '',
    durationMins: 60, totalQuestions: 50, totalMarks: 100, prizePool: '', type: 'COMPETITION',
  });

  const { data: exams = [], isLoading } = useQuery({
    queryKey: ['competitions-list'],
    queryFn: () => listCompetitions().then((r) => r.data.data),
  });

  const createMut = useMutation({
    mutationFn: createExam,
    onSuccess: () => {
      toast.success('🏆 Competition created!');
      qc.invalidateQueries({ queryKey: ['competitions-list'] });
      setShowForm(false);
    },
    onError: () => toast.error('Failed to create competition'),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateExamStatus(id, status),
    onSuccess: () => {
      toast.success('Status updated!');
      qc.invalidateQueries({ queryKey: ['competitions-list'] });
    },
  });

  return (
    <div className="animate-fade-up">
      <SectionHeader title="🏆 Competition Manager">
        <button className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? '✕ Cancel' : '+ Create Competition'}
        </button>
      </SectionHeader>

      {showForm && (
        <div className="card-navy mb-5 animate-fade-up">
          <h3 className="font-display font-bold text-base text-white mb-4">Create New Competition</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Exam Title *</label>
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g., May Maths Olympiad 2026" className="input"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
            </div>
            <div>
              <label className="text-xs font-bold mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Prize Pool (₹)</label>
              <input type="number" value={form.prizePool} onChange={(e) => setForm((f) => ({ ...f, prizePool: e.target.value }))}
                placeholder="500000" className="input"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
            </div>
            <div>
              <label className="text-xs font-bold mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Start Time *</label>
              <input type="datetime-local" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                className="input" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
            </div>
            <div>
              <label className="text-xs font-bold mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>End Time *</label>
              <input type="datetime-local" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                className="input" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
            </div>
            <div>
              <label className="text-xs font-bold mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Duration (mins)</label>
              <input type="number" value={form.durationMins} onChange={(e) => setForm((f) => ({ ...f, durationMins: parseInt(e.target.value) }))}
                className="input" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
            </div>
            <div>
              <label className="text-xs font-bold mb-1.5 block" style={{ color: 'rgba(255,255,255,0.5)' }}>Total Questions</label>
              <input type="number" value={form.totalQuestions} onChange={(e) => setForm((f) => ({ ...f, totalQuestions: parseInt(e.target.value) }))}
                className="input" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} />
            </div>
          </div>
          <button className="btn-primary mt-4" disabled={!form.title || !form.startTime || createMut.isPending}
            onClick={() => createMut.mutate({ ...form, prizePool: parseFloat(form.prizePool) || null, classNames: form.classNames, status: 'DRAFT' })}>
            {createMut.isPending ? 'Creating...' : '🏆 Create Competition'}
          </button>
        </div>
      )}

      <div className="space-y-3">
        {exams.map((exam) => (
          <div key={exam.id} className="card-navy">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-display font-bold text-white">{exam.title}</h3>
                  <StatusBadge status={exam.status} />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  <span>📅 {formatDate(exam.start_time)}</span>
                  <span>⏱ {exam.duration_mins} min</span>
                  <span>📝 {exam.total_questions} MCQs</span>
                  {exam.prize_pool && <span style={{ color: 'var(--saffron-light)' }}>🏆 {formatCurrency(exam.prize_pool)}</span>}
                  <span>🎓 Class {exam.class_names?.join(', ')}</span>
                </div>
              </div>
              {STATUS_NEXT[exam.status] && (
                <button className="btn-primary text-sm" disabled={statusMut.isPending}
                  onClick={() => statusMut.mutate({ id: exam.id, status: STATUS_NEXT[exam.status] })}>
                  {STATUS_ACTION[exam.status]} →
                </button>
              )}
            </div>
          </div>
        ))}
        {exams.length === 0 && !isLoading && (
          <div className="card-navy text-center py-10">
            <div className="text-4xl mb-3">🏆</div>
            <p className="font-display font-bold text-white">No competitions yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
