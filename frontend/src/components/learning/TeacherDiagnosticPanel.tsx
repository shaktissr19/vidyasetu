'use client';

import { useQuery } from '@tanstack/react-query';
import { getSchoolDiagnosticOverview } from '@/services/learningVisibilityService';
import useLanguageStore from '@/store/languageStore';
import { apiErrorText } from '@/utils/errors';

export default function TeacherDiagnosticPanel({ classId, subjectCode }: { classId: string; subjectCode: string }) {
  const { t } = useLanguageStore();
  const diagnosticsQ = useQuery({
    queryKey: ['school-learning-diagnostics', classId, subjectCode],
    queryFn: () => getSchoolDiagnosticOverview(classId, subjectCode).then((r) => r.data.data),
    enabled: Boolean(classId && subjectCode),
    staleTime: 15_000,
  });

  if (diagnosticsQ.isLoading) return <div className="card mb-5"><div className="skeleton h-40 rounded-xl" /></div>;
  if (diagnosticsQ.isError) return <div className="card mb-5" style={{ color: '#B42318' }}>{apiErrorText(diagnosticsQ.error, 'Could not load diagnostic intelligence')}</div>;
  const data = diagnosticsQ.data;
  if (!data) return null;

  return (
    <div className="space-y-5 mb-5">
      <div className="card" style={{ borderLeft: '4px solid var(--saffron)' }}>
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div>
            <h2 className="font-display font-bold text-lg" style={{ color: 'var(--navy)' }}>🧠 {t('डायग्नोस्टिक इंटेलिजेंस', 'Diagnostic Intelligence')}</h2>
            <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{t('सिर्फ स्कोर नहीं—कॉन्सेप्ट proficiency, confidence, revision और साझा misconceptions', 'Beyond scores—concept proficiency, confidence, revision and shared misconceptions')}</p>
          </div>
          <span className="status-badge status-active">{data.summary.studentsWithEvidence}/{data.scope.studentCount} with evidence</span>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl" style={{ background: '#FFF0F0' }}><div className="text-2xl font-black" style={{ color: '#B42318' }}>{data.summary.activeMisconceptionStudents}</div><div className="text-xs">{t('misconception signal वाले छात्र', 'Students with misconception signals')}</div></div>
          <div className="p-3 rounded-xl" style={{ background: '#FFF7E8' }}><div className="text-2xl font-black" style={{ color: '#9A6500' }}>{data.summary.lowConfidenceStudents}</div><div className="text-xs">{t('कम confidence', 'Low confidence')}</div></div>
          <div className="p-3 rounded-xl" style={{ background: '#EEF4FF' }}><div className="text-2xl font-black" style={{ color: '#2457A6' }}>{data.summary.reviewDueStudents}</div><div className="text-xs">{t('रिविज़न ड्यू', 'Review due')}</div></div>
          <div className="p-3 rounded-xl" style={{ background: '#ECF8F0' }}><div className="text-2xl font-black" style={{ color: '#176B3A' }}>{data.summary.studentsWithEvidence}</div><div className="text-xs">{t('प्रमाण वाले छात्र', 'Students with evidence')}</div></div>
        </div>
      </div>

      {data.misconceptionClusters.length > 0 ? (
        <div className="card">
          <h3 className="font-display font-bold mb-3" style={{ color: 'var(--navy)' }}>{t('कक्षा में साझा गलतफहमियाँ', 'Shared class misconceptions')}</h3>
          <div className="grid md:grid-cols-2 gap-3">
            {data.misconceptionClusters.slice(0, 8).map((cluster) => {
              const concept = data.concepts.find((item) => item.conceptId === cluster.conceptId);
              return (
                <div key={`${cluster.conceptId}-${cluster.misconceptionCode}`} className="p-3 rounded-xl" style={{ border: '1px solid var(--border)', background: '#FFF9F7' }}>
                  <b>{concept?.name || cluster.conceptId}</b>
                  <div className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{cluster.misconceptionCode}</div>
                  <div className="text-sm mt-2"><strong>{cluster.activeStudents}</strong> active · {cluster.suspectedStudents} suspected · {cluster.affectedStudents} affected</div>
                  <div className="text-xs mt-2" style={{ color: 'var(--slate)' }}>{t('एक ही गलतफहमी कई छात्रों में दिखे तो पूरी कक्षा के लिए targeted explanation/practice अधिक उपयोगी है।', 'When the same misconception appears across students, a targeted class explanation or practice set is more useful than repeating the same test.')}</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="card">
        <h3 className="font-display font-bold mb-3" style={{ color: 'var(--navy)' }}>{t('कॉन्सेप्ट evidence quality', 'Concept evidence quality')}</h3>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Concept</th><th>Avg proficiency</th><th>Avg confidence</th><th>Evidence</th><th>Low confidence</th><th>Review due</th><th>Misconceptions</th></tr></thead>
            <tbody>{data.concepts.map((concept) => (
              <tr key={concept.conceptId}>
                <td><b>{concept.name}</b><div className="text-xs" style={{ color: 'var(--slate)' }}>{concept.code}</div></td>
                <td>{concept.averageProficiency == null ? '—' : `${concept.averageProficiency}%`}</td>
                <td>{concept.averageConfidence == null ? '—' : `${concept.averageConfidence}%`}</td>
                <td>{concept.studentsWithEvidence}</td><td>{concept.lowConfidence}</td><td>{concept.reviewDue}</td><td>{concept.misconceptionSignals}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
