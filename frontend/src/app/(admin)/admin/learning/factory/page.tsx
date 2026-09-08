'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getLearningMediaUploadUrl } from '@/services/learningMediaService';
import {
  createFactoryAssessment,
  createFactoryQuestion,
  createFactoryResource,
  getContentFactoryGrade,
  getContentFactoryOptions,
  getContentFactorySummary,
  getFactoryQuestions,
  updateContentTarget,
  type ContentTarget,
  type CreateFactoryAssessment,
  type CreateFactoryQuestion,
  type CreateFactoryResource,
} from '@/services/contentFactoryService';
import { apiErrorText } from '@/utils/errors';

const inputStyle = { width: '100%', marginTop: 5, padding: '10px 11px', borderRadius: 9, background: 'rgba(255,255,255,.055)', color: 'white', border: '1px solid rgba(255,255,255,.13)' } as const;
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,.68)' } as const;
const panelStyle = { border: '1px solid rgba(255,255,255,.1)', borderRadius: 14, background: 'rgba(255,255,255,.035)', padding: 16 } as const;

const RESOURCE_TYPES: CreateFactoryResource['resourceType'][] = ['ARTICLE','STORY','ACTIVITY','FLASHCARD','VIDEO','AUDIO','PDF','WORKSHEET','QUIZ','QUESTION_PAPER','INTERACTIVE','GAME','SIMULATION','PRACTICAL','EXTERNAL_LINK'];
const JOURNEY_STAGES = ['SEE','UNDERSTAND','DO','PRACTISE','APPLY','REVISE'] as const;
const TARGET_STATUSES: ContentTarget['target_status'][] = ['PLANNED','REGISTRY_READY','AUTHORING','REVIEW_READY','LEARNER_READY','DEFERRED'];
const FILE_RESOURCE_TYPES = new Set<CreateFactoryResource['resourceType']>(['VIDEO','AUDIO','PDF','WORKSHEET','QUESTION_PAPER','INTERACTIVE','GAME','SIMULATION','PRACTICAL']);

type Tab = 'PLAN' | 'RESOURCE' | 'QUESTION' | 'ASSESSMENT';

function toneForStatus(status: string): string {
  if (status === 'LEARNER_READY') return '#47d18c';
  if (status === 'REVIEW_READY') return '#ffd166';
  if (status === 'AUTHORING' || status === 'REGISTRY_READY') return '#69c8ff';
  if (status === 'DEFERRED') return '#a5adba';
  return '#ff9f80';
}

function metric(label: string, value: string | number) {
  return <div style={{ ...panelStyle, padding: 13 }}><div style={{ fontSize: 24, fontWeight: 900 }}>{value}</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,.48)', marginTop: 3 }}>{label}</div></div>;
}

