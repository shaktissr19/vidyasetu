'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addStudent, bulkAddStudents, getClasses, getStudentDetail, getStudents, linkStudentParent, updateStudent, type SchoolStudentListRow } from '@/services/schoolService';
import { SectionHeader, StatusBadge, TableSkeleton } from '@/components/ui/index';
import useAuthStore from '@/store/authStore';
import { apiErrorText } from '@/utils/errors';
import toast from 'react-hot-toast';

interface StudentForm { name: string; mobile: string; email: string; classId: string; rollNumber: string; parentName: string; parentMobile: string; parentEmail: string; parentRelation: string; }
interface StudentEdit { name: string; email: string; mobile: string; classId: string; rollNumber: string; status: string; }
interface ParentForm { name: string; mobile: string; email: string; relation: string; }
const emptyStudent: StudentForm = { name: '', mobile: '', email: '', classId: '', rollNumber: '', parentName: '', parentMobile: '', parentEmail: '', parentRelation: 'PARENT' };
const emptyParent: ParentForm = { name: '', mobile: '', email: '', relation: 'PARENT' };

function downloadText(name: string, text: string) { const anchor = document.createElement('a'); const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); anchor.href = url; anchor.download = name; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url); }
function csvCell(value: unknown): string { return String(value ?? '').trim(); }

