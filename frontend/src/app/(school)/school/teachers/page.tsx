'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addTeacher, deactivateTeacher, getClasses, getSubjects, getTeachers, updateTeacher, type SchoolTeacherRow } from '@/services/schoolService';
import { SectionHeader, TableSkeleton } from '@/components/ui/index';
import { apiErrorText } from '@/utils/errors';
import toast from 'react-hot-toast';

interface AssignmentForm { classId: string; subjectCode: string; isClassTeacher: boolean; }
interface TeacherForm {
  name: string; mobile: string; email: string; employeeId: string; designation: string; qualification: string;
  experienceYears: number; employmentType: string; status: string; assignments: AssignmentForm[];
}
interface Credential { name: string; username?: string | null; password: string; }
const empty: TeacherForm = { name: '', mobile: '', email: '', employeeId: '', designation: 'Teacher', qualification: '', experienceYears: 0, employmentType: 'FULL_TIME', status: 'ACTIVE', assignments: [] };

export default function SchoolTeachersPage() {
  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState<SchoolTeacherRow | null>(null);
  const [form, setForm] = useState<TeacherForm>(empty);
  const [credential, setCredential] = useState<Credential | null>(null);
  const teachersQ = useQuery({ queryKey: ['school-teachers'], queryFn: () => getTeachers().then((r) => r.data.data || []) });
  const classesQ = useQuery({ queryKey: ['school-classes'], queryFn: () => getClasses().then((r) => r.data.data || []) });
  const subjectsQ = useQuery({ queryKey: ['school-subjects'], queryFn: () => getSubjects().then((r) => r.data.data || []) });
  const teachers = teachersQ.data || []; const classes = classesQ.data || []; const subjects = subjectsQ.data || [];

  const save = useMutation({
    mutationFn: () => editing ? updateTeacher(editing.id, { ...form }) : addTeacher({ ...form }),
    onSuccess: async (res) => {
      const data = res.data.data;
      if (!editing && data.temporaryPassword) setCredential({ name: data.name, username: data.username, password: data.temporaryPassword });
      toast.success(editing ? 'Teacher updated' : 'Teacher added'); setShow(false); setEditing(null); setForm(empty);
      await Promise.all([qc.invalidateQueries({ queryKey: ['school-teachers'] }), qc.invalidateQueries({ queryKey: ['school-overview'] })]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error)),
  });
  const deactivate = useMutation({ mutationFn: (id: string) => deactivateTeacher(id), onSuccess: async () => { toast.success('Teacher deactivated'); await qc.invalidateQueries({ queryKey: ['school-teachers'] }); }, onError: (error: unknown) => toast.error(apiErrorText(error)) });

  function addAssignment() {
    if (!classes[0] || !subjects[0]) return toast.error('Configure a class and subject first');
    setForm((current) => ({ ...current, assignments: [...current.assignments, { classId: classes[0].id, subjectCode: subjects[0].code, isClassTeacher: false }] }));
  }
  function setAssignment<K extends keyof AssignmentForm>(index: number, key: K, value: AssignmentForm[K]) {
    setForm((current) => ({ ...current, assignments: current.assignments.map((assignment, position) => position === index ? { ...assignment, [key]: value } : assignment) }));
  }
  function startEdit(teacher: SchoolTeacherRow) {
    setEditing(teacher);
    setForm({ name: teacher.name, mobile: teacher.mobile, email: teacher.email || '', employeeId: teacher.employee_id || '', designation: teacher.designation || 'Teacher', qualification: teacher.qualification || '', experienceYears: teacher.experience_yrs || 0, employmentType: teacher.employment_type || 'FULL_TIME', status: teacher.status, assignments: (teacher.assignments || []).map((assignment) => ({ classId: assignment.classId, subjectCode: assignment.subjectCode, isClassTeacher: assignment.isClassTeacher })) });
    setShow(true);
  }

  return <div className="animate-fade-up">
    <SectionHeader title="👩‍🏫 Teacher Management" sub={`${teachers.filter((teacher) => teacher.status === 'ACTIVE').length} active teachers`}><button className="btn-primary" onClick={() => { setEditing(null); setForm(empty); setShow((v) => !v); }}>+ Add Teacher</button></SectionHeader>
    {credential && <div className="card mb-5" style={{ border: '2px solid var(--forest)', background: 'var(--forest-pale)' }}><div className="font-display font-bold" style={{ color: 'var(--forest)' }}>Teacher account created</div><div className="text-sm mt-2"><b>{credential.name}</b> · Username: <code>{credential.username}</code> · Temporary password: <code>{credential.password}</code></div><p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>Share this securely. The Teacher will be asked to manage their password after login.</p><button className="text-xs font-bold mt-2" onClick={() => setCredential(null)}>Dismiss</button></div>}
    {show && <div className="card mb-5" style={{ border: '2px solid var(--saffron)' }}><h3 className="font-display font-bold mb-4" style={{ color: 'var(--navy)' }}>{editing ? 'Edit Teacher' : 'Add Teacher'}</h3><div className="grid md:grid-cols-2 gap-3"><input className="input" placeholder="Full name *" value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} /><input className="input" placeholder="10-digit mobile *" maxLength={10} value={form.mobile} onChange={(e) => setForm((current) => ({ ...current, mobile: e.target.value.replace(/\D/g, '') }))} /><input className="input" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))} /><input className="input" placeholder="Employee ID" value={form.employeeId} onChange={(e) => setForm((current) => ({ ...current, employeeId: e.target.value }))} /><input className="input" placeholder="Designation" value={form.designation} onChange={(e) => setForm((current) => ({ ...current, designation: e.target.value }))} /><input className="input" placeholder="Qualification" value={form.qualification} onChange={(e) => setForm((current) => ({ ...current, qualification: e.target.value }))} /><input type="number" min="0" max="60" className="input" placeholder="Experience years" value={form.experienceYears} onChange={(e) => setForm((current) => ({ ...current, experienceYears: Number(e.target.value) }))} /><select className="input select" value={form.employmentType} onChange={(e) => setForm((current) => ({ ...current, employmentType: e.target.value }))}>{['FULL_TIME', 'PART_TIME', 'CONTRACT', 'VISITING'].map((type) => <option key={type}>{type.replaceAll('_', ' ')}</option>)}</select>{editing && <select className="input select" value={form.status} onChange={(e) => setForm((current) => ({ ...current, status: e.target.value }))}>{['ACTIVE', 'ON_LEAVE', 'INACTIVE'].map((status) => <option key={status}>{status.replaceAll('_', ' ')}</option>)}</select>}</div>
      <div className="mt-5 flex items-center justify-between"><h4 className="font-display font-bold" style={{ color: 'var(--navy)' }}>Class & Subject Assignments</h4><button className="btn-ghost text-xs" onClick={addAssignment}>+ Assignment</button></div><div className="space-y-2 mt-2">{form.assignments.map((assignment, i) => <div key={i} className="grid sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-center p-3 rounded-xl" style={{ background: '#F7F8FA' }}><select className="input select" value={assignment.classId} onChange={(e) => setAssignment(i, 'classId', e.target.value)}>{classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>Class {schoolClass.class_name}-{schoolClass.section}</option>)}</select><select className="input select" value={assignment.subjectCode} onChange={(e) => setAssignment(i, 'subjectCode', e.target.value)}>{subjects.map((subject) => <option key={subject.code} value={subject.code}>{subject.name}</option>)}</select><label className="text-xs flex items-center gap-1"><input type="checkbox" checked={assignment.isClassTeacher} onChange={(e) => setAssignment(i, 'isClassTeacher', e.target.checked)} /> Class teacher</label><button className="text-xs" style={{ color: '#C62828' }} onClick={() => setForm((current) => ({ ...current, assignments: current.assignments.filter((_, position) => position !== i) }))}>Remove</button></div>)}</div>
      <div className="flex gap-2 mt-4"><button className="btn-primary" disabled={save.isPending || !form.name || form.mobile.length !== 10} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save Teacher'}</button><button className="btn-ghost" onClick={() => setShow(false)}>Cancel</button></div>
    </div>}
    <div className="card">{teachersQ.isLoading ? <TableSkeleton rows={5} cols={7} /> : <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Employee</th><th>Name</th><th>Designation</th><th>Assignments</th><th>Mobile</th><th>Status</th><th>Action</th></tr></thead><tbody>{teachers.map((teacher) => <tr key={teacher.id}><td>{teacher.employee_id || '—'}</td><td><b>{teacher.name}</b><div className="text-xs" style={{ color: 'var(--slate)' }}>@{teacher.username}</div></td><td>{teacher.designation || 'Teacher'}</td><td className="text-xs">{(teacher.assignments || []).map((assignment) => `${assignment.className}-${assignment.section} ${assignment.subjectCode}`).join(', ') || '—'}</td><td>{teacher.mobile}</td><td><span className={`badge ${teacher.status === 'ACTIVE' ? 'badge-green' : teacher.status === 'ON_LEAVE' ? 'badge-orange' : 'badge-red'}`}>{teacher.status}</span></td><td><div className="flex gap-2"><button className="text-xs font-bold" style={{ color: 'var(--saffron)' }} onClick={() => startEdit(teacher)}>Edit</button>{teacher.status !== 'INACTIVE' && <button className="text-xs font-bold" style={{ color: '#C62828' }} disabled={deactivate.isPending} onClick={() => { if (confirm(`Deactivate ${teacher.name}?`)) deactivate.mutate(teacher.id); }}>Deactivate</button>}</div></td></tr>)}</tbody></table>{!teachers.length && <div className="py-10 text-center" style={{ color: 'var(--slate)' }}>No Teachers yet.</div>}</div>}</div>
  </div>;
}
