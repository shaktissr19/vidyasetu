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
  stageExternalWebSource,
  type FactoryCurriculumSubjectOption,
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

function durationText(seconds?: number | null) {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2,'0')}`;
}

export default function ContentFactoryPage() {
  const queryClient = useQueryClient();
  const [classNumber,setClassNumber] = useState(5);
  const [boardCode,setBoardCode] = useState('COMMON');
  const [curriculumSubjectId,setCurriculumSubjectId] = useState('');
  const [subjectName,setSubjectName] = useState('');
  const [unitId,setUnitId] = useState('');
  const [topicId,setTopicId] = useState('');
  const [freeTopic,setFreeTopic] = useState('');
  const [language,setLanguage] = useState('English');
  const [providers,setProviders] = useState<CreatorDiscoveryProvider[]>(['LOCAL','DIKSHA']);
  const [mediaKinds,setMediaKinds] = useState<CreatorDiscoveryMediaKind[]>(['ARTICLE','VIDEO']);
  const [publisher,setPublisher] = useState('');
  const [candidates,setCandidates] = useState<CreatorDiscoveryCandidate[]>([]);
  const [runs,setRuns] = useState<Array<{ provider: CreatorDiscoveryProvider; count: number; status: 'COMPLETED' | 'FAILED'; error?: string }>>([]);
  const [selectedSources,setSelectedSources] = useState<CreatorSourceInput[]>([]);
  const [pack,setPack] = useState({ lesson: true,revision: true,activities: true,questions: true,assessment: true,questionCount: 10 });
  const [title,setTitle] = useState('');
  const [createdJobId,setCreatedJobId] = useState('');
  const [createdJobStatus,setCreatedJobStatus] = useState('');
  const [webTitle,setWebTitle] = useState('');
  const [webUrl,setWebUrl] = useState('');
  const [webAttribution,setWebAttribution] = useState('');

  const factoryQuery = useQuery({ queryKey: ['content-factory-options'],queryFn: () => getContentFactoryOptions().then((r) => r.data.data) });
  const creatorOptionsQuery = useQuery({ queryKey: ['content-creator-options'],queryFn: () => getContentCreatorOptions().then((r) => r.data.data) });

  const readiness = factoryQuery.data?.readinessByClass.find((item) => item.classNumber === classNumber);
  const curriculumSubjects = useMemo(() => (factoryQuery.data?.curriculumSubjects || []).filter((item) => item.board_code === boardCode && String(item.class_name).replace(/\D/g,'') === String(classNumber)),[factoryQuery.data,boardCode,classNumber]);
  const selectedCurriculumSubject = curriculumSubjects.find((item) => item.id === curriculumSubjectId);
  const subject = selectedCurriculumSubject?.display_name || subjectName;
  const units = useMemo(() => (factoryQuery.data?.units || []).filter((item) => item.curriculum_subject_id === curriculumSubjectId),[factoryQuery.data,curriculumSubjectId]);
  const topics = useMemo(() => (factoryQuery.data?.topics || []).filter((item) => item.curriculum_unit_id === unitId),[factoryQuery.data,unitId]);
  const selectedUnit = units.find((item) => item.id === unitId);
  const selectedTopic = topics.find((item) => item.id === topicId);
  const matchingConcepts = useMemo(() => (factoryQuery.data?.concepts || []).filter((item) => item.class_number === classNumber && (!subject || item.subject_name?.toLowerCase() === subject.toLowerCase() || item.subject_code?.toLowerCase() === subject.toLowerCase())),[factoryQuery.data,classNumber,subject]);
  const matchedConcept = matchingConcepts.find((item) => item.name.toLowerCase() === (selectedTopic?.title || freeTopic).trim().toLowerCase()) || null;
  const searchText = (freeTopic.trim() || selectedTopic?.title || selectedUnit?.title || subject || '').trim();
  const discovery = creatorOptionsQuery.data?.discovery;
  const selectedBoard = factoryQuery.data?.boards.find((item) => item.code === boardCode);

  const discoverMutation = useMutation({
    mutationFn: () => discoverContentCreatorSources({
      providers,query: searchText,classNumber,subject: subject || null,language: language || null,publisher: publisher || null,mediaKinds,limit: 24,
    }),
    onSuccess: (response) => {
      const result = response.data.data;
      setCandidates(result.candidates || []);
      setRuns(result.runs || []);
      if (!result.count) toast('No direct item matches. Check provider status below or open an official reference result.');
      else toast.success(`Found ${result.count} result(s).`);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error,'Source search failed')),
  });

  const stageCandidateMutation = useMutation({
    mutationFn: (candidate: CreatorDiscoveryCandidate) => stageContentCreatorDiscoveryCandidate(candidate.id),
    onSuccess: async (response,candidate) => {
      const result = response.data.data;
      if (result.kind === 'GOVERNED_RESOURCE' && candidate.resource_id) {
        if (!selectedSources.some((item) => item.resourceId === candidate.resource_id)) {
          setSelectedSources((current) => [...current,{ sourceRole: 'GROUNDING',resourceId: candidate.resource_id,title: candidate.title }]);
        }
        toast.success('Governed VidyaSetu source added to this draft.');
      } else {
        toast.success('External source sent to Source & Licence Review. Approve it there before using it for grounding.');
      }
      await queryClient.invalidateQueries({ queryKey: ['content-creator-options'] });
    },
    onError: (error: unknown) => toast.error(apiErrorText(error,'Could not stage source')),
  });

  const webMutation = useMutation({
    mutationFn: () => stageExternalWebSource({
      title: webTitle.trim(),sourceUrl: webUrl.trim(),licenceCandidate: 'EXTERNAL_LINK_ONLY',attributionText: webAttribution.trim() || null,
      classNumber,subject: subject || null,boardCode,
    }),
    onSuccess: async () => {
      toast.success('Web source sent to Source & Licence Review.');
      setWebTitle(''); setWebUrl(''); setWebAttribution('');
      await queryClient.invalidateQueries({ queryKey: ['content-creator-options'] });
    },
    onError: (error: unknown) => toast.error(apiErrorText(error,'Could not stage web source')),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const autoTitle = title.trim() || `Class ${classNumber} ${subject || 'Learning'} — ${selectedTopic?.title || freeTopic.trim() || selectedUnit?.title || 'Lesson'}`;
      return createContentCreatorJob({
        mode: matchedConcept ? 'CURRICULUM' : 'SOURCES',
        title: autoTitle,
        instructions: `Create a clear, age-appropriate Class ${classNumber} ${subject || ''} learning pack for ${selectedTopic?.title || freeTopic.trim() || selectedUnit?.title || searchText}. Use selected governed sources, explain concepts accurately, include examples and practice.`,
        conceptId: matchedConcept?.id || null,
        existingResourceId: null,
        classNumber,
        subjectId: selectedCurriculumSubject?.subject_id || null,
        boardCodes: [boardCode],
        languageMode: language === 'Hindi' ? 'HINDI' : language === 'Bilingual' ? 'BILINGUAL' : 'ENGLISH',
        visibility: 'REGISTERED',
        accessRequirement: 'REGISTERED',
        requestedPack: pack,
        sources: selectedSources,
      });
    },
    onSuccess: (response) => {
      setCreatedJobId(response.data.data.id);
      setCreatedJobStatus(response.data.data.status);
      toast.success('Content Factory draft created. Nothing is published yet.');
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
  function chooseCurriculumSubject(item: FactoryCurriculumSubjectOption | null) {
    setCurriculumSubjectId(item?.id || '');
    setSubjectName(item?.display_name || '');
    setUnitId(''); setTopicId('');
  }
  function addApprovedIntake(intakeId: string) {
    const item = creatorOptionsQuery.data?.intake.find((entry) => entry.id === intakeId);
    if (!item || selectedSources.some((source) => source.intakeId === intakeId)) return;
    setSelectedSources((current) => [...current,{
      sourceRole: 'REFERENCE_ONLY',intakeId: item.id,title: item.title,sourceCode: item.source_code,sourceUrl: item.source_url,
      licence: item.licence_candidate || 'OTHER',attributionText: item.attribution_text || null,
    }]);
  }

  const canCreate = Boolean((matchedConcept || selectedSources.length) && searchText.length >= 2);

  return (
    <div className="admin-page" style={{ padding: 8 }}>
      <div style={{ display: 'flex',justifyContent: 'space-between',gap: 16,flexWrap: 'wrap',alignItems: 'flex-start',marginBottom: 18 }}>
        <div>
          <div style={{ color: '#FF6B00',fontSize: 12,fontWeight: 900,letterSpacing: '.12em' }}>CONTENT FACTORY 2.0 · FOUNDATION</div>
          <h1 style={{ margin: '5px 0',fontSize: 34 }}>Create a complete learning pack</h1>
          <p className="admin-muted" style={{ maxWidth: 920,lineHeight: 1.65 }}>Choose class, board, subject and topic. Search working sources, add governed material or paste any HTTPS learning URL, then create a controlled draft for review. Nothing on this page publishes automatically.</p>
        </div>
        <div style={{ display: 'flex',gap: 8,flexWrap: 'wrap' }}>
          <Link href="/admin/learning/creator" style={secondary}>Existing Creator</Link>
          <Link href="/admin/learning/intake" style={secondary}>Source & Licence Review</Link>
          <Link href="/admin/learning" style={secondary}>Content Library</Link>
        </div>
      </div>

      <section className="admin-panel" style={{ ...panel,marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}><span className="admin-step">1</span>Choose curriculum context</h2>
        <div style={{ display: 'grid',gridTemplateColumns: 'repeat(4,minmax(160px,1fr))',gap: 12 }}>
          <label className="admin-label">Class
            <select className="admin-select" value={classNumber} onChange={(e) => { setClassNumber(Number(e.target.value)); chooseCurriculumSubject(null); }}>
              {Array.from({ length: 12 },(_,i) => i + 1).map((value) => <option key={value} value={value}>Class {value}</option>)}
            </select>
          </label>
          <label className="admin-label">Board
            <select className="admin-select" value={boardCode} onChange={(e) => { setBoardCode(e.target.value); chooseCurriculumSubject(null); }}>
              {(factoryQuery.data?.boards || []).map((item) => <option key={item.code} value={item.code}>{item.short_name || item.name}</option>)}
            </select>
          </label>
          <label className="admin-label">Subject
            {curriculumSubjects.length ? (
              <select className="admin-select" value={curriculumSubjectId} onChange={(e) => chooseCurriculumSubject(curriculumSubjects.find((item) => item.id === e.target.value) || null)}>
                <option value="">Select subject...</option>
                {curriculumSubjects.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}
              </select>
            ) : (
              <select className="admin-select" value={subjectName} onChange={(e) => setSubjectName(e.target.value)}>
                <option value="">Select subject...</option>
                {(factoryQuery.data?.subjects || []).map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
              </select>
            )}
          </label>
          <label className="admin-label">Language
            <select className="admin-select" value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option>English</option><option>Hindi</option><option>Bilingual</option>
            </select>
          </label>
        </div>

        <div style={{ display: 'grid',gridTemplateColumns: '1fr 1fr 1.4fr',gap: 12,marginTop: 12 }}>
          <label className="admin-label">Chapter / unit
            {units.length ? <select className="admin-select" value={unitId} onChange={(e) => { setUnitId(e.target.value); setTopicId(''); }}><option value="">Any chapter</option>{units.map((item) => <option key={item.id} value={item.id}>{item.unit_number ? `${item.unit_number}. ` : ''}{item.title}</option>)}</select>
              : <input className="admin-input" value="" readOnly placeholder="No mapped chapters yet — use Topic / learning need" />}
          </label>
          <label className="admin-label">Mapped topic
            {topics.length ? <select className="admin-select" value={topicId} onChange={(e) => setTopicId(e.target.value)}><option value="">Any topic</option>{topics.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
              : <input className="admin-input" value="" readOnly placeholder="No mapped topics yet" />}
          </label>
          <label className="admin-label">Topic / learning need
            <input className="admin-input" value={freeTopic} onChange={(e) => setFreeTopic(e.target.value)} placeholder="e.g. Solar system, fractions, nouns, force and pressure" />
          </label>
        </div>

        <div className={readiness?.curriculumReady ? 'admin-success-note' : 'admin-note'} style={{ marginTop: 14,padding: 12 }}>
          <strong>Class {classNumber} curriculum readiness:</strong> {readiness?.conceptCount || 0} canonical concept(s), {readiness?.subjectCount || 0} concept-mapped subject(s). {!readiness?.curriculumReady && 'You can still search by subject/topic and create from governed sources; the full curriculum registry must be populated separately.'}
        </div>
      </section>

      <section className="admin-panel" style={{ ...panel,marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}><span className="admin-step">2</span>Find learning material</h2>
        <p className="admin-muted">Direct connectors return individual resources. Reference connectors open the official source so you can choose an exact item. Every external item stays governed.</p>
        <div style={{ display: 'flex',gap: 8,flexWrap: 'wrap',marginBottom: 12 }}>
          {(discovery?.providers || []).filter((item) => item.enabled).map((item) => (
            <button key={item.code} type="button" onClick={() => toggleProvider(item.code)} style={{ ...secondary,borderColor: providers.includes(item.code) ? '#FF6B00' : '#CBD5E1',background: providers.includes(item.code) ? '#FFF4EC' : '#fff',cursor: 'pointer' }}>
              {providerIcon[item.code]} {item.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'grid',gridTemplateColumns: '2fr 1fr',gap: 12 }}>
          <div>
            <div style={{ display: 'flex',gap: 8,flexWrap: 'wrap' }}>
              {(discovery?.mediaKinds || []).map((item) => <button key={item.code} type="button" onClick={() => toggleMedia(item.code)} style={{ ...secondary,borderColor: mediaKinds.includes(item.code) ? '#FF6B00' : '#CBD5E1',cursor: 'pointer' }}>{mediaIcon[item.code]} {item.label}</button>)}
            </div>
          </div>
          <label className="admin-label">Publisher filter
            <select className="admin-select" value={publisher} onChange={(e) => setPublisher(e.target.value)}><option value="">Any publisher</option>{(discovery?.publisherPresets || []).map((item) => <option key={item}>{item}</option>)}</select>
          </label>
        </div>
        <div style={{ display: 'flex',gap: 10,alignItems: 'center',marginTop: 14,flexWrap: 'wrap' }}>
          <button type="button" style={{ ...button,opacity: searchText.length < 2 || !providers.length ? .55 : 1 }} disabled={searchText.length < 2 || !providers.length || discoverMutation.isPending} onClick={() => discoverMutation.mutate()}>{discoverMutation.isPending ? 'Searching…' : 'Search Learning Content'}</button>
          <span className="admin-muted">Searching: <strong>{searchText || 'choose a topic/subject'}</strong> · Class {classNumber} · {selectedBoard?.short_name || boardCode}</span>
        </div>

        {runs.length > 0 && <div style={{ display: 'grid',gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))',gap: 8,marginTop: 14 }}>
          {runs.map((run) => <div key={`${run.provider}-${run.status}`} className={run.status === 'FAILED' ? 'admin-note' : 'admin-success-note'} style={{ padding: 10 }}><strong>{providerIcon[run.provider]} {run.provider}</strong><div>{run.status === 'FAILED' ? 'Connector failed' : `${run.count} result(s)`}</div>{run.error && <small>{run.error}</small>}</div>)}
        </div>}
      </section>

      <section className="admin-panel" style={{ ...panel,marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}><span className="admin-step">3</span>Results and validation path</h2>
        {!candidates.length && <div className="admin-note" style={{ padding: 14 }}>No results loaded yet. A zero result does not mean the workflow failed; provider status appears above so you can see whether a connector returned zero matches or could not be reached.</div>}
        <div style={{ display: 'grid',gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))',gap: 12 }}>
          {candidates.map((candidate) => (
            <article key={candidate.id} style={{ border: '1px solid #DCE3EE',borderRadius: 14,padding: 14,background: '#fff' }}>
              <div style={{ display: 'flex',justifyContent: 'space-between',gap: 8 }}><strong>{mediaIcon[candidate.media_kind || 'LINK']} {candidate.title}</strong><span style={{ color: candidate.reference_only ? '#B45309' : '#15803D',fontWeight: 800,fontSize: 12 }}>{candidate.reference_only ? 'OFFICIAL REFERENCE' : 'ITEM RESULT'}</span></div>
              <p className="admin-muted" style={{ minHeight: 42 }}>{candidate.description || candidate.primary_category || candidate.provider}</p>
              <div style={{ fontSize: 13,lineHeight: 1.6 }}><strong>{candidate.provider}</strong>{candidate.publisher_text ? ` · ${candidate.publisher_text}` : ''}{candidate.duration_seconds ? ` · ${durationText(candidate.duration_seconds)}` : ''}<br />Licence: {candidate.licence_candidate || 'review required'} · Adapt: {candidate.can_adapt ? 'yes' : 'no'} · Commercial: {candidate.can_use_commercially ? 'yes' : 'review/no'}</div>
              <div style={{ display: 'flex',gap: 8,flexWrap: 'wrap',marginTop: 12 }}>
                {candidate.source_url && <a href={candidate.source_url} target="_blank" rel="noreferrer" style={secondary}>Open source</a>}
                {!candidate.reference_only && <button type="button" style={button} disabled={stageCandidateMutation.isPending} onClick={() => stageCandidateMutation.mutate(candidate)}>{candidate.resource_id ? 'Add governed source' : 'Send to source review'}</button>}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="admin-panel" style={{ ...panel,marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}><span className="admin-step">4</span>Paste any external web address</h2>
        <p className="admin-muted">Use this when the exact learning item is on another HTTPS website. VidyaSetu stores it as reference-only first and sends it to Source & Licence Review. It is never silently copied or published.</p>
        <div style={{ display: 'grid',gridTemplateColumns: '1fr 2fr 1fr',gap: 12 }}>
          <label className="admin-label">Title<input className="admin-input" value={webTitle} onChange={(e) => setWebTitle(e.target.value)} placeholder="Resource title" /></label>
          <label className="admin-label">HTTPS URL<input className="admin-input" value={webUrl} onChange={(e) => setWebUrl(e.target.value)} placeholder="https://..." /></label>
          <label className="admin-label">Attribution / publisher<input className="admin-input" value={webAttribution} onChange={(e) => setWebAttribution(e.target.value)} placeholder="Optional — domain used if blank" /></label>
        </div>
        <button type="button" style={{ ...button,marginTop: 12,opacity: webTitle.trim().length < 2 || !webUrl.startsWith('https://') ? .55 : 1 }} disabled={webTitle.trim().length < 2 || !webUrl.startsWith('https://') || webMutation.isPending} onClick={() => webMutation.mutate()}>{webMutation.isPending ? 'Sending…' : 'Send to Source & Licence Review'}</button>
      </section>

      <section className="admin-panel" style={{ ...panel,marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}><span className="admin-step">5</span>Select governed sources and create draft</h2>
        <div style={{ display: 'grid',gridTemplateColumns: '1fr 1fr',gap: 16 }}>
          <div>
            <h3>Approved external intake</h3>
            <select className="admin-select" defaultValue="" onChange={(e) => { if (e.target.value) addApprovedIntake(e.target.value); e.currentTarget.value=''; }}>
              <option value="">Add approved source...</option>
              {(creatorOptionsQuery.data?.intake || []).map((item) => <option key={item.id} value={item.id}>{item.source_code} · {item.title}</option>)}
            </select>
          </div>
          <div>
            <h3>Selected for this draft</h3>
            {!selectedSources.length ? <p className="admin-muted">No governed source selected yet.</p> : selectedSources.map((item,index) => <div key={`${item.resourceId || item.intakeId || item.sourceUrl}-${index}`} style={{ display: 'flex',justifyContent: 'space-between',gap: 8,padding: '8px 0',borderBottom: '1px solid #E5E7EB' }}><span>{item.sourceRole === 'GROUNDING' ? '✅' : '🔗'} {item.title || item.sourceCode}</span><button type="button" onClick={() => setSelectedSources((current) => current.filter((_,i) => i !== index))} style={{ border: 0,background: 'transparent',cursor: 'pointer' }}>Remove</button></div>)}
          </div>
        </div>

        <h3 style={{ marginBottom: 8 }}>Outputs supported by the current text/question creator</h3>
        <div style={{ display: 'flex',gap: 10,flexWrap: 'wrap' }}>
          {(['lesson','revision','activities','questions','assessment'] as const).map((key) => <label key={key} style={{ ...secondary,cursor: 'pointer' }}><input type="checkbox" checked={pack[key]} onChange={(e) => setPack((current) => ({ ...current,[key]: e.target.checked }))} /> {key[0].toUpperCase() + key.slice(1)}</label>)}
          <label style={secondary}>Questions <input type="number" min={5} max={30} value={pack.questionCount} onChange={(e) => setPack((current) => ({ ...current,questionCount: Number(e.target.value) }))} style={{ width: 58 }} /></label>
        </div>
        <div className="admin-note" style={{ marginTop: 12,padding: 12 }}><strong>Next media pipeline:</strong> Watch/Video, Listen/Audio, Explore/Interactive and Worksheet are now represented in the Content Pack foundation, but original media generation connectors are not active yet. External governed media can already be discovered and curated.</div>

        <label className="admin-label" style={{ display: 'block',marginTop: 14 }}>Learning pack title<input className="admin-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`Class ${classNumber} ${subject || 'Learning'} — ${searchText || 'Topic'}`} /></label>
        {!matchedConcept && !selectedSources.length && <p style={{ color: '#B45309',fontWeight: 700 }}>This class/topic has no exact canonical concept match yet. Select at least one governed source to create from Sources, or complete the curriculum registry.</p>}
        <div style={{ display: 'flex',gap: 10,alignItems: 'center',flexWrap: 'wrap',marginTop: 12 }}>
          <button type="button" style={{ ...button,opacity: canCreate ? 1 : .55 }} disabled={!canCreate || createMutation.isPending} onClick={() => createMutation.mutate()}>{createMutation.isPending ? 'Creating…' : 'Create Governed Draft'}</button>
          {matchedConcept && <span className="admin-success-note" style={{ padding: 8 }}>Canonical concept matched: {matchedConcept.name}</span>}
        </div>

        {createdJobId && <div className="admin-success-note" style={{ marginTop: 14,padding: 14 }}>
          <strong>Draft job created:</strong> {createdJobId} · {createdJobStatus}
          <div style={{ display: 'flex',gap: 8,marginTop: 10,flexWrap: 'wrap' }}>
            <button type="button" style={button} onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>{generateMutation.isPending ? 'Generating…' : 'Generate Draft'}</button>
            <Link href="/admin/learning/creator" style={secondary}>Open Creator review workspace</Link>
          </div>
        </div>}
      </section>

      <section className="admin-panel" style={{ ...panel }}>
        <h2 style={{ marginTop: 0 }}>Content Factory end-state</h2>
        <div style={{ display: 'grid',gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))',gap: 10 }}>
          {['Curriculum context','Source discovery','Source & licence validation','Text generation','Video pipeline','Audio/TTS pipeline','Interactive pipeline','Practice & assessment','Admin review','Student/Public delivery'].map((item,index) => <div key={item} style={{ border: '1px solid #DCE3EE',borderRadius: 12,padding: 12,background: '#fff' }}><strong>{index + 1}. {item}</strong></div>)}
        </div>
      </section>
    </div>
  );
}
