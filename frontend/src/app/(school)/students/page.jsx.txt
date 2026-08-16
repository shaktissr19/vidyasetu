'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getStudents, getClasses } from '@/services/schoolService';
import { SectionHeader, CardSkeleton, StatusBadge, TableSkeleton } from '@/components/ui/index';
import useLanguageStore from '@/store/languageStore';
import toast from 'react-hot-toast';

export default function SchoolStudentsPage() {
  const { t } = useLanguageStore();
  const [search,  setSearch]  = useState('');
  const [classId, setClassId] = useState('');
  const [page,    setPage]    = useState(1);

  const { data: classesRes } = useQuery({ queryKey: ['school-classes'], queryFn: () => getClasses().then(r => r.data.data) });
  const classes = classesRes || [];

  const { data, isLoading } = useQuery({
    queryKey: ['school-students', search, classId, page],
    queryFn:  () => getStudents({ search, classId, page, limit: 20 }).then(r => r.data),
    keepPreviousData: true,
  });

  const students = data?.data || [];
  const meta     = data?.meta || {};

  return (
    <div className="animate-fade-up">
      <SectionHeader title={`👨‍🎓 ${t('छात्र प्रबंधन', 'Student Management')}`} sub={`${meta.total || 0} ${t('कुल छात्र', 'total students')}`}>
        <button className="btn-outline text-sm" onClick={() => toast('📥 Student import template downloaded')}>📥 {t('बल्क आयात', 'Bulk Import')}</button>
        <button className="btn-primary text-sm" onClick={() => toast('📝 Add student form — enter name, mobile, class')}>+ {t('छात्र जोड़ें', 'Add Student')}</button>
      </SectionHeader>

      {/* Filters */}
      <div className="card mb-5">
        <div className="flex flex-wrap gap-3">
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder={`🔍 ${t('नाम / रोल नंबर खोजें...', 'Search by name / roll no...')}`}
            className="input flex-1 min-w-[200px]" />
          <select value={classId} onChange={e => { setClassId(e.target.value); setPage(1); }}
            className="input select w-auto min-w-[140px]">
            <option value="">{t('सभी कक्षाएँ', 'All Classes')}</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>Class {c.class_name}{c.section ? `-${c.section}` : ''}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        {isLoading ? <TableSkeleton rows={8} cols={6} /> : students.length === 0 ? (
          <div className="py-12 text-center">
            <div className="text-4xl mb-3">👨‍🎓</div>
            <p className="font-display font-bold" style={{ color: 'var(--navy)' }}>{t('कोई छात्र नहीं', 'No students found')}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>{t('रोल', 'Roll')}</th>
                    <th>{t('नाम', 'Name')}</th>
                    <th>{t('कक्षा', 'Class')}</th>
                    <th>{t('मोबाइल', 'Mobile')}</th>
                    <th>{t('उपस्थिति', 'Attendance')}</th>
                    <th>{t('फीस', 'Fee')}</th>
                    <th>{t('कार्रवाई', 'Action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map(s => (
                    <tr key={s.id}>
                      <td className="font-mono text-xs">{s.roll_number || '—'}</td>
                      <td className="font-semibold">{s.name}</td>
                      <td>Class {s.class_name}{s.section ? `-${s.section}` : ''}</td>
                      <td className="font-mono text-sm">{s.mobile}</td>
                      <td>
                        <span style={{ color: s.attendance_pct >= 85 ? 'var(--forest)' : s.attendance_pct >= 75 ? 'var(--saffron)' : '#C62828', fontWeight: 700 }}>
                          {s.attendance_pct ? `${Math.round(s.attendance_pct)}%` : '—'}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={s.fee_status === 'PAID' ? 'PAID' : s.fee_status === 'OVERDUE' ? 'OVERDUE' : 'PENDING'} />
                      </td>
                      <td>
                        <button className="text-xs font-semibold px-3 py-1 rounded-lg transition-colors"
                          style={{ background: 'var(--saffron-pale)', color: 'var(--saffron)' }}
                          onClick={() => toast(`Viewing ${s.name}'s profile`)}>
                          {t('देखें', 'View')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            {meta.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                <p className="text-xs" style={{ color: 'var(--slate)' }}>
                  {t('पेज', 'Page')} {meta.page} {t('का', 'of')} {meta.totalPages}
                </p>
                <div className="flex gap-2">
                  <button className="btn-ghost text-xs" disabled={!meta.hasPrev} onClick={() => setPage(p => p - 1)}>‹ {t('पिछला', 'Prev')}</button>
                  <button className="btn-ghost text-xs" disabled={!meta.hasNext} onClick={() => setPage(p => p + 1)}>{t('अगला', 'Next')} ›</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
