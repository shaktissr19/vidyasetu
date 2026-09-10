'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import toast from 'react-hot-toast';
import LearningQualityPanel from '@/components/admin/LearningQualityPanel';
import { updateLearningStudioConcept, type UpdateLearningStudioConcept } from '@/services/adminLearningService';
import { getContentFactoryGrade, getContentFactoryOptions, type FactoryConcept } from '@/services/contentFactoryService';
import { apiErrorText } from '@/utils/errors';

const inputStyle = { width: '100%', marginTop: 5, padding: '10px 11px', borderRadius: 9, background: 'rgba(255,255,255,.05)', color: 'white', border: '1px solid rgba(255,255,255,.12)' } as const;

function readinessTone(score: number, ready: boolean): string {
  if (ready) return '#47d18c';
  if (score >= 75) return '#ffd166';
  return '#ff8d7a';
}

export default function LearningCoveragePage() {
  const queryClient = useQueryClient();
  const [gradeCode, setGradeCode] = useState('CLASS_8');
  const [subject, setSubject] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<UpdateLearningStudioConcept>({});

  const optionsQuery = useQuery({
    queryKey: ['content-factory-options'],
    queryFn: () => getContentFactoryOptions().then((r) => r.data.data),
  });
  const coverageQuery = useQuery({
    queryKey: ['content-factory-grade', gradeCode],
    queryFn: () => getContentFactoryGrade(gradeCode).then((r) => r.data.data),
    enabled: Boolean(gradeCode),
  });

  const concepts = useMemo(() => {
    const items = coverageQuery.data?.concepts || [];
    const q = subject.trim().toUpperCase();
    return q ? items.filter((concept) => concept.subject_code.toUpperCase().includes(q)) : items;
  }, [coverageQuery.data, subject]);
  const selected = useMemo(() => concepts.find((concept) => concept.id === selectedId) || null, [concepts, selectedId]);

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('Select a concept');
      return updateLearningStudioConcept(selected.id, draft);
    },
    onSuccess: async () => {
      toast.success('Concept metadata updated');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['content-factory-grade', gradeCode] }),
        queryClient.invalidateQueries({ queryKey: ['content-factory-summary'] }),
        selectedId ? queryClient.invalidateQueries({ queryKey: ['learning-readiness', 'CONCEPT', selectedId] }) : Promise.resolve(),
      ]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not update concept')),
  });

  function chooseConcept(concept: FactoryConcept): void {
    setSelectedId(concept.id);
    setDraft({
      nameHi: concept.name_hi || '',
      learningOutcome: concept.learning_outcome || '',
      learningOutcomeHi: concept.learning_outcome_hi || '',
    });
  }

  const data = coverageQuery.data;
  const summary = data?.summary;

  return (
    <div style={{ padding: 24, color: 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#ff9a3c', fontSize: 12, fontWeight: 900, letterSpacing: '.12em' }}>CONTENT PLATFORM 3.0</div>
          <h1 style={{ fontSize: 34, margin: '5px 0' }}>Content Coverage & Quality</h1>
          <p style={{ color: 'rgba(255,255,255,.62)', maxWidth: 920, lineHeight: 1.65 }}>
            Canonical coverage from Pre-Nursery through Class 12. Learner readiness requires bilingual outcomes, lessons, practice, misconceptions, application, revision, media and mastery evidence.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/admin/learning/factory" className="btn-primary">Content Factory</Link>
          <Link href="/admin/learning" className="btn-secondary">Review Studio</Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px,1fr) minmax(220px,1fr)', gap: 10, margin: '18px 0' }}>
        <label style={{ fontSize: 12, color: 'rgba(255,255,255,.65)', fontWeight: 800 }}>Grade / Stage
          <select value={gradeCode} onChange={(event) => { setGradeCode(event.target.value); setSelectedId(null); }} style={inputStyle}>
            {(optionsQuery.data?.grades || []).map((grade) => <option key={grade.code} value={grade.code}>{grade.short_name} · {grade.name_hi || grade.name}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12, color: 'rgba(255,255,255,.65)', fontWeight: 800 }}>Subject code (optional)
          <input value={subject} onChange={(event) => { setSubject(event.target.value.toUpperCase()); setSelectedId(null); }} placeholder="SCIENCE" style={inputStyle} />
        </label>
      </div>

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(135px,1fr))', gap: 10, marginBottom: 18 }}>
          {[
            ['Target areas', summary.targetAreas],
            ['Registered concepts', summary.registeredConcepts],
            ['Learner ready', summary.learnerReadyConcepts],
            ['Bilingual concepts', summary.bilingualConcepts],
            ['Average completeness', `${summary.averageCompletenessScore}%`],
          ].map(([label, value]) => <div key={String(label)} style={{ padding: 14, borderRadius: 12, background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.1)' }}><div style={{ fontSize: 24, fontWeight: 900 }}>{value}</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,.48)', marginTop: 3 }}>{label}</div></div>)}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px,1.1fr) minmax(420px,.9fr)', gap: 18, alignItems: 'start' }}>
        <section style={{ border: '1px solid rgba(255,255,255,.1)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: 13, background: 'rgba(255,255,255,.05)', fontWeight: 900 }}>{data?.grade.name || gradeCode} · Canonical concepts</div>
          {coverageQuery.isLoading && <div style={{ padding: 16, color: 'rgba(255,255,255,.55)' }}>Loading coverage…</div>}
          {coverageQuery.isError && <div style={{ padding: 16, color: '#ffc1b8' }}>Coverage could not be loaded.</div>}
          {!coverageQuery.isLoading && concepts.length === 0 && <div style={{ padding: 16, color: '#ffd7a6' }}>No canonical concepts are registered for this filter yet. Use Content Factory planning to close the syllabus gap.</div>}
          <div style={{ maxHeight: 680, overflowY: 'auto' }}>
            {concepts.map((concept) => {
              const tone = readinessTone(concept.readiness.score, concept.readiness.learnerReady);
              const active = concept.id === selectedId;
              return <button key={concept.id} type="button" onClick={() => chooseConcept(concept)} style={{ width: '100%', textAlign: 'left', padding: 13, background: active ? 'rgba(79,195,247,.1)' : 'transparent', border: 0, borderBottom: '1px solid rgba(255,255,255,.07)', color: 'white', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><div><strong>{concept.name}</strong>{concept.name_hi && <span style={{ color: 'rgba(255,255,255,.55)' }}> · {concept.name_hi}</span>}<div style={{ fontSize: 11, color: 'rgba(255,255,255,.42)', marginTop: 4 }}>{concept.code} · {concept.chapter_title || concept.chapter_code || 'No chapter'} · {concept.subject_code}</div></div><div style={{ color: tone, fontWeight: 900, whiteSpace: 'nowrap' }}>{concept.readiness.score}%</div></div>
                {concept.readiness.blockers[0] && <div style={{ marginTop: 6, fontSize: 11, color: '#ffc1b8' }}>{concept.readiness.blockers[0]}</div>}
              </button>;
            })}
          </div>
        </section>

        <section>
          {!selected ? <div style={{ padding: 18, borderRadius: 14, border: '1px solid rgba(255,255,255,.1)', color: 'rgba(255,255,255,.55)' }}>Select a concept to edit its bilingual outcome metadata and inspect deterministic quality evidence.</div> : <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ padding: 16, borderRadius: 14, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.035)' }}>
              <h2 style={{ marginTop: 0 }}>{selected.name}</h2>
              <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 12, marginBottom: 12 }}>{selected.code} · {data?.grade.name} · {selected.subject_code}</div>
              <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,.65)', marginBottom: 10 }}>Hindi concept name<textarea value={String(draft.nameHi || '')} onChange={(event) => setDraft((current) => ({ ...current, nameHi: event.target.value }))} style={{ ...inputStyle, minHeight: 62 }} /></label>
              <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,.65)', marginBottom: 10 }}>English learning outcome<textarea value={String(draft.learningOutcome || '')} onChange={(event) => setDraft((current) => ({ ...current, learningOutcome: event.target.value }))} style={{ ...inputStyle, minHeight: 82 }} /></label>
              <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,.65)', marginBottom: 10 }}>Hindi learning outcome<textarea value={String(draft.learningOutcomeHi || '')} onChange={(event) => setDraft((current) => ({ ...current, learningOutcomeHi: event.target.value }))} style={{ ...inputStyle, minHeight: 82 }} /></label>
              <button type="button" disabled={updateMutation.isPending} onClick={() => updateMutation.mutate()} className="btn-primary">{updateMutation.isPending ? 'Saving…' : 'Save concept metadata'}</button>
            </div>
            <LearningQualityPanel entityType="CONCEPT" entityId={selected.id} />
          </div>}
        </section>
      </div>
    </div>
  );
}
