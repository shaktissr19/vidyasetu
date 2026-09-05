'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  createDiagnosticAssessment,
  getConceptPrerequisites,
  getDiagnosticAssessments,
  getDiagnosticConcepts,
  getDiagnosticQuestions,
  replaceConceptPrerequisites,
} from '@/services/diagnosticAdminService';
import { apiErrorText } from '@/utils/errors';

const inputStyle = { width: '100%', marginTop: 5, padding: '9px 10px', borderRadius: 8, background: 'rgba(255,255,255,.05)', color: 'white', border: '1px solid rgba(255,255,255,.12)' } as const;
const labelStyle = { display: 'block', color: 'rgba(255,255,255,.65)', fontSize: 12, fontWeight: 800 } as const;

type DraftPrerequisite = { conceptId: string; strength: 'HELPFUL' | 'REQUIRED'; rationale: string };

export default function DiagnosticBuilderPage() {
  const queryClient = useQueryClient();
  const [classNumber, setClassNumber] = useState(8);
  const [conceptId, setConceptId] = useState('');
  const [title, setTitle] = useState('');
  const [titleHi, setTitleHi] = useState('');
  const [summary, setSummary] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [prerequisites, setPrerequisites] = useState<DraftPrerequisite[]>([]);

  const conceptsQ = useQuery({
    queryKey: ['diagnostic-admin-concepts', classNumber],
    queryFn: () => getDiagnosticConcepts(classNumber).then((r) => r.data.data || []),
  });
  const questionsQ = useQuery({
    queryKey: ['diagnostic-admin-questions'],
    queryFn: () => getDiagnosticQuestions().then((r) => r.data.data || []),
  });
  const assessmentsQ = useQuery({
    queryKey: ['diagnostic-admin-assessments'],
    queryFn: () => getDiagnosticAssessments().then((r) => (r.data.data || []).filter((item) => item.assessment_type === 'DIAGNOSTIC')),
  });
  const prerequisitesQ = useQuery({
    queryKey: ['diagnostic-prerequisites', conceptId],
    queryFn: () => getConceptPrerequisites(conceptId).then((r) => r.data.data),
    enabled: Boolean(conceptId),
  });

  useEffect(() => {
    if (!conceptId) {
      setPrerequisites([]);
      return;
    }
    if (prerequisitesQ.data) {
      setPrerequisites(prerequisitesQ.data.prerequisites.map((item) => ({
        conceptId: item.conceptId,
        strength: item.strength,
        rationale: item.rationale || '',
      })));
    }
  }, [conceptId, prerequisitesQ.data]);

  const eligible = useMemo(() => (questionsQ.data || []).filter((question) =>
    question.review_status === 'PUBLISHED'
    && question.missing_hindi_option_count === 0
    && Boolean(question.prompt_hi)
    && question.concept_ids.includes(conceptId)
    && (!question.class_min || question.class_min <= classNumber)
    && (!question.class_max || question.class_max >= classNumber),
  ), [questionsQ.data, conceptId, classNumber]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedRows = eligible.filter((item) => selectedSet.has(item.id));
  const difficultyCount = new Set(selectedRows.map((item) => item.difficulty)).size;
  const skillCount = new Set(selectedRows.map((item) => item.cognitive_skill).filter(Boolean)).size;
  const misconceptionCount = selectedRows.filter((item) => item.misconception_code).length;
  const prerequisiteSet = useMemo(() => new Set(prerequisites.map((item) => item.conceptId)), [prerequisites]);
  const prerequisiteCandidates = useMemo(() => (conceptsQ.data || []).filter((item) => item.id !== conceptId), [conceptsQ.data, conceptId]);

  const createMutation = useMutation({
    mutationFn: () => createDiagnosticAssessment({
      title, titleHi, summary, classNumber, conceptId, questionIds: selected,
      timeLimitMins: Math.max(6, Math.min(15, selected.length)), passingPct: 60,
    }),
    onSuccess: async () => {
      toast.success('Diagnostic saved as governed DRAFT');
      setTitle(''); setTitleHi(''); setSummary(''); setSelected([]);
      await queryClient.invalidateQueries({ queryKey: ['diagnostic-admin-assessments'] });
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not create diagnostic')),
  });

  const prerequisiteMutation = useMutation({
    mutationFn: () => replaceConceptPrerequisites(conceptId, prerequisites.map((item) => ({
      conceptId: item.conceptId,
      strength: item.strength,
      rationale: item.rationale.trim() || null,
    }))),
    onSuccess: async () => {
      toast.success('Prerequisite graph saved');
      await queryClient.invalidateQueries({ queryKey: ['diagnostic-prerequisites', conceptId] });
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Prerequisite graph was rejected')),
  });

  function toggle(id: string): void {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function togglePrerequisite(id: string): void {
    setPrerequisites((current) => current.some((item) => item.conceptId === id)
      ? current.filter((item) => item.conceptId !== id)
      : [...current, { conceptId: id, strength: 'REQUIRED', rationale: '' }]);
  }

  function updatePrerequisite(id: string, patch: Partial<Omit<DraftPrerequisite, 'conceptId'>>): void {
    setPrerequisites((current) => current.map((item) => item.conceptId === id ? { ...item, ...patch } : item));
  }

  const enoughDepth = selected.length >= 10 && difficultyCount >= 2 && skillCount >= 2;

  return (
    <div style={{ padding: 24, color: 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#ff9a3c', fontSize: 12, fontWeight: 900, letterSpacing: '.12em' }}>DIAGNOSTIC & ASSESSMENT INTELLIGENCE 2.0</div>
          <h1 style={{ fontSize: 34, margin: '5px 0' }}>Governed Diagnostic Builder</h1>
          <p style={{ color: 'rgba(255,255,255,.62)', maxWidth: 950, lineHeight: 1.65 }}>
            Build concept diagnostics only from reviewed bilingual Question Bank items, then govern the prerequisite graph that powers repair recommendations. Diagnostics measure evidence quality, misconceptions and confidence; they do not automatically award mastery.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}><Link href="/admin/learning/practice" className="btn-secondary">Question Bank</Link><Link href="/admin/learning" className="btn-secondary">Learning Studio</Link></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(420px,.8fr) minmax(520px,1.2fr)', gap: 18, marginTop: 18, alignItems: 'start' }}>
        <section style={{ padding: 17, borderRadius: 14, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.035)' }}>
          <h2 style={{ marginTop: 0 }}>1. Diagnostic identity</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 9 }}>
            <label style={labelStyle}>Class<input style={inputStyle} type="number" min={1} max={12} value={classNumber} onChange={(e) => { setClassNumber(Number(e.target.value)); setConceptId(''); setSelected([]); setPrerequisites([]); }} /></label>
            <label style={labelStyle}>Canonical concept<select style={inputStyle} value={conceptId} onChange={(e) => { setConceptId(e.target.value); setSelected([]); setPrerequisites([]); }}><option value="">Select concept</option>{(conceptsQ.data || []).map((concept) => <option key={concept.id} value={concept.id}>{concept.code} — {concept.name}</option>)}</select></label>
          </div>
          <label style={{ ...labelStyle, marginTop: 9 }}>English title<input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Class 8 Force quick diagnostic" /></label>
          <label style={{ ...labelStyle, marginTop: 9 }}>हिन्दी शीर्षक<input style={inputStyle} value={titleHi} onChange={(e) => setTitleHi(e.target.value)} placeholder="कक्षा 8 बल त्वरित जाँच" /></label>
          <label style={{ ...labelStyle, marginTop: 9 }}>Purpose / learner-facing summary<textarea style={{ ...inputStyle, minHeight: 78 }} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="A short evidence check to identify understanding gaps before the next learning step." /></label>

          <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: 'rgba(79,195,247,.06)', border: '1px solid rgba(79,195,247,.16)' }}>
            <strong>Evidence quality preview</strong>
            <div style={{ color: 'rgba(255,255,255,.62)', fontSize: 12, lineHeight: 1.7, marginTop: 6 }}>
              {selected.length} questions selected · {difficultyCount} difficulty levels · {skillCount} cognitive skills · {misconceptionCount} misconception-tagged items
            </div>
            <div style={{ color: enoughDepth ? '#47d18c' : '#ffd166', fontSize: 12, marginTop: 5 }}>
              {enoughDepth ? '✓ Minimum governed diagnostic depth reached' : 'Select at least 10 published questions spanning 2+ difficulty levels and 2+ cognitive skills.'}
            </div>
          </div>

          <button className="btn-primary" style={{ marginTop: 13 }} disabled={createMutation.isPending || !conceptId || !title.trim() || !titleHi.trim() || !enoughDepth} onClick={() => createMutation.mutate()}>
            {createMutation.isPending ? 'Saving…' : 'Save governed DRAFT diagnostic'}
          </button>
          <div style={{ color: 'rgba(255,255,255,.42)', fontSize: 11, marginTop: 8 }}>Saving never publishes. The normal academic, Hindi, licensing, accessibility and technical quality gates still apply before approval/publication.</div>
        </section>

        <section style={{ padding: 17, borderRadius: 14, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.035)' }}>
          <h2 style={{ marginTop: 0 }}>2. Select reviewed evidence questions</h2>
          {!conceptId ? <div style={{ color: 'rgba(255,255,255,.55)' }}>Choose a canonical concept first.</div> : questionsQ.isLoading ? <div>Loading Question Bank…</div> : eligible.length === 0 ? (
            <div style={{ color: '#ffd166' }}>No published bilingual Question Bank items are currently eligible for this concept. Author and approve questions in Question Bank first.</div>
          ) : (
            <div style={{ maxHeight: 620, overflowY: 'auto', border: '1px solid rgba(255,255,255,.08)', borderRadius: 10 }}>
              {eligible.map((question) => (
                <label key={question.id} style={{ display: 'flex', gap: 10, padding: 11, borderBottom: '1px solid rgba(255,255,255,.06)', cursor: 'pointer', background: selectedSet.has(question.id) ? 'rgba(71,209,140,.06)' : 'transparent' }}>
                  <input type="checkbox" checked={selectedSet.has(question.id)} onChange={() => toggle(question.id)} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}><strong style={{ fontSize: 12 }}>{question.public_code}</strong><span style={{ fontSize: 10, color: '#b9e5ff' }}>{question.difficulty}</span><span style={{ fontSize: 10, color: '#b9e5ff' }}>{question.cognitive_skill || 'SKILL UNSET'}</span>{question.misconception_code ? <span style={{ fontSize: 10, color: '#ffc18b' }}>MISCONCEPTION</span> : null}</div>
                    <div style={{ color: 'rgba(255,255,255,.76)', fontSize: 12, marginTop: 4 }}>{question.prompt}</div>
                    <div style={{ color: 'rgba(255,255,255,.45)', fontSize: 11, marginTop: 3 }}>{question.prompt_hi}</div>
                    {question.misconception_code ? <div style={{ color: '#ffc18b', fontSize: 10, marginTop: 4 }}>{question.misconception_code}</div> : null}
                  </div>
                </label>
              ))}
            </div>
          )}
        </section>
      </div>

      <section style={{ marginTop: 18, padding: 17, borderRadius: 14, border: '1px solid rgba(255,255,255,.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0 }}>3. Govern prerequisite graph</h2>
            <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 12, marginBottom: 0 }}>Same-grade prerequisite links drive “repair the foundation first” recommendations. The API rejects self-links, duplicates, inactive concepts, cross-grade links and cycles.</p>
          </div>
          <button className="btn-primary" disabled={!conceptId || prerequisiteMutation.isPending || prerequisitesQ.isLoading} onClick={() => prerequisiteMutation.mutate()}>
            {prerequisiteMutation.isPending ? 'Saving…' : 'Save prerequisite graph'}
          </button>
        </div>

        {!conceptId ? <div style={{ color: 'rgba(255,255,255,.5)', marginTop: 14 }}>Select a canonical concept above to manage its prerequisites.</div> : prerequisitesQ.isError ? (
          <div style={{ color: '#ff8e8e', marginTop: 14 }}>{apiErrorText(prerequisitesQ.error, 'Could not load prerequisite graph')}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 9, marginTop: 14 }}>
            {prerequisiteCandidates.map((candidate) => {
              const selectedPrerequisite = prerequisites.find((item) => item.conceptId === candidate.id);
              return (
                <div key={candidate.id} style={{ border: `1px solid ${selectedPrerequisite ? 'rgba(71,209,140,.35)' : 'rgba(255,255,255,.08)'}`, borderRadius: 10, padding: 11, background: selectedPrerequisite ? 'rgba(71,209,140,.05)' : 'rgba(255,255,255,.025)' }}>
                  <label style={{ display: 'flex', gap: 9, alignItems: 'start', cursor: 'pointer' }}>
                    <input type="checkbox" checked={prerequisiteSet.has(candidate.id)} onChange={() => togglePrerequisite(candidate.id)} />
                    <div><strong>{candidate.code} — {candidate.name}</strong><div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginTop: 2 }}>{candidate.subject_name || candidate.subject_code}{candidate.chapter_title ? ` · ${candidate.chapter_title}` : ''}</div></div>
                  </label>
                  {selectedPrerequisite ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 8, marginTop: 9 }}>
                      <label style={labelStyle}>Strength<select style={inputStyle} value={selectedPrerequisite.strength} onChange={(e) => updatePrerequisite(candidate.id, { strength: e.target.value as 'HELPFUL' | 'REQUIRED' })}><option value="REQUIRED">Required</option><option value="HELPFUL">Helpful</option></select></label>
                      <label style={labelStyle}>Rationale<input style={inputStyle} value={selectedPrerequisite.rationale} onChange={(e) => updatePrerequisite(candidate.id, { rationale: e.target.value })} placeholder="Why this foundation matters" /></label>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section style={{ marginTop: 18, padding: 17, borderRadius: 14, border: '1px solid rgba(255,255,255,.1)' }}>
        <h2 style={{ marginTop: 0 }}>Diagnostic review queue</h2>
        {assessmentsQ.isError ? <div style={{ color: '#ff8e8e' }}>{apiErrorText(assessmentsQ.error, 'Could not load diagnostics')}</div> : (assessmentsQ.data || []).length === 0 ? <div style={{ color: 'rgba(255,255,255,.5)' }}>No diagnostics authored yet.</div> : (
          <div style={{ display: 'grid', gap: 8 }}>
            {(assessmentsQ.data || []).map((assessment) => (
              <div key={assessment.id} style={{ padding: 11, borderRadius: 9, background: 'rgba(255,255,255,.035)', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div><strong>{assessment.title}</strong><div style={{ color: 'rgba(255,255,255,.45)', fontSize: 11, marginTop: 3 }}>{assessment.title_hi} · {assessment.question_count} questions · {assessment.published_question_count} published</div></div>
                <span style={{ color: assessment.review_status === 'PUBLISHED' ? '#47d18c' : '#ffd166', fontSize: 11, fontWeight: 900 }}>{assessment.review_status.replaceAll('_', ' ')}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
