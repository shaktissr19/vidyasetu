'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  createContentCreatorJob,
  discoverContentCreatorSources,
  generateContentCreatorJob,
  getContentCreatorOptions,
  stageContentCreatorDiscoveryCandidate,
  type CreatorDiscoveryCandidate,
  type CreatorDiscoveryMediaKind,
  type CreatorDiscoveryProvider,
  type CreatorSourceInput,
} from '@/services/contentCreatorService';
import {
  getContentFactoryOptions,
  getContentFactoryQueueCounts,
  stageExternalWebSource,
} from '@/services/contentFactoryService';
import { apiErrorText } from '@/utils/errors';

const panel = { padding: 20,borderRadius: 16 } as const;
const button = { padding: '10px 16px',borderRadius: 10,border: 0,background: '#FF6B00',color: '#fff',fontWeight: 900,cursor: 'pointer' } as const;
const secondary = { padding: '9px 14px',borderRadius: 10,border: '1px solid #CBD5E1',background: '#fff',color: '#14213D',fontWeight: 800,textDecoration: 'none',display: 'inline-flex',alignItems: 'center',gap: 6 } as const;
const providerIcon: Record<CreatorDiscoveryProvider,string> = {
  LOCAL: '📚',DIKSHA: '🇮🇳',NROER: '🏛️',CBSE: '🎓',NCERT_EPATHSHALA: '📖',NIOS: '🏫',SWAYAM: '🎬',PHET: '🔬',OER_COMMONS: '🌍',
};
const mediaIcon: Record<CreatorDiscoveryMediaKind,string> = {
  ARTICLE: '📖',VIDEO: '▶️',AUDIO: '🎧',INTERACTIVE: '🧩',PDF: '📄',COURSE: '🎓',LINK: '🔗',
};

type StageState = { kind: 'GOVERNED_RESOURCE' | 'OER_INTAKE'; intakeId?: string; resourceId?: string };

