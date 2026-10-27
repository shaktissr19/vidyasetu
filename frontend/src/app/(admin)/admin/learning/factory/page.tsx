'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import LearningAsset from '@/components/learning/LearningAsset';
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
} from '@/services/contentFactoryService';
import { apiErrorText } from '@/utils/errors';

const panel = { padding: 20,borderRadius: 16 } as const;
const button = { padding: '10px 16px',borderRadius: 10,border: 0,background: '#B54708',color: '#fff',fontWeight: 900,cursor: 'pointer' } as const;
const secondary = { padding: '9px 14px',borderRadius: 10,border: '1px solid #CBD5E1',background: '#fff',color: '#14213D',fontWeight: 800,textDecoration: 'none',display: 'inline-flex',alignItems: 'center',gap: 6 } as const;
const providerIcon: Partial<Record<CreatorDiscoveryProvider,string>> = {
  LOCAL: '📚',DIKSHA: '🇮🇳',NROER: '🏛️',CBSE: '🎓',NCERT_EPATHSHALA: '📖',NIOS: '🏫',SWAYAM: '🎬',PHET: '🔬',OER_COMMONS: '🌍',
};
const mediaIcon: Record<CreatorDiscoveryMediaKind,string> = {
  ARTICLE: '📖',VIDEO: '▶️',AUDIO: '🎧',IMAGE: '🖼️',INTERACTIVE: '🧩',PDF: '📄',COURSE: '🎓',LINK: '🔗',
};

