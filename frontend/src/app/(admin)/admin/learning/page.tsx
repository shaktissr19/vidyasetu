'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import LearningQualityPanel from '@/components/admin/LearningQualityPanel';
import {
  createLearningStudioResource,
  getLearningStudioConcepts,
  getLearningStudioOptions,
  getLearningStudioResources,
  updateLearningStudioStatus,
  type LearningJourneyStage,
  type LearningReviewStatus,
  type LearningStudioResource,
  type SaveLearningStudioResource,
} from '@/services/adminLearningService';
import { getLearningMediaUploadUrl } from '@/services/learningMediaService';
import type { LearningCategory } from '@/services/publicService';
import { apiErrorText } from '@/utils/errors';

const CATEGORIES: Array<{ value: LearningCategory; label: string }> = [
  { value: 'ACADEMIC', label: 'Academic' },
  { value: 'MOTIVATION', label: 'Motivation' },
  { value: 'STUDY_SKILLS', label: 'Study Skills' },
  { value: 'WORK_ETHIC', label: 'Work Ethic' },
  { value: 'SOCIAL_RESPONSIBILITY', label: 'Social Responsibility' },
  { value: 'LIFE_SKILLS', label: 'Life Skills' },
  { value: 'WELLBEING', label: 'Well-being' },
  { value: 'CAREER_AWARENESS', label: 'Career Awareness' },
  { value: 'DIGITAL_CITIZENSHIP', label: 'Digital Citizenship' },
];

const REVIEW_TRANSITIONS: Record<LearningReviewStatus, LearningReviewStatus[]> = {
  DRAFT: ['SUBMITTED', 'ARCHIVED'],
  SUBMITTED: ['DRAFT', 'ACADEMIC_REVIEW', 'ARCHIVED'],
  ACADEMIC_REVIEW: ['SUBMITTED', 'APPROVED', 'ARCHIVED'],
  APPROVED: ['ACADEMIC_REVIEW', 'PUBLISHED', 'ARCHIVED'],
  PUBLISHED: ['ARCHIVED'],
  ARCHIVED: ['DRAFT'],
};

const JOURNEY_STAGES: LearningJourneyStage[] = ['SEE', 'UNDERSTAND', 'DO', 'PRACTISE', 'APPLY', 'REVISE'];
const FILE_TYPES = new Set(['VIDEO', 'AUDIO', 'PDF', 'WORKSHEET', 'QUESTION_PAPER']);

interface StudioForm extends SaveLearningStudioResource {
  selectedConceptId: string;
  journeyStage: LearningJourneyStage;
}

const INITIAL: StudioForm = {
  title: '',
  titleHi: '',
  summary: '',
  summaryHi: '',
  bodyMarkdown: '',
  bodyMarkdownHi: '',
  resourceType: 'ARTICLE',
  category: 'ACADEMIC',
  visibility: 'PUBLIC',
  reviewStatus: 'DRAFT',
  language: 'en',
  classMin: 8,
  classMax: 8,
  sourceCode: 'VIDYASETU_ORIGINAL',
  licence: 'VIDYASETU_ORIGINAL',
  boardCodes: ['COMMON'],
  isOfflineReady: true,
  isFeaturedPublic: false,
  selectedConceptId: '',
  journeyStage: 'UNDERSTAND',
};

const inputStyle = { width: '100%', marginTop: 5, padding: '10px 11px', borderRadius: 9, background: 'rgba(255,255,255,.05)', color: 'white', border: '1px solid rgba(255,255,255,.12)' } as const;
const labelStyle = { display: 'block', color: 'rgba(255,255,255,.65)', fontSize: 12, fontWeight: 800 } as const;

function statusLabel(status: string): string { return status.replaceAll('_', ' '); }

