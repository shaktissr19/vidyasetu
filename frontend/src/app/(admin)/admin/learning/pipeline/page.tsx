'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { apiErrorText } from '@/utils/errors';
import { getLearningResourcePreview } from '@/services/adminLearningService';
import LearningAsset from '@/components/learning/LearningAsset';
import LearningMarkdown from '@/components/learning/LearningMarkdown';
import {
  approveLearningPipelineIntake,
  getLearningPipelineOptions,
  getLearningPipelineQueue,
  materialiseLearningPipelineIntake,
  acquireLearningContent,
  createLearningCurriculumTopic,
  stageLearningPipelineContent,
  uploadLearningPipelineFile,
  updateLearningPipelineDraft,
  verifyLearningPipelineRights,
  type PipelineAccess,
  type PipelineCategory,
  type PipelineDeliveryMode,
  type PipelineLicence,
  type PipelineMediaKind,
  type PipelineOptions,
  type PipelineQueueItem,
  type PipelineVisibility,
  type StagePipelinePayload,
} from '@/services/learningContentPipelineService';

const panel = { padding: 20, borderRadius: 16 } as const;
const primary = { padding: '10px 16px', borderRadius: 10, border: 0, background: '#FF6B00', color: '#fff', fontWeight: 900, cursor: 'pointer' } as const;
const secondary = { padding: '9px 14px', borderRadius: 10, border: '1px solid #CBD5E1', background: '#fff', color: '#14213D', fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' } as const;
const LICENCES: PipelineLicence[] = ['VIDYASETU_ORIGINAL','CC_BY','CC_BY_SA','CC_BY_NC','CC_BY_NC_SA','CC_BY_ND','CC_BY_NC_ND','PUBLIC_DOMAIN','EXTERNAL_LINK_ONLY','PERMISSION_GRANTED','OTHER'];
const MEDIA_LABELS: Record<PipelineMediaKind, string> = {
  ARTICLE: 'Text / article', VIDEO: 'Video', AUDIO: 'Audio', IMAGE: 'Image / pictorial', INTERACTIVE: 'Interactive',
  DOCUMENT: 'Document (DOCX / TXT)', PDF: 'PDF', WORKSHEET: 'Worksheet', QUESTION_PAPER: 'Question paper', EXTERNAL_LINK: 'External link',
};

type FormState = StagePipelinePayload & { file: File | null };

const INITIAL_FORM: FormState = {
  sourceCode: 'VIDYASETU_ORIGINAL', title: '', mediaKind: 'ARTICLE', deliveryMode: 'VIDYASETU_ORIGINAL',
  sourceUrl: '', sourceItemId: '', embedUrl: '', storageKey: '', mimeType: '', byteSize: null,
  licenceCandidate: 'VIDYASETU_ORIGINAL', licenceUrl: '', attributionText: '', rightsEvidenceUrl: '',
  category: 'ACADEMIC', gradeCodes: [], boardCodes: ['COMMON'], subjectLabel: '', chapterLabel: '', topicLabel: '', language: 'en',
  visibility: 'REGISTERED', accessRequirement: 'REGISTERED', bodyMarkdown: '', bodyMarkdownHi: '', summary: '', summaryHi: '',
  thumbnailUrl: '', durationSecs: null, file: null, titleHi: '', difficulty: null, conceptIds: [], journeyStage: 'UNDERSTAND', transcript: '', altText: '',
};

function label(value: string): string { return value.replaceAll('_', ' '); }
function fieldValue(value: string | null | undefined): string { return value || ''; }

export default function LearningContentPipelinePage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [editingResourceId, setEditingResourceId] = useState('');
  const [resourceLoaded, setResourceLoaded] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [queueSearch, setQueueSearch] = useState('');
  const [assetUrl,setAssetUrl] = useState('');
  const [permissionConfirmed,setPermissionConfirmed] = useState(false);
  const [syllabusUrl,setSyllabusUrl] = useState('');
  const [academicYear,setAcademicYear] = useState('2026-27');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [openedFromSearch, setOpenedFromSearch] = useState(false);
  const [rightsDrafts, setRightsDrafts] = useState<Record<string, { licenceCandidate: PipelineLicence; attributionText: string; licenceUrl: string; rightsEvidenceUrl: string; reviewerNote: string }>>({});

  useEffect(() => { setEditingResourceId(new URLSearchParams(window.location.search).get('resource') || ''); }, []);
  const resourceQuery = useQuery({ queryKey: ['pipeline-draft-editor',editingResourceId], enabled: Boolean(editingResourceId), queryFn: () => getLearningResourcePreview(editingResourceId).then((response) => response.data.data) });
  useEffect(() => {
    const item = resourceQuery.data;
    if (!item || resourceLoaded) return;
    setForm({ ...INITIAL_FORM, title: item.title, titleHi: item.title_hi, mediaKind: item.resource_type as PipelineMediaKind,
      sourceCode: item.source_code, sourceUrl: item.source_url, deliveryMode: item.delivery_mode as PipelineDeliveryMode,
      category: item.category as PipelineCategory, gradeCodes: item.grade_codes || [], boardCodes: item.board_codes || ['COMMON'],
      subjectId: item.subject_id, subjectLabel: item.subject_label, chapterLabel: item.chapter_label, topicLabel: item.topic_label,
      bodyMarkdown: item.body_markdown, bodyMarkdownHi: item.body_markdown_hi, summary: item.summary, summaryHi: item.summary_hi,
      language: item.language, difficulty: item.difficulty, conceptIds: item.concept_ids || [], transcript: item.transcript, altText: item.alt_text,
      visibility: item.visibility as PipelineVisibility, accessRequirement: item.access_requirement,
      licenceCandidate: item.licence as PipelineLicence, licenceUrl: item.licence_url, rightsEvidenceUrl: item.rights_evidence_url, attributionText: item.attribution_text,
    });
    setResourceLoaded(true);
  }, [resourceQuery.data,resourceLoaded]);
  const optionsQuery = useQuery({ queryKey: ['learning-pipeline-options'], queryFn: () => getLearningPipelineOptions().then((response) => response.data.data) });
  const queueQuery = useQuery({ queryKey: ['learning-pipeline-queue'], queryFn: () => getLearningPipelineQueue().then((response) => response.data.data || []), refetchInterval: 30000 });
  const options = optionsQuery.data as PipelineOptions | undefined;
  const queue = queueQuery.data || [];

  useEffect(() => {
    if (!form.file) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(form.file); setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [form.file]);

  useEffect(() => {
    if (!options) return;
    setForm((current) => {
      const sourceExists = options.sources.some((item) => item.code === current.sourceCode);
      const gradeCodes = current.gradeCodes.filter((code) => options.grades.some((item) => item.code === code));
      const boardCodes = current.boardCodes.filter((code) => options.boards.some((item) => item.code === code));
      return {
        ...current,
        sourceCode: sourceExists ? current.sourceCode : (options.sources[0]?.code || 'VIDYASETU_ORIGINAL'),
        licenceCandidate: sourceExists ? current.licenceCandidate : ((options.sources[0]?.default_license || 'OTHER') as PipelineLicence),
        gradeCodes,
        boardCodes: boardCodes.length ? boardCodes : (options.boards.find((item) => item.code === 'COMMON') ? ['COMMON'] : options.boards[0] ? [options.boards[0].code] : []),
      };
    });
  }, [options]);

  const binaryNeedsFile = !editingResourceId && ['VIDEO','AUDIO','IMAGE','PDF','WORKSHEET','QUESTION_PAPER','DOCUMENT'].includes(form.mediaKind)
    && ['LICENSED_REHOST','VIDYASETU_ORIGINAL'].includes(form.deliveryMode);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['learning-pipeline-queue'] });
  };

  const stageMutation = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error('Enter a title');
      if (!form.gradeCodes.length || !form.boardCodes.length) throw new Error('Select at least one grade and board');
      let uploaded = { key: form.storageKey || null, contentType: form.mimeType || null, byteSize: form.byteSize || null };
      if (form.file && !editingResourceId) {
        const result = await uploadLearningPipelineFile(form.file);
        uploaded = { key: result.key, contentType: result.contentType, byteSize: result.byteSize };
      }
      const { file: _file, ...rest } = form;
      const payload: StagePipelinePayload = {
        ...rest, intakeId: editingId || undefined,
        title: form.title.trim(),
        sourceUrl: form.sourceUrl?.trim() || null,
        sourceItemId: form.sourceItemId?.trim() || null,
        embedUrl: form.embedUrl?.trim() || null,
        storageKey: uploaded.key,
        mimeType: uploaded.contentType,
        byteSize: uploaded.byteSize,
        licenceUrl: form.licenceUrl?.trim() || null,
        attributionText: form.attributionText?.trim() || null,
        rightsEvidenceUrl: form.rightsEvidenceUrl?.trim() || null,
        subjectLabel: form.subjectLabel?.trim() || null,
        chapterLabel: form.chapterLabel?.trim() || null,
        topicLabel: form.topicLabel?.trim() || null,
        summary: form.summary?.trim() || null,
        summaryHi: form.summaryHi?.trim() || null,
        bodyMarkdown: form.bodyMarkdown?.trim() || null,
        bodyMarkdownHi: form.bodyMarkdownHi?.trim() || null,
        thumbnailUrl: form.thumbnailUrl?.trim() || null,
        durationSecs: form.durationSecs || null,
      };
      if (!editingResourceId && !form.file && assetUrl.trim() && form.deliveryMode === 'LICENSED_REHOST') {
        if (!permissionConfirmed) throw new Error('Review the asset permission and confirm copying/distribution rights');
        return acquireLearningContent({...payload,assetUrl:assetUrl.trim(),permissionConfirmed:true});
      }
      return editingResourceId ? updateLearningPipelineDraft(editingResourceId,payload) : stageLearningPipelineContent(payload);
    },
    onSuccess: async () => { if (editingResourceId) { toast.success('Draft corrected; repeat Library quality review.'); await resourceQuery.refetch(); return; } toast.success('Staged. Verify rights before approval.'); setEditingId(''); setAssetUrl(''); setPermissionConfirmed(false); setForm((current) => ({ ...INITIAL_FORM, gradeCodes: current.gradeCodes, boardCodes: current.boardCodes })); await refresh(); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not stage content')),
  });

  const rightsMutation = useMutation({
    mutationFn: ({ intakeId, payload }: { intakeId: string; payload: { licenceCandidate: PipelineLicence; attributionText: string; licenceUrl: string; rightsEvidenceUrl: string; reviewerNote: string } }) => verifyLearningPipelineRights(intakeId, { ...payload, licenceUrl: payload.licenceUrl || null, rightsEvidenceUrl: payload.rightsEvidenceUrl || null, reviewerNote: payload.reviewerNote || null }),
    onSuccess: async () => { toast.success('Rights verified and recorded.'); await refresh(); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Rights verification failed')),
  });
  const approveMutation = useMutation({
    mutationFn: (intakeId: string) => approveLearningPipelineIntake(intakeId),
    onSuccess: async () => { toast.success('Approved for Content Library handoff.'); await refresh(); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Approval blocked')),
  });
  const materialiseMutation = useMutation({
    mutationFn: (intakeId: string) => materialiseLearningPipelineIntake(intakeId),
    onSuccess: async () => { toast.success('Created a DRAFT in Content Library. Review and publish it there.'); await refresh(); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not create Learning draft')),
  });

  function update<K extends keyof FormState>(key: K, value: FormState[K]) { setForm((current) => ({ ...current, [key]: value })); }
  function updateSource(code: string) {
    const next = options?.sources.find((item) => item.code === code);
    setForm((current) => ({ ...current, sourceCode: code, licenceCandidate: (next?.default_license || 'OTHER') as PipelineLicence, deliveryMode: code === 'VIDYASETU_ORIGINAL' ? 'VIDYASETU_ORIGINAL' : current.deliveryMode === 'VIDYASETU_ORIGINAL' ? 'EXTERNAL_LINK' : current.deliveryMode }));
  }
  function updateVisibility(visibility: PipelineVisibility) { setForm((current) => ({ ...current, visibility, accessRequirement: visibility === 'PUBLIC' ? 'PUBLIC' : current.accessRequirement === 'PUBLIC' ? 'REGISTERED' : current.accessRequirement })); }
  function updateAccess(accessRequirement: PipelineAccess) { setForm((current) => ({ ...current, accessRequirement, visibility: accessRequirement === 'PUBLIC' ? 'PUBLIC' : current.visibility === 'PUBLIC' ? 'REGISTERED' : current.visibility })); }
  function setRights(item: PipelineQueueItem, key: keyof ReturnType<typeof rightsFor>, value: string) {
    setRightsDrafts((current) => ({ ...current, [item.id]: { ...rightsFor(item), [key]: value } }));
  }
  function rightsFor(item: PipelineQueueItem) {
    return rightsDrafts[item.id] || {
      licenceCandidate: item.licence_candidate || 'OTHER', attributionText: item.attribution_text || '', licenceUrl: item.licence_url || '', rightsEvidenceUrl: item.rights_evidence_url || '', reviewerNote: '',
    };
  }

  function configure(item: PipelineQueueItem) {
    const metadata = item.metadata || {};
    const inferredGrade = item.grade_code || (options?.grades.some((grade) => grade.code === item.class_hint) ? item.class_hint : '') || (/Class\s*(\d+)/i.exec(item.class_hint || '')?.[1] ? `CLASS_${/Class\s*(\d+)/i.exec(item.class_hint || '')![1]}` : '');
    const discoveredKind = item.discovered_media_kind;
    const mediaKind = (item.asset_id ? item.media_kind : discoveredKind && !['LINK','COURSE','ARTICLE'].includes(discoveredKind) ? discoveredKind : 'EXTERNAL_LINK') as PipelineMediaKind;
    setEditingId(item.id); setAssetUrl(item.discovered_asset_url || ''); setPermissionConfirmed(false);
    setForm({ ...INITIAL_FORM, ...metadata, file: null, title: item.title, sourceCode: item.source_code,
      sourceUrl: item.source_url, sourceItemId: item.source_item_id, mediaKind,
      deliveryMode: item.delivery_mode, embedUrl: item.embed_url || (item.discovered_embed_url && /^https:\/\/(www\.youtube(?:-nocookie)?\.com\/embed\/|player\.vimeo\.com\/video\/|phet\.colorado\.edu\/sims\/)/.test(item.discovered_embed_url) ? item.discovered_embed_url : ''), storageKey: item.storage_key || '', mimeType: item.mime_type || '', byteSize: item.byte_size,
      licenceCandidate: item.licence_candidate || 'OTHER', attributionText: item.attribution_text || '', licenceUrl: item.licence_url || '', rightsEvidenceUrl: item.rights_evidence_url || '',
      gradeCodes: metadata.gradeCodes || (inferredGrade ? [inferredGrade] : []), boardCodes: metadata.boardCodes || [item.board_hint || 'COMMON'],
      conceptIds:metadata.conceptIds || item.discovery_context?.conceptIds || [],subjectId:metadata.subjectId || item.discovery_context?.subjectId || null,chapterLabel:metadata.chapterLabel || item.discovery_context?.chapterLabel || '',topicLabel:metadata.topicLabel || item.discovery_context?.topicLabel || '',language:metadata.language || item.discovered_language || 'en',durationSecs:metadata.durationSecs || item.discovered_duration || null,
      subjectLabel: metadata.subjectLabel || item.subject_hint || '', thumbnailUrl: metadata.thumbnailUrl || item.discovered_thumbnail_url || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  useEffect(() => {
    if (openedFromSearch || !queue.length) return;
    const intakeId = new URLSearchParams(window.location.search).get('intake');
    const item = queue.find((entry) => entry.id === intakeId);
    if (item && item.status !== 'IMPORTED') { configure(item); setOpenedFromSearch(true); }
  }, [queue, openedFromSearch]);
  const topicMutation = useMutation({
    mutationFn: () => {
      if (!form.gradeCodes.length || !form.subjectId || !form.topicLabel?.trim()) throw new Error('Select a grade, subject and topic name first');
      return createLearningCurriculumTopic({gradeCode:form.gradeCodes[0],subjectId:form.subjectId,name:form.topicLabel.trim(),chapterTitle:form.chapterLabel || '',academicYear,evidenceUrl:syllabusUrl});
    },
    onSuccess: async response => { await optionsQuery.refetch(); update('conceptIds',[...(form.conceptIds || []),response.data.data.id]); toast.success('Curriculum topic saved and mapped. Academic review is still required.'); },
    onError: error => toast.error(apiErrorText(error,'Could not add curriculum topic')),
  });
  const publicationBlockers = [!form.titleHi?.trim() && 'Hindi title',!form.summary?.trim() && 'English summary',!form.summaryHi?.trim() && 'Hindi summary',!form.gradeCodes.length && 'Grade',!form.boardCodes.length && 'Board',form.category === 'ACADEMIC' && !form.subjectId && 'Subject',form.category === 'ACADEMIC' && !form.topicLabel?.trim() && 'Topic',form.category === 'ACADEMIC' && !form.difficulty && 'Difficulty',form.category === 'ACADEMIC' && !form.conceptIds?.length && 'Curriculum mapping',form.mediaKind === 'ARTICLE' && !form.bodyMarkdown?.trim() && 'English article',form.mediaKind === 'ARTICLE' && !form.bodyMarkdownHi?.trim() && 'Hindi article'].filter(Boolean);
  const filteredQueue = queue.filter((item) => `${item.title} ${item.source_name} ${item.status}`.toLowerCase().includes(queueSearch.toLowerCase()));

  return (
    <div className="admin-page" style={{ padding: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <div style={{ color: '#FF6B00', fontSize: 12, fontWeight: 900, letterSpacing: '.12em' }}>CONTENT PIPELINE</div>
          <h1 style={{ margin: '5px 0', fontSize: 34 }}>Prepare content for your Library</h1>
          <p className="admin-muted" style={{ maxWidth: 900, lineHeight: 1.65 }}>Use one workflow for VidyaSetu originals, licensed files and official provider links/embeds. UKG, LKG, nursery and Classes 1–12 are first-class grade choices.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Link href="/admin/learning/factory" style={secondary}>Source search</Link><Link href="/admin/learning/practice" style={secondary}>Q&amp;A / practice tests</Link><Link href="/admin/learning/creator" style={secondary}>AI lesson &amp; question drafts</Link><Link href="/admin/learning" style={secondary}>Content Library</Link></div>
      </div>

      <div className="admin-panel-muted" style={{padding:12,marginBottom:12}}><strong>Publication checklist:</strong> {publicationBlockers.length ? `Complete ${publicationBlockers.join(', ')}. You can save a draft first.` : 'Metadata complete. Library academic, language, safety, accessibility and rights reviews still apply.'}</div>
      <div className="admin-warning-note" style={{ padding: 13, marginBottom: 16 }}><strong>Rights boundary:</strong> this module never downloads or bypasses a source login. External items remain link/embed-first until an administrator verifies item-level licence, attribution and evidence. Only explicitly uploaded/owned or licensed assets may be rehosted.</div>
      {editingResourceId && <p className="admin-warning-note">Draft corrections create a revision and reset quality reviews. Archive published content, then restore it to Draft in Library before editing. Source and media delivery cannot be changed here.</p>}
      {resourceQuery.isError && <p role="alert">Could not load the draft.</p>}
      {options?.policy && <div className="admin-success-note" style={{ padding: 13, marginBottom: 16 }}>{options.policy}</div>}

      <section className="admin-panel" style={{ ...panel, marginBottom: 18 }}>
        <h2 style={{ marginTop: 0 }}>{editingResourceId ? '1. Correct Library draft' : editingId ? '1. Complete selected content' : '1. Write or upload content'}</h2><p className="admin-muted">Choose the audience, format and delivery. Academic publication also requires a subject, topic, difficulty and curriculum concept. Saving changes resets intake approval so the final delivery can be reviewed.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12 }}>
          <label className="admin-label">English title *<input className="admin-input" value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="e.g. Counting objects up to 20" /></label>
          <label className="admin-label">Hindi title<input className="admin-input" value={fieldValue(form.titleHi)} onChange={(event) => update('titleHi', event.target.value)} /></label>
          <label className="admin-label">Difficulty<select className="admin-select" value={form.difficulty || ''} onChange={(event) => update('difficulty', (event.target.value || null) as FormState['difficulty'])}><option value="">Select / not applicable</option><option value="EASY">Easy</option><option value="MODERATE">Moderate</option><option value="ADVANCED">Advanced / difficult</option></select></label>
          <label className="admin-label">Content type<select className="admin-select" value={form.mediaKind} disabled={Boolean(editingResourceId)} onChange={(event) => update('mediaKind', event.target.value as PipelineMediaKind)}>{(options?.mediaKinds || Object.keys(MEDIA_LABELS) as PipelineMediaKind[]).map((kind) => <option key={kind} value={kind}>{MEDIA_LABELS[kind]}</option>)}</select></label>
          <label className="admin-label">Delivery mode<select className="admin-select" value={form.deliveryMode} disabled={Boolean(editingResourceId)} onChange={(event) => update('deliveryMode', event.target.value as PipelineDeliveryMode)}>{(options?.deliveryModes || []).map((mode) => <option key={mode.code} value={mode.code}>{mode.label}</option>)}</select></label>
          <label className="admin-label">Source/provider<select className="admin-select" value={form.sourceCode} disabled={Boolean(editingResourceId)} onChange={(event) => updateSource(event.target.value)}>{(options?.sources || []).map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
          <label className="admin-label">Language<input className="admin-input" value={fieldValue(form.language)} onChange={(event) => update('language', event.target.value)} placeholder="en, hi or en-hi" /></label>
          <label className="admin-label">Subject {form.category === 'ACADEMIC' ? '(required for publication)' : '(optional)'}<select className="admin-select" value={form.subjectId || ''} onChange={(event) => setForm((current) => ({ ...current, subjectId: event.target.value || null, subjectLabel: options?.subjects.find((item) => item.id === event.target.value)?.name || '', conceptIds: [] }))}><option value="">Select subject…</option>{options?.subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="admin-label">Content category *<select className="admin-select" value={form.category} onChange={(event) => update('category', event.target.value as PipelineCategory)}>{(options?.categories || []).map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12, marginTop: 12 }}>
          <label className="admin-label">Grades <span className="admin-muted">(Ctrl/Cmd-click for multiple)</span><select className="admin-select" multiple size={6} value={form.gradeCodes} onChange={(event) => update('gradeCodes', Array.from(event.target.selectedOptions).map((option) => option.value))}>{(options?.grades || []).map((grade) => <option key={grade.code} value={grade.code}>{grade.name} ({grade.code})</option>)}</select></label>
          <label className="admin-label">Boards <span className="admin-muted">(COMMON works across boards)</span><select className="admin-select" multiple size={6} value={form.boardCodes} onChange={(event) => update('boardCodes', Array.from(event.target.selectedOptions).map((option) => option.value))}>{(options?.boards || []).map((board) => <option key={board.code} value={board.code}>{board.short_name || board.name} ({board.code})</option>)}</select></label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12, marginTop: 12 }}>
          <label className="admin-label">Chapter / unit<input className="admin-input" value={fieldValue(form.chapterLabel)} onChange={(event) => update('chapterLabel', event.target.value)} /></label>
          <label className="admin-label">Topic / learning outcome<input className="admin-input" value={fieldValue(form.topicLabel)} onChange={(event) => update('topicLabel', event.target.value)} /></label>
          <label className="admin-label">Duration (seconds)<input className="admin-input" type="number" min={1} value={form.durationSecs || ''} onChange={(event) => update('durationSecs', event.target.value ? Number(event.target.value) : null)} /></label>
        </div>

        {form.category === 'ACADEMIC' && <div style={{ marginTop: 12 }}>
          <label className="admin-label">Curriculum concepts (required before publication)<select className="admin-select" multiple size={4} value={form.conceptIds || []} onChange={(event) => update('conceptIds', Array.from(event.target.selectedOptions).map((item) => item.value))}>{options?.concepts.filter((item) => form.gradeCodes.includes(item.grade_code) && (!form.subjectId || item.subject_id === form.subjectId)).map((item) => <option key={item.id} value={item.id}>{item.grade_code} · {item.chapter_title} · {item.name}</option>)}</select></label>
          <label className="admin-label">Learning journey stage<select className="admin-select" value={form.journeyStage || 'UNDERSTAND'} onChange={(event) => update('journeyStage', event.target.value as FormState['journeyStage'])}>{['SEE','UNDERSTAND','DO','PRACTISE','APPLY','REVISE'].map((stage) => <option key={stage}>{stage}</option>)}</select></label>
          {!options?.concepts.some((item) => form.gradeCodes.includes(item.grade_code) && (!form.subjectId || item.subject_id === form.subjectId)) && <p className="admin-warning-note">No matching curriculum topics exist. Select a grade and subject, enter the topic above, then add it with syllabus evidence below.</p>}
        </div>}
        {form.category === 'ACADEMIC' && <details style={{marginTop:12}}><summary>Add curriculum topic from a reviewed syllabus</summary><p className="admin-muted">Uses the first selected grade, selected subject, chapter and topic. This creates a curriculum draft, not a certified syllabus or published lesson.</p><label className="admin-label">Academic year<input className="admin-input" value={academicYear} onChange={e=>setAcademicYear(e.target.value)} /></label><label className="admin-label">Exact syllabus / curriculum evidence URL<input className="admin-input" type="url" value={syllabusUrl} onChange={e=>setSyllabusUrl(e.target.value)} /></label><button type="button" style={secondary} disabled={topicMutation.isPending || !form.subjectId || !form.gradeCodes.length || !form.topicLabel || !syllabusUrl} onClick={()=>topicMutation.mutate()}>Add and map curriculum topic</button></details>}
        {!editingResourceId && form.deliveryMode !== 'VIDYASETU_ORIGINAL' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12, marginTop: 12 }}>
          <label className="admin-label">Original source URL<input className="admin-input" value={fieldValue(form.sourceUrl)} onChange={(event) => update('sourceUrl', event.target.value)} placeholder="https://diksha.gov.in/..." /></label>
          <label className="admin-label">Official embed URL {form.deliveryMode === 'OFFICIAL_EMBED' && <span className="admin-muted">(provider-approved)</span>}<input className="admin-input" value={fieldValue(form.embedUrl)} onChange={(event) => update('embedUrl', event.target.value)} placeholder="https://.../embed/..." /></label>
        </div>}

        {binaryNeedsFile && form.deliveryMode === 'LICENSED_REHOST' && <div className="admin-panel-muted" style={{padding:14,marginTop:12}}><strong>Import a permitted media file into VidyaSetu</strong><p>Enter the actual MP4/audio/image/PDF URL on an approved provider host, or upload a licensed file below. A provider lesson page or protected stream cannot be imported. Imports are bounded in size and time; large files use the upload path.</p><label className="admin-label">Direct media file URL<input className="admin-input" type="url" value={assetUrl} onChange={e=>{setAssetUrl(e.target.value);setPermissionConfirmed(false);}} /></label><label><input type="checkbox" checked={permissionConfirmed} onChange={e=>setPermissionConfirmed(e.target.checked)} /> I reviewed the specific asset's licence and permission to copy/distribute it, and recorded attribution and evidence below.</label></div>}
        {binaryNeedsFile && <label className="admin-label" style={{ marginTop: 12 }}>Upload an original or explicitly licensed file<input className="admin-input" type="file" accept=".mp4,.webm,.mp3,.m4a,.wav,.ogg,.png,.jpg,.jpeg,.webp,.pdf,.docx,.txt" onChange={(event) => update('file', event.target.files?.[0] || null)} />{form.file && <span className="admin-muted">{form.file.name} · {(form.file.size / (1024 * 1024)).toFixed(1)} MB</span>}</label>}
        {form.mediaKind === 'ARTICLE' && <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(270px,1fr))', gap: 12, marginTop: 12 }}>
            <label className="admin-label">English text / Markdown<textarea className="admin-textarea" style={{ minHeight: 160 }} value={fieldValue(form.bodyMarkdown)} onChange={(event) => update('bodyMarkdown', event.target.value)} placeholder={'# Lesson heading\n\nWrite a paragraph, then use - for a list item.'} /></label>
            <label className="admin-label">Hindi text / Markdown<textarea className="admin-textarea" style={{ minHeight: 160 }} value={fieldValue(form.bodyMarkdownHi)} onChange={(event) => update('bodyMarkdownHi', event.target.value)} placeholder={'# पाठ का शीर्षक\n\nअनुच्छेद लिखें और सूची के लिए - का उपयोग करें।'} /></label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(270px,1fr))', gap: 12, marginTop: 12 }}>
            <section className="admin-panel-muted" style={{ padding: 14, borderRadius: 12 }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 14 }}>English learner preview</h3>
              {form.bodyMarkdown?.trim() ? <LearningMarkdown body={form.bodyMarkdown} /> : <p className="admin-muted" style={{ margin: 0 }}>Your formatted lesson will appear here as you write.</p>}
            </section>
            <section className="admin-panel-muted" style={{ padding: 14, borderRadius: 12 }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 14 }}>Hindi learner preview</h3>
              {form.bodyMarkdownHi?.trim() ? <LearningMarkdown body={form.bodyMarkdownHi} /> : <p className="admin-muted" style={{ margin: 0 }}>हिंदी पाठ का पूर्वावलोकन यहाँ दिखेगा।</p>}
            </section>
          </div>
        </>}
        <div style={{ marginTop: 12 }}>
          <label className="admin-label">Image description / alt text<input className="admin-input" value={fieldValue(form.altText)} onChange={(event) => update('altText', event.target.value)} /></label>
          <label className="admin-label">Transcript / accessible text<textarea className="admin-textarea" value={fieldValue(form.transcript)} onChange={(event) => update('transcript', event.target.value)} /></label>
          {previewUrl && <LearningAsset title={form.title || 'Preview'} kind={form.mediaKind} contentUrl={previewUrl} mimeType={form.file?.type} altText={form.altText} />}
          {form.deliveryMode === 'OFFICIAL_EMBED' && form.embedUrl && <p className="admin-muted">The approved official player will be previewed in Library after rights verification. Provider login and embedding restrictions still apply.</p>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12, marginTop: 12 }}><label className="admin-label">English summary<textarea className="admin-textarea" style={{ minHeight: 70 }} value={fieldValue(form.summary)} onChange={(event) => update('summary', event.target.value)} /></label><label className="admin-label">Hindi summary<textarea className="admin-textarea" style={{ minHeight: 70 }} value={fieldValue(form.summaryHi)} onChange={(event) => update('summaryHi', event.target.value)} /></label></div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12, marginTop: 12 }}>
          <label className="admin-label">Licence candidate<select className="admin-select" value={form.licenceCandidate || 'OTHER'} disabled={Boolean(editingResourceId)} onChange={(event) => update('licenceCandidate', event.target.value as PipelineLicence)}>{LICENCES.map((licence) => <option key={licence} value={licence}>{label(licence)}</option>)}</select></label>
          <label className="admin-label">Visibility<select className="admin-select" value={form.visibility} onChange={(event) => updateVisibility(event.target.value as PipelineVisibility)}><option value="PUBLIC">Public</option><option value="REGISTERED">Registered learners</option><option value="CLASS_ONLY">Class only</option></select></label>
          <label className="admin-label">Access requirement<select className="admin-select" value={form.accessRequirement} onChange={(event) => updateAccess(event.target.value as PipelineAccess)}><option value="PUBLIC">Public/free</option><option value="REGISTERED">Login required</option><option value="SUBSCRIBER">Subscriber</option></select></label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12, marginTop: 12 }}><label className="admin-label">Licence URL<input className="admin-input" value={fieldValue(form.licenceUrl)} onChange={(event) => update('licenceUrl', event.target.value)} placeholder="https://creativecommons.org/..." /></label><label className="admin-label">Attribution text<input className="admin-input" value={fieldValue(form.attributionText)} onChange={(event) => update('attributionText', event.target.value)} placeholder="Creator, publisher and licence credit" /></label><label className="admin-label">Rights evidence URL<input className="admin-input" value={fieldValue(form.rightsEvidenceUrl)} onChange={(event) => update('rightsEvidenceUrl', event.target.value)} placeholder="Exact item/licence evidence" /></label></div>
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}><button type="button" style={primary} disabled={stageMutation.isPending || !form.title.trim()} onClick={() => stageMutation.mutate()}>{stageMutation.isPending ? 'Acquiring & staging…' : editingResourceId ? 'Save draft correction' : assetUrl && form.deliveryMode === 'LICENSED_REHOST' && !form.file ? 'Import licensed file & stage' : editingId ? 'Save details for review' : 'Stage content for review'}</button><span className="admin-muted">Staging does not publish. The next section records rights verification and approval.</span></div>
      </section>

      <section className="admin-panel" style={{ ...panel }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}><div><h2 style={{ margin: 0 }}>2. Rights review queue</h2><p className="admin-muted" style={{ margin: '5px 0 0' }}>Verify exact item-level evidence, approve the intake, then materialise a normal DRAFT in Content Library.</p></div><button type="button" style={secondary} onClick={() => queueQuery.refetch()}>Refresh</button></div>
        <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
          <label className="admin-label">Search review queue<input className="admin-input" value={queueSearch} onChange={(event) => setQueueSearch(event.target.value)} placeholder="Title, provider or status" /></label>
          {filteredQueue.map((item) => {
            const rights = rightsFor(item);
            return <article key={item.id} className="admin-panel-muted" style={{ padding: 16, borderRadius: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><div><strong>{item.title}</strong><div className="admin-muted" style={{ marginTop: 4 }}>{item.source_name} · {MEDIA_LABELS[item.media_kind]} · {label(item.category)} · {label(item.delivery_mode)} · {label(item.status)}</div></div><span className="admin-chip">Rights: {label(item.rights_status)}</span></div>
              <div style={{ marginTop: 8, fontSize: 12, color: '#475467' }}>{item.source_url && <a href={item.source_url} target="_blank" rel="noopener noreferrer">Inspect original source / rights ↗</a>}{item.storage_key ? ` · In-platform media ${item.processing_status || 'registered'}` : ''}{item.imported_resource_id && <Link href="/admin/learning"> · Open Library to preview &amp; publish</Link>}</div>
              {item.status !== 'IMPORTED' && <>
                <button type="button" style={secondary} onClick={() => configure(item)}>{item.asset_id ? 'Edit details / delivery' : 'Complete details / choose delivery'}</button>
                {!item.asset_id && <p className="admin-warning-note">This search result needs grade, board and delivery details before rights review.</p>}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 9, marginTop: 12 }}><label className="admin-label">Licence<select className="admin-select" value={rights.licenceCandidate} onChange={(event) => setRights(item, 'licenceCandidate', event.target.value)}>{LICENCES.map((licence) => <option key={licence} value={licence}>{label(licence)}</option>)}</select></label><label className="admin-label">Attribution<input className="admin-input" value={rights.attributionText} onChange={(event) => setRights(item, 'attributionText', event.target.value)} /></label><label className="admin-label">Licence URL<input className="admin-input" value={rights.licenceUrl} onChange={(event) => setRights(item, 'licenceUrl', event.target.value)} /></label><label className="admin-label">Evidence URL<input className="admin-input" value={rights.rightsEvidenceUrl} onChange={(event) => setRights(item, 'rightsEvidenceUrl', event.target.value)} /></label></div>
                <label className="admin-label" style={{ marginTop: 9 }}>Reviewer note<input className="admin-input" value={rights.reviewerNote} onChange={(event) => setRights(item, 'reviewerNote', event.target.value)} /></label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 11 }}><button type="button" style={secondary} disabled={rightsMutation.isPending || !item.asset_id || !rights.attributionText.trim()} onClick={() => rightsMutation.mutate({ intakeId: item.id, payload: rights })}>Verify rights</button><button type="button" style={secondary} disabled={approveMutation.isPending || item.rights_status !== 'VERIFIED'} onClick={() => approveMutation.mutate(item.id)}>Approve intake</button><button type="button" style={primary} disabled={materialiseMutation.isPending || !item.asset_id || item.rights_status !== 'VERIFIED' || item.status !== 'APPROVED'} onClick={() => materialiseMutation.mutate(item.id)}>Create Content Library draft</button></div>
              </>}
            </article>;
          })}
          {!queue.length && <div className="admin-panel-muted" style={{ padding: 20, color: '#667085' }}>{queueQuery.isLoading ? 'Loading queue…' : 'No staged items yet. Start with an original, licensed upload or official source link above.'}</div>}
        </div>
      </section>
    </div>
  );
}
