'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  createLearningStudioIntake,
  getLearningStudioIntake,
  updateLearningStudioIntakeStatus,
  type LearningStudioIntake,
  type SaveLearningStudioIntake,
} from '@/services/adminLearningService';
import { updateContentCreatorIntakeEvidence } from '@/services/contentCreatorService';
import { apiErrorText } from '@/utils/errors';

const LICENCES = ['CC_BY','CC_BY_SA','CC_BY_NC','CC_BY_NC_SA','CC_BY_NC_ND','PUBLIC_DOMAIN','EXTERNAL_LINK_ONLY','OTHER'] as const;
const SOURCE_OPTIONS = [
  { code: 'NROER', label: 'NROER' }, { code: 'DIKSHA', label: 'DIKSHA / PM eVIDYA' }, { code: 'CBSE_ACADEMIC', label: 'CBSE Academic' },
  { code: 'NCERT_EPATHSHALA', label: 'NCERT / ePathshala' }, { code: 'NIOS', label: 'NIOS' }, { code: 'SWAYAM', label: 'SWAYAM' },
  { code: 'PHET', label: 'PhET' }, { code: 'OER_COMMONS', label: 'OER Commons' }, { code: 'EXTERNAL_OFFICIAL', label: 'Other official external source' },
] as const;
const INITIAL: SaveLearningStudioIntake = { sourceCode: 'NROER', title: '', sourceUrl: '', licenceCandidate: 'OTHER', attributionText: '', classHint: '', boardHint: 'COMMON', subjectHint: '' };
interface EvidenceDraft { licenceCandidate: string; attributionText: string; reviewerNote: string; }
const secondaryButton = { padding: '8px 12px', borderRadius: 9, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#14213D', cursor: 'pointer', fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' } as const;

export default function SourceLicenceReviewPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SaveLearningStudioIntake>(INITIAL);
  const [editingId, setEditingId] = useState('');
  const [evidence, setEvidence] = useState<EvidenceDraft>({ licenceCandidate: 'OTHER', attributionText: '', reviewerNote: '' });

  const intakeQuery = useQuery({ queryKey: ['learning-studio-intake'], queryFn: () => getLearningStudioIntake().then((r) => r.data.data || []) });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['learning-studio-intake'] }),
      queryClient.invalidateQueries({ queryKey: ['content-creator-options'] }),
      queryClient.invalidateQueries({ queryKey: ['content-creator-discovery-runs'] }),
    ]);
  };
  const createMutation = useMutation({
    mutationFn: () => createLearningStudioIntake(form),
    onSuccess: async () => { toast.success('Source candidate added to review queue'); setForm(INITIAL); await refresh(); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not add source candidate')),
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateLearningStudioIntakeStatus(id, status),
    onSuccess: async (_response, variables) => { toast.success(`Moved to ${variables.status.replaceAll('_',' ')}`); await refresh(); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Review transition blocked')),
  });
  const evidenceMutation = useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: EvidenceDraft }) => updateContentCreatorIntakeEvidence(id, { licenceCandidate: draft.licenceCandidate, attributionText: draft.attributionText, reviewerNote: draft.reviewerNote.trim() || null }),
    onSuccess: async () => { toast.success('Licence and attribution evidence saved'); setEditingId(''); await refresh(); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not save source evidence')),
  });

  function beginEvidenceEdit(item: LearningStudioIntake) {
    setEditingId(item.id);
    setEvidence({ licenceCandidate: item.licence_candidate || 'OTHER', attributionText: item.attribution_text || '', reviewerNote: item.reviewer_note || '' });
  }
  function defaultLicence(sourceCode: string): string {
    if (sourceCode === 'PHET') return 'CC_BY_NC';
    if (['CBSE_ACADEMIC','NCERT_EPATHSHALA','NIOS','SWAYAM','EXTERNAL_OFFICIAL'].includes(sourceCode)) return 'EXTERNAL_LINK_ONLY';
    return 'OTHER';
  }

  const items = intakeQuery.data || [];
  const pending = items.filter((item) => !['APPROVED','REJECTED','IMPORTED'].includes(item.status)).length;
  const approved = items.filter((item) => ['APPROVED','IMPORTED'].includes(item.status)).length;

  return (
    <div className="admin-page" style={{ padding: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <div style={{ color: '#FF6B00', fontSize: 12, fontWeight: 900, letterSpacing: '.12em' }}>ADVANCED · SOURCE GOVERNANCE</div>
          <h1 style={{ margin: '5px 0', fontSize: 34 }}>Source & Licence Review</h1>
          <p className="admin-muted" style={{ maxWidth: 880, lineHeight: 1.65 }}>This is an advanced compliance queue. Normal content creation should start from <strong>Create Content</strong>; external sources are sent here automatically only when licence or attribution review is required.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Link href="/admin/learning/creator" className="btn-primary">Create Content</Link><Link href="/admin/learning/creator/discovery" style={secondaryButton}>Source Library</Link></div>
      </div>

      <div className="admin-note" style={{ padding: 13, marginBottom: 16 }}>Discovery is not approval. External material must have item-level rights and required attribution recorded before it can be used for adaptation. Non-commercial material is never assumed safe for Subscriber content.</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(150px,1fr))', gap: 10, marginBottom: 16 }}>
        {[['Total candidates', items.length],['Needs review', pending],['Approved / imported', approved]].map(([label,value]) => <div key={String(label)} className="admin-panel" style={{ padding: 15 }}><div style={{ fontSize: 25, fontWeight: 900 }}>{value}</div><div style={{ fontSize: 11, color: '#667085', marginTop: 3 }}>{label}</div></div>)}
      </div>

      <section className="admin-panel" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Review queue</h2>
        <p className="admin-muted">Lifecycle: DISCOVERED → LICENCE REVIEW → CONTENT REVIEW → APPROVED → IMPORTED. Reject unclear rights, missing attribution, poor academic quality or unsafe material.</p>
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          {items.map((item) => <article key={item.id} className="admin-source-card" style={{ padding: 15 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}><div><strong>{item.title}</strong><div style={{ color: '#667085', fontSize: 11, marginTop: 4 }}>{item.source_name} · {item.licence_candidate || 'Licence not verified'}{item.class_hint ? ` · ${item.class_hint}` : ''}{item.subject_hint ? ` · ${item.subject_hint}` : ''}</div></div><span style={{ padding: '5px 9px', borderRadius: 999, background: '#FFF1E6', color: '#9A3B00', fontSize: 11, fontWeight: 900 }}>{item.status.replaceAll('_',' ')}</span></div>
            <div style={{ marginTop: 8 }}><a href={item.source_url} target="_blank" rel="noopener noreferrer" style={{ color: '#C2410C', fontWeight: 800, fontSize: 12 }}>Open original source ↗</a></div>
            {item.attribution_text ? <p style={{ color: '#475467', fontSize: 12, marginTop: 7 }}>Attribution: {item.attribution_text}</p> : <p style={{ color: '#B54708', fontSize: 12, marginTop: 7 }}>Attribution evidence not recorded.</p>}

            {editingId === item.id ? <div className="admin-panel-muted" style={{ padding: 13, marginTop: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 10 }}><label className="admin-label">Verified licence<select className="admin-select" value={evidence.licenceCandidate} onChange={(e) => setEvidence((v) => ({ ...v, licenceCandidate: e.target.value }))}>{LICENCES.map((v) => <option key={v}>{v}</option>)}</select></label><label className="admin-label">Reviewer note<input className="admin-input" value={evidence.reviewerNote} onChange={(e) => setEvidence((v) => ({ ...v, reviewerNote: e.target.value }))} /></label></div>
              <label className="admin-label" style={{ marginTop: 9 }}>Verified attribution evidence<textarea className="admin-textarea" style={{ minHeight: 85 }} value={evidence.attributionText} onChange={(e) => setEvidence((v) => ({ ...v, attributionText: e.target.value }))} /></label>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button className="btn-primary" type="button" disabled={evidenceMutation.isPending} onClick={() => evidenceMutation.mutate({ id: item.id, draft: evidence })}>{evidenceMutation.isPending ? 'Saving…' : 'Save evidence'}</button><button type="button" style={secondaryButton} onClick={() => setEditingId('')}>Cancel</button></div>
            </div> : <button type="button" style={{ ...secondaryButton, marginTop: 9 }} onClick={() => beginEvidenceEdit(item)}>Edit licence & attribution</button>}

            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 10 }}>{['LICENCE_REVIEW','CONTENT_REVIEW','APPROVED','REJECTED','IMPORTED'].map((status) => <button key={status} type="button" className={`admin-chip ${item.status === status ? 'active' : ''}`} disabled={statusMutation.isPending || item.status === status} onClick={() => statusMutation.mutate({ id: item.id, status })}>{status.replaceAll('_',' ')}</button>)}</div>
            {item.status === 'APPROVED' && <div className="admin-success-note" style={{ padding: 9, marginTop: 10, fontSize: 12 }}>✓ Approved source is now available in Create Content.</div>}
          </article>)}
          {!items.length && <div className="admin-panel-muted" style={{ padding: 18, color: '#667085' }}>No source candidates are waiting for review.</div>}
        </div>
      </section>

      <details className="admin-panel" style={{ padding: 20 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 900, fontSize: 17 }}>Advanced: add a source candidate manually</summary>
        <p className="admin-muted" style={{ marginTop: 8 }}>Prefer Source Library whenever possible so official-domain validation and discovery metadata are preserved.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(220px,1fr))', gap: 10, marginTop: 12 }}>
          <label className="admin-label">Source<select className="admin-select" value={form.sourceCode} onChange={(e) => { const code = e.target.value; setForm((f) => ({ ...f, sourceCode: code, licenceCandidate: defaultLicence(code) })); }}>{SOURCE_OPTIONS.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
          <label className="admin-label">Resource title<input className="admin-input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></label>
          <label className="admin-label">Original source URL<input className="admin-input" type="url" value={form.sourceUrl} onChange={(e) => setForm((f) => ({ ...f, sourceUrl: e.target.value }))} placeholder="https://official-source/..." /></label>
          <label className="admin-label">Licence evidence<select className="admin-select" value={form.licenceCandidate || 'OTHER'} onChange={(e) => setForm((f) => ({ ...f, licenceCandidate: e.target.value }))}>{LICENCES.map((v) => <option key={v}>{v}</option>)}</select></label>
          <label className="admin-label">Class hint<input className="admin-input" value={form.classHint || ''} onChange={(e) => setForm((f) => ({ ...f, classHint: e.target.value }))} /></label>
          <label className="admin-label">Subject hint<input className="admin-input" value={form.subjectHint || ''} onChange={(e) => setForm((f) => ({ ...f, subjectHint: e.target.value }))} /></label>
        </div>
        <label className="admin-label" style={{ marginTop: 10 }}>Attribution evidence<textarea className="admin-textarea" style={{ minHeight: 90 }} value={form.attributionText || ''} onChange={(e) => setForm((f) => ({ ...f, attributionText: e.target.value }))} placeholder="Creator/author, institution/publisher, item title, visible copyright/licence statement and source." /></label>
        <button className="btn-primary" type="button" disabled={createMutation.isPending || !form.title.trim() || !form.sourceUrl.trim()} onClick={() => createMutation.mutate()} style={{ marginTop: 12 }}>{createMutation.isPending ? 'Adding…' : 'Add to review queue'}</button>
      </details>
    </div>
  );
}
