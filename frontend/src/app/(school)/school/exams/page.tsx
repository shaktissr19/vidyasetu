'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSchoolExam, getClasses, getSchoolExams, getSubjects, updateSchoolExamStatus } from '@/services/schoolService';
import { SectionHeader, TableSkeleton, StatusBadge } from '@/components/ui/index';
import { apiErrorText } from '@/utils/errors';
import toast from 'react-hot-toast';

type Choice = 'A' | 'B' | 'C' | 'D';
type ExamListField = 'classNames' | 'subjectCodes';
interface QuestionForm {
  questionText: string; subjectCode?: string; optionA: string; optionB: string; optionC: string; optionD: string;
  correctOption: Choice; explanation: string; difficulty: string;
}
interface ExamForm {
  title: string; classNames: string[]; subjectCodes: string[]; startTime: string; endTime: string;
  durationMins: number; marksPerQuestion: number; negativeMarks: number; status: string; instructions: string; questions: QuestionForm[];
}
const blankQuestion = (): QuestionForm => ({ questionText: '', subjectCode: '', optionA: '', optionB: '', optionC: '', optionD: '', correctOption: 'A', explanation: '', difficulty: 'MEDIUM' });
const nextStatus: Record<string, string> = { DRAFT: 'REGISTRATION_OPEN', REGISTRATION_OPEN: 'LIVE', LIVE: 'COMPLETED' };