export default function AdminLearningStudioPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<StudioForm>(INITIAL);
  const [file, setFile] = useState<File | null>(null);
  const [selectedResource, setSelectedResource] = useState<LearningStudioResource | null>(null);

  const optionsQuery = useQuery({ queryKey: ['learning-studio-options'], queryFn: () => getLearningStudioOptions().then((r) => r.data.data) });
  const resourcesQuery = useQuery({ queryKey: ['learning-studio-resources'], queryFn: () => getLearningStudioResources().then((r) => r.data.data || []) });
  const conceptsQuery = useQuery({
    queryKey: ['learning-studio-concepts', form.classMin || 8],
    queryFn: () => getLearningStudioConcepts({ class: form.classMin || 8 }).then((r) => r.data.data || []),
    enabled: form.category === 'ACADEMIC',
  });

  const selectedSource = useMemo(() => optionsQuery.data?.sources.find((source) => source.code === form.sourceCode), [optionsQuery.data, form.sourceCode]);

  const createMutation = useMutation({
    mutationFn: async () => {
      let fileKey = form.fileKey || null;
      if (file && FILE_TYPES.has(form.resourceType)) {
        if (file.size > 100 * 1024 * 1024) throw new Error('Learning media must be 100 MB or smaller');
        const upload = await getLearningMediaUploadUrl(file.name, file.type || 'application/octet-stream').then((r) => r.data.data);
        const response = await fetch(upload.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
        if (!response.ok) throw new Error(`Media upload failed (${response.status})`);
        fileKey = upload.key;
      }

      const payload: SaveLearningStudioResource = {
        ...form,
        reviewStatus: 'DRAFT',
        fileKey,
        title: form.title.trim(),
        titleHi: form.titleHi?.trim() || null,
        summary: form.summary?.trim() || null,
        summaryHi: form.summaryHi?.trim() || null,
        bodyMarkdown: form.bodyMarkdown?.trim() || null,
        bodyMarkdownHi: form.bodyMarkdownHi?.trim() || null,
        conceptMappings: form.category === 'ACADEMIC' && form.selectedConceptId
          ? [{ conceptId: form.selectedConceptId, journeyStage: form.journeyStage, isPrimary: true, sortOrder: 1 }]
          : [],
      };
      delete (payload as SaveLearningStudioResource & { selectedConceptId?: string }).selectedConceptId;
      delete (payload as SaveLearningStudioResource & { journeyStage?: string }).journeyStage;
      return createLearningStudioResource(payload);
    },
    onSuccess: async () => {
      toast.success('Learning resource created as DRAFT');
      setForm(INITIAL);
      setFile(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['learning-studio-resources'] }),
        queryClient.invalidateQueries({ queryKey: ['learning-coverage'] }),
      ]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not create learning resource')),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: LearningReviewStatus }) => updateLearningStudioStatus(id, status),
    onSuccess: async (_response, variables) => {
      toast.success(`Resource moved to ${statusLabel(variables.status)}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['learning-studio-resources'] }),
        queryClient.invalidateQueries({ queryKey: ['learning-readiness', 'RESOURCE', variables.id] }),
        queryClient.invalidateQueries({ queryKey: ['learning-coverage'] }),
      ]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Review transition blocked')),
  });

  function toggleBoard(code: string): void {
    setForm((current) => {
      const selected = current.boardCodes || [];
      const next = selected.includes(code) ? selected.filter((item) => item !== code) : [...selected, code];
      return { ...current, boardCodes: next.length ? next : ['COMMON'] };
    });
  }

  function changeSource(code: string): void {
    const source = optionsQuery.data?.sources.find((item) => item.code === code);
    setForm((current) => ({
      ...current,
      sourceCode: code,
      licence: (source?.default_license || 'OTHER') as SaveLearningStudioResource['licence'],
      resourceType: code === 'NROER' ? 'EXTERNAL_LINK' : current.resourceType,
      visibility: code === 'NROER' ? 'PUBLIC' : current.visibility,
    }));
    setFile(null);
  }

  const fileRequired = FILE_TYPES.has(form.resourceType) && form.sourceCode === 'VIDYASETU_ORIGINAL';

  return (
    <div style={{ padding: 24, color: 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: '#ff9a3c', fontSize: 12, fontWeight: 900, letterSpacing: '.12em' }}>VIDYASETU LEARNING & CONTENT 2.0</div>
          <h1 style={{ fontSize: 34, margin: '5px 0' }}>Learning Studio</h1>
          <p style={{ color: 'rgba(255,255,255,.62)', maxWidth: 920, lineHeight: 1.65 }}>Single governed authoring path for bilingual VidyaSetu Original, verified OER and official external resources. Every item starts in DRAFT; approval and publication are blocked until deterministic completeness and human quality gates pass.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/admin/learning/coverage" className="btn-secondary">Coverage & quality</Link>
          <Link href="/admin/learning/practice" className="btn-secondary">Question Bank</Link>
          <Link href="/admin/learning/intake" className="btn-secondary">OER Intake</Link>
          <Link href="/admin/learning/imports" className="btn-secondary">Bulk Import</Link>
        </div>
      </div>

      <div style={{ margin: '16px 0', padding: 12, borderRadius: 11, border: '1px solid rgba(71,209,140,.28)', background: 'rgba(71,209,140,.06)', color: '#c8f7dc', fontSize: 12 }}>
        Governance: DRAFT → SUBMITTED → ACADEMIC REVIEW → APPROVED → PUBLISHED. There is no second Admin publishing path.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(430px,.9fr) minmax(520px,1.1fr)', gap: 18, alignItems: 'start' }}>
        <section style={{ padding: 18, borderRadius: 14, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.035)' }}>
          <h2 style={{ marginTop: 0 }}>Author bilingual resource</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={labelStyle}>English title<input style={inputStyle} value={form.title} onChange={(e) => setForm((v) => ({ ...v, title: e.target.value }))} /></label>
            <label style={labelStyle}>हिन्दी शीर्षक<input style={inputStyle} value={form.titleHi || ''} onChange={(e) => setForm((v) => ({ ...v, titleHi: e.target.value }))} /></label>
            <label style={labelStyle}>English summary<textarea style={{ ...inputStyle, minHeight: 74 }} value={form.summary || ''} onChange={(e) => setForm((v) => ({ ...v, summary: e.target.value }))} /></label>
            <label style={labelStyle}>हिन्दी सारांश<textarea style={{ ...inputStyle, minHeight: 74 }} value={form.summaryHi || ''} onChange={(e) => setForm((v) => ({ ...v, summaryHi: e.target.value }))} /></label>
            <label style={labelStyle}>Category<select style={inputStyle} value={form.category} onChange={(e) => setForm((v) => ({ ...v, category: e.target.value as LearningCategory }))}>{CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label style={labelStyle}>Resource type<select style={inputStyle} value={form.resourceType} onChange={(e) => { setForm((v) => ({ ...v, resourceType: e.target.value as SaveLearningStudioResource['resourceType'] })); setFile(null); }}>{['ARTICLE','VIDEO','AUDIO','PDF','WORKSHEET','QUESTION_PAPER','INTERACTIVE','EXTERNAL_LINK'].map((type) => <option key={type}>{type}</option>)}</select></label>
            <label style={labelStyle}>Class from<input style={inputStyle} type="number" min={1} max={12} value={form.classMin || ''} onChange={(e) => setForm((v) => ({ ...v, classMin: Number(e.target.value), classMax: Number(e.target.value), selectedConceptId: '' }))} /></label>
            <label style={labelStyle}>Visibility<select style={inputStyle} value={form.visibility} onChange={(e) => setForm((v) => ({ ...v, visibility: e.target.value as SaveLearningStudioResource['visibility'] }))}>{['PUBLIC','REGISTERED','CLASS_ONLY','SCHOOL_ONLY'].map((value) => <option key={value}>{value}</option>)}</select></label>
          </div>

          {form.category === 'ACADEMIC' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr .6fr', gap: 10, marginTop: 10 }}>
              <label style={labelStyle}>Canonical concept<select style={inputStyle} value={form.selectedConceptId} onChange={(e) => setForm((v) => ({ ...v, selectedConceptId: e.target.value }))}><option value="">Select concept</option>{(conceptsQuery.data || []).map((concept) => <option key={concept.id} value={concept.id}>{concept.code} — {concept.name}</option>)}</select></label>
              <label style={labelStyle}>Learning stage<select style={inputStyle} value={form.journeyStage} onChange={(e) => setForm((v) => ({ ...v, journeyStage: e.target.value as LearningJourneyStage }))}>{JOURNEY_STAGES.map((stage) => <option key={stage}>{stage}</option>)}</select></label>
            </div>
          )}

          {form.resourceType === 'ARTICLE' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
              <label style={labelStyle}>English lesson body<textarea style={{ ...inputStyle, minHeight: 190 }} value={form.bodyMarkdown || ''} onChange={(e) => setForm((v) => ({ ...v, bodyMarkdown: e.target.value }))} placeholder="## See\n..." /></label>
              <label style={labelStyle}>हिन्दी पाठ<textarea style={{ ...inputStyle, minHeight: 190 }} value={form.bodyMarkdownHi || ''} onChange={(e) => setForm((v) => ({ ...v, bodyMarkdownHi: e.target.value }))} /></label>
            </div>
          )}

          <label style={{ ...labelStyle, marginTop: 10 }}>Content source<select style={inputStyle} value={form.sourceCode} onChange={(e) => changeSource(e.target.value)}>{(optionsQuery.data?.sources || []).map((source) => <option key={source.code} value={source.code}>{source.name}</option>)}</select></label>
          {selectedSource && <div style={{ marginTop: 8, color: 'rgba(255,255,255,.48)', fontSize: 11 }}>Default licence: <b>{selectedSource.default_license}</b> · Item licence check: <b>{selectedSource.requires_item_license_check ? 'Required' : 'Not required'}</b> · Rehosting default: <b>{selectedSource.allow_rehosting_default ? 'Allowed' : 'No'}</b></div>}

          {form.sourceCode !== 'VIDYASETU_ORIGINAL' && (
            <div style={{ display: 'grid', gap: 9, marginTop: 10 }}>
              <label style={labelStyle}>Original source URL<input style={inputStyle} type="url" value={form.sourceUrl || ''} onChange={(e) => setForm((v) => ({ ...v, sourceUrl: e.target.value }))} /></label>
              <label style={labelStyle}>Attribution<textarea style={{ ...inputStyle, minHeight: 70 }} value={form.attributionText || ''} onChange={(e) => setForm((v) => ({ ...v, attributionText: e.target.value }))} /></label>
              <label style={labelStyle}>External learning URL<input style={inputStyle} type="url" value={form.externalUrl || ''} onChange={(e) => setForm((v) => ({ ...v, externalUrl: e.target.value }))} /></label>
            </div>
          )}

          <label style={{ ...labelStyle, marginTop: 10 }}>Licence<select style={inputStyle} value={form.licence} onChange={(e) => setForm((v) => ({ ...v, licence: e.target.value as SaveLearningStudioResource['licence'] }))}>{['VIDYASETU_ORIGINAL','CC_BY','CC_BY_SA','CC_BY_NC_SA','CC_BY_NC_ND','PUBLIC_DOMAIN','EXTERNAL_LINK_ONLY','OTHER'].map((value) => <option key={value}>{value}</option>)}</select></label>

          {fileRequired && <label style={{ ...labelStyle, marginTop: 10 }}>Learning media file<input style={inputStyle} type="file" accept={form.resourceType === 'VIDEO' ? 'video/mp4' : form.resourceType === 'AUDIO' ? 'audio/*' : 'application/pdf'} onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>}

          <div style={{ ...labelStyle, marginTop: 10 }}>Boards<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>{(optionsQuery.data?.boards || []).map((board) => { const active = (form.boardCodes || []).includes(board.code); return <button type="button" key={board.code} onClick={() => toggleBoard(board.code)} style={{ padding: '6px 9px', borderRadius: 999, border: `1px solid ${active ? '#ff9a3c' : 'rgba(255,255,255,.14)'}`, background: active ? 'rgba(255,154,60,.1)' : 'transparent', color: active ? '#ffc18b' : 'rgba(255,255,255,.6)' }}>{board.short_name || board.code}</button>; })}</div></div>

          <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
            <label style={{ color: 'rgba(255,255,255,.7)', fontSize: 12 }}><input type="checkbox" checked={Boolean(form.isOfflineReady)} onChange={(e) => setForm((v) => ({ ...v, isOfflineReady: e.target.checked }))} /> Offline-ready</label>
            <label style={{ color: 'rgba(255,255,255,.7)', fontSize: 12 }}><input type="checkbox" checked={Boolean(form.isFeaturedPublic)} onChange={(e) => setForm((v) => ({ ...v, isFeaturedPublic: e.target.checked }))} /> Featured after publication</label>
          </div>

          <button className="btn-primary" style={{ marginTop: 14 }} disabled={createMutation.isPending || !form.title.trim() || (form.category === 'ACADEMIC' && !form.selectedConceptId) || (fileRequired && !file)} onClick={() => createMutation.mutate()}>{createMutation.isPending ? 'Saving…' : 'Create governed DRAFT'}</button>
        </section>

        <section style={{ display: 'grid', gap: 14 }}>
          <div style={{ padding: 16, borderRadius: 14, border: '1px solid rgba(255,255,255,.1)' }}>
            <h2 style={{ marginTop: 0 }}>Resource review queue</h2>
            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              {(resourcesQuery.data || []).map((resource) => (
                <div key={resource.id} style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <button type="button" onClick={() => setSelectedResource(resource)} style={{ background: 'transparent', border: 0, color: 'white', padding: 0, textAlign: 'left', cursor: 'pointer' }}><strong>{resource.title}</strong><div style={{ color: 'rgba(255,255,255,.45)', fontSize: 11, marginTop: 3 }}>{resource.source_name} · {resource.category.replaceAll('_', ' ')} · concepts {resource.concept_count || 0} · {resource.board_codes.join(', ')}</div></button>
                    <span style={{ color: resource.review_status === 'PUBLISHED' ? '#47d18c' : '#ffd166', fontSize: 11, fontWeight: 900 }}>{statusLabel(resource.review_status)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {(REVIEW_TRANSITIONS[resource.review_status] || []).map((status) => <button key={status} type="button" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ id: resource.id, status })} style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid rgba(255,255,255,.13)', background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.72)', fontSize: 11 }}>{statusLabel(status)}</button>)}
                    <button type="button" onClick={() => setSelectedResource(resource)} style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid rgba(79,195,247,.3)', background: 'rgba(79,195,247,.07)', color: '#b9e5ff', fontSize: 11 }}>Quality evidence</button>
                  </div>
                </div>
              ))}
              {!resourcesQuery.data?.length && <div style={{ color: 'rgba(255,255,255,.45)' }}>No governed resources yet.</div>}
            </div>
          </div>
          {selectedResource && <LearningQualityPanel entityType="RESOURCE" entityId={selectedResource.id} />}
        </section>
      </div>
    </div>
  );
}