export default function ContentFactoryPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('PLAN');
  const [gradeCode, setGradeCode] = useState('CLASS_8');
  const [selectedConceptId, setSelectedConceptId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [resourceType, setResourceType] = useState<CreateFactoryResource['resourceType']>('ARTICLE');
  const [resourceForm, setResourceForm] = useState({ title: '', titleHi: '', summary: '', summaryHi: '', body: '', bodyHi: '', transcript: '', transcriptHi: '', sourceCode: 'VIDYASETU_ORIGINAL', sourceUrl: '', attribution: '', externalUrl: '', journeyStage: 'UNDERSTAND' as typeof JOURNEY_STAGES[number], mediaQa: false });
  const [questionForm, setQuestionForm] = useState({ prompt: '', promptHi: '', explanation: '', explanationHi: '', difficulty: 'MEDIUM' as CreateFactoryQuestion['difficulty'], correctOption: 'A', skillCode: '', misconceptionCode: '', misconceptionText: '', misconceptionTextHi: '', options: [{ key: 'A', text: '', textHi: '' }, { key: 'B', text: '', textHi: '' }, { key: 'C', text: '', textHi: '' }, { key: 'D', text: '', textHi: '' }] });
  const [assessmentForm, setAssessmentForm] = useState({ title: '', titleHi: '', summary: '', summaryHi: '', assessmentType: 'PRACTICE' as CreateFactoryAssessment['assessmentType'], timeLimitMins: 20, passingPct: 40, questionIds: [] as string[] });

  const summaryQuery = useQuery({ queryKey: ['content-factory-summary'], queryFn: () => getContentFactorySummary().then((r) => r.data.data) });
  const optionsQuery = useQuery({ queryKey: ['content-factory-options'], queryFn: () => getContentFactoryOptions().then((r) => r.data.data) });
  const gradeQuery = useQuery({ queryKey: ['content-factory-grade', gradeCode], queryFn: () => getContentFactoryGrade(gradeCode).then((r) => r.data.data), enabled: Boolean(gradeCode) });
  const questionsQuery = useQuery({ queryKey: ['content-factory-questions', gradeCode], queryFn: () => getFactoryQuestions(gradeCode).then((r) => r.data.data || []), enabled: Boolean(gradeCode) });

  const selectedGrade = useMemo(() => optionsQuery.data?.grades.find((grade) => grade.code === gradeCode), [optionsQuery.data, gradeCode]);
  const selectedConcept = useMemo(() => gradeQuery.data?.concepts.find((concept) => concept.id === selectedConceptId), [gradeQuery.data, selectedConceptId]);
  const selectedSource = useMemo(() => optionsQuery.data?.sources.find((source) => source.code === resourceForm.sourceCode), [optionsQuery.data, resourceForm.sourceCode]);

  const targetMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateContentTarget>[1] }) => updateContentTarget(id, patch),
    onSuccess: async () => {
      toast.success('Content target updated');
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['content-factory-grade', gradeCode] }), queryClient.invalidateQueries({ queryKey: ['content-factory-summary'] })]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not update target')),
  });

  const resourceMutation = useMutation({
    mutationFn: async () => {
      let fileKey: string | null = null;
      if (file) {
        if (file.size > 100 * 1024 * 1024) throw new Error('Learning file must be 100 MB or smaller');
        const upload = await getLearningMediaUploadUrl(file.name, file.type || 'application/octet-stream').then((r) => r.data.data);
        const response = await fetch(upload.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
        if (!response.ok) throw new Error(`Media upload failed (${response.status})`);
        fileKey = upload.key;
      }
      const source = selectedSource;
      return createFactoryResource({
        title: resourceForm.title.trim(), titleHi: resourceForm.titleHi.trim(), summary: resourceForm.summary.trim(), summaryHi: resourceForm.summaryHi.trim(),
        bodyMarkdown: resourceForm.body.trim() || null, bodyMarkdownHi: resourceForm.bodyHi.trim() || null,
        resourceType, category: 'ACADEMIC', visibility: 'REGISTERED', gradeCodes: [gradeCode],
        sourceCode: resourceForm.sourceCode, licence: source?.default_license || 'VIDYASETU_ORIGINAL', boardCodes: ['COMMON'],
        sourceUrl: resourceForm.sourceUrl.trim() || null, attributionText: resourceForm.attribution.trim() || null,
        externalUrl: resourceForm.externalUrl.trim() || null, fileKey, isOfflineReady: Boolean(fileKey),
        mediaReadiness: FILE_RESOURCE_TYPES.has(resourceType) ? (resourceForm.mediaQa ? 'QA_APPROVED' : fileKey ? 'MEDIA_READY' : 'NOT_STARTED') : 'NOT_STARTED',
        transcript: resourceForm.transcript.trim() || null, transcriptHi: resourceForm.transcriptHi.trim() || null,
        conceptMappings: selectedConceptId ? [{ conceptId: selectedConceptId, journeyStage: resourceForm.journeyStage, isPrimary: true, sortOrder: 1 }] : [],
      });
    },
    onSuccess: async () => {
      toast.success('Bilingual resource created as DRAFT');
      setResourceForm((current) => ({ ...current, title: '', titleHi: '', summary: '', summaryHi: '', body: '', bodyHi: '', transcript: '', transcriptHi: '', mediaQa: false }));
      setFile(null);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['content-factory-grade', gradeCode] }), queryClient.invalidateQueries({ queryKey: ['learning-studio-resources'] })]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not create resource')),
  });

  const questionMutation = useMutation({
    mutationFn: () => createFactoryQuestion({
      prompt: questionForm.prompt.trim(), promptHi: questionForm.promptHi.trim(), questionType: 'MCQ_SINGLE', difficulty: questionForm.difficulty,
      explanation: questionForm.explanation.trim(), explanationHi: questionForm.explanationHi.trim(), correctAnswer: { option: questionForm.correctOption },
      marks: 1, negativeMarks: 0, gradeCodes: [gradeCode], sourceCode: 'VIDYASETU_ORIGINAL', licence: 'VIDYASETU_ORIGINAL', visibility: 'REGISTERED', boardCodes: ['COMMON'],
      options: questionForm.options.map((option) => ({ ...option, text: option.text.trim(), textHi: option.textHi.trim() })),
      conceptIds: selectedConceptId ? [selectedConceptId] : [], cognitiveSkill: 'UNDERSTAND', skillCode: questionForm.skillCode.trim() || null,
      misconceptionCode: questionForm.misconceptionCode.trim() || null, misconceptionText: questionForm.misconceptionText.trim() || null, misconceptionTextHi: questionForm.misconceptionTextHi.trim() || null,
    }),
    onSuccess: async () => {
      toast.success('Bilingual question created as DRAFT');
      setQuestionForm((current) => ({ ...current, prompt: '', promptHi: '', explanation: '', explanationHi: '', skillCode: '', misconceptionCode: '', misconceptionText: '', misconceptionTextHi: '', options: current.options.map((option) => ({ ...option, text: '', textHi: '' })) }));
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['content-factory-questions', gradeCode] }), queryClient.invalidateQueries({ queryKey: ['learning-studio-questions'] })]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not create question')),
  });

  const assessmentMutation = useMutation({
    mutationFn: () => createFactoryAssessment({
      title: assessmentForm.title.trim(), titleHi: assessmentForm.titleHi.trim(), summary: assessmentForm.summary.trim(), summaryHi: assessmentForm.summaryHi.trim(),
      assessmentType: assessmentForm.assessmentType, visibility: 'REGISTERED', gradeCodes: [gradeCode], timeLimitMins: assessmentForm.timeLimitMins,
      passingPct: assessmentForm.passingPct, shuffleQuestions: true, boardCodes: ['COMMON'], questionIds: assessmentForm.questionIds, conceptIds: selectedConceptId ? [selectedConceptId] : [],
    }),
    onSuccess: async () => {
      toast.success('Bilingual assessment created as DRAFT');
      setAssessmentForm((current) => ({ ...current, title: '', titleHi: '', summary: '', summaryHi: '', questionIds: [] }));
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['content-factory-grade', gradeCode] }), queryClient.invalidateQueries({ queryKey: ['learning-studio-assessments'] })]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not create assessment')),
  });

  function chooseGrade(code: string) {
    setGradeCode(code); setSelectedConceptId(''); setAssessmentForm((current) => ({ ...current, questionIds: [] }));
  }

  return (
    <div style={{ padding: 24, color: 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: '#ff9a3c', fontSize: 12, fontWeight: 900, letterSpacing: '.12em' }}>CONTENT PLATFORM 3.0</div>
          <h1 style={{ fontSize: 34, margin: '5px 0' }}>Content Factory</h1>
          <p style={{ maxWidth: 920, color: 'rgba(255,255,255,.62)', lineHeight: 1.65 }}>One production workspace from Pre-Nursery to Class 12. English + Hindi, canonical grade identity, concept mapping, governed DRAFT-first authoring and measurable learner-ready coverage.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Link href="/admin/learning" className="btn-secondary">Learning Studio</Link><Link href="/admin/learning/coverage" className="btn-secondary">Quality Coverage</Link><Link href="/admin/learning/imports" className="btn-secondary">Bulk Import</Link></div>
      </div>

      <div style={{ margin: '14px 0', padding: 12, borderRadius: 11, border: '1px solid rgba(71,209,140,.28)', background: 'rgba(71,209,140,.06)', color: '#c8f7dc', fontSize: 12 }}>
        Publication contract: canonical Grade + English + Hindi + deterministic readiness + mandatory human quality gates. Factory creation always starts in DRAFT.
      </div>

      {summaryQuery.data && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,minmax(120px,1fr))', gap: 10, marginBottom: 16 }}>{metric('Grades', summaryQuery.data.gradeCount)}{metric('Production targets', summaryQuery.data.totals.targets)}{metric('Concepts', summaryQuery.data.totals.concepts)}{metric('Bilingual concepts', summaryQuery.data.totals.bilingualConcepts)}{metric('Published resources', summaryQuery.data.totals.resources)}{metric('Published questions', summaryQuery.data.totals.questions)}</div>}

      <section style={{ ...panelStyle, marginBottom: 16 }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Grade / Stage</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,minmax(90px,1fr))', gap: 8 }}>
          {(optionsQuery.data?.grades || []).map((grade) => <button key={grade.code} type="button" onClick={() => chooseGrade(grade.code)} style={{ padding: '10px 7px', borderRadius: 9, border: grade.code === gradeCode ? '1px solid #4fc3f7' : '1px solid rgba(255,255,255,.11)', background: grade.code === gradeCode ? 'rgba(79,195,247,.13)' : 'rgba(255,255,255,.03)', color: 'white', cursor: 'pointer' }}><div style={{ fontWeight: 900, fontSize: 12 }}>{grade.short_name}</div><div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', marginTop: 2 }}>{grade.name_hi}</div></button>)}
        </div>
      </section>

      {gradeQuery.data && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(130px,1fr))', gap: 10, marginBottom: 16 }}>{metric('Target areas', gradeQuery.data.summary.targetAreas)}{metric('Registered concepts', gradeQuery.data.summary.registeredConcepts)}{metric('Learner ready', gradeQuery.data.summary.learnerReadyConcepts)}{metric('Bilingual concepts', gradeQuery.data.summary.bilingualConcepts)}{metric('Avg completeness', `${gradeQuery.data.summary.averageCompletenessScore}%`)}</div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>{(['PLAN','RESOURCE','QUESTION','ASSESSMENT'] as Tab[]).map((value) => <button key={value} type="button" onClick={() => setTab(value)} className={tab === value ? 'btn-primary' : 'btn-secondary'}>{value === 'PLAN' ? 'Coverage plan' : `Author ${value.toLowerCase()}`}</button>)}</div>

      {tab === 'PLAN' && <div style={{ display: 'grid', gridTemplateColumns: 'minmax(520px,1.2fr) minmax(380px,.8fr)', gap: 16, alignItems: 'start' }}>
        <section style={panelStyle}>
          <h2 style={{ marginTop: 0 }}>{selectedGrade?.name} · {selectedGrade?.name_hi}</h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {(gradeQuery.data?.targets || []).map((target) => <div key={target.id} style={{ padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,.09)', background: 'rgba(255,255,255,.025)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}><div><strong>{target.subject_name}</strong> <span style={{ color: 'rgba(255,255,255,.55)' }}>· {target.subject_name_hi}</span><div style={{ fontSize: 11, color: 'rgba(255,255,255,.42)', marginTop: 3 }}>{target.subject_code} · {target.area_type} · {target.priority}</div></div><span style={{ color: toneForStatus(target.target_status), fontSize: 11, fontWeight: 900 }}>{target.target_status.replaceAll('_',' ')}</span></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7, margin: '9px 0', fontSize: 11 }}><div>Registered <b>{target.registeredConcepts}</b></div><div>Ready <b>{target.learnerReadyConcepts}</b></div><div>Completeness <b>{target.averageCompletenessScore}%</b></div><div>Gap <b>{target.gap ?? '—'}</b></div></div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><select style={{ ...inputStyle, width: 170, marginTop: 0 }} value={target.target_status} onChange={(e) => targetMutation.mutate({ id: target.id, patch: { targetStatus: e.target.value as ContentTarget['target_status'] } })}>{TARGET_STATUSES.map((status) => <option key={status}>{status}</option>)}</select><input style={{ ...inputStyle, width: 120, marginTop: 0 }} type="number" min={0} placeholder="Expected" defaultValue={target.expected_concepts ?? ''} onBlur={(e) => { const value = e.target.value.trim(); targetMutation.mutate({ id: target.id, patch: { expectedConcepts: value ? Number(value) : null } }); }} /></div>
            </div>)}
          </div>
        </section>
        <section style={panelStyle}><h2 style={{ marginTop: 0 }}>Canonical concepts</h2><div style={{ maxHeight: 650, overflowY: 'auto' }}>{(gradeQuery.data?.concepts || []).map((concept) => <button key={concept.id} type="button" onClick={() => setSelectedConceptId(concept.id)} style={{ width: '100%', textAlign: 'left', padding: 11, border: 0, borderBottom: '1px solid rgba(255,255,255,.07)', background: selectedConceptId === concept.id ? 'rgba(79,195,247,.1)' : 'transparent', color: 'white', cursor: 'pointer' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong>{concept.name}</strong><span style={{ color: concept.readiness.learnerReady ? '#47d18c' : '#ffd166', fontWeight: 900 }}>{concept.readiness.score}%</span></div><div style={{ fontSize: 10, color: 'rgba(255,255,255,.45)', marginTop: 3 }}>{concept.subject_code} · {concept.code}</div>{concept.readiness.blockers[0] && <div style={{ fontSize: 10, color: '#ffc1b8', marginTop: 4 }}>{concept.readiness.blockers[0]}</div>}</button>)}</div></section>
      </div>}

      {tab !== 'PLAN' && <div style={{ ...panelStyle, marginBottom: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><label style={labelStyle}>Selected grade<input style={inputStyle} value={`${selectedGrade?.name || gradeCode} · ${selectedGrade?.name_hi || ''}`} disabled /></label><label style={labelStyle}>Canonical concept<select style={inputStyle} value={selectedConceptId} onChange={(e) => setSelectedConceptId(e.target.value)}><option value="">No concept selected</option>{(gradeQuery.data?.concepts || []).map((concept) => <option key={concept.id} value={concept.id}>{concept.subject_code} · {concept.name} / {concept.name_hi || 'Hindi pending'}</option>)}</select></label>{selectedConcept && <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'rgba(255,255,255,.48)' }}>{selectedConcept.code} · readiness {selectedConcept.readiness.score}%</div>}</div>}

      {tab === 'RESOURCE' && <section style={panelStyle}><h2 style={{ marginTop: 0 }}>Author bilingual Resource</h2><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><label style={labelStyle}>English title<input style={inputStyle} value={resourceForm.title} onChange={(e) => setResourceForm((v) => ({ ...v, title: e.target.value }))} /></label><label style={labelStyle}>हिन्दी शीर्षक<input style={inputStyle} value={resourceForm.titleHi} onChange={(e) => setResourceForm((v) => ({ ...v, titleHi: e.target.value }))} /></label><label style={labelStyle}>English summary<textarea style={{ ...inputStyle, minHeight: 80 }} value={resourceForm.summary} onChange={(e) => setResourceForm((v) => ({ ...v, summary: e.target.value }))} /></label><label style={labelStyle}>हिन्दी सारांश<textarea style={{ ...inputStyle, minHeight: 80 }} value={resourceForm.summaryHi} onChange={(e) => setResourceForm((v) => ({ ...v, summaryHi: e.target.value }))} /></label><label style={labelStyle}>Resource type<select style={inputStyle} value={resourceType} onChange={(e) => { setResourceType(e.target.value as CreateFactoryResource['resourceType']); setFile(null); }}>{RESOURCE_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label><label style={labelStyle}>Learning stage<select style={inputStyle} value={resourceForm.journeyStage} onChange={(e) => setResourceForm((v) => ({ ...v, journeyStage: e.target.value as typeof JOURNEY_STAGES[number] }))}>{JOURNEY_STAGES.map((stage) => <option key={stage}>{stage}</option>)}</select></label></div>
        {['ARTICLE','STORY','ACTIVITY'].includes(resourceType) && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}><label style={labelStyle}>English content<textarea style={{ ...inputStyle, minHeight: 180 }} value={resourceForm.body} onChange={(e) => setResourceForm((v) => ({ ...v, body: e.target.value }))} /></label><label style={labelStyle}>हिन्दी सामग्री<textarea style={{ ...inputStyle, minHeight: 180 }} value={resourceForm.bodyHi} onChange={(e) => setResourceForm((v) => ({ ...v, bodyHi: e.target.value }))} /></label></div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}><label style={labelStyle}>Source<select style={inputStyle} value={resourceForm.sourceCode} onChange={(e) => setResourceForm((v) => ({ ...v, sourceCode: e.target.value }))}>{(optionsQuery.data?.sources || []).map((source) => <option key={source.code} value={source.code}>{source.name}</option>)}</select></label>{resourceForm.sourceCode !== 'VIDYASETU_ORIGINAL' && <label style={labelStyle}>Source URL<input style={inputStyle} value={resourceForm.sourceUrl} onChange={(e) => setResourceForm((v) => ({ ...v, sourceUrl: e.target.value }))} /></label>}</div>
        {FILE_RESOURCE_TYPES.has(resourceType) && <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><label style={labelStyle}>Upload media / document<input style={inputStyle} type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label><label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8, marginTop: 25 }}><input type="checkbox" checked={resourceForm.mediaQa} onChange={(e) => setResourceForm((v) => ({ ...v, mediaQa: e.target.checked }))} /> Media QA approved</label><label style={labelStyle}>English transcript / accessibility text<textarea style={{ ...inputStyle, minHeight: 100 }} value={resourceForm.transcript} onChange={(e) => setResourceForm((v) => ({ ...v, transcript: e.target.value }))} /></label><label style={labelStyle}>हिन्दी ट्रांसक्रिप्ट / accessibility text<textarea style={{ ...inputStyle, minHeight: 100 }} value={resourceForm.transcriptHi} onChange={(e) => setResourceForm((v) => ({ ...v, transcriptHi: e.target.value }))} /></label></div>}
        {resourceType === 'EXTERNAL_LINK' && <label style={{ ...labelStyle, marginTop: 10 }}>External URL<input style={inputStyle} value={resourceForm.externalUrl} onChange={(e) => setResourceForm((v) => ({ ...v, externalUrl: e.target.value }))} /></label>}
        <button type="button" className="btn-primary" style={{ marginTop: 14 }} disabled={resourceMutation.isPending} onClick={() => resourceMutation.mutate()}>{resourceMutation.isPending ? 'Creating…' : 'Create Resource as DRAFT'}</button></section>}

      {tab === 'QUESTION' && <section style={panelStyle}><h2 style={{ marginTop: 0 }}>Author bilingual MCQ</h2><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><label style={labelStyle}>English question<textarea style={{ ...inputStyle, minHeight: 90 }} value={questionForm.prompt} onChange={(e) => setQuestionForm((v) => ({ ...v, prompt: e.target.value }))} /></label><label style={labelStyle}>हिन्दी प्रश्न<textarea style={{ ...inputStyle, minHeight: 90 }} value={questionForm.promptHi} onChange={(e) => setQuestionForm((v) => ({ ...v, promptHi: e.target.value }))} /></label></div><div style={{ marginTop: 10, display: 'grid', gap: 8 }}>{questionForm.options.map((option, index) => <div key={option.key} style={{ display: 'grid', gridTemplateColumns: '42px 1fr 1fr', gap: 8, alignItems: 'end' }}><div style={{ fontWeight: 900, paddingBottom: 10 }}>{option.key}</div><label style={labelStyle}>English option<input style={inputStyle} value={option.text} onChange={(e) => setQuestionForm((v) => ({ ...v, options: v.options.map((item, i) => i === index ? { ...item, text: e.target.value } : item) }))} /></label><label style={labelStyle}>हिन्दी विकल्प<input style={inputStyle} value={option.textHi} onChange={(e) => setQuestionForm((v) => ({ ...v, options: v.options.map((item, i) => i === index ? { ...item, textHi: e.target.value } : item) }))} /></label></div>)}</div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 10 }}><label style={labelStyle}>Correct option<select style={inputStyle} value={questionForm.correctOption} onChange={(e) => setQuestionForm((v) => ({ ...v, correctOption: e.target.value }))}>{questionForm.options.map((option) => <option key={option.key}>{option.key}</option>)}</select></label><label style={labelStyle}>Difficulty<select style={inputStyle} value={questionForm.difficulty} onChange={(e) => setQuestionForm((v) => ({ ...v, difficulty: e.target.value as CreateFactoryQuestion['difficulty'] }))}>{['FOUNDATION','EASY','MEDIUM','HARD','CHALLENGE'].map((value) => <option key={value}>{value}</option>)}</select></label><label style={labelStyle}>Skill code<input style={inputStyle} value={questionForm.skillCode} onChange={(e) => setQuestionForm((v) => ({ ...v, skillCode: e.target.value }))} /></label></div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}><label style={labelStyle}>English explanation<textarea style={{ ...inputStyle, minHeight: 90 }} value={questionForm.explanation} onChange={(e) => setQuestionForm((v) => ({ ...v, explanation: e.target.value }))} /></label><label style={labelStyle}>हिन्दी व्याख्या<textarea style={{ ...inputStyle, minHeight: 90 }} value={questionForm.explanationHi} onChange={(e) => setQuestionForm((v) => ({ ...v, explanationHi: e.target.value }))} /></label><label style={labelStyle}>Misconception code<input style={inputStyle} value={questionForm.misconceptionCode} onChange={(e) => setQuestionForm((v) => ({ ...v, misconceptionCode: e.target.value }))} /></label><div /></div><button type="button" className="btn-primary" style={{ marginTop: 14 }} disabled={questionMutation.isPending} onClick={() => questionMutation.mutate()}>{questionMutation.isPending ? 'Creating…' : 'Create Question as DRAFT'}</button></section>}

      {tab === 'ASSESSMENT' && <section style={panelStyle}><h2 style={{ marginTop: 0 }}>Build bilingual Assessment</h2><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><label style={labelStyle}>English title<input style={inputStyle} value={assessmentForm.title} onChange={(e) => setAssessmentForm((v) => ({ ...v, title: e.target.value }))} /></label><label style={labelStyle}>हिन्दी शीर्षक<input style={inputStyle} value={assessmentForm.titleHi} onChange={(e) => setAssessmentForm((v) => ({ ...v, titleHi: e.target.value }))} /></label><label style={labelStyle}>English summary<textarea style={{ ...inputStyle, minHeight: 80 }} value={assessmentForm.summary} onChange={(e) => setAssessmentForm((v) => ({ ...v, summary: e.target.value }))} /></label><label style={labelStyle}>हिन्दी सारांश<textarea style={{ ...inputStyle, minHeight: 80 }} value={assessmentForm.summaryHi} onChange={(e) => setAssessmentForm((v) => ({ ...v, summaryHi: e.target.value }))} /></label><label style={labelStyle}>Assessment type<select style={inputStyle} value={assessmentForm.assessmentType} onChange={(e) => setAssessmentForm((v) => ({ ...v, assessmentType: e.target.value as CreateFactoryAssessment['assessmentType'] }))}>{['DIAGNOSTIC','PRACTICE','CHAPTER_TEST','UNIT_TEST','MOCK','DAILY'].map((value) => <option key={value}>{value}</option>)}</select></label><label style={labelStyle}>Time limit (minutes)<input style={inputStyle} type="number" min={1} max={300} value={assessmentForm.timeLimitMins} onChange={(e) => setAssessmentForm((v) => ({ ...v, timeLimitMins: Number(e.target.value) }))} /></label></div><div style={{ marginTop: 12, fontWeight: 900 }}>Questions for {selectedGrade?.short_name}</div><div style={{ maxHeight: 330, overflowY: 'auto', marginTop: 8, border: '1px solid rgba(255,255,255,.08)', borderRadius: 10 }}>{(questionsQuery.data || []).map((question) => { const checked = assessmentForm.questionIds.includes(question.id); return <label key={question.id} style={{ display: 'flex', gap: 9, padding: 10, borderBottom: '1px solid rgba(255,255,255,.06)', cursor: 'pointer' }}><input type="checkbox" checked={checked} onChange={(e) => setAssessmentForm((v) => ({ ...v, questionIds: e.target.checked ? [...v.questionIds, question.id] : v.questionIds.filter((id) => id !== question.id) }))} /><div><div style={{ fontSize: 12, fontWeight: 800 }}>{question.prompt}</div><div style={{ fontSize: 10, color: 'rgba(255,255,255,.46)', marginTop: 2 }}>{question.public_code} · {question.difficulty} · {question.review_status}</div></div></label>; })}</div><div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,.52)' }}>{assessmentForm.questionIds.length} question(s) selected. Assessment publication remains blocked until its questions pass publication readiness.</div><button type="button" className="btn-primary" style={{ marginTop: 14 }} disabled={assessmentMutation.isPending || assessmentForm.questionIds.length === 0} onClick={() => assessmentMutation.mutate()}>{assessmentMutation.isPending ? 'Creating…' : 'Create Assessment as DRAFT'}</button></section>}
    </div>
  );
}