type StageState = { kind: 'GOVERNED_RESOURCE' | 'OER_INTAKE'; intakeId?: string; resourceId?: string };
const FACTORY_SESSION_KEY = 'vs_admin_content_factory_search_v1';
interface SavedFactorySearch {
  syllabusMode: 'SYLLABUS'|'EXPLORE'; curriculumTopicId: string; curriculumMedium: 'en'|'hi'; syllabusConcept: string; syllabusYear: string;
  gradeCode: string; classNumber: number; boardCode: string; subjectId: string; chapterText: string; topicText: string;
  language: 'English'|'Hindi'|'Bilingual'; providers: CreatorDiscoveryProvider[]; mediaKinds: CreatorDiscoveryMediaKind[]; publisher: string;
  candidates: CreatorDiscoveryCandidate[]; previewCandidateId: string; resultFilter: 'ALL'|'PLAYABLE'|'UNPLAYABLE';
  runs: Array<{ provider: CreatorDiscoveryProvider; count: number; status: 'COMPLETED'|'FAILED'; error?: string }>;
  staged: Record<string,StageState>;
}

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
  const router=useRouter();
  const queryClient = useQueryClient();
  const [syllabusMode,setSyllabusMode] = useState<'SYLLABUS'|'EXPLORE'>('SYLLABUS');
  const [curriculumTopicId,setCurriculumTopicId] = useState('');
  const [curriculumMedium,setCurriculumMedium] = useState<'en'|'hi'>('en');
  const [syllabusConcept,setSyllabusConcept] = useState('');
  const [syllabusYear,setSyllabusYear] = useState('');
  const [gradeCode,setGradeCode] = useState('CLASS_5');
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
  const [previewCandidateId,setPreviewCandidateId] = useState('');
  const [resultFilter,setResultFilter] = useState<'ALL'|'PLAYABLE'|'UNPLAYABLE'>('ALL');
  const [runs,setRuns] = useState<Array<{ provider: CreatorDiscoveryProvider; count: number; status: 'COMPLETED' | 'FAILED'; error?: string }>>([]);
  const [staged,setStaged] = useState<Record<string,StageState>>({});
  const [selectedSources,setSelectedSources] = useState<CreatorSourceInput[]>([]);
  const [pack,setPack] = useState({ lesson: true,revision: true,activities: true,questions: true,assessment: true,questionCount: 10 });
  const [title,setTitle] = useState('');
  const [createdJobId,setCreatedJobId] = useState('');
  const [createdJobStatus,setCreatedJobStatus] = useState('');
  const [sessionRestored,setSessionRestored] = useState(false);

  useEffect(()=>{
    const p=new URLSearchParams(window.location.search);
    if(p.get('grade')){setGradeCode(p.get('grade')!);setClassNumber(Number(p.get('grade')?.replace('CLASS_','')) || 1);}
    if(p.get('board'))setBoardCode(p.get('board')!);
    if(p.get('subject'))setSubjectId(p.get('subject')!);
    if(p.get('chapter'))setChapterText(p.get('chapter')!);
    if(p.get('topic'))setTopicText(p.get('topic')!);
    const topicId=p.get('topicId')||'';
    if(topicId){setCurriculumTopicId(topicId);setSyllabusMode('SYLLABUS');}
    else if(p.get('mode')==='explore')setSyllabusMode('EXPLORE');
    setCurriculumMedium((p.get('medium')==='hi'?'hi':'en'));
    setSyllabusConcept(p.get('concept')||'');setSyllabusYear(p.get('year')||'');
  },[]);
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const cameFromCurriculum=['grade','board','subject','chapter','topic','topicId','mode'].some((key)=>params.has(key));
    if(cameFromCurriculum){window.sessionStorage.removeItem(FACTORY_SESSION_KEY);setSessionRestored(true);return;}
    try {
      const raw=window.sessionStorage.getItem(FACTORY_SESSION_KEY);
      if(raw){
        const saved=JSON.parse(raw) as SavedFactorySearch;
        if(Array.isArray(saved.candidates)){
          setSyllabusMode(saved.syllabusMode||'SYLLABUS');setCurriculumTopicId(saved.curriculumTopicId||'');setCurriculumMedium(saved.curriculumMedium||'en');
          setSyllabusConcept(saved.syllabusConcept||'');setSyllabusYear(saved.syllabusYear||'');setGradeCode(saved.gradeCode||'CLASS_5');
          setClassNumber(Number(saved.classNumber)||5);setBoardCode(saved.boardCode||'COMMON');setSubjectId(saved.subjectId||'');
          setChapterText(saved.chapterText||'');setTopicText(saved.topicText||'');setLanguage(saved.language||'English');
          setProviders((saved.providers||['LOCAL','DIKSHA']).filter((provider)=>provider!=='YOUTUBE'));
          setMediaKinds(saved.mediaKinds?.length?saved.mediaKinds:['ARTICLE','VIDEO']);setPublisher(saved.publisher||'');
          setCandidates(saved.candidates);setPreviewCandidateId(saved.previewCandidateId||'');setResultFilter(saved.resultFilter||'ALL');
          setRuns(saved.runs||[]);setStaged(saved.staged||{});
        }
      }
    } catch { window.sessionStorage.removeItem(FACTORY_SESSION_KEY); }
    setSessionRestored(true);
  },[]);
  useEffect(()=>{
    if(!sessionRestored)return;
    const saved:SavedFactorySearch={syllabusMode,curriculumTopicId,curriculumMedium,syllabusConcept,syllabusYear,gradeCode,classNumber,boardCode,subjectId,chapterText,topicText,language,providers:providers.filter((provider)=>provider!=='YOUTUBE'),mediaKinds,publisher,candidates,previewCandidateId,resultFilter,runs,staged};
    window.sessionStorage.setItem(FACTORY_SESSION_KEY,JSON.stringify(saved));
  },[sessionRestored,syllabusMode,curriculumTopicId,curriculumMedium,syllabusConcept,syllabusYear,gradeCode,classNumber,boardCode,subjectId,chapterText,topicText,language,providers,mediaKinds,publisher,candidates,previewCandidateId,resultFilter,runs,staged]);
  const factoryQuery = useQuery({ queryKey: ['content-factory-options'],queryFn: () => getContentFactoryOptions().then((r) => r.data.data) });
  const creatorOptionsQuery = useQuery({ queryKey: ['content-creator-options'],queryFn: () => getContentCreatorOptions().then((r) => r.data.data) });
  const queueQuery = useQuery({ queryKey: ['content-factory-queue-counts'],queryFn: () => getContentFactoryQueueCounts().then((r) => r.data.data),refetchInterval: 30000 });

  const subjects = factoryQuery.data?.subjects || [];
  const selectedSubject = subjects.find((item) => item.id === subjectId);
  const subject = selectedSubject?.name || '';
  const selectedBoard = factoryQuery.data?.boards.find((item) => item.code === boardCode);
  const readiness = factoryQuery.data?.readinessByClass.find((item) => item.classNumber === classNumber);

  const frameworkSubjectsForContext = useMemo(() => (factoryQuery.data?.curriculumSubjects || []).filter((item) =>
    item.board_code === boardCode && item.medium === curriculumMedium &&
    (item.class_name===gradeCode || (gradeCode.startsWith('CLASS_') && String(item.class_name).replace(/\D/g,'')===String(classNumber))),
  ),[factoryQuery.data,boardCode,curriculumMedium,classNumber,gradeCode]);
  const syllabusYears = useMemo(() => [...new Set(frameworkSubjectsForContext.map(item=>item.academic_year).filter((year):year is string=>Boolean(year)))].sort((a,b)=>b.localeCompare(a)),[frameworkSubjectsForContext]);
  const availableCurriculumSubjects = useMemo(() => frameworkSubjectsForContext.filter(item=>!syllabusYear||item.academic_year===syllabusYear),[frameworkSubjectsForContext,syllabusYear]);
  const curriculumSubject = availableCurriculumSubjects.find((item) => item.subject_id === subjectId)
    || availableCurriculumSubjects.find((item) => normalizedText(item.display_name) === normalizedText(subject));
  const useSyllabusTopics = syllabusMode === 'SYLLABUS' && Boolean(curriculumSubject);
  const chapterOptions = useMemo(() => {
    const topics=factoryQuery.data?.topics||[];
    const units=new Set((factoryQuery.data?.units||[]).filter(item=>item.curriculum_subject_id===curriculumSubject?.id).map(item=>item.id));
    const unique=new Map<string,{id:string;title:string}>();
    for(const topic of topics){if(!units.has(topic.curriculum_unit_id))continue;const id=topic.chapter_id||topic.curriculum_unit_id;unique.set(id,{id,title:topic.chapter_title||topic.title});}
    return [...unique.values()];
  },[factoryQuery.data,curriculumSubject]);
  const visibleTopics = useMemo(() => {
    const unitIds=new Set((factoryQuery.data?.units||[]).filter(item=>item.curriculum_subject_id===curriculumSubject?.id).map(item=>item.id));
    return (factoryQuery.data?.topics||[]).filter(item=>unitIds.has(item.curriculum_unit_id)&&(!chapterText||((item.chapter_id||item.curriculum_unit_id)===chapterText)));
  },[factoryQuery.data,curriculumSubject,chapterText]);
  const selectedCurriculumTopic = useMemo(() => visibleTopics.find(item=>item.id===curriculumTopicId)
    || (factoryQuery.data?.topics||[]).find(item=>item.id===curriculumTopicId&&item.curriculum_unit_id&&(factoryQuery.data?.units||[]).some(unit=>unit.id===item.curriculum_unit_id&&unit.curriculum_subject_id===curriculumSubject?.id)),
  [visibleTopics,factoryQuery.data,curriculumTopicId,curriculumSubject]);
  useEffect(()=>{if(syllabusYears.length&&!syllabusYears.includes(syllabusYear))setSyllabusYear(syllabusYears[0]);},[syllabusYear,syllabusYears]);
  useEffect(()=>{if(selectedCurriculumTopic){setChapterText(selectedCurriculumTopic.chapter_id||selectedCurriculumTopic.curriculum_unit_id);setTopicText(selectedCurriculumTopic.title);if(selectedCurriculumTopic.concept_id)setSyllabusConcept(selectedCurriculumTopic.concept_id);}},[selectedCurriculumTopic]);

  const matchingConcepts = useMemo(() => (factoryQuery.data?.concepts || []).filter((item) =>
    item.class_number === classNumber && (!subject || normalizedText(item.subject_name) === normalizedText(subject) || normalizedText(item.subject_code) === normalizedText(selectedSubject?.code)),
  ),[factoryQuery.data,classNumber,subject,selectedSubject?.code]);
  const matchedConcept = useSyllabusTopics
    ? matchingConcepts.find((item)=>item.id===selectedCurriculumTopic?.concept_id)||null
    : matchingConcepts.find((item) => normalizedText(item.name) === normalizedText(topicText))
      || matchingConcepts.find((item) => normalizedText(item.chapter_title) === normalizedText(chapterText) && !topicText.trim())
      || null;
  const searchText = (useSyllabusTopics
    ? (language==='Bilingual'&&selectedCurriculumTopic?.title_hi ? `${selectedCurriculumTopic.title} ${selectedCurriculumTopic.title_hi}` : selectedCurriculumTopic?.title || '')
    : (topicText.trim() || chapterText.trim() || subject)).trim();
  const discovery = creatorOptionsQuery.data?.discovery;
  const providerConfigured = Boolean(creatorOptionsQuery.data?.provider?.configured);
  const activeProviders = providers.filter((code) => (discovery?.providers || []).some((item) => item.code === code && item.enabled));
  const playableCandidates = candidates.filter((candidate) => ['LIBRARY','EMBED','IMPORT'].includes(candidate.delivery_capability?.code || ''));
  const sourceOnlyCandidates = candidates.filter((candidate) => !['LIBRARY','EMBED','IMPORT'].includes(candidate.delivery_capability?.code || ''));
  const visiblePlayableCandidates = resultFilter === 'UNPLAYABLE' ? [] : playableCandidates;
  const showUnplayableCandidates = resultFilter !== 'PLAYABLE' && sourceOnlyCandidates.length > 0;

  const discoverMutation = useMutation({
    mutationFn: () => discoverContentCreatorSources({
      providers: activeProviders.length ? activeProviders : providers.filter((code) => code === 'LOCAL' || code === 'DIKSHA'),
      query: searchText,
      gradeCode,boardCode,conceptIds:useSyllabusTopics&&selectedCurriculumTopic?.concept_id?[selectedCurriculumTopic.concept_id]:(syllabusConcept && factoryQuery.data?.concepts.some(c=>c.id===syllabusConcept && c.grade_code===gradeCode && c.subject_id===subjectId && normalizedText(c.name)===normalizedText(topicText))?[syllabusConcept]:[]),academicYear:useSyllabusTopics?syllabusYear||null:null,curriculumMedium:useSyllabusTopics?curriculumMedium:null,curriculumTopicId:useSyllabusTopics?selectedCurriculumTopic?.id||null:null,subjectId:subjectId || null,chapterLabel:useSyllabusTopics?selectedCurriculumTopic?.chapter_title||null:chapterText||null,topicLabel:useSyllabusTopics?selectedCurriculumTopic?.title||null:topicText||null,
      classNumber: gradeCode.startsWith('CLASS_') ? classNumber : null,
      subject: subject || null,
      language: language === 'Bilingual' ? null : language,
      publisher: publisher || null,
      mediaKinds,
      limit: 24,
    }),
    onSuccess: (response) => {
      const result = response.data.data;
      setCandidates(result.candidates || []);
      setResultFilter('ALL');
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
        toast.success('Selected. Review the media, rights and audience in Content Library.');
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['content-creator-options'] }),
        queryClient.invalidateQueries({ queryKey: ['content-factory-source-review'] }),
        queryClient.invalidateQueries({ queryKey: ['content-factory-queue-counts'] }),
      ]);
      router.push(result.intakeId ? `/admin/learning?intake=${result.intakeId}` : result.resourceId ? `/admin/learning?resource=${result.resourceId}` : '/admin/learning');
    },
    onError: (error: unknown) => toast.error(apiErrorText(error,'Could not select source')),
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
        curriculumTopicId: useSyllabusTopics?selectedCurriculumTopic?.id||null:null,
        curriculumAcademicYear: useSyllabusTopics?syllabusYear||null:null,
        curriculumMedium: useSyllabusTopics?curriculumMedium:null,
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
  function clearSearch() {
    setCandidates([]);setRuns([]);setStaged({});setPreviewCandidateId('');setResultFilter('ALL');setPublisher('');
    setChapterText('');setTopicText('');setSyllabusConcept('');
    if(syllabusMode==='SYLLABUS')setCurriculumTopicId('');
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

  const canSearch = searchText.length >= 2 && providers.length > 0 && mediaKinds.length > 0 && (!useSyllabusTopics||Boolean(selectedCurriculumTopic));
  const canCreate = gradeCode.startsWith('CLASS_') && Boolean((matchedConcept || selectedSources.length) && searchText.length >= 2);

  return (
    <div className="admin-page" style={{ padding: 8 }}>
      <div style={{ display: 'flex',justifyContent: 'space-between',gap: 16,flexWrap: 'wrap',alignItems: 'flex-start',marginBottom: 18 }}>
        <div>
          <div style={{ color: '#9A3B00',fontSize: 12,fontWeight: 900,letterSpacing: '.12em' }}>CONTENT FACTORY · START HERE</div>
          <h1 style={{ margin: '5px 0',fontSize: 34 }}>Build or add learning content</h1>
          <p className="admin-muted" style={{ maxWidth: 940,lineHeight: 1.65 }}>Choose the learner context, search trusted sources, select an item, verify its rights, then add it to Content Library. You can also create an AI-assisted text/question draft from governed sources. Nothing is published automatically.</p>
        </div>
        <div style={{ display: 'flex',gap: 8,flexWrap: 'wrap' }}>
          <Link href="/admin/learning" style={secondary}>Content Library {queueQuery.data?.contentLibraryPending ? `(${queueQuery.data.contentLibraryPending})` : ''}</Link>
        </div>
      </div>

      <div className="admin-success-note" style={{ padding: 13,marginBottom: 16 }}>
        <strong>How this works:</strong> Search → select a playable result → review it in Content Library → confirm rights and audience → publish when ready. Public items appear under Learn; private items follow their class and subscription rules.
      </div>

      <section className="admin-panel" style={{ ...panel,marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}><span className="admin-step">1</span>What do you want to teach?</h2>
        <div style={{ display: 'flex',gap: 8,flexWrap: 'wrap',marginBottom: 14 }}>
          <button type="button" style={{ ...secondary,borderColor:syllabusMode==='SYLLABUS'?'#B54708':'#CBD5E1',background:syllabusMode==='SYLLABUS'?'#FFF4EC':'#fff' }} onClick={()=>{setSyllabusMode('SYLLABUS');setChapterText('');setTopicText('');setCurriculumTopicId('');setSyllabusConcept('');}}>Use a published syllabus</button>
          <button type="button" style={{ ...secondary,borderColor:syllabusMode==='EXPLORE'?'#B54708':'#CBD5E1',background:syllabusMode==='EXPLORE'?'#FFF4EC':'#fff' }} onClick={()=>{setSyllabusMode('EXPLORE');setCurriculumTopicId('');setSyllabusConcept('');}}>Explore another topic</button>
          {useSyllabusTopics&&<span className="admin-chip">Content found here will be linked to the selected syllabus topic.</span>}
          {syllabusMode==='EXPLORE'&&<span className="admin-note" style={{ padding: '7px 10px' }}>Off-syllabus search · mapping can be added later by an academic reviewer.</span>}
        </div>
        <div style={{ display: 'grid',gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))',gap: 12 }}>
          <label className="admin-label">Class
            <select className="admin-select" value={gradeCode} onChange={(e) => { setGradeCode(e.target.value); const grade = factoryQuery.data?.grades.find((item) => item.code === e.target.value); setClassNumber(grade?.class_number || 1);setSubjectId(''); setSyllabusYear('');setChapterText(''); setTopicText('');setCurriculumTopicId('');setSyllabusConcept(''); }}>
              {(factoryQuery.data?.grades || []).map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
            </select>
          </label>
          <label className="admin-label">Board
            <select className="admin-select" value={boardCode} onChange={(e) => { setBoardCode(e.target.value);setSubjectId('');setSyllabusYear(''); setChapterText(''); setTopicText('');setCurriculumTopicId('');setSyllabusConcept(''); }}>
              {(factoryQuery.data?.boards || []).map((item) => <option key={item.code} value={item.code}>{item.short_name || item.name}</option>)}
            </select>
          </label>
          <label className="admin-label">Subject
            <select className="admin-select" value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setChapterText(''); setTopicText('');setCurriculumTopicId('');setSyllabusConcept(''); }}>
              <option value="">{factoryQuery.isLoading ? 'Loading subjects…' : subjects.length ? 'Select subject…' : 'No subjects available'}</option>
              {subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="admin-label">Language
            <select className="admin-select" value={language} onChange={(e) => setLanguage(e.target.value as typeof language)}>
              <option>English</option><option>Hindi</option><option>Bilingual</option>
            </select>
          </label>
          {syllabusMode==='SYLLABUS'&&<>
            {syllabusYears.length > 0 && <label className="admin-label">Syllabus year<select className="admin-select" value={syllabusYear} onChange={e=>{setSyllabusYear(e.target.value);setChapterText('');setTopicText('');setCurriculumTopicId('');setSyllabusConcept('');}}>{syllabusYears.map(year=><option key={year}>{year}</option>)}</select></label>}
            <label className="admin-label">Syllabus medium<select className="admin-select" value={curriculumMedium} onChange={e=>{setCurriculumMedium(e.target.value as 'en'|'hi');setSyllabusYear('');setSubjectId('');setChapterText('');setTopicText('');setCurriculumTopicId('');setSyllabusConcept('');}}><option value="en">English syllabus</option><option value="hi">Hindi syllabus</option></select></label>
          </>}
        </div>

        {useSyllabusTopics?<div style={{ display: 'grid',gridTemplateColumns: '1fr 1.4fr',gap: 12,marginTop: 12 }}>
          <label className="admin-label">Chapter / unit from syllabus
            <select className="admin-select" value={chapterText} onChange={e=>{setChapterText(e.target.value);setCurriculumTopicId('');setTopicText('');setSyllabusConcept('');}}><option value="">All chapters</option>{chapterOptions.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select>
          </label>
          <label className="admin-label">Published syllabus topic
            <select className="admin-select" value={selectedCurriculumTopic?curriculumTopicId:''} onChange={e=>{const topic=(factoryQuery.data?.topics||[]).find(item=>item.id===e.target.value);setCurriculumTopicId(e.target.value);setTopicText(topic?.title||'');setSyllabusConcept(topic?.concept_id||'');}}><option value="">Select a syllabus topic…</option>{visibleTopics.map(item=><option key={item.id} value={item.id}>{item.chapter_title||'Chapter'} · {item.title}{item.title_hi?` / ${item.title_hi}`:''}</option>)}</select>
          </label>
        </div>:null}
        {!useSyllabusTopics&&<div style={{ display: 'grid',gridTemplateColumns: '1fr 1.4fr',gap: 12,marginTop: 12 }}>
          <label className="admin-label">Chapter / unit <span className="admin-muted">— type a search phrase</span><input className="admin-input" value={chapterText} onChange={(e) => { setChapterText(e.target.value); setTopicText(''); }} placeholder="e.g. Multiplication, Force and Pressure" /></label>
          <label className="admin-label">Topic / learning need <span className="admin-muted">— free topic search</span><input className="admin-input" value={topicText} onChange={(e) => setTopicText(e.target.value)} placeholder="e.g. Multiplication of 2-digit numbers, solar system, nouns" /></label>
        </div>}

        {!availableCurriculumSubjects.length&&syllabusMode==='SYLLABUS'&&<div className="admin-note" style={{ marginTop: 12,padding: 12 }}>No published syllabus is available for this board and class yet. Choose a subject and search normally; a syllabus year is only needed when selecting a published syllabus topic. <Link className="underline font-semibold" href="/admin/learning/framework">Open Framework Manager</Link> to import and review a syllabus.</div>}
        {availableCurriculumSubjects.length>0&&subjectId&&!curriculumSubject&&syllabusMode==='SYLLABUS'&&<div className="admin-note" style={{ marginTop: 12,padding: 12 }}>This subject has no published syllabus for the selected year and medium. Search it as an off-syllabus topic; an academic reviewer can map it later.</div>}
        {useSyllabusTopics&&selectedCurriculumTopic&&<div className="admin-success-note" style={{ marginTop: 14,padding: 12 }}><strong>Syllabus link selected:</strong> {selectedBoard?.short_name||boardCode} · {gradeCode} · {subject} · {syllabusYear} · {selectedCurriculumTopic.chapter_title||'Chapter'} → {selectedCurriculumTopic.title}. This stable topic ID will be retained through source review and Library draft creation.</div>}
        {syllabusMode==='EXPLORE'&&<div className={readiness?.curriculumReady ? 'admin-success-note' : 'admin-note'} style={{ marginTop: 14,padding: 12 }}><strong>Off-syllabus search:</strong> Class {classNumber} currently has {readiness?.conceptCount || 0} canonical concept(s). Search is allowed; an academic reviewer can map the draft to a published syllabus topic later.</div>}
      </section>

      <section className="admin-panel" style={{ ...panel,marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}><span className="admin-step">2</span>Find learning material</h2>
        <p className="admin-muted">Select sources and content types. Results that VidyaSetu can play or preview appear here; source-only references are clearly marked and cannot be added as playable Learning items.</p>

        <div className="admin-label" style={{ marginBottom: 6 }}>Sources</div>
        <div style={{ display: 'flex',gap: 8,flexWrap: 'wrap',marginBottom: 14 }}>
          {(discovery?.providers || []).filter((item)=>item.code!=='YOUTUBE').map((item) => {
            const checked = item.enabled && providers.includes(item.code);
            return <button key={item.code} type="button" disabled={!item.enabled} title={item.enabled ? item.licencePolicy : item.statusNote || 'Not configured'} onClick={() => toggleProvider(item.code)} style={{ ...secondary,borderColor: checked ? '#FF6B00' : '#CBD5E1',background: checked ? '#FFF4EC' : '#fff',cursor: item.enabled ? 'pointer' : 'not-allowed',opacity: item.enabled ? 1 : .55 }}>
              <span>{checked ? '✓' : item.enabled ? '○' : '🔒'}</span> {providerIcon[item.code]} {item.label}{!item.enabled && item.requiresApiKey ? ' (configure API key)' : ''}
            </button>;
          })}
          {(discovery?.providers || []).filter((item) => item.code!=='YOUTUBE'&&!item.enabled&&item.statusNote).map((item) => <span key={`${item.code}-note`} className="admin-muted" style={{ alignSelf: 'center',fontSize: 12 }}>{item.label}: {item.statusNote}</span>)}
        </div>

        <div className="admin-label" style={{ marginBottom: 6 }}>Content types</div>
        <div style={{ display: 'flex',gap: 8,flexWrap: 'wrap' }}>
          {(discovery?.mediaKinds || []).map((item) => <label key={item.code} style={{ ...secondary,cursor: 'pointer',borderColor: mediaKinds.includes(item.code) ? '#FF6B00' : '#CBD5E1',background: mediaKinds.includes(item.code) ? '#FFF4EC' : '#fff' }}>
            <input type="checkbox" checked={mediaKinds.includes(item.code)} onChange={() => toggleMedia(item.code)} /> {mediaIcon[item.code]} {item.label}
          </label>)}
        </div>

        <div style={{ display: 'grid',gridTemplateColumns: '2fr 1fr',gap: 12,marginTop: 14 }}>
          <div className="admin-note" style={{ padding: 11 }}>
            Search target: <strong>{searchText || 'select a subject or enter a chapter/topic'}</strong> · {factoryQuery.data?.grades.find((item) => item.code === gradeCode)?.name || `Class ${classNumber}`} · {selectedBoard?.short_name || boardCode}
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
          {runs.filter((run)=>run.provider!=='YOUTUBE').map((run) => <div key={`${run.provider}-${run.status}`} className={run.status === 'FAILED' ? 'admin-note' : 'admin-success-note'} style={{ padding: 10 }}><strong>{providerIcon[run.provider]||'🌐'} {run.provider}</strong><div>{run.status === 'FAILED' ? 'Connector failed' : `${run.count} result(s)`}</div>{run.error && <small>{run.error}</small>}</div>)}
        </div>}
      </section>

      <section className="admin-panel" style={{ ...panel,marginBottom: 16 }}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap'}}><h2 style={{ marginTop: 0 }}><span className="admin-step">3</span>Select a useful result</h2>{(candidates.length>0||runs.length>0)&&<button type="button" style={secondary} onClick={clearSearch}>Clear search</button>}</div>
        {!candidates.length && <div className="admin-panel-muted" style={{ padding: 16 }}>No results loaded yet. Search above. Select a playable result to open its review card in Content Library.</div>}
        {candidates.length > 0 && <div className={playableCandidates.length ? 'admin-success-note' : 'admin-note'} style={{ padding: 12, marginBottom: 12 }}>
          <strong>{playableCandidates.length} ready for VidyaSetu review</strong> · {sourceOnlyCandidates.length} source reference{sourceOnlyCandidates.length === 1 ? '' : 's'} do not currently have a supported in-platform player or importable file. Only ready items can enter the Library queue.
        </div>}
        {candidates.length > 0 && <div role="group" aria-label="Filter search results by VidyaSetu playability" style={{ display: 'flex',gap: 8,flexWrap: 'wrap',marginBottom: 14 }}>
          {([
            ['ALL',`All results (${candidates.length})`],
            ['PLAYABLE',`Playable in VidyaSetu (${playableCandidates.length})`],
            ['UNPLAYABLE',`Not playable (${sourceOnlyCandidates.length})`],
          ] as const).map(([value,label]) => <button key={value} type="button" aria-pressed={resultFilter===value} onClick={()=>setResultFilter(value)} style={{ ...secondary,cursor:'pointer',borderColor:resultFilter===value?'#FF6B00':'#CBD5E1',background:resultFilter===value?'#FFF4EC':'#fff' }}>{label}</button>)}
        </div>}
        <div style={{ display: 'grid',gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))',gap: 12 }}>
          {visiblePlayableCandidates.map((candidate) => {
            const stage = staged[candidate.id] || (candidate.intake_id ? { kind: 'OER_INTAKE' as const,intakeId: candidate.intake_id } : undefined);
            const artifactUrl = typeof candidate.metadata?.artifactUrl === 'string' ? candidate.metadata.artifactUrl : null;
            const previewKind = ['VIDEO','AUDIO','IMAGE','PDF'].includes(candidate.media_kind || '') ? candidate.media_kind : null;
            const canPreviewArtifact = candidate.delivery_capability?.code === 'IMPORT' && Boolean(artifactUrl && artifactUrl.startsWith('https://') && previewKind);
            const canDeliverInVidyaSetu = ['LIBRARY','EMBED','IMPORT'].includes(candidate.delivery_capability?.code || '');
            const deliveryLabel = candidate.delivery_capability?.code === 'IMPORT' ? 'IMPORT TO VIDYASETU' : candidate.delivery_capability?.code === 'EMBED' ? 'IN-PLATFORM PLAYER' : candidate.delivery_capability?.code === 'LIBRARY' ? 'ALREADY IN LIBRARY' : 'SOURCE ONLY';
            const previewOpen = previewCandidateId === candidate.id;
            return <article key={candidate.id} style={{ border: '1px solid #DCE3EE',borderRadius: 14,padding: 14,background: '#fff' }}>
              <div style={{ display: 'flex',justifyContent: 'space-between',gap: 8 }}>
                <strong>{mediaIcon[candidate.media_kind || 'LINK']} {candidate.title}</strong>
                <span style={{ color: canDeliverInVidyaSetu ? '#15803D' : '#B45309',fontWeight: 800,fontSize: 11 }}>{deliveryLabel}</span>
              </div>
              <p className="admin-chip">{candidate.delivery_capability?.label || (candidate.reference_only ? 'Reference search only' : 'Delivery requires configuration')}</p>
              {candidate.delivery_capability?.code === 'EMBED' && <LearningAsset title={candidate.title} kind={candidate.media_kind || 'VIDEO'} embedUrl={candidate.embed_url} />}
              {canPreviewArtifact && <div style={{ marginTop: 10 }}>
                <button type="button" style={secondary} aria-expanded={previewOpen} onClick={() => setPreviewCandidateId(previewOpen ? '' : candidate.id)}>
                  {previewOpen ? 'Hide source preview' : `Preview ${previewKind === 'PDF' ? 'PDF' : previewKind?.toLowerCase()} in admin`}
                </button>
                {previewOpen && <div className="admin-panel-muted" style={{ marginTop: 10,padding: 12,borderRadius: 10 }}>
                  <p className="admin-muted" style={{ marginTop: 0 }}>This preview is loaded inside VidyaSetu from the source media URL. It has not yet been copied into VidyaSetu storage, and preview availability does not confirm reuse rights.</p>
                  <LearningAsset title={candidate.title} kind={previewKind!} contentUrl={artifactUrl} mimeType={previewKind === 'PDF' ? 'application/pdf' : undefined} altText={candidate.title} />
                </div>}
              </div>}
              <p className="admin-muted" style={{ minHeight: 38 }}>{candidate.description || candidate.primary_category || candidate.provider}</p>
              <div style={{ fontSize: 13,lineHeight: 1.65 }}>
                <strong>{candidate.provider}</strong>{candidate.publisher_text ? ` · ${candidate.publisher_text}` : ''}{candidate.duration_seconds ? ` · ${durationText(candidate.duration_seconds)}` : ''}<br />
                Type: {candidate.media_kind || 'LINK'} · Class: {candidate.grade_levels?.join(', ') || classNumber}<br />
                Licence metadata: {candidate.licence_candidate || 'review required'} · Adaptation: {candidate.can_adapt ? 'possible after verification' : 'not assumed'}
              </div>
              <div style={{ display: 'flex',gap: 8,flexWrap: 'wrap',marginTop: 12 }}>
                {candidate.source_url && <a href={candidate.source_url} target="_blank" rel="noreferrer" style={secondary}>Open original source / rights ↗</a>}
                {canDeliverInVidyaSetu && !stage && <button type="button" style={button} disabled={stageCandidateMutation.isPending} onClick={() => stageCandidateMutation.mutate(candidate)}>{candidate.resource_id ? 'Select governed source' : 'Select for review'}</button>}
                {stage?.kind === 'OER_INTAKE' && stage.intakeId && <Link href={`/admin/learning?intake=${stage.intakeId}`} style={button}>Review in Content Library</Link>}
                {stage?.kind === 'GOVERNED_RESOURCE' && <Link href={`/admin/learning?resource=${candidate.resource_id}`} style={secondary}>Open in Content Library</Link>}
                {stage?.kind === 'GOVERNED_RESOURCE' && <span className="admin-success-note" style={{ padding: '9px 12px',borderRadius: 9 }}>✓ Already in Library</span>}
                {!canDeliverInVidyaSetu && <span className="admin-note" style={{ padding: '9px 12px',borderRadius: 9,fontSize: 12 }}>This result only points to a source page. VidyaSetu cannot play it yet, so it cannot be selected for the Learning Library.</span>}
              </div>
            </article>;
          })}
        </div>
        {showUnplayableCandidates && <details open={resultFilter==='UNPLAYABLE'} style={{ marginTop: 14 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 800, color: '#475467' }}>{resultFilter==='UNPLAYABLE'?'Not playable in VidyaSetu':'Show not-playable source references'} ({sourceOnlyCandidates.length})</summary>
          <p className="admin-muted" style={{ fontSize: 12 }}>These are search references only. They cannot be published until VidyaSetu has a supported player or an approved media file for them.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 8 }}>
            {sourceOnlyCandidates.map((candidate) => <article key={candidate.id} className="admin-panel-muted" style={{ padding: 12 }}>
              <strong>{candidate.title}</strong><div className="admin-muted" style={{ fontSize: 12, marginTop: 4 }}>{candidate.provider} · {candidate.media_kind || 'Unknown format'} · {candidate.delivery_capability?.label || 'Source only'}</div>
              {candidate.source_url && <a href={candidate.source_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 6, color: '#9A3B00', fontWeight: 800 }}>Inspect source ↗</a>}
            </article>)}
          </div>
        </details>}
      </section>

      <section className="admin-panel" style={{ ...panel,marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}><span className="admin-step">4</span>Review and publish from Content Library</h2>
        <p className="admin-muted">Selecting a result opens its review card in Content Library. Preview it there, confirm rights and in-platform playback, choose Public or Private, then add it as a draft. Publish only after the required review checks pass.</p>
        <Link href="/admin/learning" style={secondary}>Open Content Library</Link>
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