export default function SchoolStudentsPage() {
  const { user } = useAuthStore();
  const canAdmin = Boolean(user?.role && ['SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(user.role));
  const qc = useQueryClient();
  const [search, setSearch] = useState(''); const [classId, setClassId] = useState(''); const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false); const [form, setForm] = useState<StudentForm>(emptyStudent);
  const [selectedId, setSelectedId] = useState<string | null>(null); const [edit, setEdit] = useState<StudentEdit | null>(null);
  const [parent, setParent] = useState<ParentForm>(emptyParent); const [bulkMessage, setBulkMessage] = useState('');

  const classesQ = useQuery({ queryKey: ['school-classes'], queryFn: () => getClasses().then((r) => r.data.data || []) });
  const classes = classesQ.data || [];
  const studentsQ = useQuery({ queryKey: ['school-students', search, classId, page], queryFn: () => getStudents({ search, classId, page, limit: 20 }).then((r) => r.data), placeholderData: (previous) => previous });
  const students = studentsQ.data?.data || []; const meta = studentsQ.data?.meta;
  const detailQ = useQuery({ queryKey: ['school-student-detail', selectedId], queryFn: async () => { if (!selectedId) throw new Error('No Student selected'); return getStudentDetail(selectedId).then((r) => r.data.data); }, enabled: !!selectedId });
  const byLabel = useMemo<Record<string, string>>(() => Object.fromEntries(classes.map((schoolClass) => [`${schoolClass.class_name}-${schoolClass.section}`.toLowerCase(), schoolClass.id])), [classes]);

  const create = useMutation({
    mutationFn: () => addStudent({ ...form, email: form.email || undefined, parentMobile: form.parentMobile || undefined, parentEmail: form.parentEmail || undefined, parentName: form.parentName || undefined }),
    onSuccess: async (res) => { const student = res.data.data; toast.success(`Student created: ${student.student_code}`); if (student.temporaryPassword) toast(`Temporary password: ${student.temporaryPassword}`, { duration: 15000, icon: '🔑' }); setShowAdd(false); setForm(emptyStudent); await Promise.all([qc.invalidateQueries({ queryKey: ['school-students'] }), qc.invalidateQueries({ queryKey: ['school-overview'] })]); },
    onError: (error: unknown) => toast.error(apiErrorText(error)),
  });
  const update = useMutation({
    mutationFn: async () => { if (!selectedId || !edit) throw new Error('No Student selected'); return updateStudent(selectedId, { ...edit }); },
    onSuccess: async () => { toast.success('Student updated'); setEdit(null); await Promise.all([qc.invalidateQueries({ queryKey: ['school-students'] }), qc.invalidateQueries({ queryKey: ['school-student-detail', selectedId] })]); },
    onError: (error: unknown) => toast.error(apiErrorText(error)),
  });
  const link = useMutation({
    mutationFn: async () => { if (!selectedId) throw new Error('No Student selected'); return linkStudentParent(selectedId, { ...parent }); },
    onSuccess: async (res) => { toast.success(res.data.data.status === 'LINKED' ? 'Parent linked' : 'Parent invitation saved'); setParent(emptyParent); await qc.invalidateQueries({ queryKey: ['school-student-detail', selectedId] }); },
    onError: (error: unknown) => toast.error(apiErrorText(error)),
  });
  const bulk = useMutation({
    mutationFn: bulkAddStudents,
    onSuccess: async (res) => { const created = res.data.data.created || []; setBulkMessage(`${created.length} Students imported successfully.`); await qc.invalidateQueries({ queryKey: ['school-students'] }); await qc.invalidateQueries({ queryKey: ['school-overview'] }); },
    onError: (error: unknown) => toast.error(apiErrorText(error)),
  });

  async function importCsv(file?: File) {
    if (!file || !canAdmin) return;
    const text = await file.text(); const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return toast.error('CSV has no data rows');
    const header = lines[0].split(',').map((value) => value.trim());
    const rows: Array<Record<string, unknown>> = [];
    for (const line of lines.slice(1)) {
      const vals = line.split(','); const row: Record<string, string> = Object.fromEntries(header.map((key, index) => [key, csvCell(vals[index])]));
      const key = `${row.class}-${row.section || 'A'}`.toLowerCase(); const id = byLabel[key];
      if (!id) return toast.error(`Class ${row.class}-${row.section || 'A'} is not configured`);
      rows.push({ name: row.name, mobile: row.mobile, email: row.email || undefined, classId: id, rollNumber: row.rollNumber || undefined, parentName: row.parentName || undefined, parentMobile: row.parentMobile || undefined, parentEmail: row.parentEmail || undefined, parentRelation: row.parentRelation || 'PARENT' });
    }
    if (!rows.length) return toast.error('CSV has no Student rows');
    bulk.mutate(rows);
  }
  function template() { downloadText('vidyasetu-student-import.csv', 'name,mobile,email,class,section,rollNumber,parentName,parentMobile,parentEmail,parentRelation\nSample Student,9390000101,,8,A,8A25,Sample Parent,9490000101,,FATHER\n'); }
  function openDetail(student: SchoolStudentListRow) { setSelectedId(student.id); setEdit(null); setParent(emptyParent); }
  const detail = detailQ.data;

  return <div className="animate-fade-up">
    <SectionHeader title="👨‍🎓 Student Management" sub={`${meta?.total || 0} official Students`}>{canAdmin && <><label className="btn-outline text-sm cursor-pointer">📥 Import CSV<input type="file" accept=".csv,text/csv" hidden onChange={(e) => importCsv(e.target.files?.[0])} /></label><button className="btn-ghost text-sm" onClick={template}>Download Template</button><button className="btn-primary text-sm" onClick={() => setShowAdd((value) => !value)}>+ Add Student</button></>}</SectionHeader>
    {!canAdmin && <div className="card mb-5 text-sm" style={{ borderLeft: '4px solid var(--saffron)', color: 'var(--slate)' }}>Teacher access is read-only. Student admissions, transfers and Parent links are managed by the School Administrator.</div>}
    {bulkMessage && <div className="card mb-4" style={{ borderLeft: '4px solid var(--forest)', color: 'var(--forest)' }}>{bulkMessage}</div>}

    {showAdd && canAdmin && <div className="card mb-5" style={{ border: '2px solid var(--saffron)' }}><h3 className="font-display font-bold mb-4" style={{ color: 'var(--navy)' }}>Add Student to School</h3><div className="grid md:grid-cols-2 gap-3"><input className="input" placeholder="Full name *" value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} /><input className="input" placeholder="10-digit mobile *" maxLength={10} value={form.mobile} onChange={(e) => setForm((current) => ({ ...current, mobile: e.target.value.replace(/\D/g, '') }))} /><input className="input" type="email" placeholder="Email (optional)" value={form.email} onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))} /><select className="input select" value={form.classId} onChange={(e) => setForm((current) => ({ ...current, classId: e.target.value }))}><option value="">Select class / section *</option>{classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>Class {schoolClass.class_name}-{schoolClass.section}</option>)}</select><input className="input" placeholder="Roll number" value={form.rollNumber} onChange={(e) => setForm((current) => ({ ...current, rollNumber: e.target.value }))} /><select className="input select" value={form.parentRelation} onChange={(e) => setForm((current) => ({ ...current, parentRelation: e.target.value }))}>{['FATHER', 'MOTHER', 'GUARDIAN', 'PARENT'].map((relation) => <option key={relation}>{relation}</option>)}</select><input className="input" placeholder="Parent name (optional)" value={form.parentName} onChange={(e) => setForm((current) => ({ ...current, parentName: e.target.value }))} /><input className="input" placeholder="Parent mobile" maxLength={10} value={form.parentMobile} onChange={(e) => setForm((current) => ({ ...current, parentMobile: e.target.value.replace(/\D/g, '') }))} /></div><p className="text-xs mt-3" style={{ color: 'var(--slate)' }}>A permanent Student ID, username and secure temporary password are generated automatically. Share the temporary credential privately with the Student.</p><div className="flex gap-2 mt-4"><button className="btn-primary" disabled={create.isPending || !form.name || form.mobile.length !== 10 || !form.classId} onClick={() => create.mutate()}>{create.isPending ? 'Creating…' : 'Create Student'}</button><button className="btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button></div></div>}

    <div className="card mb-5"><div className="flex flex-wrap gap-3"><input className="input flex-1 min-w-[220px]" placeholder="🔍 Name / username / Student ID" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /><select className="input select w-auto" value={classId} onChange={(e) => { setClassId(e.target.value); setPage(1); }}><option value="">All Classes</option>{classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>Class {schoolClass.class_name}-{schoolClass.section}</option>)}</select></div></div>

    <div className="card">{studentsQ.isLoading ? <TableSkeleton rows={8} cols={8} /> : studentsQ.isError ? <div style={{ color: '#C62828' }}>{apiErrorText(studentsQ.error)}</div> : <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Student ID</th><th>Roll</th><th>Name</th><th>Class</th><th>Mobile</th><th>Attendance</th><th>Fee</th><th>Action</th></tr></thead><tbody>{students.map((student) => <tr key={student.id}><td className="font-mono text-xs">{student.student_code}</td><td>{student.roll_number || '—'}</td><td><b>{student.name}</b><div className="text-xs" style={{ color: 'var(--slate)' }}>@{student.username}</div></td><td>Class {student.class_name}-{student.section}</td><td className="font-mono text-sm">{student.mobile}</td><td>{student.attendance_pct ? `${Math.round(Number(student.attendance_pct))}%` : '—'}</td><td><StatusBadge status={student.fee_status || 'PENDING'} /></td><td><button className="text-xs font-bold px-3 py-1 rounded-lg" style={{ background: 'var(--saffron-pale)', color: 'var(--saffron)' }} onClick={() => openDetail(student)}>View</button></td></tr>)}</tbody></table>{!students.length && <div className="py-10 text-center" style={{ color: 'var(--slate)' }}>No Students found.</div>}{(meta?.totalPages || 0) > 1 && <div className="flex justify-between mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}><span className="text-xs">Page {meta?.page} of {meta?.totalPages}</span><div className="flex gap-2"><button className="btn-ghost text-xs" disabled={!meta?.hasPrev} onClick={() => setPage((value) => value - 1)}>Prev</button><button className="btn-ghost text-xs" disabled={!meta?.hasNext} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>}</div>}</div>

    {selectedId && <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4" style={{ background: 'rgba(13,27,62,.55)' }} onClick={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}><div className="card w-full max-w-3xl max-h-[90vh] overflow-y-auto" style={{ background: 'white' }}>{detailQ.isLoading ? <div className="py-10 text-center">Loading…</div> : detailQ.isError ? <div style={{ color: '#C62828' }}>{apiErrorText(detailQ.error)}</div> : detail && <><div className="flex justify-between gap-3"><div><h2 className="font-display font-extrabold text-xl" style={{ color: 'var(--navy)' }}>{detail.name}</h2><p className="text-xs" style={{ color: 'var(--slate)' }}>{detail.student_code} · @{detail.username}</p></div><button className="btn-ghost" onClick={() => setSelectedId(null)}>✕</button></div><div className="grid sm:grid-cols-4 gap-3 my-5">{[['Class', `${detail.class_name || detail.grade_level}-${detail.section || ''}`], ['Roll', detail.roll_number || '—'], ['Attendance', detail.attendance?.[0]?.percentage ? `${Math.round(Number(detail.attendance[0].percentage))}%` : '—'], ['Status', detail.status || '—']].map(([label, value]) => <div className="p-3 rounded-xl" style={{ background: '#F7F8FA' }} key={label}><div className="text-xs" style={{ color: 'var(--slate)' }}>{label}</div><div className="font-bold mt-1">{value}</div></div>)}</div>
      {canAdmin && (!edit ? <button className="btn-outline text-sm mb-5" onClick={() => setEdit({ name: detail.name, email: detail.email || '', mobile: detail.mobile, classId: detail.class_id || '', rollNumber: detail.roll_number || '', status: detail.status || 'ACTIVE' })}>Edit Student</button> : <div className="p-4 rounded-xl mb-5" style={{ background: '#F7F8FA' }}><div className="grid sm:grid-cols-2 gap-2"><input className="input" value={edit.name} onChange={(e) => setEdit((current) => current ? ({ ...current, name: e.target.value }) : current)} /><input className="input" value={edit.mobile} onChange={(e) => setEdit((current) => current ? ({ ...current, mobile: e.target.value.replace(/\D/g, '') }) : current)} /><select className="input select" value={edit.classId} onChange={(e) => setEdit((current) => current ? ({ ...current, classId: e.target.value }) : current)}>{classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>Class {schoolClass.class_name}-{schoolClass.section}</option>)}</select><input className="input" value={edit.rollNumber} onChange={(e) => setEdit((current) => current ? ({ ...current, rollNumber: e.target.value }) : current)} /><select className="input select" value={edit.status} onChange={(e) => setEdit((current) => current ? ({ ...current, status: e.target.value }) : current)}>{['ACTIVE', 'INACTIVE', 'TRANSFERRED', 'GRADUATED'].map((status) => <option key={status}>{status}</option>)}</select></div><div className="flex gap-2 mt-3"><button className="btn-primary" disabled={update.isPending} onClick={() => update.mutate()}>Save</button><button className="btn-ghost" onClick={() => setEdit(null)}>Cancel</button></div></div>)}
      <h3 className="font-display font-bold mb-2" style={{ color: 'var(--navy)' }}>Parents / Guardians</h3><div className="space-y-2 mb-4">{(detail.parents || []).map((item) => <div className="p-3 rounded-xl flex justify-between" style={{ background: 'var(--forest-pale)' }} key={item.id}><span><b>{item.name}</b> · {item.relation}</span><span className="text-sm">{item.mobile}</span></div>)}{!(detail.parents || []).length && <p className="text-sm" style={{ color: 'var(--slate)' }}>No Parent account linked yet.</p>}</div>
      {canAdmin && <><div className="grid sm:grid-cols-4 gap-2"><input className="input" placeholder="Parent name" value={parent.name} onChange={(e) => setParent((current) => ({ ...current, name: e.target.value }))} /><input className="input" placeholder="Mobile" maxLength={10} value={parent.mobile} onChange={(e) => setParent((current) => ({ ...current, mobile: e.target.value.replace(/\D/g, '') }))} /><input className="input" placeholder="Email" value={parent.email} onChange={(e) => setParent((current) => ({ ...current, email: e.target.value }))} /><select className="input select" value={parent.relation} onChange={(e) => setParent((current) => ({ ...current, relation: e.target.value }))}>{['FATHER', 'MOTHER', 'GUARDIAN', 'PARENT'].map((relation) => <option key={relation}>{relation}</option>)}</select></div><button className="btn-primary mt-2 text-sm" disabled={link.isPending || (!parent.mobile && !parent.email)} onClick={() => link.mutate()}>Link / Invite Parent</button></>}
    </>}</div></div>}
  </div>;
}
