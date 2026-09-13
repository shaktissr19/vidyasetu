'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  createContentCreatorJob,
  generateContentCreatorJob,
  getContentCreatorJob,
  getContentCreatorJobs,
  getContentCreatorOptions,
  materialiseContentCreatorJob,
  reviewContentCreatorJob,
  type CreateCreatorJobPayload,
  type CreatorJobDetail,
  type CreatorLanguageMode,
  type CreatorMode,
  type CreatorSourceInput,
} from '@/services/contentCreatorService';
import type { LearningAccessRequirement, LearningVisibility } from '@/services/adminLearningService';
import { apiErrorText } from '@/utils/errors';

const inputStyle = {
  width: '100%', marginTop: 5, padding: '10px 11px', borderRadius: 9,
  background: 'rgba(255,255,255,.05)', color: 'white', border: '1px solid rgba(255,255,255,.12)',
} as const;
const labelStyle = { display: 'block', color: 'rgba(255,255,255,.68)', fontSize: 12, fontWeight: 800 } as const;
const panelStyle = { padding: 18, borderRadius: 14, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.035)' } as const;
const MODES: Array<{ value: CreatorMode; title: string; detail: string }> = [
  { value: 'CURRICULUM', title: 'From Curriculum', detail: 'Choose a canonical VidyaSetu concept and generate a governed lesson pack.' },
  { value: 'SOURCES', title: 'From Sources', detail: 'Ground the lesson in approved internal/OER evidence or a governed source excerpt.' },
  { value: 'IMPROVE_EXISTING', title: 'Improve Existing', detail: 'Create an improved draft from an approved or published VidyaSetu lesson.' },
];
const LANGUAGES: CreatorLanguageMode[] = ['BILINGUAL','ENGLISH','HINDI'];
const ACCESS: Array<{ value: LearningAccessRequirement; label: string }> = [
  { value: 'PUBLIC', label: 'Public Free' },
  { value: 'REGISTERED', label: 'Registered Free' },
  { value: 'SUBSCRIBER', label: 'Subscriber' },
];
const LICENCES = ['CC_BY','CC_BY_SA','CC_BY_NC_SA','CC_BY_NC_ND','PUBLIC_DOMAIN','EXTERNAL_LINK_ONLY','OTHER'] as const;

interface FormState {
  mode: CreatorMode;
  title: string;
  instructions: string;
  conceptId: string;
  existingResourceId: string;
  classNumber: number;
  boardCodes: string;
  languageMode: CreatorLanguageMode;
  visibility: LearningVisibility;
  accessRequirement: LearningAccessRequirement;
  lesson: boolean;
  revision: boolean;
  activities: boolean;
  questions: boolean;
  assessment: boolean;
  questionCount: number;
}

const INITIAL: FormState = {
  mode: 'CURRICULUM', title: '', instructions: '', conceptId: '', existingResourceId: '',
  classNumber: 8, boardCodes: 'COMMON', languageMode: 'BILINGUAL', visibility: 'REGISTERED',
  accessRequirement: 'REGISTERED', lesson: true, revision: true, activities: true,
  questions: true, assessment: true, questionCount: 10,
};

function statusLabel(value: string): string { return value.replaceAll('_', ' '); }
function dateText(value?: string | null): string { return value ? new Date(value).toLocaleString('en-IN') : '—'; }

