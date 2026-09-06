'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listCompetitions as listAdminCompetitions } from '@/services/adminService';
import {
  createExam,
  getCompetitionReadiness,
  importCompetitionLearningQuestions,
  updateExamStatus,
} from '@/services/competitionService';
import { getLearningStudioQuestions } from '@/services/adminLearningService';
import { SectionHeader, StatusBadge } from '@/components/ui/index';
import { formatDate, formatCurrency } from '@/utils/formatters';
import { apiErrorText } from '@/utils/errors';
import toast from 'react-hot-toast';

const STATUS_NEXT: Record<string, string> = {
  DRAFT: 'REGISTRATION_OPEN',
  REGISTRATION_OPEN: 'REGISTRATION_CLOSED',
  REGISTRATION_CLOSED: 'LIVE',
  LIVE: 'SCORING',
  SCORING: 'COMPLETED',
};
const STATUS_ACTION: Record<string, string> = {
  DRAFT: 'Open Registration',
  REGISTRATION_OPEN: 'Close Registration',
  REGISTRATION_CLOSED: 'Go Live',
  LIVE: 'Enter Scoring',
  SCORING: 'Release Results',
};
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

function toIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

export default function AdminCompetitionsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [classGroup, setClassGroup] = useState('Class 5–8');
  const [subjectCode, setSubjectCode] = useState('SCI');
  const [builderExamId, setBuilderExamId] = useState<string | null>(null);
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
  const [form, setForm] = useState({
    title: '', titleHi: '', startTime: '', endTime: '', registrationStart: '', registrationEnd: '', resultsAt: '',
    durationMins: 45, totalQuestions: 10, marksPerQuestion: 2, negativeMarks: 0,
    prizePool: '', instructions: '', instructionsHi: '',
  });

  const { data: exams = [], isLoading } = useQuery({
    queryKey: ['admin-competitions-list'],
    queryFn: () => listAdminCompetitions().then((response) => response.data.data),
  });
  const { data: questionBank = [] } = useQuery({
    queryKey: ['competition-v2-question-bank'],
    queryFn: () => getLearningStudioQuestions().then((response) => response.data.data),
  });
  const { data: readiness, refetch: refetchReadiness } = useQuery({
    queryKey: ['competition-v2-readiness', builderExamId],
    queryFn: () => getCompetitionReadiness(builderExamId || '').then((response) => response.data.data),
    enabled: Boolean(builderExamId),
    retry: false,
  });

  const eligibleQuestions = useMemo(() => questionBank.filter((question) =>
    question.review_status === 'PUBLISHED'
    && question.question_type === 'MCQ_SINGLE'
    && Boolean(question.prompt_hi?.trim())
    && Number(question.option_count || 0) >= 4
    && Number(question.missing_hindi_option_count || 0) === 0
    && (question.concept_ids || []).length > 0
    && (subjectCode === 'ALL' || !question.subject_name || question.public_code.toUpperCase().includes(subjectCode) || true)
  ), [questionBank, subjectCode]);

  const createMut = useMutation({
    mutationFn: () => createExam({
      title: form.title,
      titleHi: form.titleHi || undefined,
      type: 'OLYMPIAD',
      classNames: CLASS_GROUPS[classGroup] || [],
      subjectCodes: subjectCode === 'ALL' ? [] : [subjectCode],
      startTime: toIso(form.startTime),
      endTime: toIso(form.endTime),
      registrationStart: toIso(form.registrationStart),
      registrationEnd: toIso(form.registrationEnd),
      resultsAt: toIso(form.resultsAt),
      durationMins: form.durationMins,
      totalQuestions: form.totalQuestions,
      marksPerQuestion: form.marksPerQuestion,
      negativeMarks: form.negativeMarks,
      prizePool: Number(form.prizePool) || 0,
      instructions: form.instructions || undefined,
      instructionsHi: form.instructionsHi || undefined,
      status: 'DRAFT',
    }),
    onSuccess: async (response) => {
      toast.success('🏆 Competition created as governed DRAFT');
      await qc.invalidateQueries({ queryKey: ['admin-competitions-list'] });
      setShowForm(false);
      setBuilderExamId(response.data.data.id);
      setSelectedQuestions([]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Failed to create competition')),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateExamStatus(id, status),
    onSuccess: async () => {
      toast.success('Competition lifecycle updated');
      await qc.invalidateQueries({ queryKey: ['admin-competitions-list'] });
      if (builderExamId) await refetchReadiness();
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Competition cannot move to that state yet')),
  });

  const importMut = useMutation({
    mutationFn: () => importCompetitionLearningQuestions(builderExamId || '', selectedQuestions),
    onSuccess: async (response) => {
      toast.success(`${response.data.data.imported} governed questions imported`);
      setSelectedQuestions([]);
      await qc.invalidateQueries({ queryKey: ['admin-competitions-list'] });
      await refetchReadiness();
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not import selected Learning Question Bank items')),
  });

  const selectedExam = exams.find((exam) => exam.id === builderExamId) || null;

  return (
    <div className="animate-fade-up">
      <SectionHeader title="🏆 Competition 2.0" sub={`${exams.length} platform competitions · governed by Learning Question Bank`}>
        <button className="btn-primary" onClick={() => setShowForm((value) => !value)}>{showForm ? '✕ Cancel' : '+ Create Competition'}</button>
      </SectionHeader>

      <div className="card mb-5" style={{ borderLeft: '4px solid var(--saffron)' }}>
        <strong style={{ color: 'var(--navy)' }}>Publication rule</strong>
        <p style={{ color: 'var(--slate)', fontSize: 13, marginTop: 5 }}>Platform competitions are DRAFT-first. Registration cannot open until every question comes from the PUBLISHED bilingual Learning Question Bank, maps to a canonical concept, and all timing/readiness checks pass.</p>
      </div>

      {showForm && (
        <div className="card-navy mb-5 animate-fade-up">
          <h3 className="font-display font-bold text-base text-white mb-4">Create governed Competition DRAFT</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <label className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>Title (English) *
              <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className="input mt-1.5" style={{ background: 'rgba(255,255,255,0.06)', color: 'white' }} />
            </label>
            <label className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>शीर्षक (Hindi) — required before publication
              <input value={form.titleHi} onChange={(event) => setForm((current) => ({ ...current, titleHi: event.target.value }))} className="input mt-1.5" style={{ background: 'rgba(255,255,255,0.06)', color: 'white' }} />
            </label>
            <label className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>Target Classes
              <select value={classGroup} onChange={(event) => setClassGroup(event.target.value)} className="input select mt-1.5" style={{ background: '#111a32', color: 'white' }}>{Object.keys(CLASS_GROUPS).map((group) => <option key={group}>{group}</option>)}</select>
            </label>
            <label className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>Subject
              <select value={subjectCode} onChange={(event) => setSubjectCode(event.target.value)} className="input select mt-1.5" style={{ background: '#111a32', color: 'white' }}>{SUBJECTS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}<option value="ALL">All Subjects</option></select>
            </label>
            <label className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>Registration opens
              <input type="datetime-local" value={form.registrationStart} onChange={(event) => setForm((current) => ({ ...current, registrationStart: event.target.value }))} className="input mt-1.5" style={{ background: 'rgba(255,255,255,0.06)', color: 'white' }} />
            </label>
            <label className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>Registration closes
              <input type="datetime-local" value={form.registrationEnd} onChange={(event) => setForm((current) => ({ ...current, registrationEnd: event.target.value }))} className="input mt-1.5" style={{ background: 'rgba(255,255,255,0.06)', color: 'white' }} />
            </label>
            <label className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>Competition starts *
              <input type="datetime-local" value={form.startTime} onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))} className="input mt-1.5" style={{ background: 'rgba(255,255,255,0.06)', color: 'white' }} />
            </label>
            <label className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>Competition ends *
              <input type="datetime-local" value={form.endTime} onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))} className="input mt-1.5" style={{ background: 'rgba(255,255,255,0.06)', color: 'white' }} />
            </label>
            <label className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>Official results release
              <input type="datetime-local" value={form.resultsAt} onChange={(event) => setForm((current) => ({ ...current, resultsAt: event.target.value }))} className="input mt-1.5" style={{ background: 'rgba(255,255,255,0.06)', color: 'white' }} />
            </label>
            <label className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>Prize / recognition pool (₹)
              <input type="number" min={0} value={form.prizePool} onChange={(event) => setForm((current) => ({ ...current, prizePool: event.target.value }))} className="input mt-1.5" style={{ background: 'rgba(255,255,255,0.06)', color: 'white' }} />
            </label>
            <label className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>Duration (minutes)
              <input type="number" min={1} max={360} value={form.durationMins} onChange={(event) => setForm((current) => ({ ...current, durationMins: Number(event.target.value) }))} className="input mt-1.5" style={{ background: 'rgba(255,255,255,0.06)', color: 'white' }} />
            </label>
            <label className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>Planned questions
              <input type="number" min={5} max={100} value={form.totalQuestions} onChange={(event) => setForm((current) => ({ ...current, totalQuestions: Number(event.target.value) }))} className="input mt-1.5" style={{ background: 'rgba(255,255,255,0.06)', color: 'white' }} />
            </label>
            <label className="text-xs font-bold md:col-span-2" style={{ color: 'rgba(255,255,255,0.5)' }}>Instructions (English)
              <textarea value={form.instructions} onChange={(event) => setForm((current) => ({ ...current, instructions: event.target.value }))} rows={2} className="input mt-1.5" style={{ background: 'rgba(255,255,255,0.06)', color: 'white', resize: 'vertical' }} />
            </label>
            <label className="text-xs font-bold md:col-span-2" style={{ color: 'rgba(255,255,255,0.5)' }}>निर्देश (Hindi)
              <textarea value={form.instructionsHi} onChange={(event) => setForm((current) => ({ ...current, instructionsHi: event.target.value }))} rows={2} className="input mt-1.5" style={{ background: 'rgba(255,255,255,0.06)', color: 'white', resize: 'vertical' }} />
            </label>
          </div>
          <button className="btn-primary mt-4" disabled={!form.title.trim() || !form.startTime || !form.endTime || createMut.isPending} onClick={() => createMut.mutate()}>{createMut.isPending ? 'Creating…' : '🏆 Create DRAFT & build question set'}</button>
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
                  {Number(exam.prize_pool || 0) > 0 && <span style={{ color: 'var(--saffron-light)' }}>🏆 {formatCurrency(exam.prize_pool)}</span>}
                  <span>🎓 {exam.class_names?.length ? `Class ${exam.class_names.join(', ')}` : 'All Classes'}</span>
                  <span>📚 {exam.subject_codes?.length ? exam.subject_codes.join(', ') : 'All Subjects'}</span>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {exam.status === 'DRAFT' && <button className="btn-outline text-sm" onClick={() => { setBuilderExamId(exam.id); setSelectedQuestions([]); }}>Build / Readiness</button>}
                {STATUS_NEXT[exam.status] && <button className="btn-primary text-sm" disabled={statusMut.isPending} onClick={() => statusMut.mutate({ id: exam.id, status: STATUS_NEXT[exam.status] })}>{STATUS_ACTION[exam.status]} →</button>}
                {!['COMPLETED','CANCELLED'].includes(exam.status) && <button className="text-xs font-bold px-3 py-2 rounded-lg" style={{ background: 'rgba(194,40,40,0.18)', color: '#EF9A9A', border: '1px solid rgba(194,40,40,0.2)' }} onClick={() => statusMut.mutate({ id: exam.id, status: 'CANCELLED' })}>Cancel</button>}
              </div>
            </div>
          </div>
        ))}
        {exams.length === 0 && !isLoading && <div className="card-navy text-center py-10"><div className="text-4xl mb-3">🏆</div><p className="font-display font-bold text-white">No competitions yet</p></div>}
      </div>

      {builderExamId && selectedExam && (
        <div className="card mt-5" style={{ padding: 22 }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-display font-extrabold text-lg" style={{ color: 'var(--navy)' }}>🧩 Build: {selectedExam.title}</h3>
              <p style={{ color: 'var(--slate)', fontSize: 13, marginTop: 4 }}>Only PUBLISHED, bilingual, concept-mapped MCQ_SINGLE items are eligible.</p>
            </div>
            <button className="btn-outline" onClick={() => setBuilderExamId(null)}>Close</button>
          </div>

          {readiness && (
            <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: readiness.ready ? '#EFFAF5' : '#FFF8EF', border: `1px solid ${readiness.ready ? '#BDE8D2' : '#FFD7B5'}` }}>
              <strong style={{ color: 'var(--navy)' }}>{readiness.ready ? '✅ Ready to open registration' : '⚠️ Not publication-ready'}</strong>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', color: 'var(--slate)', fontSize: 12, marginTop: 7 }}>
                <span>Total {readiness.totalQuestions}</span><span>Bilingual {readiness.bilingualQuestions}</span><span>Concept mapped {readiness.conceptMappedQuestions}</span><span>Governed {readiness.governedQuestions}</span>
              </div>
              {readiness.blockers.length > 0 && <ul style={{ margin: '8px 0 0 18px', color: '#8A4B00', fontSize: 12 }}>{readiness.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 18 }}>
            <strong style={{ color: 'var(--navy)' }}>Learning Question Bank · {eligibleQuestions.length} eligible</strong>
            <button className="btn-primary" disabled={!selectedQuestions.length || importMut.isPending} onClick={() => importMut.mutate()}>{importMut.isPending ? 'Importing…' : `Import ${selectedQuestions.length} selected`}</button>
          </div>
          <div style={{ display: 'grid', gap: 8, marginTop: 12, maxHeight: 440, overflow: 'auto' }}>
            {eligibleQuestions.map((question) => {
              const checked = selectedQuestions.includes(question.id);
              return (
                <label key={question.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', border: '1px solid var(--border)', borderRadius: 10, padding: 11, cursor: 'pointer', background: checked ? '#F2F8FF' : 'white' }}>
                  <input type="checkbox" checked={checked} onChange={() => setSelectedQuestions((current) => checked ? current.filter((id) => id !== question.id) : [...current, question.id])} />
                  <div>
                    <strong style={{ color: 'var(--navy)', fontSize: 13 }}>{question.public_code} · {question.prompt}</strong>
                    <div style={{ color: 'var(--slate)', fontSize: 12, marginTop: 3 }}>{question.prompt_hi} · {question.difficulty} · {question.cognitive_skill || 'skill n/a'} · {question.concept_ids.length} concept mapping(s)</div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