function durationText(seconds?: number | null) {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function normalizedText(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

export default function ContentFactoryPage() {
  const queryClient = useQueryClient();
  const [classNumber,setClassNumber] = useState(5);
  const [boardCode,setBoardCode] = useState('COMMON');
  const [subjectId,setSubjectId] = useState('');
  const [chapterText,setChapterText] = useState('');
  const [topicText,setTopicText] = useState('');
  const [language,setLanguage] = useState<'English' | 'Hindi' | 'Bilingual'>('English');
  const [providers,setProviders] = useState<CreatorDiscoveryProvider[]>(['LOCAL','DIKSHA']);
  const [mediaKinds,setMediaKinds] = useState<CreatorDiscoveryMediaKind[]>(['ARTICLE','VIDEO']);
  const [publisher,setPublisher] = useState('');
  const [candidates,setCandidates] = useState<CreatorDiscoveryCandidate[]>([]);
  const [runs,setRuns] = useState<Array<{ provider: CreatorDiscoveryProvider; count: number; status: 'COMPLETED' | 'FAILED'; error?: string }>>([]);
  const [staged,setStaged] = useState<Record<string,StageState>>({});
  const [selectedSources,setSelectedSources] = useState<CreatorSourceInput[]>([]);
  const [pack,setPack] = useState({ lesson: true,revision: true,activities: true,questions: true,assessment: true,questionCount: 10 });
  const [title,setTitle] = useState('');
  const [createdJobId,setCreatedJobId] = useState('');
  const [createdJobStatus,setCreatedJobStatus] = useState('');
  const [webTitle,setWebTitle] = useState('');
  const [webUrl,setWebUrl] = useState('');
  const [webAttribution,setWebAttribution] = useState('');
  const [lastWebIntakeId,setLastWebIntakeId] = useState('');

  const factoryQuery = useQuery({ queryKey: ['content-factory-options'],queryFn: () => getContentFactoryOptions().then((r) => r.data.data) });
  const creatorOptionsQuery = useQuery({ queryKey: ['content-creator-options'],queryFn: () => getContentCreatorOptions().then((r) => r.data.data) });
  const queueQuery = useQuery({ queryKey: ['content-factory-queue-counts'],queryFn: () => getContentFactoryQueueCounts().then((r) => r.data.data),refetchInterval: 30000 });

  const subjects = factoryQuery.data?.subjects || [];
  const selectedSubject = subjects.find((item) => item.id === subjectId);
  const subject = selectedSubject?.name || '';
  const selectedBoard = factoryQuery.data?.boards.find((item) => item.code === boardCode);
  const readiness = factoryQuery.data?.readinessByClass.find((item) => item.classNumber === classNumber);

  const curriculumSubject = useMemo(() => {
    const candidatesForClass = (factoryQuery.data?.curriculumSubjects || []).filter((item) =>
      item.board_code === boardCode && String(item.class_name).replace(/\D/g,'') === String(classNumber),
    );
    return candidatesForClass.find((item) => item.subject_id === subjectId)
      || candidatesForClass.find((item) => normalizedText(item.display_name) === normalizedText(subject));
  },[factoryQuery.data,boardCode,classNumber,subjectId,subject]);

  const chapterSuggestions = useMemo(() => (factoryQuery.data?.units || []).filter((item) => item.curriculum_subject_id === curriculumSubject?.id),[factoryQuery.data,curriculumSubject]);
  const selectedMappedUnit = chapterSuggestions.find((item) => normalizedText(item.title) === normalizedText(chapterText));
  const topicSuggestions = useMemo(() => {
    const unitIds = new Set(chapterSuggestions.map((item) => item.id));
    return (factoryQuery.data?.topics || []).filter((item) => selectedMappedUnit ? item.curriculum_unit_id === selectedMappedUnit.id : unitIds.has(item.curriculum_unit_id));
  },[factoryQuery.data,chapterSuggestions,selectedMappedUnit]);

  const matchingConcepts = useMemo(() => (factoryQuery.data?.concepts || []).filter((item) =>
    item.class_number === classNumber && (!subject || normalizedText(item.subject_name) === normalizedText(subject) || normalizedText(item.subject_code) === normalizedText(selectedSubject?.code)),
  ),[factoryQuery.data,classNumber,subject,selectedSubject?.code]);
  const matchedConcept = matchingConcepts.find((item) => normalizedText(item.name) === normalizedText(topicText))
    || matchingConcepts.find((item) => normalizedText(item.chapter_title) === normalizedText(chapterText) && !topicText.trim())
    || null;
  const searchText = (topicText.trim() || chapterText.trim() || subject).trim();
  const discovery = creatorOptionsQuery.data?.discovery;
  const providerConfigured = Boolean(creatorOptionsQuery.data?.provider?.configured);

  const discoverMutation = useMutation({
    mutationFn: () => discoverContentCreatorSources({
      providers,
      query: searchText,
      classNumber,
      subject: subject || null,
      language: language === 'Bilingual' ? null : language,
      publisher: publisher || null,
      mediaKinds,
      limit: 24,
    }),
    onSuccess: (response) => {
      const result = response.data.data;
      setCandidates(result.candidates || []);
      setRuns(result.runs || []);
      const alreadyStaged: Record<string,StageState> = {};
      for (const item of result.candidates || []) {
        if (item.intake_id) alreadyStaged[item.id] = { kind: 'OER_INTAKE',intakeId: item.intake_id };
      }
      setStaged((current) => ({ ...alreadyStaged,...current }));
      if (!result.count) toast('No direct item matches. Check provider status below or try a broader topic.');
      else toast.success(`Found ${result.count} learning result(s).`);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error,'Source search failed')),
  });

  const stageCandidateMutation = useMutation({
    mutationFn: (candidate: CreatorDiscoveryCandidate) => stageContentCreatorDiscoveryCandidate(candidate.id),
    onSuccess: async (response,candidate) => {
      const result = response.data.data;
      setStaged((current) => ({ ...current,[candidate.id]: { kind: result.kind,intakeId: result.intakeId,resourceId: result.resourceId } }));
      if (result.kind === 'GOVERNED_RESOURCE' && candidate.resource_id) {
        if (!selectedSources.some((item) => item.resourceId === candidate.resource_id)) {
          setSelectedSources((current) => [...current,{ sourceRole: 'GROUNDING',resourceId: candidate.resource_id,title: candidate.title }]);
        }
        toast.success('Governed VidyaSetu resource selected for the optional draft creator.');
      } else {
        toast.success('Saved in Source & Licence Review. Verify it there, then add it to Content Library.');
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['content-creator-options'] }),
        queryClient.invalidateQueries({ queryKey: ['content-factory-source-review'] }),
        queryClient.invalidateQueries({ queryKey: ['content-factory-queue-counts'] }),
      ]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error,'Could not select source')),
  });

  const webMutation = useMutation({
    mutationFn: () => stageExternalWebSource({
      title: webTitle.trim(),
      sourceUrl: webUrl.trim(),
      licenceCandidate: 'EXTERNAL_LINK_ONLY',
      attributionText: webAttribution.trim() || null,
      classNumber,
      subject: subject || null,
      boardCode,
    }),
    onSuccess: async (response) => {
      setLastWebIntakeId(response.data.data.intakeId);
      toast.success('Web item saved in Source & Licence Review.');
      setWebTitle(''); setWebUrl(''); setWebAttribution('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['content-factory-source-review'] }),
        queryClient.invalidateQueries({ queryKey: ['content-factory-queue-counts'] }),
      ]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error,'Could not stage web source')),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const focus = topicText.trim() || chapterText.trim() || subject || 'Learning';
      const autoTitle = title.trim() || `Class ${classNumber} ${subject || 'Learning'} — ${focus}`;
      return createContentCreatorJob({
        mode: matchedConcept ? 'CURRICULUM' : 'SOURCES',
        title: autoTitle,
        instructions: `Create a clear, age-appropriate Class ${classNumber} ${subject || ''} learning pack for ${focus}. Use only selected governed sources, explain concepts accurately, include examples and practice.`,
        conceptId: matchedConcept?.id || null,
        existingResourceId: null,
        classNumber,
        subjectId: subjectId || null,
        boardCodes: [boardCode],
        languageMode: language === 'Hindi' ? 'HINDI' : language === 'Bilingual' ? 'BILINGUAL' : 'ENGLISH',
        visibility: 'CLASS_ONLY',
        accessRequirement: 'REGISTERED',
        requestedPack: pack,
        sources: selectedSources,
      });
    },
    onSuccess: (response) => {
      setCreatedJobId(response.data.data.id);
      setCreatedJobStatus(response.data.data.status);
      toast.success('AI/text creator draft job created. Nothing is published.');
    },
    onError: (error: unknown) => toast.error(apiErrorText(error,'Could not create draft')),
  });

  const generateMutation = useMutation({
    mutationFn: () => generateContentCreatorJob(createdJobId),
    onSuccess: (response) => {
      setCreatedJobStatus(response.data.data.status);
      toast.success(response.data.data.status === 'READY_FOR_REVIEW' ? 'Draft generated and ready for review.' : `Generation finished with status ${response.data.data.status}.`);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error,'Generation failed')),
  });

  function toggleProvider(code: CreatorDiscoveryProvider) {
    setProviders((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current,code]);
  }
  function toggleMedia(code: CreatorDiscoveryMediaKind) {
    setMediaKinds((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current,code]);
  }
  function addApprovedIntake(intakeId: string) {
    const item = creatorOptionsQuery.data?.intake.find((entry) => entry.id === intakeId);
    if (!item || selectedSources.some((source) => source.intakeId === intakeId)) return;
    setSelectedSources((current) => [...current,{
      sourceRole: 'REFERENCE_ONLY',
      intakeId: item.id,
      title: item.title,
      sourceCode: item.source_code,
      sourceUrl: item.source_url,
      licence: item.licence_candidate || 'OTHER',
      attributionText: item.attribution_text || null,
    }]);
  }

  const canSearch = searchText.length >= 2 && providers.length > 0 && mediaKinds.length > 0;
  const canCreate = Boolean((matchedConcept || selectedSources.length) && searchText.length >= 2);

  return (
    <div className="admin-page" style={{ padding: 8 }}>
      <div style={{ display: 'flex',justifyContent: 'space-between',gap: 16,flexWrap: 'wrap',alignItems: 'flex-start',marginBottom: 18 }}>
        <div>
          <div style={{ color: '#FF6B00',fontSize: 12,fontWeight: 900,letterSpacing: '.12em' }}>CONTENT FACTORY · START HERE</div>
          <h1 style={{ margin: '5px 0',fontSize: 34 }}>Build or add learning content</h1>
          <p className="admin-muted" style={{ maxWidth: 940,lineHeight: 1.65 }}>Choose the learner context, search trusted sources, select an item, verify its rights, then add it to Content Library. You can also create an AI-assisted text/question draft from governed sources. Nothing is published automatically.</p>
        </div>
        <div style={{ display: 'flex',gap: 8,flexWrap: 'wrap' }}>
          <Link href="/admin/learning/intake" style={secondary}>Source & Licence Review {queueQuery.data?.sourceReviewPending ? `(${queueQuery.data.sourceReviewPending})` : ''}</Link>
          <Link href="/admin/learning" style={secondary}>Content Library {queueQuery.data?.contentLibraryPending ? `(${queueQuery.data.contentLibraryPending})` : ''}</Link>
          <Link href="/admin/learning/creator/discovery" style={secondary}>Advanced Source Search</Link>
        </div>
      </div>

      <div className="admin-success-note" style={{ padding: 13,marginBottom: 16 }}>
        <strong>How this works:</strong> Search → select an external item → Source & Licence Review → verify licence/attribution → approve → Add to Content Library → normal Learning review → publish. Public items then appear under Learn; class-private items are filtered by the Student Learning runtime.
      </div>

      <section className="admin-panel" style={{ ...panel,marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}><span className="admin-step">1</span>What do you want to teach?</h2>
        <div style={{ display: 'grid',gridTemplateColumns: 'repeat(4,minmax(160px,1fr))',gap: 12 }}>
          <label className="admin-label">Class
            <select className="admin-select" value={classNumber} onChange={(e) => { setClassNumber(Number(e.target.value)); setChapterText(''); setTopicText(''); }}>
              {Array.from({ length: 12 },(_,i) => i + 1).map((value) => <option key={value} value={value}>Class {value}</option>)}
            </select>
          </label>
          <label className="admin-label">Board
            <select className="admin-select" value={boardCode} onChange={(e) => { setBoardCode(e.target.value); setChapterText(''); setTopicText(''); }}>
              {(factoryQuery.data?.boards || []).map((item) => <option key={item.code} value={item.code}>{item.short_name || item.name}</option>)}
            </select>
          </label>
          <label className="admin-label">Subject
            <select className="admin-select" value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setChapterText(''); setTopicText(''); }}>
              <option value="">Select subject…</option>
              {subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="admin-label">Language
            <select className="admin-select" value={language} onChange={(e) => setLanguage(e.target.value as typeof language)}>
              <option>English</option><option>Hindi</option><option>Bilingual</option>
            </select>
          </label>
        </div>

        <div style={{ display: 'grid',gridTemplateColumns: '1fr 1.4fr',gap: 12,marginTop: 12 }}>
          <label className="admin-label">Chapter / unit <span className="admin-muted">— select a suggestion or type your own</span>
            <input className="admin-input" list="factory-chapters" value={chapterText} onChange={(e) => { setChapterText(e.target.value); setTopicText(''); }} placeholder="e.g. Multiplication, Force and Pressure" />
            <datalist id="factory-chapters">{chapterSuggestions.map((item) => <option key={item.id} value={item.title} />)}</datalist>
          </label>
          <label className="admin-label">Topic / learning need <span className="admin-muted">— always editable</span>
            <input className="admin-input" list="factory-topics" value={topicText} onChange={(e) => setTopicText(e.target.value)} placeholder="e.g. Multiplication of 2-digit numbers, solar system, nouns" />
            <datalist id="factory-topics">{topicSuggestions.map((item) => <option key={item.id} value={item.title} />)}</datalist>
          </label>
        </div>

        <div className={readiness?.curriculumReady ? 'admin-success-note' : 'admin-note'} style={{ marginTop: 14,padding: 12 }}>
          <strong>Curriculum mapping:</strong> Class {classNumber} currently has {readiness?.conceptCount || 0} canonical concept(s). {!readiness?.curriculumReady ? 'No problem: Chapter and Topic remain editable, so you can search and classify content now. Canonical curriculum mapping can be completed separately.' : 'Mapped suggestions are shown as you type; manual chapter/topic text is still allowed.'}
        </div>
      </section>

      <section className="admin-panel" style={{ ...panel,marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}><span className="admin-step">2</span>Find learning material</h2>
        <p className="admin-muted">Select where and what to search. A checked content type is included in the search. DIKSHA and VidyaSetu can return individual items; reference connectors open/search official libraries without pretending that a website grants reuse rights.</p>

        <div className="admin-label" style={{ marginBottom: 6 }}>Sources</div>
        <div style={{ display: 'flex',gap: 8,flexWrap: 'wrap',marginBottom: 14 }}>
          {(discovery?.providers || []).filter((item) => item.enabled).map((item) => {
            const checked = providers.includes(item.code);
            return <button key={item.code} type="button" onClick={() => toggleProvider(item.code)} style={{ ...secondary,borderColor: checked ? '#FF6B00' : '#CBD5E1',background: checked ? '#FFF4EC' : '#fff',cursor: 'pointer' }}>
              <span>{checked ? '✓' : '○'}</span> {providerIcon[item.code]} {item.label}
            </button>;
          })}
        </div>

        <div className="admin-label" style={{ marginBottom: 6 }}>Content types</div>
        <div style={{ display: 'flex',gap: 8,flexWrap: 'wrap' }}>
          {(discovery?.mediaKinds || []).map((item) => <label key={item.code} style={{ ...secondary,cursor: 'pointer',borderColor: mediaKinds.includes(item.code) ? '#FF6B00' : '#CBD5E1',background: mediaKinds.includes(item.code) ? '#FFF4EC' : '#fff' }}>
            <input type="checkbox" checked={mediaKinds.includes(item.code)} onChange={() => toggleMedia(item.code)} /> {mediaIcon[item.code]} {item.label}
          </label>)}
        </div>

        <div style={{ display: 'grid',gridTemplateColumns: '2fr 1fr',gap: 12,marginTop: 14 }}>
          <div className="admin-note" style={{ padding: 11 }}>
            Search target: <strong>{searchText || 'select a subject or enter a chapter/topic'}</strong> · Class {classNumber} · {selectedBoard?.short_name || boardCode}
          </div>
          <label className="admin-label">Publisher filter
            <select className="admin-select" value={publisher} onChange={(e) => setPublisher(e.target.value)}><option value="">Any publisher</option>{(discovery?.publisherPresets || []).map((item) => <option key={item}>{item}</option>)}</select>
          </label>
        </div>

        <div style={{ display: 'flex',gap: 10,alignItems: 'center',marginTop: 14,flexWrap: 'wrap' }}>
          <button type="button" style={{ ...button,opacity: canSearch ? 1 : .55 }} disabled={!canSearch || discoverMutation.isPending} onClick={() => discoverMutation.mutate()}>{discoverMutation.isPending ? 'Searching…' : 'Search Learning Content'}</button>
          {!searchText && <span style={{ color: '#B54708',fontSize: 12 }}>Select a subject or type a Chapter/Topic first.</span>}
          {!mediaKinds.length && <span style={{ color: '#B54708',fontSize: 12 }}>Choose at least one content type.</span>}
        </div>

        {runs.length > 0 && <div style={{ display: 'grid',gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))',gap: 8,marginTop: 14 }}>
          {runs.map((run) => <div key={`${run.provider}-${run.status}`} className={run.status === 'FAILED' ? 'admin-note' : 'admin-success-note'} style={{ padding: 10 }}><strong>{providerIcon[run.provider]} {run.provider}</strong><div>{run.status === 'FAILED' ? 'Connector failed' : `${run.count} result(s)`}</div>{run.error && <small>{run.error}</small>}</div>)}
        </div>}
      </section>

      <section className="admin-panel" style={{ ...panel,marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}><span className="admin-step">3</span>Select a useful result</h2>
        {!candidates.length && <div className="admin-panel-muted" style={{ padding: 16 }}>No results loaded yet. Search above. When you select an external item, its status remains visible here and it is saved in Source & Licence Review.</div>}
        <div style={{ display: 'grid',gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))',gap: 12 }}>
          {candidates.map((candidate) => {
            const stage = staged[candidate.id] || (candidate.intake_id ? { kind: 'OER_INTAKE' as const,intakeId: candidate.intake_id } : undefined);
            return <article key={candidate.id} style={{ border: '1px solid #DCE3EE',borderRadius: 14,padding: 14,background: '#fff' }}>
              <div style={{ display: 'flex',justifyContent: 'space-between',gap: 8 }}>
                <strong>{mediaIcon[candidate.media_kind || 'LINK']} {candidate.title}</strong>
                <span style={{ color: candidate.reference_only ? '#B45309' : '#15803D',fontWeight: 800,fontSize: 11 }}>{candidate.reference_only ? 'OFFICIAL REFERENCE' : 'ITEM RESULT'}</span>
              </div>
              <p className="admin-muted" style={{ minHeight: 38 }}>{candidate.description || candidate.primary_category || candidate.provider}</p>
              <div style={{ fontSize: 13,lineHeight: 1.65 }}>
                <strong>{candidate.provider}</strong>{candidate.publisher_text ? ` · ${candidate.publisher_text}` : ''}{candidate.duration_seconds ? ` · ${durationText(candidate.duration_seconds)}` : ''}<br />
                Type: {candidate.media_kind || 'LINK'} · Class: {candidate.grade_levels?.join(', ') || classNumber}<br />
                Licence metadata: {candidate.licence_candidate || 'review required'} · Adaptation: {candidate.can_adapt ? 'possible after verification' : 'not assumed'}
              </div>
              <div style={{ display: 'flex',gap: 8,flexWrap: 'wrap',marginTop: 12 }}>
                {candidate.source_url && <a href={candidate.source_url} target="_blank" rel="noreferrer" style={secondary}>Preview / open source ↗</a>}
                {!candidate.reference_only && !stage && <button type="button" style={button} disabled={stageCandidateMutation.isPending} onClick={() => stageCandidateMutation.mutate(candidate)}>{candidate.resource_id ? 'Select governed source' : `Select this ${candidate.media_kind === 'VIDEO' ? 'video' : 'item'}`}</button>}
                {stage?.kind === 'OER_INTAKE' && <Link href="/admin/learning/intake" style={{ ...secondary,borderColor: '#22C55E',background: '#ECFDF3' }}>✓ Sent to Source Review · Review now →</Link>}
                {stage?.kind === 'GOVERNED_RESOURCE' && <span className="admin-success-note" style={{ padding: '9px 12px',borderRadius: 9 }}>✓ Governed source selected</span>}
                {candidate.reference_only && <span className="admin-note" style={{ padding: '9px 12px',borderRadius: 9,fontSize: 12 }}>Open the official library, choose the exact item, then use the web-address section below.</span>}
              </div>
            </article>;
          })}
        </div>
      </section>

      <section className="admin-panel" style={{ ...panel,marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}><span className="admin-step">4</span>Already have an exact web address?</h2>
        <p className="admin-muted">Paste any HTTPS learning item that is not returned directly. VidyaSetu stores the exact URL in Source & Licence Review as link-only first. It is never silently copied or published.</p>
        <div style={{ display: 'grid',gridTemplateColumns: '1fr 2fr 1fr',gap: 12 }}>
          <label className="admin-label">Title<input className="admin-input" value={webTitle} onChange={(e) => setWebTitle(e.target.value)} placeholder="Resource title" /></label>
          <label className="admin-label">HTTPS URL<input className="admin-input" value={webUrl} onChange={(e) => setWebUrl(e.target.value)} placeholder="https://..." /></label>
          <label className="admin-label">Attribution / publisher<input className="admin-input" value={webAttribution} onChange={(e) => setWebAttribution(e.target.value)} placeholder="Optional — domain used if blank" /></label>
        </div>
        <div style={{ display: 'flex',gap: 9,alignItems: 'center',marginTop: 12,flexWrap: 'wrap' }}>
          <button type="button" style={{ ...button,opacity: webTitle.trim().length >= 2 && webUrl.startsWith('https://') ? 1 : .55 }} disabled={webTitle.trim().length < 2 || !webUrl.startsWith('https://') || webMutation.isPending} onClick={() => webMutation.mutate()}>{webMutation.isPending ? 'Sending…' : 'Send to Source & Licence Review'}</button>
          {lastWebIntakeId && <Link href="/admin/learning/intake" style={{ ...secondary,borderColor: '#22C55E',background: '#ECFDF3' }}>✓ Saved · Open Source Review →</Link>}
        </div>
      </section>

      <section className="admin-panel" style={{ ...panel,marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}><span className="admin-step">5</span>What happens after source review?</h2>
        <div style={{ display: 'grid',gridTemplateColumns: 'repeat(3,minmax(190px,1fr))',gap: 10 }}>
          <div className="admin-panel-muted" style={{ padding: 14 }}><strong>1 · Verify and approve</strong><p className="admin-muted">Source Review records item-level licence and attribution. Approval is disabled until required evidence is saved.</p><Link href="/admin/learning/intake" style={secondary}>Open Source Review</Link></div>
          <div className="admin-panel-muted" style={{ padding: 14 }}><strong>2 · Add to Content Library</strong><p className="admin-muted">Choose class, board, subject, chapter/topic and Public / Registered / Subscriber audience. The item enters Content Library as DRAFT.</p><Link href="/admin/learning" style={secondary}>Open Content Library</Link></div>
          <div className="admin-panel-muted" style={{ padding: 14 }}><strong>3 · Review and publish</strong><p className="admin-muted">Only PUBLISHED items reach learners. Public Free appears under Learn; private items are restricted by class and, when selected, subscription entitlement.</p></div>
        </div>
      </section>

      <details className="admin-panel" style={{ ...panel,marginBottom: 16 }}>
        <summary style={{ cursor: 'pointer',fontWeight: 900,fontSize: 18 }}>Optional: create an AI-assisted lesson/question draft from governed sources</summary>
        <p className="admin-muted" style={{ lineHeight: 1.6 }}>Use this when you want VidyaSetu to create original text, revision, activities, questions and an assessment. Existing external video/audio items can already be curated through Source Review; original AI video/audio generation is a separate future media pipeline.</p>
        {!providerConfigured && <div className="admin-note" style={{ padding: 12,marginBottom: 12 }}><strong>AI provider is currently in safe/mock mode.</strong> Mock output deliberately cannot pass academic approval. Configure the production AI provider before using generated lessons for publication.</div>}

        <div style={{ display: 'grid',gridTemplateColumns: '1fr 1fr',gap: 16 }}>
          <div>
            <h3>Approved/governed sources</h3>
            <select className="admin-select" defaultValue="" onChange={(e) => { if (e.target.value) addApprovedIntake(e.target.value); e.currentTarget.value=''; }}>
              <option value="">Add approved external reference…</option>
              {(creatorOptionsQuery.data?.intake || []).map((item) => <option key={item.id} value={item.id}>{item.source_code} · {item.title}</option>)}
            </select>
            <p className="admin-muted" style={{ fontSize: 12 }}>Governed VidyaSetu results selected above are automatically added as grounding sources. Approved external link-only items remain references; use Advanced Creator when a verified adaptation-compatible excerpt is required.</p>
          </div>
          <div>
            <h3>Selected for draft</h3>
            {!selectedSources.length ? <p className="admin-muted">No governed source selected. A mapped canonical concept can also start a curriculum draft.</p> : selectedSources.map((item,index) => <div key={`${item.resourceId || item.intakeId || item.sourceUrl}-${index}`} style={{ display: 'flex',justifyContent: 'space-between',gap: 8,padding: '8px 0',borderBottom: '1px solid #E5E7EB' }}><span>{item.sourceRole === 'GROUNDING' ? '✅' : '🔗'} {item.title || item.sourceCode}</span><button type="button" onClick={() => setSelectedSources((current) => current.filter((_,i) => i !== index))} style={{ border: 0,background: 'transparent',cursor: 'pointer' }}>Remove</button></div>)}
          </div>
        </div>

        <div style={{ display: 'flex',gap: 10,flexWrap: 'wrap',marginTop: 12 }}>
          {(['lesson','revision','activities','questions','assessment'] as const).map((key) => <label key={key} style={{ ...secondary,cursor: 'pointer' }}><input type="checkbox" checked={pack[key]} onChange={(e) => setPack((current) => ({ ...current,[key]: e.target.checked }))} /> {key[0].toUpperCase() + key.slice(1)}</label>)}
          <label style={secondary}>Questions <input type="number" min={5} max={30} value={pack.questionCount} onChange={(e) => setPack((current) => ({ ...current,questionCount: Number(e.target.value) }))} style={{ width: 58 }} /></label>
        </div>
        <label className="admin-label" style={{ display: 'block',marginTop: 14 }}>Draft title
          <input className="admin-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`Class ${classNumber} ${subject || 'Learning'} — ${topicText || chapterText || 'Lesson'}`} />
        </label>
        <div style={{ display: 'flex',gap: 10,alignItems: 'center',marginTop: 12,flexWrap: 'wrap' }}>
          <button type="button" style={{ ...button,opacity: canCreate ? 1 : .55 }} disabled={!canCreate || createMutation.isPending} onClick={() => createMutation.mutate()}>{createMutation.isPending ? 'Creating…' : 'Create governed AI draft job'}</button>
          {!canCreate && <span style={{ color: '#B54708',fontSize: 12 }}>Select a governed source above or use a mapped canonical topic.</span>}
          {createdJobId && <span className="admin-success-note" style={{ padding: '8px 10px' }}>Job {createdJobId.slice(0,8)} · {createdJobStatus}</span>}
          {createdJobId && ['READY_TO_GENERATE','VALIDATION_FAILED','FAILED'].includes(createdJobStatus) && <button type="button" style={secondary} disabled={generateMutation.isPending} onClick={() => generateMutation.mutate()}>{generateMutation.isPending ? 'Generating…' : 'Generate draft'}</button>}
          <Link href="/admin/learning/creator" style={secondary}>Advanced Creator workspace</Link>
        </div>
      </details>

      <div className="admin-note" style={{ padding: 13 }}>
        <strong>Learning Pack meaning:</strong> one topic can ultimately contain Learn (article), Watch (video), Listen (audio), Explore (interactive), Practice, Revise, Assess and Worksheet assets. The current factory can curate external media and create text/question drafts; the pack container exists, while original media-generation connectors remain separate work.
      </div>
    </div>
  );
}
