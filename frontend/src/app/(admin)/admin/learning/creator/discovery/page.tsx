'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  discoverContentCreatorSources,
  getContentCreatorDiscoveryRuns,
  getContentCreatorOptions,
  stageContentCreatorDiscoveryCandidate,
  stageSelectedExternalContentCreatorItem,
  type CreatorDiscoveryCandidate,
  type CreatorDiscoveryMediaKind,
  type CreatorDiscoveryProvider,
} from '@/services/contentCreatorService';
import { apiErrorText } from '@/utils/errors';

const secondaryButton = {
  padding: '8px 12px', borderRadius: 9, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#14213D',
  cursor: 'pointer', fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6,
} as const;
const providerIcon: Record<CreatorDiscoveryProvider,string> = {
  LOCAL: '📚', DIKSHA: '🇮🇳', NROER: '🏛️', CBSE: '🎓', NCERT_EPATHSHALA: '📖',
  NIOS: '🏫', SWAYAM: '🎬', PHET: '🔬', OER_COMMONS: '🌍',
};
const mediaIcon: Record<CreatorDiscoveryMediaKind,string> = {
  ARTICLE: '📖', VIDEO: '▶️', AUDIO: '🎧', INTERACTIVE: '🔬', PDF: '📄', COURSE: '🎓', LINK: '🔗',
};
function durationText(seconds?: number | null): string {
  if (!seconds) return '';
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;
  return `${minutes}:${String(remain).padStart(2,'0')}`;
}
function dateText(value?: string | null): string { return value ? new Date(value).toLocaleString('en-IN') : '—'; }

