'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { apiErrorText } from '@/utils/errors';
import {
  approveLearningPipelineIntake,
  getLearningPipelineOptions,
  getLearningPipelineQueue,
  materialiseLearningPipelineIntake,
  stageLearningPipelineContent,
  uploadLearningPipelineFile,
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
const LICENCES: PipelineLicence[] = ['VIDYASETU_ORIGINAL','CC_BY','CC_BY_SA','CC_BY_NC','CC_BY_NC_SA','CC_BY_ND','CC_BY_NC_ND','PUBLIC_DOMAIN','EXTERNAL_LINK_ONLY','OTHER'];
const MEDIA_LABELS: Record<PipelineMediaKind, string> = {
  ARTICLE: 'Text / article', VIDEO: 'Video', AUDIO: 'Audio', IMAGE: 'Image / pictorial', INTERACTIVE: 'Interactive',
  PDF: 'PDF', WORKSHEET: 'Worksheet', QUESTION_PAPER: 'Question paper', EXTERNAL_LINK: 'External link',
};

type FormState = StagePipelinePayload & { file: File | null };

const INITIAL_FORM: FormState = {
  sourceCode: 'VIDYASETU_ORIGINAL', title: '', mediaKind: 'ARTICLE', deliveryMode: 'VIDYASETU_ORIGINAL',
  sourceUrl: '', sourceItemId: '', embedUrl: '', storageKey: '', mimeType: '', byteSize: null,
  licenceCandidate: 'VIDYASETU_ORIGINAL', licenceUrl: '', attributionText: '', rightsEvidenceUrl: '',
  category: 'ACADEMIC', gradeCodes: ['UKG'], boardCodes: ['COMMON'], subjectLabel: '', chapterLabel: '', topicLabel: '', language: 'en',
  visibility: 'PUBLIC', accessRequirement: 'PUBLIC', bodyMarkdown: '', bodyMarkdownHi: '', summary: '', summaryHi: '',
  thumbnailUrl: '', durationSecs: null, file: null,
};

function label(value: string): string { return value.replaceAll('_', ' '); }
function fieldValue(value: string | null | undefined): string { return value || ''; }

export default function LearningContentPipelinePage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [rightsDrafts, setRightsDrafts] = useState<Record<string, { licenceCandidate: PipelineLicence; attributionText: string; licenceUrl: string; rightsEvidenceUrl: string; reviewerNote: string }>>({});

  const optionsQuery = useQuery({ queryKey: ['learning-pipeline-options'], queryFn: () => getLearningPipelineOptions().then((response) => response.data.data) });
  const queueQuery = useQuery({ queryKey: ['learning-pipeline-queue'], queryFn: () => getLearningPipelineQueue().then((response) => response.data.data || []), refetchInterval: 30000 });
  const options = optionsQuery.data as PipelineOptions | undefined;
  const queue = queueQuery.data || [];

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
        gradeCodes: gradeCodes.length ? gradeCodes : (options.grades[0] ? [options.grades[0].code] : []),
        boardCodes: boardCodes.length ? boardCodes : (options.boards.find((item) => item.code === 'COMMON') ? ['COMMON'] : options.boards[0] ? [options.boards[0].code] : []),
      };
    });
  }, [options]);

  const binaryNeedsFile = ['VIDEO','AUDIO','IMAGE','PDF','WORKSHEET','QUESTION_PAPER'].includes(form.mediaKind)
    && ['LICENSED_REHOST','VIDYASETU_ORIGINAL'].includes(form.deliveryMode);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['learning-pipeline-queue'] });
  };

  const stageMutation = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error('Enter a title');
      if (!form.gradeCodes.length || !form.boardCodes.length) throw new Error('Select at least one grade and board');
      let uploaded = { key: form.storageKey || null, contentType: form.mimeType || null, byteSize: form.byteSize || null };
      if (form.file) {
        const result = await uploadLearningPipelineFile(form.file);
        uploaded = { key: result.key, contentType: result.contentType, byteSize: result.byteSize };
      }
      const { file: _file, ...rest } = form;
      return stageLearningPipelineContent({
        ...rest,
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
      });
    },
    onSuccess: async () => { toast.success('Staged. Verify rights before approval.'); setForm((current) => ({ ...INITIAL_FORM, gradeCodes: current.gradeCodes, boardCodes: current.boardCodes })); await refresh(); },
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
    onSuccess: async () => { toast.success('Created a DRAFT in Content Library.'); await refresh(); },
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

  return (
    <div className="admin-page" style={{ padding: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <div style={{ color: '#FF6B00', fontSize: 12, fontWeight: 900, letterSpacing: '.12em' }}>CONTENT PIPELINE</div>
          <h1 style={{ margin: '5px 0', fontSize: 34 }}>Stage video, audio, text & pictorial content</h1>
          <p className="admin-muted" style={{ maxWidth: 900, lineHeight: 1.65 }}>Use one workflow for VidyaSetu originals, licensed files and official provider links/embeds. UKG, LKG, nursery and Classes 1–12 are first-class grade choices.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Link href="/admin/learning/factory" style={secondary}>Source search</Link><Link href="/admin/learning" style={secondary}>Content Library</Link></div>
      </div>

      <div className="admin-warning-note" style={{ padding: 13, marginBottom: 16 }}><strong>Rights boundary:</strong> this module never downloads or bypasses a source login. External items remain link/embed-first until an administrator verifies item-level licence, attribution and evidence. Only explicitly uploaded/owned or licensed assets may be rehosted.</div>
      {options?.policy && <div className="admin-success-note" style={{ padding: 13, marginBottom: 16 }}>{options.policy}</div>}

      <section className="admin-panel" style={{ ...panel, marginBottom: 18 }}>
        <h2 style={{ marginTop: 0 }}>1. Stage a content item</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(170px,1fr))', gap: 12 }}>
          <label className="admin-label">Title<input className="admin-input" value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="e.g. Counting objects up to 20" /></label>
          <label className="admin-label">Content type<select className="admin-select" value={form.mediaKind} onChange={(event) => update('mediaKind', event.target.value as PipelineMediaKind)}>{(options?.mediaKinds || Object.keys(MEDIA_LABELS) as PipelineMediaKind[]).map((kind) => <option key={kind} value={kind}>{MEDIA_LABELS[kind]}</option>)}</select></label>
          <label className="admin-label">Delivery mode<select className="admin-select" value={form.deliveryMode} onChange={(event) => update('deliveryMode', event.target.value as PipelineDeliveryMode)}>{(options?.deliveryModes || []).map((mode) => <option key={mode.code} value={mode.code}>{mode.label}</option>)}</select></label>
          <label className="admin-label">Source/provider<select className="admin-select" value={form.sourceCode} onChange={(event) => updateSource(event.target.value)}>{(options?.sources || []).map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
          <label className="admin-label">Language<input className="admin-input" value={fieldValue(form.language)} onChange={(event) => update('language', event.target.value)} placeholder="en, hi or en-hi" /></label>
          <label className="admin-label">Subject<input className="admin-input" value={fieldValue(form.subjectLabel)} onChange={(event) => update('subjectLabel', event.target.value)} placeholder="Mathematics" /></label>
          <label className="admin-label">Public learning category<select className="admin-select" value={form.category} onChange={(event) => update('category', event.target.value as PipelineCategory)}>{(options?.categories || []).map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
          <label className="admin-label">Grades <span className="admin-muted">(Ctrl/Cmd-click for multiple)</span><select className="admin-select" multiple size={6} value={form.gradeCodes} onChange={(event) => update('gradeCodes', Array.from(event.target.selectedOptions).map((option) => option.value))}>{(options?.grades || []).map((grade) => <option key={grade.code} value={grade.code}>{grade.name} ({grade.code})</option>)}</select></label>
          <label className="admin-label">Boards <span className="admin-muted">(COMMON works across boards)</span><select className="admin-select" multiple size={6} value={form.boardCodes} onChange={(event) => update('boardCodes', Array.from(event.target.selectedOptions).map((option) => option.value))}>{(options?.boards || []).map((board) => <option key={board.code} value={board.code}>{board.short_name || board.name} ({board.code})</option>)}</select></label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(170px,1fr))', gap: 12, marginTop: 12 }}>
          <label className="admin-label">Chapter / unit<input className="admin-input" value={fieldValue(form.chapterLabel)} onChange={(event) => update('chapterLabel', event.target.value)} /></label>
          <label className="admin-label">Topic / learning outcome<input className="admin-input" value={fieldValue(form.topicLabel)} onChange={(event) => update('topicLabel', event.target.value)} /></label>
          <label className="admin-label">Duration (seconds)<input className="admin-input" type="number" min={1} value={form.durationSecs || ''} onChange={(event) => update('durationSecs', event.target.value ? Number(event.target.value) : null)} /></label>
        </div>

        {form.deliveryMode !== 'VIDYASETU_ORIGINAL' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
          <label className="admin-label">Original source URL<input className="admin-input" value={fieldValue(form.sourceUrl)} onChange={(event) => update('sourceUrl', event.target.value)} placeholder="https://diksha.gov.in/..." /></label>
          <label className="admin-label">Official embed URL {form.deliveryMode === 'OFFICIAL_EMBED' && <span className="admin-muted">(provider-approved)</span>}<input className="admin-input" value={fieldValue(form.embedUrl)} onChange={(event) => update('embedUrl', event.target.value)} placeholder="https://.../embed/..." /></label>
        </div>}

        {binaryNeedsFile && <label className="admin-label" style={{ marginTop: 12 }}>Upload the explicitly owned/licensed file<input className="admin-input" type="file" accept="video/*,audio/*,image/*,application/pdf" onChange={(event) => update('file', event.target.files?.[0] || null)} />{form.file && <span className="admin-muted">{form.file.name} · {(form.file.size / (1024 * 1024)).toFixed(1)} MB</span>}</label>}
        {(form.mediaKind === 'ARTICLE' || form.deliveryMode === 'VIDYASETU_ORIGINAL') && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}><label className="admin-label">English text / notes<textarea className="admin-textarea" style={{ minHeight: 130 }} value={fieldValue(form.bodyMarkdown)} onChange={(event) => update('bodyMarkdown', event.target.value)} /></label><label className="admin-label">Hindi text / notes<textarea className="admin-textarea" style={{ minHeight: 130 }} value={fieldValue(form.bodyMarkdownHi)} onChange={(event) => update('bodyMarkdownHi', event.target.value)} /></label></div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}><label className="admin-label">English summary<textarea className="admin-textarea" style={{ minHeight: 70 }} value={fieldValue(form.summary)} onChange={(event) => update('summary', event.target.value)} /></label><label className="admin-label">Hindi summary<textarea className="admin-textarea" style={{ minHeight: 70 }} value={fieldValue(form.summaryHi)} onChange={(event) => update('summaryHi', event.target.value)} /></label></div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(170px,1fr))', gap: 12, marginTop: 12 }}>
          <label className="admin-label">Licence candidate<select className="admin-select" value={form.licenceCandidate || 'OTHER'} onChange={(event) => update('licenceCandidate', event.target.value as PipelineLicence)}>{LICENCES.map((licence) => <option key={licence} value={licence}>{label(licence)}</option>)}</select></label>
          <label className="admin-label">Visibility<select className="admin-select" value={form.visibility} onChange={(event) => updateVisibility(event.target.value as PipelineVisibility)}><option value="PUBLIC">Public</option><option value="REGISTERED">Registered learners</option><option value="CLASS_ONLY">Class only</option><option value="SCHOOL_ONLY">School only</option></select></label>
          <label className="admin-label">Access requirement<select className="admin-select" value={form.accessRequirement} onChange={(event) => updateAccess(event.target.value as PipelineAccess)}><option value="PUBLIC">Public/free</option><option value="REGISTERED">Login required</option><option value="SUBSCRIBER">Subscriber</option></select></label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 12 }}><label className="admin-label">Licence URL<input className="admin-input" value={fieldValue(form.licenceUrl)} onChange={(event) => update('licenceUrl', event.target.value)} placeholder="https://creativecommons.org/..." /></label><label className="admin-label">Attribution text<input className="admin-input" value={fieldValue(form.attributionText)} onChange={(event) => update('attributionText', event.target.value)} placeholder="Creator, publisher and licence credit" /></label><label className="admin-label">Rights evidence URL<input className="admin-input" value={fieldValue(form.rightsEvidenceUrl)} onChange={(event) => update('rightsEvidenceUrl', event.target.value)} placeholder="Exact item/licence evidence" /></label></div>
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}><button type="button" style={primary} disabled={stageMutation.isPending || !form.title.trim()} onClick={() => stageMutation.mutate()}>{stageMutation.isPending ? 'Uploading & staging…' : 'Stage content for review'}</button><span className="admin-muted">Staging does not publish. The next section records rights verification and approval.</span></div>
      </section>

      <section className="admin-panel" style={{ ...panel }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}><div><h2 style={{ margin: 0 }}>2. Rights review queue</h2><p className="admin-muted" style={{ margin: '5px 0 0' }}>Verify exact item-level evidence, approve the intake, then materialise a normal DRAFT in Content Library.</p></div><button type="button" style={secondary} onClick={() => queueQuery.refetch()}>Refresh</button></div>
        <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
          {queue.map((item) => {
            const rights = rightsFor(item);
            return <article key={item.id} className="admin-panel-muted" style={{ padding: 16, borderRadius: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><div><strong>{item.title}</strong><div className="admin-muted" style={{ marginTop: 4 }}>{item.source_name} · {MEDIA_LABELS[item.media_kind]} · {label(item.category)} · {label(item.delivery_mode)} · {label(item.status)}</div></div><span className="admin-chip">Rights: {label(item.rights_status)}</span></div>
              <div style={{ marginTop: 8, fontSize: 12, color: '#475467' }}>{item.source_url && <a href={item.source_url} target="_blank" rel="noopener noreferrer">Open original source ↗</a>}{item.storage_key ? ` · Hosted file ${item.processing_status || 'registered'}` : ''}{item.imported_resource_id ? ` · Resource ${item.imported_resource_id}` : ''}</div>
              {item.status !== 'IMPORTED' && <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(150px,1fr))', gap: 9, marginTop: 12 }}><label className="admin-label">Licence<select className="admin-select" value={rights.licenceCandidate} onChange={(event) => setRights(item, 'licenceCandidate', event.target.value)}>{LICENCES.map((licence) => <option key={licence} value={licence}>{label(licence)}</option>)}</select></label><label className="admin-label">Attribution<input className="admin-input" value={rights.attributionText} onChange={(event) => setRights(item, 'attributionText', event.target.value)} /></label><label className="admin-label">Licence URL<input className="admin-input" value={rights.licenceUrl} onChange={(event) => setRights(item, 'licenceUrl', event.target.value)} /></label><label className="admin-label">Evidence URL<input className="admin-input" value={rights.rightsEvidenceUrl} onChange={(event) => setRights(item, 'rightsEvidenceUrl', event.target.value)} /></label></div>
                <label className="admin-label" style={{ marginTop: 9 }}>Reviewer note<input className="admin-input" value={rights.reviewerNote} onChange={(event) => setRights(item, 'reviewerNote', event.target.value)} /></label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 11 }}><button type="button" style={secondary} disabled={rightsMutation.isPending || !rights.attributionText.trim()} onClick={() => rightsMutation.mutate({ intakeId: item.id, payload: rights })}>Verify rights</button><button type="button" style={secondary} disabled={approveMutation.isPending || item.rights_status !== 'VERIFIED'} onClick={() => approveMutation.mutate(item.id)}>Approve intake</button><button type="button" style={primary} disabled={materialiseMutation.isPending || item.status !== 'APPROVED'} onClick={() => materialiseMutation.mutate(item.id)}>Create Content Library draft</button></div>
              </>}
            </article>;
          })}
          {!queue.length && <div className="admin-panel-muted" style={{ padding: 20, color: '#667085' }}>{queueQuery.isLoading ? 'Loading queue…' : 'No staged items yet. Start with an original, licensed upload or official source link above.'}</div>}
        </div>
      </section>
    </div>
  );
}
