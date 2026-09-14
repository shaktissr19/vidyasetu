'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import LearningQualityPanel from '@/components/admin/LearningQualityPanel';
import { getContentCreatorOptions } from '@/services/contentCreatorService';
import {
  getLearningCoverage,
  updateLearningStudioConcept,
  type LearningCoverageConcept,
  type UpdateLearningStudioConcept,
} from '@/services/adminLearningService';
import { apiErrorText } from '@/utils/errors';

function readinessTone(score: number, ready: boolean): string {
  if (ready) return '#147D4A';
  if (score >= 75) return '#B26A00';
  return '#B42318';
}

export default function LearningCoveragePage() {
  const queryClient = useQueryClient();
  const [classNumber, setClassNumber] = useState(5);
  const [subjectCode, setSubjectCode] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<UpdateLearningStudioConcept>({});

  const optionsQuery = useQuery({ queryKey: ['content-creator-options'], queryFn: () => getContentCreatorOptions().then((response) => response.data.data) });
  const subjects = useMemo(() => {
    const map = new Map<string,string>();
    (optionsQuery.data?.concepts || []).filter((item) => item.class_number === classNumber).forEach((item) => map.set(item.subject_code, item.subject_name || item.subject_code));
    return [...map.entries()].map(([code,name]) => ({ code,name })).sort((a,b) => a.name.localeCompare(b.name));
  }, [optionsQuery.data, classNumber]);

  const coverageQuery = useQuery({
    queryKey: ['learning-coverage', classNumber, subjectCode],
    queryFn: () => getLearningCoverage({ class: classNumber, subject: subjectCode || undefined }).then((response) => response.data.data),
  });
  const selected = useMemo(() => coverageQuery.data?.concepts.find((concept) => concept.id === selectedId) || null, [coverageQuery.data, selectedId]);

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('Select a concept');
      return updateLearningStudioConcept(selected.id, draft);
    },
    onSuccess: async () => {
      toast.success('Concept metadata updated');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['learning-coverage'] }),
        queryClient.invalidateQueries({ queryKey: ['learning-studio-concepts'] }),
        selectedId ? queryClient.invalidateQueries({ queryKey: ['learning-readiness', 'CONCEPT', selectedId] }) : Promise.resolve(),
      ]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not update concept')),
  });

  function chooseConcept(concept: LearningCoverageConcept) {
    setSelectedId(concept.id);
    setDraft({
      nameHi: concept.name_hi || '',
      description: concept.description || '',
      descriptionHi: concept.description_hi || '',
      learningOutcome: concept.learning_outcome || '',
      learningOutcomeHi: concept.learning_outcome_hi || '',
    });
  }

  const data = coverageQuery.data;

  return (
    <div className="admin-page" style={{ padding: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <div style={{ color: '#FF6B00', fontSize: 12, fontWeight: 900, letterSpacing: '.12em' }}>LEARNING QUALITY</div>
          <h1 style={{ fontSize: 34, margin: '5px 0' }}>Content Coverage & Quality</h1>
          <p className="admin-muted" style={{ maxWidth: 850, lineHeight: 1.65 }}>See what each class and subject is missing, then create the missing lesson, bilingual outcome, video, practice or assessment.</p>
        </div>
        <Link href="/admin/learning/creator" className="btn-primary">Create Missing Content</Link>
      </div>

      <section className="admin-panel" style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '200px 280px 1fr', gap: 12, alignItems: 'end' }}>
          <label className="admin-label">Class<select className="admin-select" value={classNumber} onChange={(event) => { setClassNumber(Number(event.target.value)); setSubjectCode(''); setSelectedId(null); }}>{Array.from({ length: 12 }, (_, i) => i + 1).map((value) => <option key={value} value={value}>Class {value}</option>)}</select></label>
          <label className="admin-label">Subject<select className="admin-select" value={subjectCode} onChange={(event) => { setSubjectCode(event.target.value); setSelectedId(null); }}><option value="">All subjects</option>{subjects.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
          <div style={{ color: '#667085', fontSize: 12, paddingBottom: 10 }}>Choose a real subject from the curriculum. This replaces the previous free-text field that looked selected even when it was only placeholder text.</div>
        </div>
      </section>

      {data && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(135px,1fr))', gap: 10, marginBottom: 16 }}>
        {[
          ['Concepts', data.totalConcepts],
          ['Learner ready', data.learnerReadyConcepts],
          ['Review ready', data.reviewReadyConcepts],
          ['Bilingual outcomes', data.bilingualOutcomeConcepts],
          ['Average completeness', `${data.averageCompletenessScore}%`],
        ].map(([label,value]) => <div key={String(label)} className="admin-panel" style={{ padding: 15 }}><div style={{ fontSize: 25, fontWeight: 900, color: '#14213D' }}>{value}</div><div style={{ fontSize: 11, color: '#667085', marginTop: 3 }}>{label}</div></div>)}
      </div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px,1.05fr) minmax(430px,.95fr)', gap: 16, alignItems: 'start' }}>
        <section className="admin-panel" style={{ overflow: 'hidden' }}>
          <div style={{ padding: 14, borderBottom: '1px solid #D7E0EA', fontWeight: 900, background: '#F8FAFC' }}>Canonical concepts</div>
          {coverageQuery.isLoading && <div style={{ padding: 16, color: '#667085' }}>Loading coverage…</div>}
          {coverageQuery.isError && <div style={{ padding: 16, color: '#B42318' }}>Coverage could not be loaded.</div>}
          <div style={{ maxHeight: 680, overflowY: 'auto' }}>
            {(data?.concepts || []).map((concept) => {
              const tone = readinessTone(concept.readiness.score, concept.readiness.learnerReady);
              const active = concept.id === selectedId;
              return <button key={concept.id} type="button" onClick={() => chooseConcept(concept)} style={{ width: '100%', textAlign: 'left', padding: 14, background: active ? '#FFF7F0' : '#FFFFFF', border: 0, borderLeft: active ? '4px solid #FF6B00' : '4px solid transparent', borderBottom: '1px solid #E7ECF2', color: '#14213D', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><div><strong>{concept.name}</strong>{concept.name_hi && <span style={{ color: '#667085' }}> · {concept.name_hi}</span>}<div style={{ fontSize: 11, color: '#667085', marginTop: 4 }}>{concept.code} · {concept.chapter_title || concept.chapter_code || 'No chapter'} · {concept.subject_code}</div></div><div style={{ color: tone, fontWeight: 900, whiteSpace: 'nowrap' }}>{concept.readiness.score}%</div></div>
                {concept.readiness.blockers.length > 0 && <div style={{ marginTop: 6, fontSize: 11, color: '#B42318' }}>{concept.readiness.blockers[0]}</div>}
              </button>;
            })}
            {!coverageQuery.isLoading && !(data?.concepts || []).length && <div style={{ padding: 18, color: '#667085' }}>No concepts found for this class/subject.</div>}
          </div>
        </section>

        <section>
          {!selected ? <div className="admin-panel" style={{ padding: 20, color: '#667085' }}>Select a concept to see exactly what is missing and update bilingual learning outcomes.</div> : <div style={{ display: 'grid', gap: 14 }}>
            <div className="admin-panel" style={{ padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}><div><h2 style={{ marginTop: 0, marginBottom: 4 }}>{selected.name}</h2><div style={{ color: '#667085', fontSize: 12 }}>{selected.code} · {selected.grade_name} · {selected.subject_name}</div></div><Link href="/admin/learning/creator" style={{ color: '#C2410C', fontWeight: 900, textDecoration: 'none' }}>Create content →</Link></div>
              {[
                ['Hindi concept name','nameHi'],['English description','description'],['Hindi description','descriptionHi'],['English learning outcome','learningOutcome'],['Hindi learning outcome','learningOutcomeHi'],
              ].map(([label,key]) => <label key={key} className="admin-label" style={{ marginTop: 10 }}>{label}<textarea className="admin-textarea" style={{ minHeight: key.includes('Outcome') ? 82 : 62 }} value={String(draft[key as keyof UpdateLearningStudioConcept] || '')} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} /></label>)}
              <button type="button" disabled={updateMutation.isPending} onClick={() => updateMutation.mutate()} className="btn-primary" style={{ marginTop: 10 }}>{updateMutation.isPending ? 'Saving…' : 'Save concept metadata'}</button>
            </div>
            <LearningQualityPanel entityType="CONCEPT" entityId={selected.id} />
          </div>}
        </section>
      </div>
    </div>
  );
}
