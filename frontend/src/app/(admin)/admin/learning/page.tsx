'use client';

import LearningAsset from '@/components/learning/LearningAsset';
import LearningMarkdown from '@/components/learning/LearningMarkdown';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import LearningQualityPanel from '@/components/admin/LearningQualityPanel';
import {
  createLearningStudioResource,
  getLearningStudioConcepts,
  getLearningStudioOptions,
  getLearningStudioResources,
  getLearningResourcePreview,
  getLearningEntityReadiness,
  reviewAndPublishLearningStudioResource,
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
import { getLearningPipelineQueue, type PipelineQueueItem } from '@/services/learningContentPipelineService';
import { addDiscoveredContentToLibrary } from '@/services/contentCreatorService';
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
const FILE_TYPES = new Set(['VIDEO','AUDIO','IMAGE','PDF','WORKSHEET','QUESTION_PAPER']);
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
  const [librarySearch, setLibrarySearch] = useState('');
  const [publicationFilter,setPublicationFilter] = useState<'ALL'|'PUBLISHED'|'NOT_PUBLISHED'>('ALL');
  const [reviewFilter,setReviewFilter] = useState<'ALL'|'REVIEWED'|'NOT_REVIEWED'>('ALL');
  const [boardFilter,setBoardFilter] = useState('');
  const [classFilter,setClassFilter] = useState('');
  const [subjectFilter,setSubjectFilter] = useState('');
  const [selectedIntakeId,setSelectedIntakeId] = useState('');
  const [intakeTitle,setIntakeTitle] = useState('');
  const [intakeVisibility,setIntakeVisibility] = useState<'PUBLIC'|'CLASS_ONLY'>('CLASS_ONLY');
  const [intakeAccess,setIntakeAccess] = useState<LearningAccessRequirement>('REGISTERED');
  const [intakeLicence,setIntakeLicence] = useState('OTHER');
  const [intakeLicenceUrl,setIntakeLicenceUrl] = useState('');
  const [intakeAttribution,setIntakeAttribution] = useState('');
  const [intakeEvidenceUrl,setIntakeEvidenceUrl] = useState('');
  const [intakeRightsConfirmed,setIntakeRightsConfirmed] = useState(false);
  const [selectedResource, setSelectedResource] = useState<LearningStudioResource | null>(null);
  const previewQuery = useQuery({ queryKey: ['learning-admin-preview',selectedResource?.id],enabled: Boolean(selectedResource?.id),queryFn: () => getLearningResourcePreview(selectedResource!.id).then((response) => response.data.data) });
  const selectedReadinessQuery = useQuery({
    queryKey: ['learning-readiness','RESOURCE',selectedResource?.id],
    enabled: Boolean(selectedResource?.id),
    queryFn: () => getLearningEntityReadiness('RESOURCE',selectedResource!.id).then((response) => response.data.data),
  });
  const [form, setForm] = useState<StudioForm>(INITIAL);
  const [file, setFile] = useState<File | null>(null);

  const optionsQuery = useQuery({ queryKey: ['learning-studio-options'], queryFn: () => getLearningStudioOptions().then((r) => r.data.data) });
  const resourcesQuery = useQuery({ queryKey: ['learning-studio-resources'], queryFn: () => getLearningStudioResources().then((r) => r.data.data || []) });
  const pipelineQueueQuery = useQuery({ queryKey: ['learning-pipeline-queue'], queryFn: () => getLearningPipelineQueue().then((r) => r.data.data || []) });
  const pendingDiscovered = (pipelineQueueQuery.data || []).filter((item) => item.discovery_candidate_id && !item.imported_resource_id && item.status !== 'REJECTED');
  const selectedIntake = pendingDiscovered.find((item) => item.id === selectedIntakeId) || null;
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('intake');
    if (requested) setSelectedIntakeId(requested);
  },[]);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('resource');
    const match = requested ? resourcesQuery.data?.find((item) => item.id === requested) : null;
    if (match) setSelectedResource(match);
  },[resourcesQuery.data]);
  useEffect(() => {
    if (!selectedIntake) return;
    setIntakeTitle(selectedIntake.title);
    setIntakeLicence(selectedIntake.licence_candidate || 'OTHER');
    setIntakeAttribution(selectedIntake.attribution_text || '');
    setIntakeEvidenceUrl(selectedIntake.rights_evidence_url || selectedIntake.source_url || '');
    setIntakeLicenceUrl(selectedIntake.licence_url || '');
    setIntakeRightsConfirmed(false);
  },[selectedIntake?.id]);
  const addDiscoveredMutation = useMutation({
    mutationFn: () => {
      if (!selectedIntake?.discovery_candidate_id) throw new Error('Select an item from Content Factory first');
      if (!intakeRightsConfirmed) throw new Error('Confirm the item rights and in-platform playback review');
      return addDiscoveredContentToLibrary(selectedIntake.discovery_candidate_id,{
        title:intakeTitle.trim()||selectedIntake.title,
        visibility:intakeVisibility,
        accessRequirement:intakeVisibility==='PUBLIC'?'PUBLIC':intakeAccess==='PUBLIC'?'REGISTERED':intakeAccess,
        licenceCandidate:intakeLicence,licenceUrl:intakeLicenceUrl.trim()||null,attributionText:intakeAttribution.trim(),
        rightsEvidenceUrl:intakeEvidenceUrl.trim()||selectedIntake.source_url,permissionConfirmed:true,
      });
    },
    onSuccess:async(response)=>{
      toast.success('Added to Content Library as a draft. Review its player and publish from here.');
      setSelectedIntakeId('');setIntakeRightsConfirmed(false);
      const [,resourceResponse]=await Promise.all([queryClient.invalidateQueries({queryKey:['learning-pipeline-queue']}),resourcesQuery.refetch()]);
      const resourceId=response.data.data.resourceId;
      const created=resourceResponse.data?.find((item)=>item.id===resourceId);
      if(created)setSelectedResource(created);
    },
    onError:(error:unknown)=>toast.error(apiErrorText(error,'Could not add discovered content to the Library')),
  });
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
        if (file.size > 500 * 1024 * 1024) throw new Error('Learning media must be 500 MB or smaller');
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
      if (selectedResource?.id === variables.id && response.data.data) setSelectedResource((current) => current ? { ...current,...response.data.data } : current);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['learning-studio-resources'] }),
        queryClient.invalidateQueries({ queryKey: ['learning-readiness', 'RESOURCE', variables.id] }),
        queryClient.invalidateQueries({ queryKey: ['learning-coverage'] }),
      ]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Review transition blocked')),
  });
  const reviewPublishMutation = useMutation({
    mutationFn: (resourceId:string)=>reviewAndPublishLearningStudioResource(resourceId),
    onSuccess:async(response)=>{
      toast.success('Reviewed and published. The audit trail records the governance steps.');
      if(response.data.data&&selectedResource?.id===response.data.data.id)setSelectedResource((current)=>current?{...current,...response.data.data}:current);
      await queryClient.invalidateQueries({queryKey:['learning-studio-resources']});
    },
    onError:(error:unknown)=>toast.error(apiErrorText(error,'Could not publish this resource')),
  });
  const accessMutation = useMutation({
    mutationFn: ({ id, visibility, accessRequirement }: { id: string; visibility: LearningVisibility; accessRequirement: LearningAccessRequirement }) => updateLearningStudioResourceAccess(id, { visibility, accessRequirement }),
    onSuccess: async (response, variables) => {
      toast.success(`Access updated to ${accessLabel(variables.accessRequirement)}`);
      if (selectedResource?.id === variables.id && response.data.data) setSelectedResource((current) => current ? { ...current,...response.data.data } : current);
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

  const resources = resourcesQuery.data || [];
  const libraryBoards = [...new Set(resources.flatMap((item) => item.board_codes || []))].sort();
  const classNumbersFor = (item: LearningStudioResource) => {
    const mapped = (item.grade_codes || []).map((code) => /^CLASS_(\d{1,2})$/.exec(code)?.[1]).filter(Boolean).map(Number);
    const ranged = item.class_min && item.class_max
      ? Array.from({ length: Math.max(1,item.class_max-item.class_min+1) },(_,index)=>item.class_min!+index)
      : [];
    return [...new Set([...mapped,...ranged])];
  };
  const libraryClasses = [...new Set(resources.flatMap(classNumbersFor))].sort((a,b)=>a-b);
  const librarySubjects = [...new Map(resources.filter((item)=>item.subject_id&&item.subject_name).map((item)=>[item.subject_id!,item.subject_name!])).entries()].sort((a,b)=>a[1].localeCompare(b[1]));
  const filteredResources = resources.filter((item) => {
    const matchesSearch = `${item.title} ${item.source_name} ${item.resource_type} ${item.review_status} ${item.difficulty || ''}`.toLowerCase().includes(librarySearch.toLowerCase());
    const matchesPublication = publicationFilter === 'ALL' || (publicationFilter === 'PUBLISHED' ? item.review_status === 'PUBLISHED' : item.review_status !== 'PUBLISHED');
    const reviewed = Boolean(item.quality_review_complete) || ['ACADEMIC_REVIEW','APPROVED','PUBLISHED'].includes(item.review_status);
    const matchesReview = reviewFilter === 'ALL' || (reviewFilter === 'REVIEWED' ? reviewed : !reviewed);
    const classNumbers = classNumbersFor(item);
    return matchesSearch && matchesPublication && matchesReview
      && (!boardFilter || (item.board_codes || []).includes(boardFilter))
      && (!classFilter || classNumbers.includes(Number(classFilter)))
      && (!subjectFilter || item.subject_id === subjectFilter);
  });
  const draftCount = resources.filter((item) => item.review_status === 'DRAFT').length;
  const reviewCount = resources.filter((item) => ['SUBMITTED','ACADEMIC_REVIEW','APPROVED'].includes(item.review_status)).length;
  const publishedCount = resources.filter((item) => item.review_status === 'PUBLISHED').length;
  const fileRequired = FILE_TYPES.has(form.resourceType) && form.sourceCode === 'VIDYASETU_ORIGINAL';
  const intakeMediaKind = selectedIntake?.discovered_media_kind && ['VIDEO','AUDIO','IMAGE','PDF','INTERACTIVE'].includes(selectedIntake.discovered_media_kind)
    ? selectedIntake.discovered_media_kind : selectedIntake?.media_kind;
  const intakeArtifactUrl = selectedIntake?.discovered_asset_url || null;
  const intakeEmbedUrl = selectedIntake?.discovered_embed_url || null;

  return (
    <div className="admin-page" style={{ padding: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <div style={{ color: '#9A3B00', fontSize: 12, fontWeight: 900, letterSpacing: '.12em' }}>VIDYASETU LEARNING</div>
          <h1 style={{ margin: '5px 0', fontSize: 34 }}>Content Library</h1>
          <p className="admin-muted" style={{ maxWidth: 850, lineHeight: 1.65 }}>Review, approve and publish the lessons created by Admin, AI Creator, bulk import or governed source workflows.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems:'center' }}><Link href="/admin/learning/creator" className="btn-primary">Create Content</Link><Link href="/admin/learning/coverage" style={secondaryButton}>Coverage</Link><Link href="/admin/learning/practice" style={secondaryButton}>Question Bank</Link><details style={{position:'relative'}}><summary style={{...secondaryButton,listStyle:'none'}}>Advanced tools</summary><div className="admin-panel" style={{position:'absolute',right:0,zIndex:5,minWidth:220,display:'grid',gap:8,padding:12}}><Link href="/admin/learning/pipeline" style={secondaryButton}>Content Pipeline</Link><Link href="/admin/learning/intake" style={secondaryButton}>Advanced Source Review</Link></div></details></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(150px,1fr))', gap: 10, marginBottom: 16 }}>
        {[['All resources', resources.length],['Drafts', draftCount],['In review', reviewCount],['Published', publishedCount]].map(([label,value]) => <div key={String(label)} className="admin-panel" style={{ padding: 15 }}><div style={{ fontSize: 26, fontWeight: 900 }}>{value}</div><div style={{ color: '#667085', fontSize: 11, marginTop: 3 }}>{label}</div></div>)}
      </div>

      {pendingDiscovered.length > 0 && <section className="admin-panel" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Selected from Content Factory · {pendingDiscovered.length}</h2>
        <p className="admin-muted">Review and play the item here. Adding it creates an unpublished Library draft. Imports are copied into VidyaSetu only after you confirm the item’s reuse rights.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,1fr) minmax(300px,2fr)', gap: 14 }}>
          <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>{pendingDiscovered.map((item)=><button key={item.id} type="button" className={`admin-source-card ${selectedIntakeId===item.id?'selected':''}`} onClick={()=>setSelectedIntakeId(item.id)} style={{ padding: 12,textAlign:'left' }}><strong>{item.title}</strong><div className="admin-muted" style={{fontSize:12,marginTop:4}}>{item.source_name} · {item.discovered_media_kind||item.media_kind} · Needs review</div></button>)}</div>
          {selectedIntake ? <div className="admin-panel-muted" style={{padding:16}}>
            <div style={{display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}><div><h3 style={{margin:'0 0 4px'}}>{selectedIntake.title}</h3><p className="admin-muted" style={{margin:0}}>{selectedIntake.source_name} · {intakeMediaKind||'Learning media'} · {selectedIntake.licence_candidate||'Rights review needed'}</p></div><span className="admin-chip">Not published</span></div>
            {intakeMediaKind && (intakeArtifactUrl || intakeEmbedUrl) && <div style={{marginTop:12}}><LearningAsset title={selectedIntake.title} kind={intakeMediaKind} contentUrl={intakeArtifactUrl} embedUrl={intakeEmbedUrl} altText={selectedIntake.title} /></div>}
            <div className="admin-muted" style={{fontSize:13,lineHeight:1.6,marginTop:8}}>Class: {selectedIntake.class_hint||selectedIntake.discovery_context?.gradeCodes?.join(', ')||'From search'} · Board: {selectedIntake.board_hint||selectedIntake.discovery_context?.boardCodes?.join(', ')||'From search'} · Subject: {selectedIntake.subject_hint||selectedIntake.discovery_context?.subjectLabel||'From search'}<br/>Topic: {selectedIntake.discovery_context?.topicLabel||selectedIntake.discovery_context?.chapterLabel||'Not mapped to a syllabus topic'}</div>
            {selectedIntake.source_url&&<p style={{margin:'8px 0'}}><a href={selectedIntake.source_url} target="_blank" rel="noreferrer" style={{color:'#9A3B00',fontWeight:800}}>Inspect source and rights evidence ↗</a></p>}
            <label className="admin-label" style={{display:'block',marginTop:12}}>Content name<input className="admin-input" value={intakeTitle} onChange={(event)=>setIntakeTitle(event.target.value)} maxLength={300} /></label>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10,marginTop:12}}>
              <label className="admin-label">Who can see it?<select className="admin-select" value={intakeVisibility==='PUBLIC'?'PUBLIC':intakeAccess==='SUBSCRIBER'?'SUBSCRIBER':'CLASS_ONLY'} onChange={(event)=>{const audience=event.target.value;if(audience==='PUBLIC'){setIntakeVisibility('PUBLIC');setIntakeAccess('PUBLIC');}else{setIntakeVisibility('CLASS_ONLY');setIntakeAccess(audience==='SUBSCRIBER'?'SUBSCRIBER':'REGISTERED');}}}><option value="PUBLIC">Public · anyone</option><option value="CLASS_ONLY">Private · selected class learners</option><option value="SUBSCRIBER">Private · subscribers</option></select></label>
              <label className="admin-label">Licence<select className="admin-select" value={intakeLicence} onChange={(event)=>setIntakeLicence(event.target.value)}>{['CC_BY','CC_BY_SA','CC_BY_NC','CC_BY_NC_SA','CC_BY_ND','CC_BY_NC_ND','PUBLIC_DOMAIN','PERMISSION_GRANTED','EXTERNAL_LINK_ONLY','OTHER'].map((value)=><option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select></label>
              <label className="admin-label">Attribution<input className="admin-input" value={intakeAttribution} onChange={(event)=>setIntakeAttribution(event.target.value)} placeholder="Creator / publisher credit" /></label>
              <label className="admin-label">Rights evidence<input className="admin-input" value={intakeEvidenceUrl} onChange={(event)=>setIntakeEvidenceUrl(event.target.value)} placeholder="Source page showing licence and reuse terms" /></label>
            </div>
            <label style={{display:'flex',gap:8,alignItems:'start',marginTop:12,fontSize:13}}><input type="checkbox" checked={intakeRightsConfirmed} onChange={(event)=>setIntakeRightsConfirmed(event.target.checked)} /><span>I checked the item’s rights and confirmed the content plays inside VidyaSetu without requiring the learner to sign in to the source.</span></label>
            <button type="button" className="btn-primary" disabled={addDiscoveredMutation.isPending||!intakeRightsConfirmed||intakeTitle.trim().length<3} onClick={()=>addDiscoveredMutation.mutate()} style={{marginTop:12}}>{addDiscoveredMutation.isPending?'Preparing VidyaSetu playback…':'Add reviewed item to Library draft'}</button>
          </div> : <div className="admin-panel-muted" style={{padding:18}}>Select a discovered item to review it here.</div>}
        </div>
      </section>}

      <section className="admin-panel" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}><div><h2 style={{ margin: 0 }}>Review & Publish</h2><label className="admin-label">Search Library<input className="admin-input" value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder="Title, format, difficulty or status" /></label><p className="admin-muted" style={{ marginTop: 4 }}>Choose the audience, review the in-platform preview and rights, then use one publish action. Governance history is retained automatically.</p></div></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginTop: 14 }}>
          <label className="admin-label">Publication<select className="admin-select" value={publicationFilter} onChange={(event)=>setPublicationFilter(event.target.value as typeof publicationFilter)}><option value="ALL">All publication states</option><option value="NOT_PUBLISHED">Not published</option><option value="PUBLISHED">Published</option></select></label>
          <label className="admin-label">Review<select className="admin-select" value={reviewFilter} onChange={(event)=>setReviewFilter(event.target.value as typeof reviewFilter)}><option value="ALL">All review states</option><option value="NOT_REVIEWED">Not reviewed</option><option value="REVIEWED">Reviewed</option></select></label>
          <label className="admin-label">Board<select className="admin-select" value={boardFilter} onChange={(event)=>setBoardFilter(event.target.value)}><option value="">All boards</option>{libraryBoards.map((code)=><option key={code} value={code}>{code}</option>)}</select></label>
          <label className="admin-label">Class<select className="admin-select" value={classFilter} onChange={(event)=>setClassFilter(event.target.value)}><option value="">All classes</option>{libraryClasses.map((value)=><option key={value} value={value}>Class {value}</option>)}</select></label>
          <label className="admin-label">Subject<select className="admin-select" value={subjectFilter} onChange={(event)=>setSubjectFilter(event.target.value)}><option value="">All subjects</option>{librarySubjects.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,360px),1fr))', gap: 16, marginTop: 14 }}>
          <div style={{ maxHeight: 650, overflowY: 'auto', display: 'grid', gap: 8 }}>
            {filteredResources.map((resource) => <button key={resource.id} type="button" className={`admin-source-card ${selectedResource?.id === resource.id ? 'selected' : ''}`} onClick={() => setSelectedResource(resource)} style={{ padding: 13, textAlign: 'left', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong>{resource.title}</strong><span style={{ color: resource.review_status === 'PUBLISHED' ? '#147D4A' : '#B26A00', fontSize: 11, fontWeight: 900 }}>{statusLabel(resource.review_status)}</span></div>
              <div style={{ color: '#667085', fontSize: 11, marginTop: 5 }}>{resource.source_name} · {resource.category} · {resource.resource_type}</div>
              <div style={{ color: '#475467', fontSize: 11, marginTop: 3 }}>{resource.visibility} · {accessLabel(resource.access_requirement)}{resource.concept_count != null ? ` · ${resource.concept_count} concept(s)` : ''}</div>
            </button>)}
            {!resourcesQuery.isLoading && !filteredResources.length && <div className="admin-panel-muted" style={{ padding: 16, color: '#667085' }}>{resources.length ? 'No resources match these filters.' : 'No learning resources yet. Use Create Content to create the first one.'}</div>}
          </div>

          <div>
            {!selectedResource ? <div className="admin-panel-muted" style={{ padding: 22, color: '#667085' }}>Select a resource from the library to review, change access, inspect quality evidence and publish.</div> : <div style={{ display: 'grid', gap: 12 }}>
              <div className="admin-panel-muted" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}><div><h2 style={{ margin: 0 }}>{selectedResource.title}</h2><div style={{ color: '#667085', fontSize: 12, marginTop: 5 }}>{selectedResource.source_name} · {selectedResource.resource_type} · {selectedResource.licence}</div></div><span style={{ background: '#FFF1E6', color: '#9A3B00', borderRadius: 999, padding: '5px 9px', fontSize: 11, fontWeight: 900 }}>{statusLabel(selectedResource.review_status)}</span></div>
                {selectedResource.summary && <p style={{ color: '#475467', lineHeight: 1.55, marginTop: 10 }}>{selectedResource.summary}</p>}
                <label className="admin-label" style={{display:'block',marginTop:12}}>Who can see it?<select className="admin-select" value={selectedResource.visibility==='PUBLIC'?'PUBLIC':selectedResource.access_requirement==='SUBSCRIBER'?'SUBSCRIBER':'CLASS_ONLY'} onChange={(event)=>{const audience=event.target.value;if(audience==='PUBLIC')accessMutation.mutate({id:selectedResource.id,visibility:'PUBLIC',accessRequirement:'PUBLIC'});else if(audience==='SUBSCRIBER')accessMutation.mutate({id:selectedResource.id,visibility:'CLASS_ONLY',accessRequirement:'SUBSCRIBER'});else accessMutation.mutate({id:selectedResource.id,visibility:'CLASS_ONLY',accessRequirement:'REGISTERED'});}}><option value="PUBLIC">Public · anyone</option><option value="CLASS_ONLY">Private · eligible class learners</option><option value="SUBSCRIBER">Private · subscribers</option></select></label>
                <div style={{ marginTop: 13 }}>
                  <div className="admin-label" style={{ marginBottom: 6 }}>Publication</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {selectedResource.review_status==='PUBLISHED' ? <button type="button" className="admin-chip" disabled={statusMutation.isPending} onClick={()=>statusMutation.mutate({id:selectedResource.id,status:'ARCHIVED'})}>Unpublish / archive</button>
                      : selectedResource.review_status==='ARCHIVED' ? <button type="button" className="admin-chip" disabled={statusMutation.isPending} onClick={()=>statusMutation.mutate({id:selectedResource.id,status:'DRAFT'})}>Restore draft</button>
                        : <button type="button" className="btn-primary" disabled={reviewPublishMutation.isPending||selectedReadinessQuery.isLoading||!selectedReadinessQuery.data?.readyForPublication} onClick={()=>reviewPublishMutation.mutate(selectedResource.id)}>{reviewPublishMutation.isPending?'Checking review and player…':'Review & Publish'}</button>}
                  </div>
                  {!['PUBLISHED','ARCHIVED'].includes(selectedResource.review_status) && <p className="admin-muted" style={{fontSize:12,margin:'7px 0 0'}} role="status">
                    {selectedReadinessQuery.isLoading ? 'Checking required publication checks…'
                      : selectedReadinessQuery.isError ? 'Publication checks could not be loaded. Retry before publishing.'
                        : selectedReadinessQuery.data?.readyForPublication ? 'All required checks pass. This item is ready to publish.'
                          : `Complete ${selectedReadinessQuery.data?.blockers.length || 'the required'} quality check(s) in the review panel below before publishing.`}
                  </p>}
                </div>
                {selectedResource.public_slug && selectedResource.review_status === 'PUBLISHED' && <div style={{ marginTop: 10 }}><Link href={`/learn/${selectedResource.public_slug}`} target="_blank" style={{ color: '#C2410C', fontWeight: 900 }}>Preview published resource ↗</Link></div>}
              </div>
              <section className="admin-panel-muted" style={{ padding: 16 }}><h3>Learner preview</h3><Link href={`/admin/learning/pipeline?resource=${selectedResource.id}`} style={{ color: '#C2410C', fontWeight: 800 }}>Edit draft details / curriculum mapping</Link>
                {previewQuery.isLoading ? <p>Loading preview…</p> : previewQuery.isError ? <p role="alert">Preview could not be loaded. Check media storage and retry before publication.</p> : previewQuery.data && <>
                  <LearningAsset title={previewQuery.data.title} kind={previewQuery.data.resource_type} contentUrl={previewQuery.data.content_url} embedUrl={previewQuery.data.embed_url} transcript={previewQuery.data.transcript} altText={previewQuery.data.alt_text} />
                  <LearningMarkdown body={previewQuery.data.body_markdown} />
                  {previewQuery.data.body_markdown_hi && <><h4>Hindi preview</h4><LearningMarkdown body={previewQuery.data.body_markdown_hi} /></>}
                </>}
              </section>
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
          <label className="admin-label">Resource type<select className="admin-select" value={form.resourceType} onChange={(e) => { setForm((v) => ({ ...v, resourceType: e.target.value as SaveLearningStudioResource['resourceType'] })); setFile(null); }}>{['ARTICLE','VIDEO','AUDIO','IMAGE','PDF','WORKSHEET','QUESTION_PAPER','INTERACTIVE','EXTERNAL_LINK'].map((type) => <option key={type}>{type}</option>)}</select></label>
          <label className="admin-label">Class<select className="admin-select" value={form.classMin || 5} onChange={(e) => setForm((v) => ({ ...v, classMin: Number(e.target.value), classMax: Number(e.target.value), selectedConceptId: '' }))}>{Array.from({ length: 12 },(_,i)=>i+1).map((n)=><option key={n} value={n}>Class {n}</option>)}</select></label>
          <label className="admin-label">Curriculum concept<select className="admin-select" value={form.selectedConceptId} onChange={(e) => setForm((v) => ({ ...v, selectedConceptId: e.target.value }))}><option value="">No concept mapping</option>{(conceptsQuery.data || []).map((concept) => <option key={concept.id} value={concept.id}>{concept.subject_name || concept.subject_code} · {concept.chapter_title || 'Concept'} · {concept.name}</option>)}</select></label>
          <label className="admin-label">Source<select className="admin-select" value={form.sourceCode} onChange={(e) => changeSource(e.target.value)}>{(optionsQuery.data?.sources || []).map((source) => <option key={source.code} value={source.code}>{source.name}</option>)}</select></label>
          <label className="admin-label">Licence<input className="admin-input" value={form.licence} readOnly /></label>
          <label className="admin-label">Visibility<select className="admin-select" value={form.visibility} onChange={(e) => changeFormVisibility(e.target.value as LearningVisibility)}><option value="PUBLIC">Public</option><option value="REGISTERED">Registered</option><option value="CLASS_ONLY">Class only</option></select></label>
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
