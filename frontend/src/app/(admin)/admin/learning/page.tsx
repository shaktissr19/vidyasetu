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
  updateLearningStudioResourceAccess,
  updateLearningStudioStatus,
  type LearningAccessRequirement,
  type LearningJourneyStage,
  type LearningReviewStatus,
  type LearningStudioResource,
  type LearningVisibility,
  type SaveLearningStudioResource,
} from '@/services/adminLearningService';
import { getLearningMediaUploadUrl } from '@/services/learningMediaService';
import type { LearningCategory } from '@/services/publicService';
import { apiErrorText } from '@/utils/errors';

const REVIEW_TRANSITIONS: Record<LearningReviewStatus, LearningReviewStatus[]> = {
  DRAFT: ['SUBMITTED','ARCHIVED'],
  SUBMITTED: ['DRAFT','ACADEMIC_REVIEW','ARCHIVED'],
  ACADEMIC_REVIEW: ['SUBMITTED','APPROVED','ARCHIVED'],
  APPROVED: ['ACADEMIC_REVIEW','PUBLISHED','ARCHIVED'],
  PUBLISHED: ['ARCHIVED'],
  ARCHIVED: ['DRAFT'],
};
const ACCESS_OPTIONS: Array<{ value: LearningAccessRequirement; label: string }> = [
  { value: 'PUBLIC', label: 'Public Free' },
  { value: 'REGISTERED', label: 'Registered Free' },
  { value: 'SUBSCRIBER', label: 'Subscriber' },
];
const CATEGORIES: Array<{ value: LearningCategory; label: string }> = [
  { value: 'ACADEMIC', label: 'Academic' }, { value: 'MOTIVATION', label: 'Motivation' },
  { value: 'STUDY_SKILLS', label: 'Study Skills' }, { value: 'WORK_ETHIC', label: 'Work Ethic' },
  { value: 'SOCIAL_RESPONSIBILITY', label: 'Social Responsibility' }, { value: 'LIFE_SKILLS', label: 'Life Skills' },
  { value: 'WELLBEING', label: 'Well-being' }, { value: 'CAREER_AWARENESS', label: 'Career Awareness' },
  { value: 'DIGITAL_CITIZENSHIP', label: 'Digital Citizenship' },
];
const FILE_TYPES = new Set(['VIDEO','AUDIO','PDF','WORKSHEET','QUESTION_PAPER']);
const secondaryButton = { padding: '8px 12px', borderRadius: 9, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#14213D', cursor: 'pointer', fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 } as const;

interface StudioForm extends SaveLearningStudioResource {
  selectedConceptId: string;
  journeyStage: LearningJourneyStage;
}
const INITIAL: StudioForm = {
  title: '', titleHi: '', summary: '', summaryHi: '', bodyMarkdown: '', bodyMarkdownHi: '',
  resourceType: 'ARTICLE', category: 'ACADEMIC', visibility: 'PUBLIC', accessRequirement: 'PUBLIC', reviewStatus: 'DRAFT',
  language: 'en', classMin: 5, classMax: 5, sourceCode: 'VIDYASETU_ORIGINAL', licence: 'VIDYASETU_ORIGINAL',
  boardCodes: ['COMMON'], isOfflineReady: true, isFeaturedPublic: false, selectedConceptId: '', journeyStage: 'UNDERSTAND',
};
function statusLabel(value: string): string { return value.replaceAll('_',' '); }
function accessLabel(value: LearningAccessRequirement): string { return ACCESS_OPTIONS.find((item) => item.value === value)?.label || value; }

export default function AdminContentLibraryPage() {
  const queryClient = useQueryClient();
  const [selectedResource, setSelectedResource] = useState<LearningStudioResource | null>(null);
  const [form, setForm] = useState<StudioForm>(INITIAL);
  const [file, setFile] = useState<File | null>(null);

  const optionsQuery = useQuery({ queryKey: ['learning-studio-options'], queryFn: () => getLearningStudioOptions().then((r) => r.data.data) });
  const resourcesQuery = useQuery({ queryKey: ['learning-studio-resources'], queryFn: () => getLearningStudioResources().then((r) => r.data.data || []) });
  const conceptsQuery = useQuery({
    queryKey: ['learning-studio-concepts', form.classMin || 5],
    queryFn: () => getLearningStudioConcepts({ class: form.classMin || 5 }).then((r) => r.data.data || []),
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
        conceptMappings: form.category === 'ACADEMIC' && form.selectedConceptId ? [{ conceptId: form.selectedConceptId, journeyStage: form.journeyStage, isPrimary: true, sortOrder: 1 }] : [],
      };
      delete (payload as SaveLearningStudioResource & { selectedConceptId?: string }).selectedConceptId;
      delete (payload as SaveLearningStudioResource & { journeyStage?: string }).journeyStage;
      return createLearningStudioResource(payload);
    },
    onSuccess: async () => {
      toast.success('Resource created as DRAFT');
      setForm(INITIAL); setFile(null);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['learning-studio-resources'] }), queryClient.invalidateQueries({ queryKey: ['learning-coverage'] })]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not create learning resource')),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: LearningReviewStatus }) => updateLearningStudioStatus(id, status),
    onSuccess: async (response, variables) => {
      toast.success(`Moved to ${statusLabel(variables.status)}`);
      if (selectedResource?.id === variables.id && response.data.data) setSelectedResource(response.data.data);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['learning-studio-resources'] }),
        queryClient.invalidateQueries({ queryKey: ['learning-readiness', 'RESOURCE', variables.id] }),
        queryClient.invalidateQueries({ queryKey: ['learning-coverage'] }),
      ]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Review transition blocked')),
  });
  const accessMutation = useMutation({
    mutationFn: ({ id, visibility, accessRequirement }: { id: string; visibility: LearningVisibility; accessRequirement: LearningAccessRequirement }) => updateLearningStudioResourceAccess(id, { visibility, accessRequirement }),
    onSuccess: async (response, variables) => {
      toast.success(`Access updated to ${accessLabel(variables.accessRequirement)}`);
      if (selectedResource?.id === variables.id && response.data.data) setSelectedResource(response.data.data);
      await queryClient.invalidateQueries({ queryKey: ['learning-studio-resources'] });
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not update access')),
  });

  function changeFormVisibility(visibility: LearningVisibility) {
    setForm((current) => ({ ...current, visibility, accessRequirement: visibility === 'PUBLIC' ? 'PUBLIC' : current.accessRequirement === 'PUBLIC' ? 'REGISTERED' : current.accessRequirement, isFeaturedPublic: visibility === 'PUBLIC' ? current.isFeaturedPublic : false }));
  }
  function changeFormAccess(accessRequirement: LearningAccessRequirement) {
    setForm((current) => ({ ...current, accessRequirement, visibility: accessRequirement === 'PUBLIC' ? 'PUBLIC' : current.visibility === 'PUBLIC' ? 'REGISTERED' : current.visibility, isFeaturedPublic: accessRequirement === 'PUBLIC' ? current.isFeaturedPublic : false }));
  }
  function changeSource(code: string) {
    const source = optionsQuery.data?.sources.find((item) => item.code === code);
    setForm((current) => ({ ...current, sourceCode: code, licence: (source?.default_license || 'OTHER') as SaveLearningStudioResource['licence'] }));
  }
  function updateResourceVisibility(resource: LearningStudioResource, visibility: LearningVisibility) {
    const accessRequirement = visibility === 'PUBLIC' ? 'PUBLIC' : resource.access_requirement === 'PUBLIC' ? 'REGISTERED' : resource.access_requirement;
    accessMutation.mutate({ id: resource.id, visibility, accessRequirement });
  }
  function updateResourceAccess(resource: LearningStudioResource, accessRequirement: LearningAccessRequirement) {
    const visibility = accessRequirement === 'PUBLIC' ? 'PUBLIC' : resource.visibility === 'PUBLIC' ? 'REGISTERED' : resource.visibility;
    accessMutation.mutate({ id: resource.id, visibility, accessRequirement });
  }

  const resources = resourcesQuery.data || [];
  const draftCount = resources.filter((item) => item.review_status === 'DRAFT').length;
  const reviewCount = resources.filter((item) => ['SUBMITTED','ACADEMIC_REVIEW','APPROVED'].includes(item.review_status)).length;
  const publishedCount = resources.filter((item) => item.review_status === 'PUBLISHED').length;
  const fileRequired = FILE_TYPES.has(form.resourceType) && form.sourceCode === 'VIDYASETU_ORIGINAL';

  return (
    <div className="admin-page" style={{ padding: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <div style={{ color: '#FF6B00', fontSize: 12, fontWeight: 900, letterSpacing: '.12em' }}>VIDYASETU LEARNING</div>
          <h1 style={{ margin: '5px 0', fontSize: 34 }}>Content Library</h1>
          <p className="admin-muted" style={{ maxWidth: 850, lineHeight: 1.65 }}>Review, approve and publish the lessons created by Admin, AI Creator, bulk import or governed source workflows.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Link href="/admin/learning/creator" className="btn-primary">Create Content</Link><Link href="/admin/learning/coverage" style={secondaryButton}>Coverage</Link><Link href="/admin/learning/practice" style={secondaryButton}>Question Bank</Link><Link href="/admin/learning/intake" style={secondaryButton}>Advanced Source Review</Link></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(150px,1fr))', gap: 10, marginBottom: 16 }}>
        {[['All resources', resources.length],['Drafts', draftCount],['In review', reviewCount],['Published', publishedCount]].map(([label,value]) => <div key={String(label)} className="admin-panel" style={{ padding: 15 }}><div style={{ fontSize: 26, fontWeight: 900 }}>{value}</div><div style={{ color: '#667085', fontSize: 11, marginTop: 3 }}>{label}</div></div>)}
      </div>

      <section className="admin-panel" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}><div><h2 style={{ margin: 0 }}>Review & Publish</h2><p className="admin-muted" style={{ marginTop: 4 }}>Select a resource. The system only shows valid next states, so the audited DRAFT → SUBMITTED → ACADEMIC REVIEW → APPROVED → PUBLISHED flow stays intact.</p></div></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(330px,.8fr) minmax(480px,1.2fr)', gap: 16, marginTop: 14 }}>
          <div style={{ maxHeight: 650, overflowY: 'auto', display: 'grid', gap: 8 }}>
            {resources.map((resource) => <button key={resource.id} type="button" className={`admin-source-card ${selectedResource?.id === resource.id ? 'selected' : ''}`} onClick={() => setSelectedResource(resource)} style={{ padding: 13, textAlign: 'left', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong>{resource.title}</strong><span style={{ color: resource.review_status === 'PUBLISHED' ? '#147D4A' : '#B26A00', fontSize: 11, fontWeight: 900 }}>{statusLabel(resource.review_status)}</span></div>
              <div style={{ color: '#667085', fontSize: 11, marginTop: 5 }}>{resource.source_name} · {resource.category} · {resource.resource_type}</div>
              <div style={{ color: '#475467', fontSize: 11, marginTop: 3 }}>{resource.visibility} · {accessLabel(resource.access_requirement)}{resource.concept_count != null ? ` · ${resource.concept_count} concept(s)` : ''}</div>
            </button>)}
            {!resourcesQuery.isLoading && !resources.length && <div className="admin-panel-muted" style={{ padding: 16, color: '#667085' }}>No learning resources yet. Use Create Content to create the first one.</div>}
          </div>

          <div>
            {!selectedResource ? <div className="admin-panel-muted" style={{ padding: 22, color: '#667085' }}>Select a resource from the library to review, change access, inspect quality evidence and publish.</div> : <div style={{ display: 'grid', gap: 12 }}>
              <div className="admin-panel-muted" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}><div><h2 style={{ margin: 0 }}>{selectedResource.title}</h2><div style={{ color: '#667085', fontSize: 12, marginTop: 5 }}>{selectedResource.source_name} · {selectedResource.resource_type} · {selectedResource.licence}</div></div><span style={{ background: '#FFF1E6', color: '#9A3B00', borderRadius: 999, padding: '5px 9px', fontSize: 11, fontWeight: 900 }}>{statusLabel(selectedResource.review_status)}</span></div>
                {selectedResource.summary && <p style={{ color: '#475467', lineHeight: 1.55, marginTop: 10 }}>{selectedResource.summary}</p>}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}><label className="admin-label">Audience<select className="admin-select" value={selectedResource.visibility} onChange={(e) => updateResourceVisibility(selectedResource, e.target.value as LearningVisibility)}><option value="PUBLIC">Public</option><option value="REGISTERED">Registered learners</option><option value="CLASS_ONLY">Class only</option><option value="SCHOOL_ONLY">School only</option></select></label><label className="admin-label">Learning access<select className="admin-select" value={selectedResource.access_requirement} onChange={(e) => updateResourceAccess(selectedResource, e.target.value as LearningAccessRequirement)}>{ACCESS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div>
                <div style={{ marginTop: 13 }}><div className="admin-label" style={{ marginBottom: 6 }}>Next step</div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{REVIEW_TRANSITIONS[selectedResource.review_status].map((status) => <button key={status} type="button" className={status === 'PUBLISHED' ? 'btn-primary' : 'admin-chip'} disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ id: selectedResource.id, status })}>{status === 'PUBLISHED' ? 'Publish' : statusLabel(status)}</button>)}</div></div>
                {selectedResource.public_slug && selectedResource.review_status === 'PUBLISHED' && <div style={{ marginTop: 10 }}><Link href={`/learn/${selectedResource.public_slug}`} target="_blank" style={{ color: '#C2410C', fontWeight: 900 }}>Preview published resource ↗</Link></div>}
              </div>
              <LearningQualityPanel entityType="RESOURCE" entityId={selectedResource.id} />
            </div>}
          </div>
        </div>
      </section>

      <details className="admin-panel" style={{ padding: 20 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 900, fontSize: 18 }}>Advanced: author a resource manually</summary>
        <p className="admin-muted" style={{ marginTop: 8 }}>Normal content creation should start from Create Content. Use this form when you need to manually author or upload a specific resource.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
          <label className="admin-label">English title<input className="admin-input" value={form.title} onChange={(e) => setForm((v) => ({ ...v, title: e.target.value }))} /></label>
          <label className="admin-label">Hindi title<input className="admin-input" value={form.titleHi || ''} onChange={(e) => setForm((v) => ({ ...v, titleHi: e.target.value }))} /></label>
          <label className="admin-label">English summary<textarea className="admin-textarea" style={{ minHeight: 80 }} value={form.summary || ''} onChange={(e) => setForm((v) => ({ ...v, summary: e.target.value }))} /></label>
          <label className="admin-label">Hindi summary<textarea className="admin-textarea" style={{ minHeight: 80 }} value={form.summaryHi || ''} onChange={(e) => setForm((v) => ({ ...v, summaryHi: e.target.value }))} /></label>
          <label className="admin-label">Category<select className="admin-select" value={form.category} onChange={(e) => setForm((v) => ({ ...v, category: e.target.value as LearningCategory }))}>{CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="admin-label">Resource type<select className="admin-select" value={form.resourceType} onChange={(e) => { setForm((v) => ({ ...v, resourceType: e.target.value as SaveLearningStudioResource['resourceType'] })); setFile(null); }}>{['ARTICLE','VIDEO','AUDIO','PDF','WORKSHEET','QUESTION_PAPER','INTERACTIVE','EXTERNAL_LINK'].map((type) => <option key={type}>{type}</option>)}</select></label>
          <label className="admin-label">Class<select className="admin-select" value={form.classMin || 5} onChange={(e) => setForm((v) => ({ ...v, classMin: Number(e.target.value), classMax: Number(e.target.value), selectedConceptId: '' }))}>{Array.from({ length: 12 },(_,i)=>i+1).map((n)=><option key={n} value={n}>Class {n}</option>)}</select></label>
          <label className="admin-label">Curriculum concept<select className="admin-select" value={form.selectedConceptId} onChange={(e) => setForm((v) => ({ ...v, selectedConceptId: e.target.value }))}><option value="">No concept mapping</option>{(conceptsQuery.data || []).map((concept) => <option key={concept.id} value={concept.id}>{concept.subject_name || concept.subject_code} · {concept.chapter_title || 'Concept'} · {concept.name}</option>)}</select></label>
          <label className="admin-label">Source<select className="admin-select" value={form.sourceCode} onChange={(e) => changeSource(e.target.value)}>{(optionsQuery.data?.sources || []).map((source) => <option key={source.code} value={source.code}>{source.name}</option>)}</select></label>
          <label className="admin-label">Licence<input className="admin-input" value={form.licence} readOnly /></label>
          <label className="admin-label">Visibility<select className="admin-select" value={form.visibility} onChange={(e) => changeFormVisibility(e.target.value as LearningVisibility)}><option value="PUBLIC">Public</option><option value="REGISTERED">Registered</option><option value="CLASS_ONLY">Class only</option><option value="SCHOOL_ONLY">School only</option></select></label>
          <label className="admin-label">Access<select className="admin-select" value={form.accessRequirement || 'PUBLIC'} onChange={(e) => changeFormAccess(e.target.value as LearningAccessRequirement)}>{ACCESS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        </div>
        {form.resourceType === 'ARTICLE' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}><label className="admin-label">English lesson body<textarea className="admin-textarea" style={{ minHeight: 160 }} value={form.bodyMarkdown || ''} onChange={(e) => setForm((v) => ({ ...v, bodyMarkdown: e.target.value }))} /></label><label className="admin-label">Hindi lesson body<textarea className="admin-textarea" style={{ minHeight: 160 }} value={form.bodyMarkdownHi || ''} onChange={(e) => setForm((v) => ({ ...v, bodyMarkdownHi: e.target.value }))} /></label></div>}
        {form.sourceCode !== 'VIDYASETU_ORIGINAL' && <label className="admin-label" style={{ marginTop: 12 }}>Original / external URL<input className="admin-input" value={form.sourceUrl || ''} onChange={(e) => setForm((v) => ({ ...v, sourceUrl: e.target.value, externalUrl: e.target.value }))} placeholder={selectedSource?.homepage_url || 'https://...'} /></label>}
        {fileRequired && <label className="admin-label" style={{ marginTop: 12 }}>Upload file<input className="admin-input" type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>}
        <button type="button" className="btn-primary" disabled={createMutation.isPending || !form.title.trim()} onClick={() => createMutation.mutate()} style={{ marginTop: 14 }}>{createMutation.isPending ? 'Creating…' : 'Create DRAFT resource'}</button>
      </details>
    </div>
  );
}
