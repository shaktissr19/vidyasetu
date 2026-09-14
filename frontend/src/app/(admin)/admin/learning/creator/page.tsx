'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  createContentCreatorJob,
  discoverContentCreatorSources,
  generateContentCreatorJob,
  getContentCreatorJob,
  getContentCreatorJobs,
  getContentCreatorOptions,
  materialiseContentCreatorJob,
  reviewContentCreatorJob,
  stageContentCreatorDiscoveryCandidate,
  stageSelectedExternalContentCreatorItem,
  submitContentCreatorJobToLearning,
  type CreateCreatorJobPayload,
  type CreatorDiscoveryCandidate,
  type CreatorDiscoveryMediaKind,
  type CreatorDiscoveryProvider,
  type CreatorJobDetail,
  type CreatorLanguageMode,
  type CreatorSourceInput,
} from '@/services/contentCreatorService';
import type { LearningAccessRequirement, LearningVisibility } from '@/services/adminLearningService';
import { apiErrorText } from '@/utils/errors';

const panel = { padding: 20, borderRadius: 16 } as const;
const secondaryButton = {
  padding: '9px 14px', borderRadius: 10, border: '1px solid #CBD5E1', background: '#FFFFFF',
  color: '#14213D', cursor: 'pointer', fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6,
} as const;
const providerIcon: Record<CreatorDiscoveryProvider,string> = {
  LOCAL: '📚', DIKSHA: '🇮🇳', NROER: '🏛️', CBSE: '🎓', NCERT_EPATHSHALA: '📖',
  NIOS: '🏫', SWAYAM: '🎬', PHET: '🔬', OER_COMMONS: '🌍',
};
const mediaIcon: Record<CreatorDiscoveryMediaKind,string> = {
  ARTICLE: '📖', VIDEO: '▶️', AUDIO: '🎧', INTERACTIVE: '🔬', PDF: '📄', COURSE: '🎓', LINK: '🔗',
};

type Destination = 'PRIVATE' | 'PUBLIC';

function statusLabel(value: string): string { return value.replaceAll('_', ' '); }
function durationText(seconds?: number | null): string {
  if (!seconds) return '';
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;
  return `${minutes}:${String(remain).padStart(2,'0')}`;
}