export default function AdminSourceLibraryPage() {
  const queryClient = useQueryClient();
  const [classNumber, setClassNumber] = useState(5);
  const [subjectCode, setSubjectCode] = useState('');
  const [chapter, setChapter] = useState('');
  const [topic, setTopic] = useState('');
  const [language, setLanguage] = useState('');
  const [publisher, setPublisher] = useState('');
  const [selectedProviders, setSelectedProviders] = useState<CreatorDiscoveryProvider[]>(['LOCAL','DIKSHA']);
  const [mediaKinds, setMediaKinds] = useState<CreatorDiscoveryMediaKind[]>([]);
  const [maxDurationMinutes, setMaxDurationMinutes] = useState<number | ''>('');
  const [candidates, setCandidates] = useState<CreatorDiscoveryCandidate[]>([]);
  const [manualProvider, setManualProvider] = useState<Exclude<CreatorDiscoveryProvider,'LOCAL'>>('NROER');
  const [manualTitle, setManualTitle] = useState('');
  const [manualUrl, setManualUrl] = useState('');

  const optionsQuery = useQuery({ queryKey: ['content-creator-options'], queryFn: () => getContentCreatorOptions().then((r) => r.data.data) });
  const runsQuery = useQuery({ queryKey: ['content-creator-discovery-runs'], queryFn: () => getContentCreatorDiscoveryRuns().then((r) => r.data.data || []) });
  const discovery = optionsQuery.data?.discovery;
  const classConcepts = useMemo(() => (optionsQuery.data?.concepts || []).filter((item) => item.class_number === classNumber), [optionsQuery.data, classNumber]);
  const subjects = useMemo(() => {
    const map = new Map<string,string>();
    classConcepts.forEach((item) => map.set(item.subject_code, item.subject_name || item.subject_code));
    return [...map.entries()].map(([code,name]) => ({ code,name })).sort((a,b) => a.name.localeCompare(b.name));
  }, [classConcepts]);
  const chapters = useMemo(() => [...new Set(classConcepts.filter((item) => !subjectCode || item.subject_code === subjectCode).map((item) => item.chapter_title).filter((item): item is string => Boolean(item)))].sort(), [classConcepts, subjectCode]);
  const subjectName = subjects.find((item) => item.code === subjectCode)?.name || '';
  const effectiveQuery = (topic.trim() || chapter || subjectName).trim();
  const liveProviders = discovery?.providers.filter((item) => item.enabled && item.connectorMode !== 'REFERENCE_SEARCH') || [];
  const officialProviders = discovery?.providers.filter((item) => item.enabled && item.connectorMode === 'REFERENCE_SEARCH') || [];

  const discoverMutation = useMutation({
    mutationFn: () => discoverContentCreatorSources({
      providers: selectedProviders,
      query: effectiveQuery,
      classNumber,
      subject: subjectName || null,
      language: language || null,
      publisher: publisher || null,
      mediaKinds: mediaKinds.length ? mediaKinds : undefined,
      maxDurationMinutes: typeof maxDurationMinutes === 'number' ? maxDurationMinutes : null,
      limit: 30,
    }),
    onSuccess: (response) => {
      setCandidates(response.data.data.candidates || []);
      const failed = response.data.data.runs.filter((item) => item.status === 'FAILED');
      if (failed.length) toast.error(`Search finished, but ${failed.map((item) => item.provider).join(', ')} was unavailable.`);
      else toast.success(`Found ${response.data.data.count} result(s).`);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Source search failed')),
  });

  const stageMutation = useMutation({
    mutationFn: (candidate: CreatorDiscoveryCandidate) => stageContentCreatorDiscoveryCandidate(candidate.id),
    onSuccess: async (response) => {
      toast.success(response.data.data.kind === 'GOVERNED_RESOURCE' ? 'Source is already governed and ready for Creator use.' : 'Source sent to licence review.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['content-creator-options'] }),
        queryClient.invalidateQueries({ queryKey: ['learning-studio-intake'] }),
      ]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not stage source')),
  });

  const manualMutation = useMutation({
    mutationFn: () => stageSelectedExternalContentCreatorItem({
      provider: manualProvider,
      title: manualTitle.trim(),
      sourceUrl: manualUrl.trim(),
      classHint: `Class ${classNumber}`,
      subjectHint: subjectName || null,
    }),
    onSuccess: async () => {
      toast.success('Specific official item sent to Source & Licence Review.');
      setManualTitle(''); setManualUrl('');
      await queryClient.invalidateQueries({ queryKey: ['content-creator-options'] });
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not add official source item')),
  });

  function toggleProvider(code: CreatorDiscoveryProvider) {
    setSelectedProviders((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current,code]);
  }
  function toggleMedia(code: CreatorDiscoveryMediaKind) {
    setMediaKinds((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current,code]);
  }

  return (
    <div className="admin-page" style={{ padding: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <div style={{ color: '#FF6B00', fontSize: 12, fontWeight: 900, letterSpacing: '.12em' }}>LEARNING SOURCES</div>
          <h1 style={{ margin: '5px 0', fontSize: 34 }}>Source Library</h1>
          <p className="admin-muted" style={{ maxWidth: 850, lineHeight: 1.65 }}>Search VidyaSetu and DIKSHA directly, or open trusted official libraries when they do not expose a stable structured search API.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Link href="/admin/learning/creator" className="btn-primary">Create Content</Link><Link href="/admin/learning/intake" style={secondaryButton}>Source & Licence Review</Link></div>
      </div>

      <section className="admin-panel" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}><span className="admin-step">1</span>Choose class, subject and topic</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(160px,1fr))', gap: 12 }}>
          <label className="admin-label">Class<select className="admin-select" value={classNumber} onChange={(e) => { setClassNumber(Number(e.target.value)); setSubjectCode(''); setChapter(''); }}>{Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Class {n}</option>)}</select></label>
          <label className="admin-label">Subject<select className="admin-select" value={subjectCode} onChange={(e) => { setSubjectCode(e.target.value); setChapter(''); }}><option value="">Select subject…</option>{subjects.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
          <label className="admin-label">Chapter<select className="admin-select" value={chapter} onChange={(e) => setChapter(e.target.value)}><option value="">Any chapter</option>{chapters.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="admin-label">Language<select className="admin-select" value={language} onChange={(e) => setLanguage(e.target.value)}><option value="">Any language</option><option value="English">English</option><option value="Hindi">Hindi</option></select></label>
        </div>
        <label className="admin-label" style={{ marginTop: 12 }}>Topic / chapter / concept<input className="admin-input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Nouns, comprehension, photosynthesis, force and pressure" /></label>
      </section>

      <section className="admin-panel" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}><span className="admin-step">2</span>Select where to search</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div><div className="admin-label" style={{ marginBottom: 8 }}>Direct search</div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{liveProviders.map((item) => <button key={item.code} type="button" className={`admin-chip ${selectedProviders.includes(item.code) ? 'active' : ''}`} onClick={() => toggleProvider(item.code)}>{providerIcon[item.code]} {item.label}</button>)}</div></div>
          <div><div className="admin-label" style={{ marginBottom: 8 }}>Official libraries</div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{officialProviders.map((item) => <button key={item.code} type="button" className={`admin-chip ${selectedProviders.includes(item.code) ? 'active' : ''}`} onClick={() => toggleProvider(item.code)}>{providerIcon[item.code]} {item.label}</button>)}</div></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 12, marginTop: 14 }}><div><div className="admin-label" style={{ marginBottom: 7 }}>Content type</div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{(discovery?.mediaKinds || []).map((item) => <button key={item.code} type="button" className={`admin-chip ${mediaKinds.includes(item.code) ? 'active' : ''}`} onClick={() => toggleMedia(item.code)}>{mediaIcon[item.code]} {item.label}</button>)}</div></div><label className="admin-label">Publisher<select className="admin-select" value={publisher} onChange={(e) => setPublisher(e.target.value)}><option value="">Any publisher</option>{(discovery?.publisherPresets || []).map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div>
        <label className="admin-label" style={{ marginTop: 12, maxWidth: 250 }}>Max video duration (minutes)<input className="admin-input" type="number" min={1} max={240} value={maxDurationMinutes} onChange={(e) => setMaxDurationMinutes(e.target.value ? Number(e.target.value) : '')} placeholder="Optional" /></label>
        <button className="btn-primary" type="button" disabled={discoverMutation.isPending || effectiveQuery.length < 2 || !selectedProviders.length} onClick={() => discoverMutation.mutate()} style={{ marginTop: 14, minWidth: 220 }}>{discoverMutation.isPending ? 'Searching…' : 'Search Learning Content'}</button>
        {effectiveQuery.length < 2 && <span style={{ marginLeft: 10, color: '#B54708', fontSize: 12 }}>Choose a subject/chapter or type a topic first.</span>}
      </section>

      <section className="admin-panel" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}><span className="admin-step">3</span>Results</h2>
        {!candidates.length && <div className="admin-panel-muted" style={{ padding: 20, color: '#667085' }}>No results yet. Search above. Direct connectors return individual resources; official-library results open the trusted source so you can choose the exact item.</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>{candidates.map((candidate) => {
          const kind = candidate.media_kind || 'LINK';
          const reference = Boolean(candidate.reference_only);
          return <article key={candidate.id} className="admin-source-card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><strong>{candidate.title}</strong><span style={{ color: '#667085', fontSize: 11 }}>{providerIcon[candidate.provider]} {candidate.provider}</span></div>
            <div style={{ marginTop: 5, color: '#667085', fontSize: 12 }}>{mediaIcon[kind]} {kind}{candidate.duration_seconds ? ` · ${durationText(candidate.duration_seconds)}` : ''}{candidate.grade_levels?.length ? ` · ${candidate.grade_levels.join(', ')}` : ''}</div>
            {candidate.description && <p style={{ marginTop: 8, color: '#475467', lineHeight: 1.5, fontSize: 12 }}>{candidate.description.slice(0,240)}</p>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {candidate.source_url && <a href={candidate.source_url} target="_blank" rel="noopener noreferrer" style={secondaryButton}>{reference ? 'Open official search ↗' : 'Preview ↗'}</a>}
              {!reference && <button type="button" className="btn-primary" disabled={stageMutation.isPending} onClick={() => stageMutation.mutate(candidate)}>{candidate.provider === 'LOCAL' ? 'Use in Creator' : 'Send to licence review'}</button>}
              {reference && <button type="button" style={secondaryButton} onClick={() => { setManualProvider(candidate.provider as Exclude<CreatorDiscoveryProvider,'LOCAL'>); setManualTitle(candidate.title.replace(/^[^:]+:\s*/,'')); }}>I selected an item</button>}
            </div>
          </article>;
        })}</div>
      </section>

      <section className="admin-panel" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Selected an exact item from an official library?</h2>
        <p className="admin-muted">Paste the exact official resource/video URL. VidyaSetu verifies that it belongs to the selected official domain and sends it to Source & Licence Review.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 1.2fr', gap: 10 }}><label className="admin-label">Source<select className="admin-select" value={manualProvider} onChange={(e) => setManualProvider(e.target.value as Exclude<CreatorDiscoveryProvider,'LOCAL'>)}>{officialProviders.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label><label className="admin-label">Exact title<input className="admin-input" value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} /></label><label className="admin-label">Official URL<input className="admin-input" value={manualUrl} onChange={(e) => setManualUrl(e.target.value)} placeholder="https://official-source/..." /></label></div>
        <button className="btn-primary" type="button" disabled={manualMutation.isPending || manualTitle.trim().length < 2 || !manualUrl.startsWith('https://')} onClick={() => manualMutation.mutate()} style={{ marginTop: 10 }}>Send to Source Review</button>
      </section>

      <details className="admin-panel" style={{ padding: 18 }}><summary style={{ cursor: 'pointer', fontWeight: 900 }}>Advanced: recent source-search audit</summary><div style={{ display: 'grid', gap: 7, marginTop: 12 }}>{(runsQuery.data || []).slice(0,20).map((run) => <div key={run.id} className="admin-panel-muted" style={{ padding: 9 }}><strong style={{ fontSize: 12 }}>{run.query_text}</strong><div style={{ color: '#667085', fontSize: 11, marginTop: 3 }}>{run.provider} · {run.result_count} result(s) · {run.status} · {dateText(run.created_at)}</div></div>)}</div></details>
    </div>
  );
}
