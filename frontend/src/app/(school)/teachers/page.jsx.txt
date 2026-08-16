'use client';
import { useQuery } from '@tanstack/react-query';
import { getTeachers } from '@/services/schoolService';
import { SectionHeader, TableSkeleton } from '@/components/ui/index';
import useLanguageStore from '@/store/languageStore';
import toast from 'react-hot-toast';

export default function TeachersPage() {
  const { t } = useLanguageStore();
  const { data: teachers = [], isLoading } = useQuery({
    queryKey: ['school-teachers'],
    queryFn:  () => getTeachers().then(r => r.data.data),
  });

  const statusColor = { ACTIVE: 'badge-green', ON_LEAVE: 'badge-orange', RESIGNED: 'badge-red' };

  return (
    <div className="animate-fade-up">
      <SectionHeader title={`👩‍🏫 ${t('शिक्षक प्रबंधन', 'Teacher Management')}`} sub={`${teachers.length} ${t('शिक्षक', 'teachers')}`}>
        <button className="btn-primary" onClick={() => toast('📝 Add teacher form')}>+ {t('शिक्षक जोड़ें', 'Add Teacher')}</button>
      </SectionHeader>
      <div className="card">
        {isLoading ? <TableSkeleton rows={5} cols={5} /> : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t('नाम', 'Name')}</th>
                  <th>{t('विषय', 'Subjects')}</th>
                  <th>{t('कक्षाएँ', 'Classes')}</th>
                  <th>{t('मोबाइल', 'Mobile')}</th>
                  <th>{t('स्थिति', 'Status')}</th>
                </tr>
              </thead>
              <tbody>
                {teachers.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8" style={{ color: 'var(--slate)' }}>{t('कोई शिक्षक नहीं', 'No teachers yet')}</td></tr>
                ) : teachers.map(t => (
                  <tr key={t.id}>
                    <td className="font-semibold">{t.name}</td>
                    <td className="text-sm">{(t.subjects || []).filter(Boolean).join(', ') || '—'}</td>
                    <td className="text-sm">{(t.classes || []).filter(Boolean).join(', ') || '—'}</td>
                    <td className="font-mono text-sm">{t.mobile}</td>
                    <td><span className={`badge ${statusColor[t.status] || 'badge-blue'}`}>{t.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
