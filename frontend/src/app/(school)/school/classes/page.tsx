'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClass, getClasses, updateClass, archiveClass } from '@/services/schoolService';
import { SectionHeader, TableSkeleton } from '@/components/ui/index';
import useLanguageStore from '@/store/languageStore';
import toast from 'react-hot-toast';

const blank = { className: '8', section: 'A', roomNumber: '' };
const errorText = e => e?.response?.data?.error?.message || e?.message || 'Request failed';

export default function SchoolClassesPage() {
  const { t } = useLanguageStore();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);

  const q = useQuery({ queryKey: ['school-classes', true], queryFn: () => getClasses(true).then(r => r.data.data || []) });
  const rows = q.data || [];
  const save = useMutation({
    mutationFn: () => editing ? updateClass(editing.id, form) : createClass(form),
    onSuccess: async () => {
      toast.success(editing ? 'Class updated' : 'Class created');
      setShowForm(false); setEditing(null); setForm(blank);
      await qc.invalidateQueries({ queryKey: ['school-classes'] });
      await qc.invalidateQueries({ queryKey: ['school-overview'] });
    },
    onError: e => toast.error(errorText(e)),
  });
  const archive = useMutation({
    mutationFn: archiveClass,
    onSuccess: async () => { toast.success('Class archived'); await qc.invalidateQueries({ queryKey: ['school-classes'] }); },
    onError: e => toast.error(errorText(e)),
  });

  function startEdit(row) {
    setEditing(row); setForm({ className: row.class_name, section: row.section, roomNumber: row.room_number || '' }); setShowForm(true);
  }

  return <div className="animate-fade-up">
    <SectionHeader title={`🏷️ ${t('कक्षाएँ और सेक्शन', 'Classes & Sections')}`} sub={`${rows.filter(r => r.is_active).length} ${t('सक्रिय कक्षाएँ', 'active class-sections')}`}>
      <button className="btn-primary" onClick={() => { setEditing(null); setForm(blank); setShowForm(v => !v); }}>+ {t('कक्षा जोड़ें', 'Add Class')}</button>
    </SectionHeader>

    {showForm && <div className="card mb-5" style={{ border: '2px solid var(--saffron)' }}>
      <h3 className="font-display font-bold mb-4" style={{ color: 'var(--navy)' }}>{editing ? 'Edit Class / Section' : 'Create Class / Section'}</h3>
      <div className="grid sm:grid-cols-3 gap-3">
        <div><label className="text-xs font-bold block mb-1">Class</label><select className="input select" value={form.className} onChange={e => setForm(f => ({ ...f, className: e.target.value }))}>{Array.from({length:12},(_,i)=><option key={i+1}>{i+1}</option>)}</select></div>
        <div><label className="text-xs font-bold block mb-1">Section</label><input className="input" maxLength={5} value={form.section} onChange={e => setForm(f => ({ ...f, section: e.target.value.toUpperCase() }))} /></div>
        <div><label className="text-xs font-bold block mb-1">Room</label><input className="input" maxLength={20} value={form.roomNumber} onChange={e => setForm(f => ({ ...f, roomNumber: e.target.value }))} placeholder="e.g. B-203" /></div>
      </div>
      <div className="flex gap-2 mt-4"><button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save'}</button><button className="btn-ghost" onClick={() => {setShowForm(false);setEditing(null);}}>Cancel</button></div>
    </div>}

    <div className="card">
      {q.isLoading ? <TableSkeleton rows={5} cols={6} /> : <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Class</th><th>Room</th><th>Academic Year</th><th>Students</th><th>Teachers</th><th>Status</th><th>Action</th></tr></thead><tbody>
        {rows.map(row => <tr key={row.id} style={{ opacity: row.is_active ? 1 : .55 }}>
          <td className="font-semibold">Class {row.class_name}-{row.section}</td><td>{row.room_number || '—'}</td><td>{row.academic_year}</td><td>{row.student_count}</td><td>{row.teacher_count}</td><td><span className={`badge ${row.is_active ? 'badge-green' : 'badge-red'}`}>{row.is_active ? 'ACTIVE' : 'ARCHIVED'}</span></td>
          <td><div className="flex gap-2"><button className="text-xs font-semibold" style={{ color: 'var(--saffron)' }} onClick={() => startEdit(row)}>Edit</button>{row.is_active && <button className="text-xs font-semibold" style={{ color: '#C62828' }} disabled={archive.isPending} onClick={() => { if(confirm(`Archive Class ${row.class_name}-${row.section}?`)) archive.mutate(row.id); }}>Archive</button>}</div></td>
        </tr>)}
      </tbody></table>{!rows.length && <div className="py-10 text-center" style={{ color: 'var(--slate)' }}>No classes configured.</div>}</div>}
    </div>
  </div>;
}