export default function AdminAIContentCreatorPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [sources, setSources] = useState<CreatorSourceInput[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [reviewNote, setReviewNote] = useState('');
  const [manual, setManual] = useState({ sourceCode: 'NROER', title: '', sourceUrl: '', licence: 'CC_BY_SA', attributionText: '', excerpt: '' });

  const optionsQuery = useQuery({ queryKey: ['content-creator-options'], queryFn: () => getContentCreatorOptions().then((r) => r.data.data) });
  const jobsQuery = useQuery({ queryKey: ['content-creator-jobs'], queryFn: () => getContentCreatorJobs().then((r) => r.data.data || []) });
  const jobQuery = useQuery({
    queryKey: ['content-creator-job', selectedJobId],
    queryFn: () => getContentCreatorJob(selectedJobId).then((r) => r.data.data),
    enabled: Boolean(selectedJobId),
  });

  const concepts = useMemo(() => (optionsQuery.data?.concepts || []).filter((item) => !form.classNumber || item.class_number === form.classNumber), [optionsQuery.data, form.classNumber]);
  const selectedConcept = useMemo(() => optionsQuery.data?.concepts.find((item) => item.id === form.conceptId), [optionsQuery.data, form.conceptId]);
  const selectedExisting = useMemo(() => optionsQuery.data?.resources.find((item) => item.id === form.existingResourceId), [optionsQuery.data, form.existingResourceId]);

  const refresh = async (jobId?: string) => {
    await queryClient.invalidateQueries({ queryKey: ['content-creator-jobs'] });
    if (jobId) await queryClient.invalidateQueries({ queryKey: ['content-creator-job', jobId] });
  };

  const createMutation = useMutation({
    mutationFn: () => {
      const payload: CreateCreatorJobPayload = {
        mode: form.mode,
        title: form.title.trim(),
        instructions: form.instructions.trim() || null,
        conceptId: form.mode === 'CURRICULUM' ? form.conceptId || null : null,
        existingResourceId: form.mode === 'IMPROVE_EXISTING' ? form.existingResourceId || null : null,
        classNumber: form.classNumber,
        boardCodes: form.boardCodes.split(',').map((v) => v.trim().toUpperCase()).filter(Boolean),
        languageMode: form.languageMode,
        visibility: form.visibility,
        accessRequirement: form.accessRequirement,
        requestedPack: {
          lesson: form.lesson, revision: form.revision, activities: form.activities,
          questions: form.questions, assessment: form.assessment, questionCount: form.questionCount,
        },
        sources: form.mode === 'CURRICULUM' ? sources : sources,
      };
      return createContentCreatorJob(payload);
    },
    onSuccess: async (response) => {
      const id = response.data.data.id;
      toast.success('Creator job staged. No learning content has been published.');
      setSelectedJobId(id);
      await refresh(id);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not create Content Creator job')),
  });

  const generateMutation = useMutation({
    mutationFn: (jobId: string) => generateContentCreatorJob(jobId),
    onSuccess: async (response, jobId) => {
      toast.success(response.data.data.status === 'READY_FOR_REVIEW' ? 'Draft generated and passed automated validation' : 'Draft generated; validation blockers need attention');
      await refresh(jobId);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Content generation failed')),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ jobId, decision }: { jobId: string; decision: 'APPROVE' | 'REJECT' }) => reviewContentCreatorJob(jobId, decision, reviewNote.trim() || null),
    onSuccess: async (response, variables) => {
      toast.success(`Creator job ${statusLabel(response.data.data.status)}`);
      setReviewNote('');
      await refresh(variables.jobId);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Review decision failed')),
  });

  const materialiseMutation = useMutation({
    mutationFn: (jobId: string) => materialiseContentCreatorJob(jobId),
    onSuccess: async (response, jobId) => {
      const result = response.data.data;
      toast.success(`Governed drafts created: lesson + ${result.questionIds.length} questions${result.assessmentId ? ' + assessment' : ''}`);
      await Promise.all([refresh(jobId), queryClient.invalidateQueries({ queryKey: ['learning-studio-resources'] })]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not materialise governed drafts')),
  });

  function changeAccess(accessRequirement: LearningAccessRequirement): void {
    setForm((current) => ({
      ...current,
      accessRequirement,
      visibility: accessRequirement === 'PUBLIC' ? 'PUBLIC' : current.visibility === 'PUBLIC' ? 'REGISTERED' : current.visibility,
    }));
  }

  function changeVisibility(visibility: LearningVisibility): void {
    setForm((current) => ({
      ...current,
      visibility,
      accessRequirement: visibility === 'PUBLIC' ? 'PUBLIC' : current.accessRequirement === 'PUBLIC' ? 'REGISTERED' : current.accessRequirement,
    }));
  }

  function addInternalResource(resourceId: string): void {
    if (!resourceId || sources.some((item) => item.resourceId === resourceId)) return;
    const resource = optionsQuery.data?.resources.find((item) => item.id === resourceId);
    if (!resource) return;
    setSources((current) => [...current, { sourceRole: 'GROUNDING', resourceId, title: resource.title }]);
  }

  function addIntake(intakeId: string): void {
    if (!intakeId || sources.some((item) => item.intakeId === intakeId)) return;
    const intake = optionsQuery.data?.intake.find((item) => item.id === intakeId);
    if (!intake) return;
    setSources((current) => [...current, {
      sourceRole: 'REFERENCE_ONLY', intakeId, title: intake.title,
      sourceCode: intake.source_code, sourceUrl: intake.source_url,
      licence: intake.licence_candidate || 'OTHER', attributionText: intake.attribution_text || null,
    }]);
  }

  function addManualSource(): void {
    if (!manual.sourceUrl.trim() || !manual.sourceCode.trim()) { toast.error('Manual source URL and source code are required'); return; }
    setSources((current) => [...current, {
      sourceRole: manual.excerpt.trim() ? 'GROUNDING' : 'REFERENCE_ONLY',
      sourceCode: manual.sourceCode.trim().toUpperCase(), title: manual.title.trim() || manual.sourceUrl.trim(),
      sourceUrl: manual.sourceUrl.trim(), licence: manual.licence,
      attributionText: manual.attributionText.trim() || null, excerpt: manual.excerpt.trim() || null,
    }]);
    setManual((current) => ({ ...current, title: '', sourceUrl: '', attributionText: '', excerpt: '' }));
  }

  const job = jobQuery.data as CreatorJobDetail | undefined;
  const provider = optionsQuery.data?.provider;

  return (
    <div style={{ padding: 24, color: 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#8bd7ff', fontSize: 12, fontWeight: 900, letterSpacing: '.12em' }}>VIDYASETU HYBRID CONTENT FACTORY</div>
          <h1 style={{ margin: '5px 0', fontSize: 34 }}>AI Content Creator</h1>
          <p style={{ maxWidth: 920, color: 'rgba(255,255,255,.64)', lineHeight: 1.65 }}>
            Admin-only drafting with curriculum grounding, source/licence governance, automated checks and mandatory human approval. AI never publishes directly; materialisation creates normal Learning Studio DRAFT entities only.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/admin/learning" className="btn-secondary">Learning Studio</Link>
          <Link href="/admin/learning/intake" className="btn-secondary">OER Intake</Link>
          <Link href="/admin/learning/coverage" className="btn-secondary">Coverage & quality</Link>
        </div>
      </div>

      <div style={{ margin: '16px 0', padding: 13, borderRadius: 11, border: `1px solid ${provider?.configured ? 'rgba(71,209,140,.3)' : 'rgba(255,190,70,.34)'}`, background: provider?.configured ? 'rgba(71,209,140,.06)' : 'rgba(255,190,70,.07)' }}>
        <strong>{provider?.configured ? 'AI provider ready' : 'AI provider is in mock/safe mode'}</strong>
        <span style={{ marginLeft: 8, color: 'rgba(255,255,255,.68)' }}>
          {provider ? `${provider.name} · ${provider.model}` : 'Loading provider status…'}
          {!provider?.configured ? ' — workflow testing is available, but mock output is intentionally blocked from academic approval.' : ''}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(440px,.92fr) minmax(520px,1.08fr)', gap: 18, alignItems: 'start' }}>
        <section style={panelStyle}>
          <h2 style={{ marginTop: 0 }}>1. Define creation job</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
            {MODES.map((item) => <button key={item.value} type="button" onClick={() => { setForm((v) => ({ ...v, mode: item.value })); setSources([]); }} style={{ textAlign: 'left', padding: 11, borderRadius: 10, border: form.mode === item.value ? '1px solid #4FC3F7' : '1px solid rgba(255,255,255,.12)', background: form.mode === item.value ? 'rgba(79,195,247,.12)' : 'rgba(255,255,255,.03)', color: 'white' }}><strong>{item.title}</strong><div style={{ fontSize: 10, color: 'rgba(255,255,255,.55)', marginTop: 4, lineHeight: 1.4 }}>{item.detail}</div></button>)}
          </div>

          <label style={labelStyle}>Job title<input style={inputStyle} value={form.title} onChange={(e) => setForm((v) => ({ ...v, title: e.target.value }))} placeholder="e.g. Class 8 Science — Force and Pressure" /></label>
          <label style={{ ...labelStyle, marginTop: 10 }}>Admin instructions<textarea style={{ ...inputStyle, minHeight: 84 }} value={form.instructions} onChange={(e) => setForm((v) => ({ ...v, instructions: e.target.value }))} placeholder="Focus, learner level, examples, misconceptions, tone, etc." /></label>

          {form.mode === 'CURRICULUM' && <div style={{ marginTop: 10 }}>
            <label style={labelStyle}>Class<select style={inputStyle} value={form.classNumber} onChange={(e) => { const classNumber = Number(e.target.value); setForm((v) => ({ ...v, classNumber, conceptId: '' })); }}>{Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Class {n}</option>)}</select></label>
            <label style={{ ...labelStyle, marginTop: 8 }}>Canonical concept<select style={inputStyle} value={form.conceptId} onChange={(e) => { const conceptId = e.target.value; const concept = optionsQuery.data?.concepts.find((item) => item.id === conceptId); setForm((v) => ({ ...v, conceptId, title: v.title || concept?.name || '' })); }}><option value="">Select concept…</option>{concepts.map((concept) => <option key={concept.id} value={concept.id}>{concept.subject_name || concept.subject_code} · {concept.chapter_title || 'Concept'} · {concept.name}</option>)}</select></label>
            {selectedConcept && <div style={{ marginTop: 7, fontSize: 11, color: 'rgba(255,255,255,.55)' }}>{selectedConcept.code} · {selectedConcept.grade_code}{selectedConcept.name_hi ? ` · ${selectedConcept.name_hi}` : ''}</div>}
          </div>}

          {form.mode === 'IMPROVE_EXISTING' && <label style={{ ...labelStyle, marginTop: 10 }}>Existing approved/published lesson<select style={inputStyle} value={form.existingResourceId} onChange={(e) => { const id = e.target.value; const resource = optionsQuery.data?.resources.find((item) => item.id === id); setForm((v) => ({ ...v, existingResourceId: id, title: v.title || resource?.title || '' })); }}><option value="">Select lesson…</option>{(optionsQuery.data?.resources || []).map((resource) => <option key={resource.id} value={resource.id}>{resource.title} · {resource.review_status}</option>)}</select>{selectedExisting && <span style={{ display: 'block', marginTop: 5, color: 'rgba(255,255,255,.5)' }}>{selectedExisting.source_code} · {selectedExisting.licence}</span>}</label>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginTop: 12 }}>
            <label style={labelStyle}>Language<select style={inputStyle} value={form.languageMode} onChange={(e) => setForm((v) => ({ ...v, languageMode: e.target.value as CreatorLanguageMode }))}>{LANGUAGES.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label style={labelStyle}>Board codes<input style={inputStyle} value={form.boardCodes} onChange={(e) => setForm((v) => ({ ...v, boardCodes: e.target.value }))} placeholder="COMMON,CBSE" /></label>
            <label style={labelStyle}>Audience visibility<select style={inputStyle} value={form.visibility} onChange={(e) => changeVisibility(e.target.value as LearningVisibility)}>{['PUBLIC','REGISTERED','CLASS_ONLY','SCHOOL_ONLY'].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label style={labelStyle}>Commercial access<select style={inputStyle} value={form.accessRequirement} onChange={(e) => changeAccess(e.target.value as LearningAccessRequirement)}>{ACCESS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          </div>

          <h3 style={{ marginBottom: 7 }}>Pack contents</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7, fontSize: 12 }}>
            {([['lesson','Lesson'],['revision','Revision'],['activities','Activities'],['questions','Questions'],['assessment','Assessment']] as const).map(([key,label]) => <label key={key} style={{ padding: 8, border: '1px solid rgba(255,255,255,.1)', borderRadius: 8 }}><input type="checkbox" checked={form[key]} onChange={(e) => setForm((v) => ({ ...v, [key]: e.target.checked }))} /> <span style={{ marginLeft: 5 }}>{label}</span></label>)}
            <label style={{ padding: 8, border: '1px solid rgba(255,255,255,.1)', borderRadius: 8 }}>Questions <input type="number" min={5} max={30} value={form.questionCount} onChange={(e) => setForm((v) => ({ ...v, questionCount: Number(e.target.value) }))} style={{ width: 48, marginLeft: 5, background: '#172033', color: 'white', border: '1px solid rgba(255,255,255,.13)', borderRadius: 5 }} /></label>
          </div>

          <h3 style={{ marginBottom: 5 }}>2. Governed sources <span style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', fontWeight: 500 }}>({sources.length})</span></h3>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', lineHeight: 1.5 }}>Approved VidyaSetu/OER evidence can ground generation. Arbitrary URLs are not silently scraped: add a verified licence, attribution where required, and an excerpt to use a URL as grounding evidence.</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label style={labelStyle}>Approved VidyaSetu lesson<select style={inputStyle} defaultValue="" onChange={(e) => { addInternalResource(e.target.value); e.currentTarget.value = ''; }}><option value="">Add internal source…</option>{(optionsQuery.data?.resources || []).map((resource) => <option key={resource.id} value={resource.id}>{resource.title}</option>)}</select></label>
            <label style={labelStyle}>Approved OER intake<select style={inputStyle} defaultValue="" onChange={(e) => { addIntake(e.target.value); e.currentTarget.value = ''; }}><option value="">Add OER reference…</option>{(optionsQuery.data?.intake || []).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
          </div>

          <div style={{ marginTop: 10, padding: 10, borderRadius: 9, border: '1px solid rgba(255,255,255,.09)', background: 'rgba(0,0,0,.08)' }}>
            <strong style={{ fontSize: 12 }}>Manual governed source</strong>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginTop: 7 }}>
              <input style={inputStyle} value={manual.sourceCode} onChange={(e) => setManual((v) => ({ ...v, sourceCode: e.target.value }))} placeholder="Source code" />
              <select style={inputStyle} value={manual.licence} onChange={(e) => setManual((v) => ({ ...v, licence: e.target.value }))}>{LICENCES.map((item) => <option key={item}>{item}</option>)}</select>
              <input style={inputStyle} value={manual.title} onChange={(e) => setManual((v) => ({ ...v, title: e.target.value }))} placeholder="Source title" />
              <input style={inputStyle} value={manual.sourceUrl} onChange={(e) => setManual((v) => ({ ...v, sourceUrl: e.target.value }))} placeholder="https://…" />
            </div>
            <input style={inputStyle} value={manual.attributionText} onChange={(e) => setManual((v) => ({ ...v, attributionText: e.target.value }))} placeholder="Required attribution / author / source details" />
            <textarea style={{ ...inputStyle, minHeight: 82 }} value={manual.excerpt} onChange={(e) => setManual((v) => ({ ...v, excerpt: e.target.value }))} placeholder="Verified excerpt for grounding. Leave blank to store as reference-only." />
            <button type="button" className="btn-secondary" style={{ marginTop: 7 }} onClick={addManualSource}>Add governed source</button>
          </div>

          {sources.length > 0 && <div style={{ marginTop: 9, display: 'grid', gap: 6 }}>{sources.map((source, index) => <div key={`${source.resourceId || source.intakeId || source.sourceUrl}-${index}`} style={{ padding: 8, borderRadius: 8, border: '1px solid rgba(255,255,255,.09)', display: 'flex', justifyContent: 'space-between', gap: 8 }}><div><strong style={{ fontSize: 11 }}>{source.title || source.sourceUrl || source.resourceId}</strong><div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)' }}>{source.sourceRole || 'GROUNDING'} · {source.licence || 'licence from registry'}</div></div><button type="button" onClick={() => setSources((current) => current.filter((_, i) => i !== index))} style={{ border: 0, background: 'transparent', color: '#ff9f9f', cursor: 'pointer' }}>Remove</button></div>)}</div>}

          <button type="button" className="btn-primary" disabled={createMutation.isPending || !form.title.trim()} onClick={() => createMutation.mutate()} style={{ marginTop: 14, width: '100%' }}>{createMutation.isPending ? 'Staging…' : 'Create governed job'}</button>
          <div style={{ marginTop: 7, color: 'rgba(255,255,255,.45)', fontSize: 10 }}>Creation only stages a job. Generation, human approval and draft materialisation are separate actions.</div>
        </section>

        <section style={panelStyle}>
          <h2 style={{ marginTop: 0 }}>Creator jobs & review queue</h2>
          <div style={{ maxHeight: 260, overflowY: 'auto', display: 'grid', gap: 7 }}>
            {(jobsQuery.data || []).map((item) => <button key={item.id} type="button" onClick={() => setSelectedJobId(item.id)} style={{ textAlign: 'left', padding: 10, borderRadius: 9, border: selectedJobId === item.id ? '1px solid #4FC3F7' : '1px solid rgba(255,255,255,.09)', background: selectedJobId === item.id ? 'rgba(79,195,247,.1)' : 'rgba(255,255,255,.025)', color: 'white' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong>{item.title}</strong><span style={{ fontSize: 10, color: item.status === 'READY_FOR_REVIEW' ? '#79e7ac' : item.status.includes('FAILED') ? '#ff9f9f' : '#9bdcff' }}>{statusLabel(item.status)}</span></div><div style={{ marginTop: 3, fontSize: 10, color: 'rgba(255,255,255,.48)' }}>{item.mode} · {item.language_mode} · {item.source_count} source(s) · {dateText(item.created_at)}</div></button>)}
            {!jobsQuery.isLoading && !(jobsQuery.data || []).length && <div style={{ color: 'rgba(255,255,255,.5)' }}>No creator jobs yet.</div>}
          </div>

          {job && <div style={{ marginTop: 14 }}>
            <div style={{ padding: 11, borderRadius: 10, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(0,0,0,.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><div><strong>{job.title}</strong><div style={{ fontSize: 11, color: 'rgba(255,255,255,.53)' }}>{job.mode} · {job.language_mode} · {job.access_requirement}</div></div><strong style={{ color: '#9bdcff' }}>{statusLabel(job.status)}</strong></div>
              {job.error_message && <div style={{ marginTop: 8, color: '#ffabab', fontSize: 11 }}>{job.error_message}</div>}
              <div style={{ marginTop: 8, fontSize: 10, color: 'rgba(255,255,255,.48)' }}>Provider: {job.provider || 'not run'} {job.provider_model ? `· ${job.provider_model}` : ''} · Updated {dateText(job.updated_at)}</div>
            </div>

            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 10 }}>
              {['READY_TO_GENERATE','VALIDATION_FAILED','FAILED'].includes(job.status) && <button className="btn-primary" type="button" disabled={generateMutation.isPending} onClick={() => generateMutation.mutate(job.id)}>{generateMutation.isPending ? 'Generating…' : 'Generate draft pack'}</button>}
              {job.status === 'READY_FOR_REVIEW' && <><button className="btn-primary" type="button" disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ jobId: job.id, decision: 'APPROVE' })}>Approve AI draft</button><button className="btn-secondary" type="button" disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ jobId: job.id, decision: 'REJECT' })}>Reject</button></>}
              {job.status === 'APPROVED' && <button className="btn-primary" type="button" disabled={materialiseMutation.isPending} onClick={() => materialiseMutation.mutate(job.id)}>{materialiseMutation.isPending ? 'Creating drafts…' : 'Materialise governed DRAFTS'}</button>}
            </div>
            {['READY_FOR_REVIEW','VALIDATION_FAILED'].includes(job.status) && <textarea style={{ ...inputStyle, minHeight: 54, marginTop: 8 }} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="Academic/language review note (recommended)" />}

            {job.validation_report && <div style={{ marginTop: 12, padding: 10, borderRadius: 9, border: `1px solid ${job.validation_report.passed ? 'rgba(71,209,140,.25)' : 'rgba(255,150,100,.25)'}` }}><strong>Automated validation: {job.validation_report.score}%</strong><div style={{ marginTop: 7, display: 'grid', gap: 4 }}>{job.validation_report.checks.map((check) => <div key={check.code} style={{ fontSize: 11, color: check.passed ? '#bdeed0' : '#ffc0a8' }}>{check.passed ? '✓' : '✕'} {check.code}: {check.message}</div>)}</div></div>}

            {job.sources?.length > 0 && <div style={{ marginTop: 12 }}><strong style={{ fontSize: 12 }}>Source provenance</strong><div style={{ display: 'grid', gap: 5, marginTop: 6 }}>{job.sources.map((source) => <div key={source.id} style={{ padding: 7, borderRadius: 7, background: 'rgba(255,255,255,.03)', fontSize: 10 }}><strong>{source.title}</strong> · {source.source_role} · {source.licence} · adaptation {source.allow_adaptation ? '✓' : '✕'} · commercial {source.allow_commercial ? '✓' : '✕'} · verified {source.verified_for_use ? '✓' : '✕'}</div>)}</div></div>}

            {job.generated_pack && <div style={{ marginTop: 12 }}>
              <strong>Generated pack preview</strong>
              <div style={{ marginTop: 7, padding: 11, borderRadius: 9, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)' }}>
                <h3 style={{ margin: 0 }}>{job.generated_pack.title}</h3>{job.generated_pack.titleHi && <div style={{ marginTop: 3, color: '#c8dcff' }}>{job.generated_pack.titleHi}</div>}
                <p style={{ color: 'rgba(255,255,255,.65)', lineHeight: 1.55 }}>{job.generated_pack.summary}</p>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.53)' }}>{job.generated_pack.learningObjectives?.length || 0} objectives · {job.generated_pack.questions?.length || 0} questions · {job.generated_pack.activities?.length || 0} activities · {job.generated_pack.citations?.length || 0} citations</div>
                <details style={{ marginTop: 9 }}><summary style={{ cursor: 'pointer' }}>English lesson draft</summary><pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', color: 'rgba(255,255,255,.75)', fontSize: 11, lineHeight: 1.55 }}>{job.generated_pack.lessonMarkdown}</pre></details>
                {job.generated_pack.lessonMarkdownHi && <details style={{ marginTop: 7 }}><summary style={{ cursor: 'pointer' }}>Hindi lesson draft</summary><pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', color: 'rgba(255,255,255,.75)', fontSize: 11, lineHeight: 1.55 }}>{job.generated_pack.lessonMarkdownHi}</pre></details>}
              </div>
            </div>}

            {job.outputs?.length > 0 && <div style={{ marginTop: 12, padding: 10, borderRadius: 9, border: '1px solid rgba(71,209,140,.22)', background: 'rgba(71,209,140,.05)' }}><strong>Canonical drafts created</strong><div style={{ marginTop: 5, fontSize: 11, color: '#c8f7dc' }}>{job.outputs.length} linked Learning Studio item(s). They still require the normal DRAFT → SUBMITTED → ACADEMIC REVIEW → APPROVED → PUBLISHED workflow.</div></div>}
          </div>}
        </section>
      </div>
    </div>
  );
}
