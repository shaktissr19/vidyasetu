'use client';

import { useEffect, useMemo, useState } from 'react';
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

const inputStyle = {
  width: '100%', marginTop: 5, padding: '10px 11px', borderRadius: 9,
  background: 'rgba(255,255,255,.05)', color: 'white', border: '1px solid rgba(255,255,255,.12)',
} as const;
const labelStyle = { display: 'block', color: 'rgba(255,255,255,.68)', fontSize: 12, fontWeight: 800 } as const;
const panelStyle = { padding: 18, borderRadius: 14, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.035)' } as const;

const providerIcon: Record<CreatorDiscoveryProvider,string> = {
  LOCAL: '📚', DIKSHA: '🇮🇳', NROER: '🏛️', CBSE: '🎓', NCERT_EPATHSHALA: '📖',
  NIOS: '🏫', SWAYAM: '🎬', PHET: '🔬', OER_COMMONS: '🌍',
};
const mediaIcon: Record<CreatorDiscoveryMediaKind,string> = {
  ARTICLE: '📖', VIDEO: '▶️', AUDIO: '🎧', INTERACTIVE: '🔬', PDF: '📄', COURSE: '🎓', LINK: '🔗',
};

function listText(value?: string[]): string { return value?.length ? value.join(', ') : '—'; }
function dateText(value?: string | null): string { return value ? new Date(value).toLocaleString('en-IN') : '—'; }
function durationText(seconds?: number | null): string {
  if (!seconds) return '—';
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;
  return `${minutes}:${String(remain).padStart(2,'0')}`;
}

