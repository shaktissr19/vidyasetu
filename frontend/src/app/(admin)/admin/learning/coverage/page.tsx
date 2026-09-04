'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import toast from 'react-hot-toast';
import LearningQualityPanel from '@/components/admin/LearningQualityPanel';
import {
  getLearningCoverage,
  updateLearningStudioConcept,
  type LearningCoverageConcept,
  type UpdateLearningStudioConcept,
} from '@/services/adminLearningService';
import { apiErrorText } from '@/utils/errors';

function readinessTone(score: number, ready: boolean): string {
  if (ready) return '#47d18c';
  if (score >= 75) return '#ffd166';
  return '#ff8d7a';
}

export default function LearningCoveragePage() {
  const queryClient = useQueryClient();
  const [classNumber, setClassNumber] = useState(8);
  const [subject, setSubject] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<UpdateLearningStudioConcept>({});

  const coverageQuery = useQuery({
    queryKey: ['learning-coverage', classNumber, subject],
    queryFn: () => getLearningCoverage({ class: classNumber, subject: subject.trim() || undefined }).then((response) => response.data.data),
  });

  const selected = useMemo(
    () => coverageQuery.data?.concepts.find((concept) => concept.id === selectedId) || null,
    [coverageQuery.data, selectedId],
  );

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

  function chooseConcept(concept: LearningCoverageConcept): void {
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
    <div style={{ padding: 24, color: 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#ff9a3c', fontSize: 12, fontWeight: 900, letterSpacing: '.12em' }}>LEARNING & CONTENT 2.0</div>
          <h1 style={{ fontSize: 34, margin: '5px 0' }}>Content Coverage & Quality</h1>
          <p style={{ color: 'rgba(255,255,255,.62)', maxWidth: 900, lineHeight: 1.65 }}>
            Canonical concept completeness is measured across bilingual outcomes, lessons, practice, misconceptions, application, revision, media and mastery. A published resource never makes a concept learner-ready by itself.
          </p>
        </div>
        <Link href="/admin/learning" style={{ color: '#b9dfff', fontWeight: 800 }}>← Learning Studio</Link>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '18px 0' }}>
        <label style={{ fontSize: 12, color: 'rgba(255,255,255,.65)' }}>Class
          <select value={classNumber} onChange={(event) => { setClassNumber(Number(event.target.value)); setSelectedId(null); }} style={{ display: 'block', marginTop: 5, padding: '9px 12px', borderRadius: 9, background: '#111a32', color: 'white', border: '1px solid rgba(255,255,255,.14)' }}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((value) => <option key={value} value={value}>Class {value}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12, color: 'rgba(255,255,255,.65)' }}>Subject code (optional)
          <input value={subject} onChange={(event) => { setSubject(event.target.value.toUpperCase()); setSelectedId(null); }} placeholder="SCIENCE" style={{ display: 'block', marginTop: 5, padding: '9px 12px', borderRadius: 9, background: 'rgba(255,255,255,.05)', color: 'white', border: '1px solid rgba(255,255,255,.14)' }} />
        </label>
      </div>

      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(135px,1fr))', gap: 10, marginBottom: 18 }}>
          {[
            ['Concepts', data.totalConcepts],
            ['Learner ready', data.learnerReadyConcepts],
            ['Review ready', data.reviewReadyConcepts],
            ['Bilingual outcomes', data.bilingualOutcomeConcepts],
            ['Average completeness', `${data.averageCompletenessScore}%`],
          ].map(([label, value]) => (
            <div key={String(label)} style={{ padding: 14, borderRadius: 12, background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.1)' }}>
              <div style={{ fontSize: 24, fontWeight: 900 }}>{value}</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,.48)', marginTop: 3 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px,1.1fr) minmax(420px,.9fr)', gap: 18, alignItems: 'start' }}>
        <section style={{ border: '1px solid rgba(255,255,255,.1)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: 13, background: 'rgba(255,255,255,.05)', fontWeight: 900 }}>Canonical concepts</div>
          {coverageQuery.isLoading ? <div style={{ padding: 16, color: 'rgba(255,255,255,.55)' }}>Loading coverage…</div> : null}
          {coverageQuery.isError ? <div style={{ padding: 16, color: '#ffc1b8' }}>Coverage could not be loaded.</div> : null}
          <div style={{ maxHeight: 680, overflowY: 'auto' }}>
            {(data?.concepts || []).map((concept) => {
              const tone = readinessTone(concept.readiness.score, concept.readiness.learnerReady);
              const active = concept.id === selectedId;
              return (
                <button key={concept.id} type="button" onClick={() => chooseConcept(concept)} style={{ width: '100%', textAlign: 'left', padding: 13, background: active ? 'rgba(79,195,247,.1)' : 'transparent', border: 0, borderBottom: '1px solid rgba(255,255,255,.07)', color: 'white', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <div><strong>{concept.name}</strong>{concept.name_hi && <span style={{ color: 'rgba(255,255,255,.55)' }}> · {concept.name_hi}</span>}<div style={{ fontSize: 11, color: 'rgba(255,255,255,.42)', marginTop: 4 }}>{concept.code} · {concept.chapter_title || concept.chapter_code || 'No chapter'} · {concept.subject_code}</div></div>
                    <div style={{ color: tone, fontWeight: 900, whiteSpace: 'nowrap' }}>{concept.readiness.score}%</div>
                  </div>
                  {concept.readiness.blockers.length > 0 && <div style={{ marginTop: 6, fontSize: 11, color: '#ffc1b8' }}>{concept.readiness.blockers[0]}</div>}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          {!selected ? (
            <div style={{ padding: 18, borderRadius: 14, border: '1px solid rgba(255,255,255,.1)', color: 'rgba(255,255,255,.55)' }}>Select a concept to edit bilingual outcomes and review its quality evidence.</div>
          ) : (
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ padding: 16, borderRadius: 14, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.035)' }}>
                <h2 style={{ marginTop: 0 }}>{selected.name}</h2>
                <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 12, marginBottom: 12 }}>{selected.code} · {selected.grade_name} · {selected.subject_name}</div>
                {[
                  ['Hindi concept name', 'nameHi'],
                  ['English description', 'description'],
                  ['Hindi description', 'descriptionHi'],
                  ['English learning outcome', 'learningOutcome'],
                  ['Hindi learning outcome', 'learningOutcomeHi'],
                ].map(([label, key]) => (
                  <label key={key} style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,.65)', marginBottom: 10 }}>{label}
                    <textarea value={String(draft[key as keyof UpdateLearningStudioConcept] || '')} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} style={{ width: '100%', minHeight: key.includes('Outcome') ? 82 : 62, marginTop: 5, padding: 10, borderRadius: 9, background: 'rgba(255,255,255,.05)', color: 'white', border: '1px solid rgba(255,255,255,.12)' }} />
                  </label>
                ))}
                <button type="button" disabled={updateMutation.isPending} onClick={() => updateMutation.mutate()} className="btn-primary">{updateMutation.isPending ? 'Saving…' : 'Save concept metadata'}</button>
              </div>
              <LearningQualityPanel entityType="CONCEPT" entityId={selected.id} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