export default function AdminCreateLearningContentPage() {
  const queryClient = useQueryClient();
  const [classNumber, setClassNumber] = useState(5);
  const [subjectCode, setSubjectCode] = useState('');
  const [chapter, setChapter] = useState('');
  const [conceptId, setConceptId] = useState('');
  const [topic, setTopic] = useState('');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('Create a clear, age-appropriate learning pack with examples and practice.');
  const [languageMode, setLanguageMode] = useState<CreatorLanguageMode>('BILINGUAL');
  const [destination, setDestination] = useState<Destination>('PUBLIC');
  const [visibility, setVisibility] = useState<LearningVisibility>('PUBLIC');
  const [accessRequirement, setAccessRequirement] = useState<LearningAccessRequirement>('PUBLIC');
  const [pack, setPack] = useState({ lesson: true, revision: true, activities: true, questions: true, assessment: true, questionCount: 10 });
  const [selectedProviders, setSelectedProviders] = useState<CreatorDiscoveryProvider[]>(['LOCAL','DIKSHA']);
  const [mediaKinds, setMediaKinds] = useState<CreatorDiscoveryMediaKind[]>(['ARTICLE','VIDEO']);
  const [publisher, setPublisher] = useState('');
  const [maxDurationMinutes, setMaxDurationMinutes] = useState<number | ''>(10);
  const [candidates, setCandidates] = useState<CreatorDiscoveryCandidate[]>([]);
  const [sources, setSources] = useState<CreatorSourceInput[]>([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [manualProvider, setManualProvider] = useState<Exclude<CreatorDiscoveryProvider,'LOCAL'>>('NROER');
  const [manualTitle, setManualTitle] = useState('');
  const [manualUrl, setManualUrl] = useState('');

  const optionsQuery = useQuery({ queryKey: ['content-creator-options'], queryFn: () => getContentCreatorOptions().then((r) => r.data.data) });
  const jobsQuery = useQuery({ queryKey: ['content-creator-jobs'], queryFn: () => getContentCreatorJobs().then((r) => r.data.data || []) });
  const jobQuery = useQuery({
    queryKey: ['content-creator-job', selectedJobId],
    queryFn: () => getContentCreatorJob(selectedJobId).then((r) => r.data.data),
    enabled: Boolean(selectedJobId),
  });

  const classConcepts = useMemo(() => (optionsQuery.data?.concepts || []).filter((item) => item.class_number === classNumber), [optionsQuery.data, classNumber]);
  const subjects = useMemo(() => {
    const map = new Map<string,string>();
    classConcepts.forEach((item) => map.set(item.subject_code, item.subject_name || item.subject_code));
    return [...map.entries()].map(([code,name]) => ({ code,name })).sort((a,b) => a.name.localeCompare(b.name));
  }, [classConcepts]);
  const chapters = useMemo(() => [...new Set(classConcepts.filter((item) => !subjectCode || item.subject_code === subjectCode).map((item) => item.chapter_title).filter((item): item is string => Boolean(item)))].sort(), [classConcepts, subjectCode]);
  const concepts = useMemo(() => classConcepts.filter((item) => (!subjectCode || item.subject_code === subjectCode) && (!chapter || item.chapter_title === chapter)), [classConcepts, subjectCode, chapter]);
  const selectedConcept = optionsQuery.data?.concepts.find((item) => item.id === conceptId);
  const selectedSubject = subjects.find((item) => item.code === subjectCode);
  const searchText = (topic.trim() || selectedConcept?.name || chapter || selectedSubject?.name || '').trim();
  const discovery = optionsQuery.data?.discovery;
  const liveProviders = discovery?.providers.filter((item) => item.connectorMode !== 'REFERENCE_SEARCH' && item.enabled) || [];
  const officialProviders = discovery?.providers.filter((item) => item.connectorMode === 'REFERENCE_SEARCH' && item.enabled) || [];
  const job = jobQuery.data as CreatorJobDetail | undefined;
  const provider = optionsQuery.data?.provider;

  const refreshJobs = async (jobId?: string) => {
    await queryClient.invalidateQueries({ queryKey: ['content-creator-jobs'] });
    if (jobId) await queryClient.invalidateQueries({ queryKey: ['content-creator-job', jobId] });
  };

  const discoverMutation = useMutation({
    mutationFn: () => discoverContentCreatorSources({
      providers: selectedProviders,
      query: searchText,
      classNumber,
      subject: selectedSubject?.name || subjectCode || null,
      language: languageMode === 'ENGLISH' ? 'English' : languageMode === 'HINDI' ? 'Hindi' : null,
      publisher: publisher || null,
      mediaKinds,
      maxDurationMinutes: typeof maxDurationMinutes === 'number' ? maxDurationMinutes : null,
      onlyCommercialSafe: destination === 'PRIVATE' && accessRequirement === 'SUBSCRIBER',
      limit: 24,
    }),
    onSuccess: (response) => {
      setCandidates(response.data.data.candidates || []);
      const failed = response.data.data.runs.filter((item) => item.status === 'FAILED');
      if (failed.length) toast.error(`Search completed, but ${failed.map((item) => item.provider).join(', ')} could not be reached.`);
      else toast.success(`Found ${response.data.data.count} learning result(s).`);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Content search failed')),
  });

  const stageMutation = useMutation({
    mutationFn: (candidate: CreatorDiscoveryCandidate) => stageContentCreatorDiscoveryCandidate(candidate.id),
    onSuccess: async (response, candidate) => {
      const result = response.data.data;
      if (result.kind === 'GOVERNED_RESOURCE' && candidate.resource_id) addLocalCandidate(candidate);
      else toast.success('Source sent to licence review. It will appear under approved sources after review.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['content-creator-options'] }),
        queryClient.invalidateQueries({ queryKey: ['learning-studio-intake'] }),
      ]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not add source')),
  });

  const selectedItemMutation = useMutation({
    mutationFn: () => stageSelectedExternalContentCreatorItem({
      provider: manualProvider,
      title: manualTitle.trim(),
      sourceUrl: manualUrl.trim(),
      classHint: `Class ${classNumber}`,
      subjectHint: selectedSubject?.name || subjectCode || null,
    }),
    onSuccess: async () => {
      toast.success('Official source item sent to Source & Licence Review.');
      setManualTitle(''); setManualUrl('');
      await queryClient.invalidateQueries({ queryKey: ['content-creator-options'] });
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not stage official source item')),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const autoTitle = title.trim() || `Class ${classNumber} ${selectedSubject?.name || subjectCode || 'Learning'} — ${selectedConcept?.name || topic.trim() || chapter || 'Lesson'}`;
      const payload: CreateCreatorJobPayload = {
        mode: conceptId ? 'CURRICULUM' : 'SOURCES',
        title: autoTitle,
        instructions: instructions.trim() || null,
        conceptId: conceptId || null,
        existingResourceId: null,
        classNumber,
        boardCodes: ['COMMON'],
        languageMode,
        visibility: destination === 'PUBLIC' ? 'PUBLIC' : visibility,
        accessRequirement: destination === 'PUBLIC' ? 'PUBLIC' : accessRequirement,
        requestedPack: pack,
        sources,
      };
      return createContentCreatorJob(payload);
    },
    onSuccess: async (response) => {
      const id = response.data.data.id;
      setSelectedJobId(id);
      toast.success('Draft creation job created. Nothing has been published yet.');
      await refreshJobs(id);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not create learning-content job')),
  });

  const generateMutation = useMutation({
    mutationFn: (jobId: string) => generateContentCreatorJob(jobId),
    onSuccess: async (response, jobId) => {
      toast.success(response.data.data.status === 'READY_FOR_REVIEW' ? 'Learning pack generated and ready for review.' : 'Draft generated with validation blockers.');
      await refreshJobs(jobId);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Content generation failed')),
  });
  const reviewMutation = useMutation({
    mutationFn: ({ jobId, decision }: { jobId: string; decision: 'APPROVE' | 'REJECT' }) => reviewContentCreatorJob(jobId, decision, reviewNote.trim() || null),
    onSuccess: async (_response, variables) => { setReviewNote(''); await refreshJobs(variables.jobId); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Review decision failed')),
  });
  const materialiseMutation = useMutation({
    mutationFn: (jobId: string) => materialiseContentCreatorJob(jobId),
    onSuccess: async (_response, jobId) => { toast.success('Canonical Learning drafts created.'); await refreshJobs(jobId); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not create Learning drafts')),
  });
  const submitMutation = useMutation({
    mutationFn: (jobId: string) => submitContentCreatorJobToLearning(jobId),
    onSuccess: async (_response, jobId) => { toast.success('Submitted to Learning review.'); await refreshJobs(jobId); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not submit to Learning review')),
  });

  function chooseDestination(next: Destination) {
    setDestination(next);
    if (next === 'PUBLIC') { setVisibility('PUBLIC'); setAccessRequirement('PUBLIC'); }
    else { setVisibility('REGISTERED'); setAccessRequirement('REGISTERED'); }
  }
  function toggleProvider(code: CreatorDiscoveryProvider) {
    setSelectedProviders((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current,code]);
  }
  function toggleMedia(code: CreatorDiscoveryMediaKind) {
    setMediaKinds((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current,code]);
  }
  function addLocalCandidate(candidate: CreatorDiscoveryCandidate) {
    if (!candidate.resource_id || sources.some((item) => item.resourceId === candidate.resource_id)) return;
    setSources((current) => [...current, { sourceRole: 'GROUNDING', resourceId: candidate.resource_id, title: candidate.title }]);
    toast.success('Added to this learning pack.');
  }
  function addApprovedIntake(intakeId: string) {
    const item = optionsQuery.data?.intake.find((entry) => entry.id === intakeId);
    if (!item || sources.some((source) => source.intakeId === intakeId)) return;
    setSources((current) => [...current, {
      sourceRole: 'REFERENCE_ONLY', intakeId: item.id, title: item.title, sourceCode: item.source_code,
      sourceUrl: item.source_url, licence: item.licence_candidate || 'OTHER', attributionText: item.attribution_text || null,
    }]);
  }

  const canCreate = Boolean((conceptId || sources.length) && (title.trim() || selectedConcept?.name || topic.trim() || chapter));

  return (
    <div className="admin-page" style={{ padding: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <div style={{ color: '#FF6B00', fontSize: 12, fontWeight: 900, letterSpacing: '.12em' }}>VIDYASETU LEARNING</div>
          <h1 style={{ margin: '5px 0', fontSize: 34 }}>Create Learning Content</h1>
          <p className="admin-muted" style={{ maxWidth: 850, lineHeight: 1.65 }}>Choose the class and subject, find useful learning material, select what you want, generate or curate the lesson, then review and publish.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/admin/learning" style={secondaryButton}>Content Library</Link>
          <Link href="/admin/learning/coverage" style={secondaryButton}>Coverage</Link>
          <Link href="/admin/learning/intake" style={secondaryButton}>Advanced: Source Review</Link>
        </div>
      </div>

      {!provider?.configured && <div className="admin-note" style={{ padding: 13, marginBottom: 16 }}><strong>AI generation is currently in safe/mock mode.</strong> You can search, select and govern sources now, but mock-generated output cannot be academically approved. Configure the production AI provider before publishing generated lessons.</div>}
      {provider?.configured && <div className="admin-success-note" style={{ padding: 13, marginBottom: 16 }}><strong>AI provider ready:</strong> {provider.name} · {provider.model}</div>}

      <section className="admin-panel" style={{ ...panel, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}><span className="admin-step">1</span>What do you want to teach?</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(160px,1fr))', gap: 12 }}>
          <label className="admin-label">Class<select className="admin-select" value={classNumber} onChange={(e) => { setClassNumber(Number(e.target.value)); setSubjectCode(''); setChapter(''); setConceptId(''); }}>{Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Class {n}</option>)}</select></label>
          <label className="admin-label">Subject<select className="admin-select" value={subjectCode} onChange={(e) => { setSubjectCode(e.target.value); setChapter(''); setConceptId(''); }}><option value="">Select subject…</option>{subjects.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
          <label className="admin-label">Chapter<select className="admin-select" value={chapter} onChange={(e) => { setChapter(e.target.value); setConceptId(''); }}><option value="">Any chapter</option>{chapters.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="admin-label">Language<select className="admin-select" value={languageMode} onChange={(e) => setLanguageMode(e.target.value as CreatorLanguageMode)}><option value="BILINGUAL">English + Hindi</option><option value="ENGLISH">English</option><option value="HINDI">Hindi</option></select></label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
          <label className="admin-label">Curriculum concept<select className="admin-select" value={conceptId} onChange={(e) => { const id = e.target.value; setConceptId(id); const c = optionsQuery.data?.concepts.find((item) => item.id === id); if (c) { setTopic(c.name); if (!title.trim()) setTitle(`Class ${classNumber} ${c.subject_name || c.subject_code} — ${c.name}`); } }}><option value="">Select a concept or search by topic…</option>{concepts.map((item) => <option key={item.id} value={item.id}>{item.chapter_title ? `${item.chapter_title} · ` : ''}{item.name}</option>)}</select></label>
          <label className="admin-label">Topic / learning need<input className="admin-input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Nouns, comprehension, fractions, force and pressure" /></label>
        </div>
      </section>

      <section className="admin-panel" style={{ ...panel, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}><span className="admin-step">2</span>Find useful learning material</h2>
        <p className="admin-muted" style={{ marginTop: -6, marginBottom: 12 }}>VidyaSetu and DIKSHA return individual results directly. Other official libraries open their trusted search so you can choose the exact item.</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div className="admin-label" style={{ marginBottom: 7 }}>Search automatically</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{liveProviders.map((item) => <button key={item.code} type="button" className={`admin-chip ${selectedProviders.includes(item.code) ? 'active' : ''}`} onClick={() => toggleProvider(item.code)}>{providerIcon[item.code]} {item.label}</button>)}</div>
          </div>
          <div>
            <div className="admin-label" style={{ marginBottom: 7 }}>Also search official libraries</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{officialProviders.map((item) => <button key={item.code} type="button" className={`admin-chip ${selectedProviders.includes(item.code) ? 'active' : ''}`} onClick={() => toggleProvider(item.code)}>{providerIcon[item.code]} {item.label}</button>)}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px,1fr) minmax(170px,.45fr) minmax(170px,.45fr)', gap: 12, marginTop: 14 }}>
          <label className="admin-label">Search topic<input className="admin-input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Type the chapter or topic" /></label>
          <label className="admin-label">Publisher<select className="admin-select" value={publisher} onChange={(e) => setPublisher(e.target.value)}><option value="">Any publisher</option>{(discovery?.publisherPresets || []).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="admin-label">Max video length<input className="admin-input" type="number" min={1} max={240} value={maxDurationMinutes} onChange={(e) => setMaxDurationMinutes(e.target.value ? Number(e.target.value) : '')} placeholder="10 min" /></label>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {(discovery?.mediaKinds || []).map((item) => <button key={item.code} type="button" className={`admin-chip ${mediaKinds.includes(item.code) ? 'active' : ''}`} onClick={() => toggleMedia(item.code)}>{mediaIcon[item.code]} {item.label}</button>)}
        </div>

        <button className="btn-primary" type="button" disabled={discoverMutation.isPending || searchText.length < 2 || !selectedProviders.length} onClick={() => discoverMutation.mutate()} style={{ marginTop: 14, minWidth: 220 }}>{discoverMutation.isPending ? 'Searching…' : 'Search Learning Content'}</button>
        {searchText.length < 2 && <span style={{ marginLeft: 10, color: '#B54708', fontSize: 12 }}>Choose a subject/chapter or type a topic first.</span>}

        {candidates.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10, marginTop: 16 }}>
          {candidates.map((candidate) => {
            const isLocal = candidate.provider === 'LOCAL' && Boolean(candidate.resource_id);
            const reference = Boolean(candidate.reference_only);
            const added = Boolean(candidate.resource_id && sources.some((source) => source.resourceId === candidate.resource_id));
            const kind = candidate.media_kind || 'LINK';
            return <article key={candidate.id} className={`admin-source-card ${added ? 'selected' : ''}`} style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><strong>{candidate.title}</strong><span style={{ color: '#667085', fontSize: 11 }}>{providerIcon[candidate.provider]} {candidate.provider}</span></div>
              <div style={{ color: '#667085', fontSize: 12, marginTop: 5 }}>{mediaIcon[kind]} {kind}{candidate.duration_seconds ? ` · ${durationText(candidate.duration_seconds)}` : ''}{candidate.grade_levels?.length ? ` · ${candidate.grade_levels.join(', ')}` : ''}</div>
              {candidate.description && <p style={{ color: '#475467', fontSize: 12, lineHeight: 1.5, marginTop: 8 }}>{candidate.description.slice(0,220)}</p>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                {candidate.source_url && <a href={candidate.source_url} target="_blank" rel="noopener noreferrer" style={secondaryButton}>{reference ? 'Open official search ↗' : 'Preview ↗'}</a>}
                {isLocal && <button type="button" className="btn-primary" disabled={added} onClick={() => addLocalCandidate(candidate)}>{added ? 'Selected ✓' : 'Select'}</button>}
                {!isLocal && !reference && <button type="button" style={secondaryButton} disabled={stageMutation.isPending} onClick={() => stageMutation.mutate(candidate)}>Send to licence review</button>}
                {reference && <button type="button" style={secondaryButton} onClick={() => { setManualProvider(candidate.provider as Exclude<CreatorDiscoveryProvider,'LOCAL'>); setManualTitle(candidate.title.replace(/^[^:]+:\s*/,'')); }}>I found an item</button>}
              </div>
            </article>;
          })}
        </div>}

        {candidates.length === 0 && !discoverMutation.isPending && <div className="admin-panel-muted" style={{ padding: 18, marginTop: 16, color: '#667085' }}>Search results will appear here. Start with Class + Subject + Topic, then refine by video, article, worksheet or publisher only when needed.</div>}

        <details style={{ marginTop: 14 }}><summary style={{ cursor: 'pointer', fontWeight: 800, color: '#344054' }}>Selected an item on an official website?</summary><div className="admin-panel-muted" style={{ padding: 14, marginTop: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 1.2fr', gap: 10 }}>
            <label className="admin-label">Source<select className="admin-select" value={manualProvider} onChange={(e) => setManualProvider(e.target.value as Exclude<CreatorDiscoveryProvider,'LOCAL'>)}>{officialProviders.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
            <label className="admin-label">Exact item title<input className="admin-input" value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} /></label>
            <label className="admin-label">Official item URL<input className="admin-input" value={manualUrl} onChange={(e) => setManualUrl(e.target.value)} placeholder="https://official-source/..." /></label>
          </div>
          <button className="btn-primary" type="button" disabled={selectedItemMutation.isPending || manualTitle.trim().length < 2 || !manualUrl.startsWith('https://')} onClick={() => selectedItemMutation.mutate()} style={{ marginTop: 10 }}>Add to Source Review</button>
        </div></details>

        {(optionsQuery.data?.intake || []).length > 0 && <div style={{ marginTop: 14 }}><label className="admin-label">Approved external source<select className="admin-select" defaultValue="" onChange={(e) => { addApprovedIntake(e.target.value); e.currentTarget.value = ''; }}><option value="">Add an already-approved source…</option>{(optionsQuery.data?.intake || []).map((item) => <option key={item.id} value={item.id}>{item.title} · {item.source_code}</option>)}</select></label></div>}

        {sources.length > 0 && <div style={{ marginTop: 14 }}><div className="admin-label" style={{ marginBottom: 6 }}>Selected for this learning pack ({sources.length})</div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{sources.map((source,index) => <span key={`${source.resourceId || source.intakeId || index}`} style={{ padding: '8px 10px', borderRadius: 9, background: '#FFF7F0', border: '1px solid #FDBA74', color: '#7C2D12', fontSize: 12 }}>{source.title || 'Approved source'} <button type="button" onClick={() => setSources((current) => current.filter((_,i) => i !== index))} style={{ border: 0, background: 'transparent', color: '#C2410C', cursor: 'pointer' }}>×</button></span>)}</div></div>}
      </section>

      <section className="admin-panel" style={{ ...panel, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}><span className="admin-step">3</span>Choose the learning pack and audience</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr', gap: 18 }}>
          <div>
            <label className="admin-label">Learning pack title<input className="admin-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={selectedConcept?.name ? `Class ${classNumber} ${selectedSubject?.name || ''} — ${selectedConcept.name}` : 'A clear title for this lesson'} /></label>
            <label className="admin-label" style={{ marginTop: 10 }}>Creator instructions<textarea className="admin-textarea" style={{ minHeight: 80 }} value={instructions} onChange={(e) => setInstructions(e.target.value)} /></label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>{([['lesson','Lesson'],['revision','Revision'],['activities','Activities'],['questions','Practice'],['assessment','Assessment']] as const).map(([key,label]) => <label key={key} className="admin-chip"><input type="checkbox" checked={pack[key]} onChange={(e) => setPack((current) => ({ ...current, [key]: e.target.checked }))} /> <span style={{ marginLeft: 5 }}>{label}</span></label>)}<label className="admin-chip">Questions <input type="number" min={5} max={30} value={pack.questionCount} onChange={(e) => setPack((current) => ({ ...current, questionCount: Number(e.target.value) }))} style={{ width: 48, marginLeft: 5 }} /></label></div>
          </div>
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><button type="button" className={`admin-source-card ${destination === 'PUBLIC' ? 'selected' : ''}`} style={{ padding: 14, cursor: 'pointer', textAlign: 'left' }} onClick={() => chooseDestination('PUBLIC')}><strong>🌐 Public Learning</strong><div style={{ color: '#667085', fontSize: 11, marginTop: 4 }}>Free public library after review.</div></button><button type="button" className={`admin-source-card ${destination === 'PRIVATE' ? 'selected' : ''}`} style={{ padding: 14, cursor: 'pointer', textAlign: 'left' }} onClick={() => chooseDestination('PRIVATE')}><strong>🔒 Private Learning</strong><div style={{ color: '#667085', fontSize: 11, marginTop: 4 }}>Signed-in learners or subscribers.</div></button></div>
            {destination === 'PRIVATE' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}><label className="admin-label">Scope<select className="admin-select" value={visibility} onChange={(e) => setVisibility(e.target.value as LearningVisibility)}><option value="REGISTERED">Registered learners</option><option value="CLASS_ONLY">Class only</option><option value="SCHOOL_ONLY">School only</option></select></label><label className="admin-label">Access<select className="admin-select" value={accessRequirement} onChange={(e) => setAccessRequirement(e.target.value as LearningAccessRequirement)}><option value="REGISTERED">Registered Free</option><option value="SUBSCRIBER">Subscriber</option></select></label></div>}
          </div>
        </div>
        <button className="btn-primary" type="button" disabled={createMutation.isPending || !canCreate} onClick={() => createMutation.mutate()} style={{ marginTop: 16, minWidth: 240 }}>{createMutation.isPending ? 'Creating draft…' : 'Create Learning Draft'}</button>
        {!canCreate && <span style={{ marginLeft: 10, color: '#B54708', fontSize: 12 }}>Select a curriculum concept or at least one governed source.</span>}
      </section>

      <section className="admin-panel" style={panel}>
        <h2 style={{ marginTop: 0 }}><span className="admin-step">4</span>Review and publish</h2>
        <p className="admin-muted">The detailed governance states remain recorded for audit, but you can progress the selected job from this one workspace.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px,.7fr) minmax(420px,1.3fr)', gap: 16 }}>
          <div style={{ maxHeight: 360, overflowY: 'auto', display: 'grid', gap: 8 }}>{(jobsQuery.data || []).map((item) => <button key={item.id} type="button" onClick={() => setSelectedJobId(item.id)} className={`admin-source-card ${selectedJobId === item.id ? 'selected' : ''}`} style={{ padding: 12, textAlign: 'left', cursor: 'pointer' }}><strong>{item.title}</strong><div style={{ marginTop: 5, fontSize: 11, color: '#667085' }}>{statusLabel(item.status)} · {item.visibility} · {item.source_count} source(s)</div></button>)}{!jobsQuery.data?.length && <div className="admin-panel-muted" style={{ padding: 15, color: '#667085' }}>No Creator jobs yet.</div>}</div>
          <div className="admin-panel-muted" style={{ padding: 16 }}>
            {!job && <div style={{ color: '#667085' }}>Select a job to preview and continue.</div>}
            {job && <>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}><div><h3 style={{ margin: 0 }}>{job.title}</h3><div style={{ color: '#667085', fontSize: 12, marginTop: 5 }}>{statusLabel(job.status)} · {job.language_mode} · {job.visibility}</div></div><span style={{ padding: '5px 9px', background: '#FFF1E6', color: '#9A3B00', borderRadius: 999, fontSize: 11, fontWeight: 900 }}>{statusLabel(job.status)}</span></div>
              {job.validation_report && <div style={{ marginTop: 12, padding: 10, background: job.validation_report.passed ? '#ECFDF3' : '#FFF8ED', borderRadius: 10, color: job.validation_report.passed ? '#176B42' : '#7A4A08', fontSize: 12 }}>Validation {job.validation_report.score}%{job.validation_report.blockers?.length ? ` · ${job.validation_report.blockers.join(' · ')}` : ' · Passed'}</div>}
              {job.generated_pack && <div style={{ marginTop: 12 }}><strong>Preview</strong><p style={{ color: '#475467', lineHeight: 1.55, marginTop: 5 }}>{job.generated_pack.summary}</p><div style={{ fontSize: 12, color: '#667085' }}>{job.generated_pack.questions?.length || 0} questions · {job.generated_pack.activities?.length || 0} activities · {job.generated_pack.revisionNotes?.length || 0} revision notes</div></div>}
              <label className="admin-label" style={{ marginTop: 12 }}>Reviewer note<textarea className="admin-textarea" style={{ minHeight: 70 }} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="Optional review note" /></label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                {['DRAFT','READY_TO_GENERATE','VALIDATION_FAILED'].includes(job.status) && <button className="btn-primary" type="button" disabled={generateMutation.isPending} onClick={() => generateMutation.mutate(job.id)}>Generate Learning Pack</button>}
                {job.status === 'READY_FOR_REVIEW' && <><button className="btn-primary" type="button" disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ jobId: job.id, decision: 'APPROVE' })}>Approve Content</button><button type="button" style={secondaryButton} disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ jobId: job.id, decision: 'REJECT' })}>Reject</button></>}
                {job.status === 'APPROVED' && <button className="btn-primary" type="button" disabled={materialiseMutation.isPending} onClick={() => materialiseMutation.mutate(job.id)}>Create Learning Drafts</button>}
                {job.status === 'MATERIALISED' && !job.submitted_to_learning_at && <button className="btn-primary" type="button" disabled={submitMutation.isPending} onClick={() => submitMutation.mutate(job.id)}>Submit to Learning Review</button>}
                {job.submitted_to_learning_at && <Link href="/admin/learning" style={secondaryButton}>Open in Content Library →</Link>}
              </div>
            </>}
          </div>
        </div>
      </section>
    </div>
  );
}