export default function AdminContentSourceDiscoveryPage() {
  const queryClient = useQueryClient();
  const [selectedProviders, setSelectedProviders] = useState<CreatorDiscoveryProvider[]>(['LOCAL','DIKSHA']);
  const [initializedProviders, setInitializedProviders] = useState(false);
  const [queryText, setQueryText] = useState('');
  const [classNumber, setClassNumber] = useState<number>(8);
  const [subject, setSubject] = useState('');
  const [language, setLanguage] = useState('');
  const [publisher, setPublisher] = useState('');
  const [mediaKinds, setMediaKinds] = useState<CreatorDiscoveryMediaKind[]>([]);
  const [maxDurationMinutes, setMaxDurationMinutes] = useState<number | ''>('');
  const [onlyCommercialSafe, setOnlyCommercialSafe] = useState(false);
  const [candidates, setCandidates] = useState<CreatorDiscoveryCandidate[]>([]);
  const [runIds, setRunIds] = useState<string[]>([]);

  const [manualProvider, setManualProvider] = useState<Exclude<CreatorDiscoveryProvider,'LOCAL'>>('NROER');
  const [manualTitle, setManualTitle] = useState('');
  const [manualUrl, setManualUrl] = useState('');
  const [manualLicence, setManualLicence] = useState('OTHER');
  const [manualAttribution, setManualAttribution] = useState('');

  const optionsQuery = useQuery({ queryKey: ['content-creator-options'], queryFn: () => getContentCreatorOptions().then((r) => r.data.data) });
  const runsQuery = useQuery({ queryKey: ['content-creator-discovery-runs'], queryFn: () => getContentCreatorDiscoveryRuns().then((r) => r.data.data || []) });
  const capabilities = optionsQuery.data?.discovery?.providers || [];
  const mediaOptions = optionsQuery.data?.discovery?.mediaKinds || [];

  useEffect(() => {
    if (initializedProviders || !capabilities.length) return;
    const enabled = capabilities.filter((item) => item.enabled).map((item) => item.code);
    if (enabled.length) setSelectedProviders(enabled);
    setInitializedProviders(true);
  }, [capabilities,initializedProviders]);

  const enabledProviders = useMemo(() => capabilities.filter((item) => item.enabled),[capabilities]);
  const externalProviders = enabledProviders.filter((item) => item.code !== 'LOCAL');
  const selectedSupportsVideo = capabilities.some((item) => selectedProviders.includes(item.code) && item.supportsMediaKinds.includes('VIDEO'));

  const discoverMutation = useMutation({
    mutationFn: () => discoverContentCreatorSources({
      providers: selectedProviders,
      query: queryText.trim(),
      classNumber: classNumber || null,
      subject: subject.trim() || null,
      language: language.trim() || null,
      publisher: publisher.trim() || null,
      mediaKinds: mediaKinds.length ? mediaKinds : undefined,
      maxDurationMinutes: typeof maxDurationMinutes === 'number' ? maxDurationMinutes : null,
      onlyCommercialSafe,
      limit: 20,
    }),
    onSuccess: async (response) => {
      const data = response.data.data;
      setCandidates(data.candidates || []);
      setRunIds(data.runIds || []);
      const failed = data.runs?.filter((item) => item.status === 'FAILED') || [];
      if (failed.length) toast.error(`Found ${data.count} candidate(s); ${failed.map((item) => item.provider).join(', ')} unavailable`);
      else toast.success(`Found ${data.count} candidate(s) across ${data.providers.length} source(s)`);
      await queryClient.invalidateQueries({ queryKey: ['content-creator-discovery-runs'] });
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Source discovery failed')),
  });

  const stageMutation = useMutation({
    mutationFn: (candidateId: string) => stageContentCreatorDiscoveryCandidate(candidateId),
    onSuccess: async (response, candidateId) => {
      const result = response.data.data;
      setCandidates((current) => current.map((item) => item.id === candidateId
        ? { ...item, intake_id: result.intakeId || item.intake_id, staged_at: new Date().toISOString() }
        : item));
      toast.success(result.kind === 'GOVERNED_RESOURCE'
        ? 'VidyaSetu source is ready to use in the Creator'
        : 'External candidate staged to OER licence/attribution review');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['content-creator-discovery-runs'] }),
        queryClient.invalidateQueries({ queryKey: ['content-creator-options'] }),
        queryClient.invalidateQueries({ queryKey: ['learning-studio-intake'] }),
      ]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not stage source candidate')),
  });

  const selectedItemMutation = useMutation({
    mutationFn: () => stageSelectedExternalContentCreatorItem({
      provider: manualProvider,
      title: manualTitle.trim(),
      sourceUrl: manualUrl.trim(),
      licenceCandidate: manualLicence || null,
      attributionText: manualAttribution.trim() || null,
      classHint: classNumber ? `Class ${classNumber}` : null,
      subjectHint: subject.trim() || null,
    }),
    onSuccess: async () => {
      toast.success('Selected source item staged to OER Intake');
      setManualTitle(''); setManualUrl(''); setManualAttribution(''); setManualLicence('OTHER');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['content-creator-options'] }),
        queryClient.invalidateQueries({ queryKey: ['learning-studio-intake'] }),
      ]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not stage selected source item')),
  });

  function toggleProvider(code: CreatorDiscoveryProvider) {
    setSelectedProviders((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current,code]);
  }
  function toggleMedia(code: CreatorDiscoveryMediaKind) {
    setMediaKinds((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current,code]);
  }
  function useReferenceCandidate(candidate: CreatorDiscoveryCandidate) {
    if (candidate.provider === 'LOCAL') return;
    setManualProvider(candidate.provider as Exclude<CreatorDiscoveryProvider,'LOCAL'>);
    setManualTitle(candidate.title.replace(/^[^:]+:\s*/,''));
    setManualUrl('');
    const capability = capabilities.find((item) => item.code === candidate.provider);
    setManualLicence(capability?.commercialPolicy === 'LINK_ONLY' ? 'EXTERNAL_LINK_ONLY' : 'OTHER');
    document.getElementById('selected-source-item')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <div style={{ padding: 24, color: 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: '#8bd7ff', fontSize: 12, fontWeight: 900, letterSpacing: '.12em' }}>CONTENT FACTORY · GOVERNED RESEARCH</div>
          <h1 style={{ margin: '5px 0', fontSize: 34 }}>Source Discovery & Video Learning</h1>
          <p style={{ maxWidth: 980, color: 'rgba(255,255,255,.62)', lineHeight: 1.65 }}>
            Search multiple approved sources in one place. VidyaSetu uses live structured connectors where reliable APIs exist and official reference-search connectors otherwise. Filter for Watch, Listen, Explore, PDFs and courses without weakening licence governance.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/admin/learning/creator" className="btn-primary">AI Content Creator</Link>
          <Link href="/admin/learning/intake" className="btn-secondary">OER Intake</Link>
          <Link href="/admin/learning" className="btn-secondary">Learning Studio</Link>
        </div>
      </div>

      <div style={{ margin: '16px 0', padding: 12, borderRadius: 11, border: '1px solid rgba(255,190,70,.28)', background: 'rgba(255,190,70,.06)', color: '#ffe1a8', fontSize: 12 }}>
        {optionsQuery.data?.discovery?.policy || 'External items require licence and attribution review before grounding/adaptation.'}
      </div>

      <section style={{ ...panelStyle, marginBottom: 18 }}>
        <h2 style={{ marginTop: 0 }}>1. Select working sources</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 9 }}>
          {capabilities.map((item) => {
            const selected = selectedProviders.includes(item.code);
            const live = item.connectorMode !== 'REFERENCE_SEARCH';
            return <button key={item.code} type="button" disabled={!item.enabled} onClick={() => toggleProvider(item.code)} style={{ padding: 12, borderRadius: 11, textAlign: 'left', color: item.enabled ? 'white' : 'rgba(255,255,255,.35)', border: selected ? '1px solid #4FC3F7' : '1px solid rgba(255,255,255,.1)', background: selected ? 'rgba(79,195,247,.1)' : 'rgba(255,255,255,.025)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}><strong>{providerIcon[item.code]} {item.label}</strong><span style={{ fontSize: 9, color: live ? '#bdeed0' : '#ffd39b' }}>{item.enabled ? (live ? 'LIVE' : 'OFFICIAL SEARCH') : 'DISABLED'}</span></div>
              <div style={{ fontSize: 10, marginTop: 5, color: 'rgba(255,255,255,.5)' }}>{item.statusNote || item.connectorMode}</div>
              <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>{item.supportsMediaKinds.slice(0,5).map((kind) => <span key={kind} style={{ fontSize: 9, padding: '2px 5px', borderRadius: 5, background: 'rgba(255,255,255,.06)' }}>{mediaIcon[kind]} {kind}</span>)}</div>
            </button>;
          })}
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px,.75fr) minmax(0,1.25fr)', gap: 18, alignItems: 'start' }}>
        <section style={panelStyle}>
          <h2 style={{ marginTop: 0 }}>2. Search & filter</h2>
          <label style={labelStyle}>Topic / chapter / concept<input style={inputStyle} value={queryText} onChange={(e) => setQueryText(e.target.value)} placeholder="Force and pressure, fractions, photosynthesis…" /></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginTop: 9 }}>
            <label style={labelStyle}>Class<select style={inputStyle} value={classNumber} onChange={(e) => setClassNumber(Number(e.target.value))}>{Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Class {n}</option>)}</select></label>
            <label style={labelStyle}>Subject<input style={inputStyle} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Science" /></label>
            <label style={labelStyle}>Language / medium<input style={inputStyle} value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="English / Hindi" /></label>
            <label style={labelStyle}>Publisher / channel<input style={inputStyle} value={publisher} onChange={(e) => setPublisher(e.target.value)} placeholder="NCERT / CBSE / NIOS" /></label>
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={labelStyle}>Learning media</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {mediaOptions.map((item) => <button key={item.code} type="button" onClick={() => toggleMedia(item.code)} style={{ padding: '7px 9px', borderRadius: 8, color: 'white', border: mediaKinds.includes(item.code) ? '1px solid #4FC3F7' : '1px solid rgba(255,255,255,.1)', background: mediaKinds.includes(item.code) ? 'rgba(79,195,247,.12)' : 'rgba(255,255,255,.025)', fontSize: 11 }}>{mediaIcon[item.code]} {item.label}</button>)}
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={labelStyle}>Quick publisher presets</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {(optionsQuery.data?.discovery?.publisherPresets || []).map((item) => <button key={item} type="button" onClick={() => setPublisher(publisher === item ? '' : item)} style={{ padding: '6px 8px', borderRadius: 8, color: 'white', border: publisher === item ? '1px solid #7fd4a5' : '1px solid rgba(255,255,255,.1)', background: publisher === item ? 'rgba(127,212,165,.1)' : 'rgba(255,255,255,.025)', fontSize: 10 }}>{item}</button>)}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginTop: 10 }}>
            <label style={labelStyle}>Video max duration (minutes)<input type="number" min={1} max={240} disabled={!selectedSupportsVideo} style={inputStyle} value={maxDurationMinutes} onChange={(e) => setMaxDurationMinutes(e.target.value ? Number(e.target.value) : '')} placeholder="e.g. 10 for micro lessons" /></label>
            <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8, paddingTop: 23 }}><input type="checkbox" checked={onlyCommercialSafe} onChange={(e) => setOnlyCommercialSafe(e.target.checked)} />Commercial/subscriber-safe only</label>
          </div>

          <button className="btn-primary" type="button" disabled={discoverMutation.isPending || queryText.trim().length < 2 || !selectedProviders.length} onClick={() => discoverMutation.mutate()} style={{ width: '100%', marginTop: 13 }}>{discoverMutation.isPending ? 'Searching sources…' : `Search ${selectedProviders.length} selected source${selectedProviders.length === 1 ? '' : 's'}`}</button>
          {runIds.length > 0 && <div style={{ marginTop: 7, fontSize: 10, color: 'rgba(255,255,255,.45)' }}>Audit runs: {runIds.join(', ')}</div>}

          <h3 style={{ marginTop: 20 }}>Recent discovery runs</h3>
          <div style={{ maxHeight: 280, overflowY: 'auto', display: 'grid', gap: 6 }}>
            {(runsQuery.data || []).map((run) => <div key={run.id} style={{ padding: 8, borderRadius: 8, border: '1px solid rgba(255,255,255,.08)', background: 'rgba(0,0,0,.08)' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong style={{ fontSize: 11 }}>{run.query_text}</strong><span style={{ fontSize: 10, color: run.status === 'COMPLETED' ? '#bdeed0' : '#ffd39b' }}>{run.status}</span></div><div style={{ marginTop: 3, fontSize: 10, color: 'rgba(255,255,255,.45)' }}>{run.provider} · {run.result_count} result(s) · {dateText(run.created_at)}</div></div>)}
          </div>
        </section>

        <section style={panelStyle}>
          <h2 style={{ marginTop: 0 }}>3. Discovery candidates</h2>
          {!candidates.length && <div style={{ color: 'rgba(255,255,255,.48)', padding: '30px 4px' }}>Search your selected sources. Live connectors return individual content; official-reference connectors take you to the trusted source and let you stage the exact item you select.</div>}
          <div style={{ display: 'grid', gap: 10 }}>
            {candidates.map((candidate) => <CandidateCard key={candidate.id} candidate={candidate} staging={stageMutation.isPending} onStage={() => stageMutation.mutate(candidate.id)} onSelectReference={() => useReferenceCandidate(candidate)} />)}
          </div>
        </section>
      </div>

      <section id="selected-source-item" style={{ ...panelStyle, marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>4. Stage a specific item selected from an official source</h2>
        <p style={{ color: 'rgba(255,255,255,.58)', fontSize: 12, lineHeight: 1.6, maxWidth: 980 }}>
          NROER, CBSE, NCERT/ePathshala, NIOS, SWAYAM, PhET and OER Commons do not all expose the same stable public structured API. Open the official search result above, choose the exact video/resource, paste its official URL here, and VidyaSetu will send it through the same OER licence and attribution review before the Creator can use it.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
          <label style={labelStyle}>Source<select style={inputStyle} value={manualProvider} onChange={(e) => { const next = e.target.value as Exclude<CreatorDiscoveryProvider,'LOCAL'>; setManualProvider(next); const cap = capabilities.find((item) => item.code === next); setManualLicence(cap?.commercialPolicy === 'LINK_ONLY' ? 'EXTERNAL_LINK_ONLY' : 'OTHER'); }}>{externalProviders.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
          <label style={labelStyle}>Selected item title<input style={inputStyle} value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} placeholder="Exact video/resource title" /></label>
          <label style={labelStyle}>Official item URL<input style={inputStyle} value={manualUrl} onChange={(e) => setManualUrl(e.target.value)} placeholder="https://official-source/..." /></label>
          <label style={labelStyle}>Licence evidence<select style={inputStyle} value={manualLicence} onChange={(e) => setManualLicence(e.target.value)}><option value="OTHER">Needs item-level verification</option><option value="EXTERNAL_LINK_ONLY">External link only</option><option value="CC_BY">CC BY</option><option value="CC_BY_SA">CC BY-SA</option><option value="CC_BY_NC">CC BY-NC</option><option value="CC_BY_NC_SA">CC BY-NC-SA</option><option value="CC_BY_NC_ND">CC BY-NC-ND</option><option value="PUBLIC_DOMAIN">Public domain</option></select></label>
        </div>
        <label style={{ ...labelStyle, marginTop: 10 }}>Attribution / author / publisher evidence<input style={inputStyle} value={manualAttribution} onChange={(e) => setManualAttribution(e.target.value)} placeholder="Author · Publisher · licence/source attribution" /></label>
        <button className="btn-primary" type="button" disabled={selectedItemMutation.isPending || manualTitle.trim().length < 2 || !manualUrl.startsWith('https://')} onClick={() => selectedItemMutation.mutate()} style={{ marginTop: 12 }}>{selectedItemMutation.isPending ? 'Staging…' : 'Stage selected item to OER Intake'}</button>
      </section>
    </div>
  );
}

function CandidateCard({ candidate, staging, onStage, onSelectReference }: { candidate: CreatorDiscoveryCandidate; staging: boolean; onStage: () => void; onSelectReference: () => void }) {
  const local = candidate.provider === 'LOCAL';
  const referenceOnly = Boolean(candidate.reference_only);
  const staged = Boolean(candidate.staged_at || candidate.intake_id || candidate.resource_id && local);
  const mediaKind = candidate.media_kind || 'LINK';
  return (
    <article style={{ padding: 13, borderRadius: 11, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.025)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          {candidate.thumbnail_url && <img src={candidate.thumbnail_url} alt="" style={{ width: 86, height: 54, objectFit: 'cover', borderRadius: 7, background: 'rgba(255,255,255,.04)' }} />}
          <div><strong>{candidate.title}</strong><div style={{ marginTop: 4, fontSize: 10, color: 'rgba(255,255,255,.5)' }}>{providerIcon[candidate.provider]} {candidate.provider} · {mediaIcon[mediaKind]} {mediaKind} {candidate.duration_seconds ? `· ${durationText(candidate.duration_seconds)}` : ''}</div></div>
        </div>
        <span style={{ fontSize: 10, color: referenceOnly ? '#8bd7ff' : candidate.licence_verified ? '#bdeed0' : '#ffd39b' }}>{referenceOnly ? 'Official search' : candidate.licence_verified ? '✓ Governed' : 'Review required'}</span>
      </div>
      {candidate.description && <p style={{ margin: '8px 0', fontSize: 11, lineHeight: 1.55, color: 'rgba(255,255,255,.62)' }}>{candidate.description}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 5, fontSize: 10, color: 'rgba(255,255,255,.52)' }}>
        <div>Class: {listText(candidate.grade_levels)}</div><div>Subject: {listText(candidate.subjects)}</div>
        <div>Language: {listText(candidate.languages)}</div><div>Licence: {candidate.licence_candidate || candidate.licence_raw || 'Unverified'}</div>
        <div>Adaptation: {candidate.can_adapt ? 'candidate allows' : 'not established'}</div><div>Commercial: {candidate.can_use_commercially ? 'candidate allows' : 'not established'}</div>
      </div>
      {(candidate.author_text || candidate.publisher_text || candidate.attribution_text) && <div style={{ marginTop: 7, padding: 7, borderRadius: 7, background: 'rgba(0,0,0,.1)', fontSize: 10, color: 'rgba(255,255,255,.56)' }}>Evidence: {[candidate.author_text,candidate.publisher_text,candidate.attribution_text].filter(Boolean).join(' · ')}</div>}
      <div style={{ display: 'flex', gap: 7, marginTop: 9, flexWrap: 'wrap' }}>
        {candidate.source_url && <a className="btn-secondary" href={candidate.source_url} target="_blank" rel="noopener noreferrer">{referenceOnly ? 'Open official search ↗' : 'Open source ↗'}</a>}
        {referenceOnly
          ? <button className="btn-primary" type="button" onClick={onSelectReference}>I selected an item →</button>
          : <button className="btn-primary" type="button" disabled={staging || (Boolean(candidate.staged_at) && !local)} onClick={onStage}>{local ? 'Use governed source' : candidate.intake_id ? 'Already in OER Intake' : 'Stage for OER review'}</button>}
        {candidate.intake_id && <Link href="/admin/learning/intake" className="btn-secondary">Review licence & attribution →</Link>}
        {local && staged && <Link href="/admin/learning/creator" className="btn-secondary">Open Creator →</Link>}
      </div>
      {!local && !referenceOnly && <div style={{ marginTop: 8, fontSize: 10, color: '#ffd39b' }}>External metadata is a discovery hint only. Admin must verify item-level licence and attribution before grounding.</div>}
      {referenceOnly && <div style={{ marginTop: 8, fontSize: 10, color: '#8bd7ff' }}>Reference-search connector: choose the exact item on the official site, then stage that item URL below. The search page itself is never treated as reusable learning content.</div>}
    </article>
  );
}