export default function SchoolExamsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ExamForm>({ title: '', classNames: [], subjectCodes: [], startTime: '', endTime: '', durationMins: 45, marksPerQuestion: 1, negativeMarks: 0, status: 'DRAFT', instructions: '', questions: [blankQuestion()] });
  const examsQ = useQuery({ queryKey: ['school-exams'], queryFn: () => getSchoolExams().then((r) => r.data.data || []) });
  const classesQ = useQuery({ queryKey: ['school-classes'], queryFn: () => getClasses().then((r) => r.data.data || []) });
  const subjectsQ = useQuery({ queryKey: ['school-subjects'], queryFn: () => getSubjects().then((r) => r.data.data || []) });
  const classNames = useMemo(() => [...new Set((classesQ.data || []).map((schoolClass) => schoolClass.class_name))], [classesQ.data]);

  const create = useMutation({
    mutationFn: () => createSchoolExam({
      ...form,
      startTime: new Date(form.startTime).toISOString(), endTime: new Date(form.endTime).toISOString(),
      totalQuestions: form.questions.length,
      questions: form.questions.map((question) => ({ ...question, subjectCode: question.subjectCode || form.subjectCodes[0] })),
    }),
    onSuccess: async () => { toast.success('School exam created'); setShowForm(false); await qc.invalidateQueries({ queryKey: ['school-exams'] }); },
    onError: (error: unknown) => toast.error(apiErrorText(error)),
  });
  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateSchoolExamStatus(id, status),
    onSuccess: async () => { toast.success('Exam status updated'); await qc.invalidateQueries({ queryKey: ['school-exams'] }); },
    onError: (error: unknown) => toast.error(apiErrorText(error)),
  });

  function toggle(field: ExamListField, value: string) {
    setForm((current) => {
      const values = current[field];
      return { ...current, [field]: values.includes(value) ? values.filter((item) => item !== value) : [...values, value] };
    });
  }
  function qChange<K extends keyof QuestionForm>(index: number, key: K, value: QuestionForm[K]) {
    setForm((current) => ({ ...current, questions: current.questions.map((question, position) => position === index ? { ...question, [key]: value } : question) }));
  }
  function validateCreate() {
    if (!form.title || !form.startTime || !form.endTime || !form.classNames.length || !form.subjectCodes.length) return toast.error('Title, class, subject and exam time are required');
    if (form.questions.some((question) => !question.questionText || !question.optionA || !question.optionB || !question.optionC || !question.optionD)) return toast.error('Complete every question and option');
    create.mutate();
  }

  return <div className="animate-fade-up">
    <SectionHeader title="📝 Exams" sub="Create and manage school tests, questions and publication status"><button className="btn-primary" onClick={() => setShowForm((v) => !v)}>+ Create Exam</button></SectionHeader>

    {showForm && <div className="card mb-5" style={{ border: '2px solid var(--saffron)' }}>
      <h3 className="font-display font-bold mb-4" style={{ color: 'var(--navy)' }}>New School Test</h3>
      <div className="grid md:grid-cols-2 gap-3"><div className="md:col-span-2"><label className="text-xs font-bold block mb-1">Title</label><input className="input" value={form.title} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} placeholder="e.g. Class 8 Science Unit Test" /></div><div><label className="text-xs font-bold block mb-1">Start</label><input type="datetime-local" className="input" value={form.startTime} onChange={(e) => setForm((current) => ({ ...current, startTime: e.target.value }))} /></div><div><label className="text-xs font-bold block mb-1">End</label><input type="datetime-local" className="input" value={form.endTime} onChange={(e) => setForm((current) => ({ ...current, endTime: e.target.value }))} /></div><div><label className="text-xs font-bold block mb-1">Duration (minutes)</label><input type="number" min="1" max="300" className="input" value={form.durationMins} onChange={(e) => setForm((current) => ({ ...current, durationMins: Number(e.target.value) }))} /></div><div><label className="text-xs font-bold block mb-1">Marks per question</label><input type="number" min="0.5" step="0.5" className="input" value={form.marksPerQuestion} onChange={(e) => setForm((current) => ({ ...current, marksPerQuestion: Number(e.target.value) }))} /></div></div>
      <div className="mt-4"><label className="text-xs font-bold block mb-2">Eligible Classes</label><div className="flex flex-wrap gap-2">{classNames.map((className) => <button type="button" key={className} className="px-3 py-1.5 rounded-full text-xs font-bold" style={{ background: form.classNames.includes(className) ? 'var(--navy)' : '#F0F4F8', color: form.classNames.includes(className) ? 'white' : 'var(--slate)' }} onClick={() => toggle('classNames', className)}>Class {className}</button>)}</div></div>
      <div className="mt-4"><label className="text-xs font-bold block mb-2">Subjects</label><div className="flex flex-wrap gap-2">{(subjectsQ.data || []).map((subject) => <button type="button" key={subject.code} className="px-3 py-1.5 rounded-full text-xs font-bold" style={{ background: form.subjectCodes.includes(subject.code) ? 'var(--saffron)' : '#F0F4F8', color: form.subjectCodes.includes(subject.code) ? 'white' : 'var(--slate)' }} onClick={() => toggle('subjectCodes', subject.code)}>{subject.name}</button>)}</div></div>
      <div className="mt-5"><div className="flex items-center justify-between"><h4 className="font-display font-bold" style={{ color: 'var(--navy)' }}>Questions ({form.questions.length})</h4><button className="btn-ghost text-xs" onClick={() => setForm((current) => ({ ...current, questions: [...current.questions, blankQuestion()] }))}>+ Add Question</button></div>
        <div className="space-y-3 mt-3">{form.questions.map((question, i) => <div className="p-4 rounded-xl" key={i} style={{ background: '#F7F8FA' }}><div className="flex justify-between"><b className="text-sm">Q{i + 1}</b>{form.questions.length > 1 && <button className="text-xs" style={{ color: '#C62828' }} onClick={() => setForm((current) => ({ ...current, questions: current.questions.filter((_, position) => position !== i) }))}>Remove</button>}</div><input className="input mt-2" value={question.questionText} onChange={(e) => qChange(i, 'questionText', e.target.value)} placeholder="Question text" /><div className="grid sm:grid-cols-2 gap-2 mt-2">{(['A', 'B', 'C', 'D'] as Choice[]).map((opt) => { const key = `option${opt}` as 'optionA' | 'optionB' | 'optionC' | 'optionD'; return <input key={opt} className="input" value={question[key]} onChange={(e) => qChange(i, key, e.target.value)} placeholder={`Option ${opt}`} />; })}</div><div className="flex gap-3 mt-2 items-center"><label className="text-xs font-bold">Correct:</label><select className="input select w-auto" value={question.correctOption} onChange={(e) => qChange(i, 'correctOption', e.target.value as Choice)}>{(['A', 'B', 'C', 'D'] as Choice[]).map((option) => <option key={option}>{option}</option>)}</select><select className="input select w-auto" value={question.difficulty} onChange={(e) => qChange(i, 'difficulty', e.target.value)}>{['EASY', 'MEDIUM', 'HARD'].map((difficulty) => <option key={difficulty}>{difficulty}</option>)}</select></div></div>)}</div>
      </div>
      <div className="flex gap-2 mt-4"><button className="btn-primary" disabled={create.isPending} onClick={validateCreate}>{create.isPending ? 'Creating…' : 'Create Draft Exam'}</button><button className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button></div>
    </div>}

    <div className="card">{examsQ.isLoading ? <TableSkeleton rows={6} cols={7} /> : <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Exam</th><th>Classes</th><th>Subject</th><th>Questions</th><th>Attempts</th><th>Status</th><th>Action</th></tr></thead><tbody>{(examsQ.data || []).map((exam) => <tr key={exam.id}><td><b>{exam.title}</b><div className="text-xs" style={{ color: 'var(--slate)' }}>{new Date(exam.start_time).toLocaleString('en-IN')}</div></td><td>{(exam.class_names || []).join(', ')}</td><td>{(exam.subject_codes || []).join(', ')}</td><td>{exam.question_count}/{exam.total_questions}</td><td>{exam.scored_attempts}</td><td><StatusBadge status={exam.status} /></td><td>{nextStatus[exam.status] ? <button className="text-xs font-bold px-3 py-1 rounded-lg" style={{ background: 'var(--saffron-pale)', color: 'var(--saffron)' }} disabled={statusMut.isPending} onClick={() => statusMut.mutate({ id: exam.id, status: nextStatus[exam.status] })}>{nextStatus[exam.status].replaceAll('_', ' ')}</button> : <span className="text-xs" style={{ color: 'var(--slate)' }}>—</span>}</td></tr>)}</tbody></table>{!(examsQ.data || []).length && <div className="py-10 text-center" style={{ color: 'var(--slate)' }}>No School exams created yet.</div>}</div>}</div>
  </div>;
}
