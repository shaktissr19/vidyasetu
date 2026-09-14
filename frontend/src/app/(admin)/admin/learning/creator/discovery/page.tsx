'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  discoverContentCreatorSources,
  getContentCreatorDiscoveryRuns,
  getContentCreatorOptions,
  stageContentCreatorDiscoveryCandidate,
  type CreatorDiscoveryCandidate,
  type CreatorDiscoveryProvider,
} from '@/services/contentCreatorService';
import { apiErrorText } from '@/utils/errors';

const inputStyle = {
  width: '100%', marginTop: 5, padding: '10px 11px', borderRadius: 9,
  background: 'rgba(255,255,255,.05)', color: 'white', border: '1px solid rgba(255,255,255,.12)',
} as const;
const labelStyle = { display: 'block', color: 'rgba(255,255,255,.68)', fontSize: 12, fontWeight: 800 } as const;
const panelStyle = { padding: 18, borderRadius: 14, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.035)' } as const;

function listText(value?: string[]): string { return value?.length ? value.join(', ') : '—'; }
function dateText(value?: string | null): string { return value ? new Date(value).toLocaleString('en-IN') : '—'; }

export default function AdminContentSourceDiscoveryPage() {
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState<CreatorDiscoveryProvider>('LOCAL');
  const [queryText, setQueryText] = useState('');
  const [classNumber, setClassNumber] = useState<number>(8);
  const [subject, setSubject] = useState('');
  const [language, setLanguage] = useState('');
  const [candidates, setCandidates] = useState<CreatorDiscoveryCandidate[]>([]);
  const [runId, setRunId] = useState('');

  const optionsQuery = useQuery({ queryKey: ['content-creator-options'], queryFn: () => getContentCreatorOptions().then((r) => r.data.data) });
  const runsQuery = useQuery({ queryKey: ['content-creator-discovery-runs'], queryFn: () => getContentCreatorDiscoveryRuns().then((r) => r.data.data || []) });

  const discoverMutation = useMutation({
    mutationFn: () => discoverContentCreatorSources({
      provider,
      query: queryText.trim(),
      classNumber: classNumber || null,
      subject: subject.trim() || null,
      language: language.trim() || null,
      limit: 20,
    }),
    onSuccess: async (response) => {
      setCandidates(response.data.data.candidates || []);
      setRunId(response.data.data.runId);
      toast.success(`Found ${response.data.data.count} governed candidate(s)`);
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

  const capabilities = optionsQuery.data?.discovery?.providers || [];
  const selectedCapability = capabilities.find((item) => item.code === provider);

  return (
    <div style={{ padding: 24, color: 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: '#8bd7ff', fontSize: 12, fontWeight: 900, letterSpacing: '.12em' }}>CONTENT FACTORY · GOVERNED RESEARCH</div>
          <h1 style={{ margin: '5px 0', fontSize: 34 }}>Source Discovery</h1>
          <p style={{ maxWidth: 940, color: 'rgba(255,255,255,.62)', lineHeight: 1.65 }}>
            Search VidyaSetu&apos;s governed library or discover DIKSHA metadata. Discovery never grants reuse rights: external material must pass OER licence and attribution review before it can ground AI generation.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/admin/learning/creator" className="btn-primary">AI Content Creator</Link>
          <Link href="/admin/learning/intake" className="btn-secondary">OER Intake</Link>
          <Link href="/admin/learning" className="btn-secondary">Learning Studio</Link>
        </div>
      </div>

      <div style={{ margin: '16px 0', padding: 12, borderRadius: 11, border: '1px solid rgba(255,190,70,.28)', background: 'rgba(255,190,70,.06)', color: '#ffe1a8', fontSize: 12 }}>
        {optionsQuery.data?.discovery?.policy || 'External discovery is metadata-only. Admin licence and attribution review is mandatory before grounding/adaptation.'}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(400px,.8fr) minmax(520px,1.2fr)', gap: 18, alignItems: 'start' }}>
        <section style={panelStyle}>
          <h2 style={{ marginTop: 0 }}>Search approved/open sources</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {(['LOCAL','DIKSHA'] as CreatorDiscoveryProvider[]).map((item) => {
              const capability = capabilities.find((entry) => entry.code === item);
              const enabled = capability?.enabled !== false;
              return <button key={item} type="button" disabled={!enabled} onClick={() => setProvider(item)} style={{ padding: 11, borderRadius: 9, textAlign: 'left', color: enabled ? 'white' : 'rgba(255,255,255,.35)', border: provider === item ? '1px solid #4FC3F7' : '1px solid rgba(255,255,255,.1)', background: provider === item ? 'rgba(79,195,247,.1)' : 'rgba(255,255,255,.025)' }}><strong>{item === 'LOCAL' ? '📚 VidyaSetu Library' : '🌐 DIKSHA'}</strong><div style={{ fontSize: 10, marginTop: 4, color: 'rgba(255,255,255,.5)' }}>{item === 'LOCAL' ? 'Already governed content' : enabled ? 'Metadata candidates · review required' : 'Disabled by server configuration'}</div></button>;
            })}
          </div>

          <label style={{ ...labelStyle, marginTop: 12 }}>Search topic<input style={inputStyle} value={queryText} onChange={(e) => setQueryText(e.target.value)} placeholder="Force and pressure, fractions, photosynthesis…" /></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginTop: 9 }}>
            <label style={labelStyle}>Class<select style={inputStyle} value={classNumber} onChange={(e) => setClassNumber(Number(e.target.value))}>{Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Class {n}</option>)}</select></label>
            <label style={labelStyle}>Subject<input style={inputStyle} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Science" /></label>
            <label style={labelStyle}>Language / medium<input style={inputStyle} value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="English / Hindi" /></label>
            <div style={{ ...labelStyle, paddingTop: 5 }}>Provider status<div style={{ ...inputStyle, color: selectedCapability?.enabled === false ? '#ffb3b3' : '#bdeed0' }}>{selectedCapability?.enabled === false ? 'Disabled' : 'Ready'}</div></div>
          </div>
          <button className="btn-primary" type="button" disabled={discoverMutation.isPending || queryText.trim().length < 2 || selectedCapability?.enabled === false} onClick={() => discoverMutation.mutate()} style={{ width: '100%', marginTop: 13 }}>{discoverMutation.isPending ? 'Searching…' : `Search ${provider === 'LOCAL' ? 'VidyaSetu' : 'DIKSHA'}`}</button>
          {runId && <div style={{ marginTop: 7, fontSize: 10, color: 'rgba(255,255,255,.45)' }}>Audit run: {runId}</div>}

          <h3 style={{ marginTop: 20 }}>Recent discovery runs</h3>
          <div style={{ maxHeight: 300, overflowY: 'auto', display: 'grid', gap: 6 }}>
            {(runsQuery.data || []).map((run) => <div key={run.id} style={{ padding: 8, borderRadius: 8, border: '1px solid rgba(255,255,255,.08)', background: 'rgba(0,0,0,.08)' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong style={{ fontSize: 11 }}>{run.query_text}</strong><span style={{ fontSize: 10, color: run.status === 'COMPLETED' ? '#bdeed0' : '#ffd39b' }}>{run.status}</span></div><div style={{ marginTop: 3, fontSize: 10, color: 'rgba(255,255,255,.45)' }}>{run.provider} · {run.result_count} result(s) · {dateText(run.created_at)}</div></div>)}
          </div>
        </section>

        <section style={panelStyle}>
          <h2 style={{ marginTop: 0 }}>Discovery candidates</h2>
          {!candidates.length && <div style={{ color: 'rgba(255,255,255,.48)', padding: '30px 4px' }}>Run a search to review source candidates. Nothing is imported or approved automatically.</div>}
          <div style={{ display: 'grid', gap: 10 }}>
            {candidates.map((candidate) => <CandidateCard key={candidate.id} candidate={candidate} staging={stageMutation.isPending} onStage={() => stageMutation.mutate(candidate.id)} />)}
          </div>
        </section>
      </div>
    </div>
  );
}

function CandidateCard({ candidate, staging, onStage }: { candidate: CreatorDiscoveryCandidate; staging: boolean; onStage: () => void }) {
  const local = candidate.provider === 'LOCAL';
  const staged = Boolean(candidate.staged_at || candidate.intake_id || candidate.resource_id && local);
  return (
    <article style={{ padding: 13, borderRadius: 11, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.025)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div><strong>{candidate.title}</strong><div style={{ marginTop: 4, fontSize: 10, color: 'rgba(255,255,255,.5)' }}>{candidate.provider} · {candidate.primary_category || candidate.resource_type || 'Learning resource'}</div></div>
        <span style={{ fontSize: 10, color: candidate.licence_verified ? '#bdeed0' : '#ffd39b' }}>{candidate.licence_verified ? '✓ Governed' : 'Review required'}</span>
      </div>
      {candidate.description && <p style={{ margin: '8px 0', fontSize: 11, lineHeight: 1.55, color: 'rgba(255,255,255,.62)' }}>{candidate.description}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, fontSize: 10, color: 'rgba(255,255,255,.52)' }}>
        <div>Class: {listText(candidate.grade_levels)}</div><div>Subject: {listText(candidate.subjects)}</div>
        <div>Language: {listText(candidate.languages)}</div><div>Licence: {candidate.licence_candidate || candidate.licence_raw || 'Unverified'}</div>
        <div>Adaptation: {candidate.can_adapt ? 'candidate allows' : 'not established'}</div><div>Commercial: {candidate.can_use_commercially ? 'candidate allows' : 'not established'}</div>
      </div>
      {(candidate.author_text || candidate.publisher_text || candidate.attribution_text) && <div style={{ marginTop: 7, padding: 7, borderRadius: 7, background: 'rgba(0,0,0,.1)', fontSize: 10, color: 'rgba(255,255,255,.56)' }}>Evidence: {[candidate.author_text,candidate.publisher_text,candidate.attribution_text].filter(Boolean).join(' · ')}</div>}
      <div style={{ display: 'flex', gap: 7, marginTop: 9, flexWrap: 'wrap' }}>
        {candidate.source_url && <a className="btn-secondary" href={candidate.source_url} target="_blank" rel="noopener noreferrer">Open source ↗</a>}
        <button className="btn-primary" type="button" disabled={staging || (Boolean(candidate.staged_at) && !local)} onClick={onStage}>{local ? 'Use governed source' : candidate.intake_id ? 'Already in OER Intake' : 'Stage for OER review'}</button>
        {candidate.intake_id && <Link href="/admin/learning/intake" className="btn-secondary">Review licence & attribution →</Link>}
        {local && staged && <Link href="/admin/learning/creator" className="btn-secondary">Open Creator →</Link>}
      </div>
      {!local && <div style={{ marginTop: 8, fontSize: 10, color: '#ffd39b' }}>DIKSHA metadata is a discovery hint only. Admin must verify item-level licence and attribution in OER Intake before grounding.</div>}
    </article>
  );
}
