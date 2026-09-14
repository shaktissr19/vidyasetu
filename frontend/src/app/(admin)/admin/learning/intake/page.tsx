'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  createLearningStudioIntake,
  updateLearningStudioIntakeStatus,
  type SaveLearningStudioIntake,
} from '@/services/adminLearningService';
import { updateContentCreatorIntakeEvidence } from '@/services/contentCreatorService';
import {
  addApprovedSourceToLibrary,
  getContentFactoryOptions,
  getContentFactorySourceReview,
  type AddApprovedSourceToLibraryPayload,
  type FactorySourceReviewItem,
} from '@/services/contentFactoryService';
import { apiErrorText } from '@/utils/errors';

const LICENCES = ['CC_BY','CC_BY_SA','CC_BY_NC','CC_BY_NC_SA','CC_BY_NC_ND','PUBLIC_DOMAIN','EXTERNAL_LINK_ONLY','OTHER'] as const;
const MANUAL_CREATE_LICENCES = ['CC_BY','CC_BY_SA','CC_BY_NC_SA','CC_BY_NC_ND','PUBLIC_DOMAIN','EXTERNAL_LINK_ONLY','OTHER'] as const;
const SOURCE_OPTIONS = [
  { code: 'NROER', label: 'NROER' }, { code: 'DIKSHA', label: 'DIKSHA / PM eVIDYA' }, { code: 'CBSE_ACADEMIC', label: 'CBSE Academic' },
  { code: 'NCERT_EPATHSHALA', label: 'NCERT / ePathshala' }, { code: 'NIOS', label: 'NIOS' }, { code: 'SWAYAM', label: 'SWAYAM' },
  { code: 'PHET', label: 'PhET' }, { code: 'OER_COMMONS', label: 'OER Commons' }, { code: 'EXTERNAL_OFFICIAL', label: 'Other official external source' },
] as const;
const INITIAL: SaveLearningStudioIntake = { sourceCode: 'NROER', title: '', sourceUrl: '', licenceCandidate: 'OTHER', attributionText: '', classHint: '', boardHint: 'COMMON', subjectHint: '' };
interface EvidenceDraft { licenceCandidate: string; attributionText: string; reviewerNote: string; }
type Audience = 'PUBLIC' | 'REGISTERED' | 'SUBSCRIBER';
interface ImportDraft {
  classNumber: number;
  boardCode: string;
  subjectId: string;
  chapter: string;
  topic: string;
  language: 'en' | 'hi' | 'en-hi';
  audience: Audience;
}

const secondaryButton = { padding: '8px 12px', borderRadius: 9, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#14213D', cursor: 'pointer', fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' } as const;
const mutedButton = { ...secondaryButton, opacity: .5, cursor: 'not-allowed' } as const;

function parseClassHint(value?: string | null): number {
  const match = String(value || '').match(/(?:CLASS\s*)?(1[0-2]|[1-9])/i);
  return match ? Number(match[1]) : 5;
}

function statusLabel(value: string) {
  return value.replaceAll('_',' ');
}

function sourceApprovalReady(item: FactorySourceReviewItem): boolean {
  if (!item.evidence_ready) return false;
  if (item.source_code !== 'NROER') return true;
  return Boolean(item.licence_candidate && ['CC_BY','CC_BY_SA','PUBLIC_DOMAIN','EXTERNAL_LINK_ONLY'].includes(item.licence_candidate));
}

export default function SourceLicenceReviewPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SaveLearningStudioIntake>(INITIAL);
  const [editingId, setEditingId] = useState('');
  const [evidence, setEvidence] = useState<EvidenceDraft>({ licenceCandidate: 'OTHER', attributionText: '', reviewerNote: '' });
  const [importingId, setImportingId] = useState('');
  const [importDraft, setImportDraft] = useState<ImportDraft>({ classNumber: 5, boardCode: 'COMMON', subjectId: '', chapter: '', topic: '', language: 'en', audience: 'REGISTERED' });

  const intakeQuery = useQuery({ queryKey: ['content-factory-source-review'], queryFn: () => getContentFactorySourceReview().then((r) => r.data.data || []) });
  const factoryQuery = useQuery({ queryKey: ['content-factory-options'], queryFn: () => getContentFactoryOptions().then((r) => r.data.data) });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['content-factory-source-review'] }),
      queryClient.invalidateQueries({ queryKey: ['content-factory-queue-counts'] }),
      queryClient.invalidateQueries({ queryKey: ['content-creator-options'] }),
      queryClient.invalidateQueries({ queryKey: ['learning-studio-intake'] }),
      queryClient.invalidateQueries({ queryKey: ['learning-studio-resources'] }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: () => createLearningStudioIntake(form),
    onSuccess: async () => { toast.success('Source candidate added to review queue'); setForm(INITIAL); await refresh(); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not add source candidate')),
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateLearningStudioIntakeStatus(id, status),
    onSuccess: async (_response, variables) => { toast.success(`Moved to ${statusLabel(variables.status)}`); await refresh(); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Review transition blocked')),
  });
  const evidenceMutation = useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: EvidenceDraft }) => updateContentCreatorIntakeEvidence(id, { licenceCandidate: draft.licenceCandidate, attributionText: draft.attributionText, reviewerNote: draft.reviewerNote.trim() || null }),
    onSuccess: async () => { toast.success('Item-level licence and attribution verification saved'); setEditingId(''); await refresh(); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not save source evidence')),
  });
  const importMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AddApprovedSourceToLibraryPayload }) => addApprovedSourceToLibrary(id,payload),
    onSuccess: async (response) => {
      toast.success(response.data.data.alreadyImported ? 'This source is already in Content Library.' : 'Added to Content Library as DRAFT. Review and publish it there.');
      setImportingId('');
      await refresh();
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not add approved source to Content Library')),
  });

  function beginEvidenceEdit(item: FactorySourceReviewItem) {
    setEditingId(item.id);
    setEvidence({ licenceCandidate: item.licence_candidate || 'OTHER', attributionText: item.attribution_text || '', reviewerNote: item.reviewer_note || '' });
  }

  function beginImport(item: FactorySourceReviewItem) {
    const subjects = factoryQuery.data?.subjects || [];
    const hinted = String(item.subject_hint || '').split(',')[0].trim();
    const subject = subjects.find((entry) => entry.name.toLowerCase() === hinted.toLowerCase() || entry.code?.toLowerCase() === hinted.toLowerCase());
    const boards = factoryQuery.data?.boards || [];
    const hintedBoard = String(item.board_hint || 'COMMON').trim().toUpperCase();
    const boardCode = boards.some((entry) => entry.code === hintedBoard) ? hintedBoard : 'COMMON';
    setImportDraft({
      classNumber: parseClassHint(item.class_hint),
      boardCode,
      subjectId: subject?.id || '',
      chapter: '',
      topic: '',
      language: 'en',
      audience: 'REGISTERED',
    });
    setImportingId(item.id);
  }

  function submitImport(item: FactorySourceReviewItem) {
    const subject = factoryQuery.data?.subjects.find((entry) => entry.id === importDraft.subjectId);
    const audiencePolicy: Record<Audience,Pick<AddApprovedSourceToLibraryPayload,'visibility' | 'accessRequirement'>> = {
      PUBLIC: { visibility: 'PUBLIC', accessRequirement: 'PUBLIC' },
      REGISTERED: { visibility: 'CLASS_ONLY', accessRequirement: 'REGISTERED' },
      SUBSCRIBER: { visibility: 'CLASS_ONLY', accessRequirement: 'SUBSCRIBER' },
    };
    const policy = audiencePolicy[importDraft.audience];
    importMutation.mutate({ id: item.id,payload: {
      classNumber: importDraft.classNumber,
      boardCode: importDraft.boardCode,
      subjectId: importDraft.subjectId,
      subjectName: subject?.name || null,
      chapter: importDraft.chapter.trim() || null,
      topic: importDraft.topic.trim() || null,
      language: importDraft.language,
      ...policy,
    } });
  }

  function defaultLicence(sourceCode: string): string {
    if (['CBSE_ACADEMIC','NCERT_EPATHSHALA','NIOS','SWAYAM','EXTERNAL_OFFICIAL'].includes(sourceCode)) return 'EXTERNAL_LINK_ONLY';
    return 'OTHER';
  }

  const items = intakeQuery.data || [];
  const pending = items.filter((item) => ['DISCOVERED','LICENCE_REVIEW','CONTENT_REVIEW'].includes(item.status)).length;
  const approved = items.filter((item) => item.status === 'APPROVED').length;
  const imported = items.filter((item) => item.status === 'IMPORTED').length;

  return (
    <div className="admin-page" style={{ padding: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <div style={{ color: '#FF6B00', fontSize: 12, fontWeight: 900, letterSpacing: '.12em' }}>SOURCE GOVERNANCE → CONTENT LIBRARY</div>
          <h1 style={{ margin: '5px 0', fontSize: 34 }}>Source & Licence Review</h1>
          <p className="admin-muted" style={{ maxWidth: 920, lineHeight: 1.65 }}>Every selected external item arrives here. Verify the item-level licence and attribution, review the learning item, approve it, then add it to the canonical Content Library for normal review and publication.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/admin/learning/factory" className="btn-primary">Content Factory</Link>
          <Link href="/admin/learning" style={secondaryButton}>Content Library</Link>
          <Link href="/admin/learning/creator/discovery" style={secondaryButton}>Advanced Source Search</Link>
        </div>
      </div>

      <div className="admin-note" style={{ padding: 13, marginBottom: 16 }}>
        <strong>Important:</strong> discovery metadata is not approval. For DIKSHA and other item-review sources, a Platform Admin must explicitly save a concrete licence and attribution evidence. Choosing <strong>EXTERNAL_LINK_ONLY</strong> means VidyaSetu links to the original item and does not copy/adapt it.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(140px,1fr))', gap: 10, marginBottom: 16 }}>
        {[['Total candidates', items.length],['Needs review', pending],['Approved — add to library', approved],['Imported to library', imported]].map(([label,value]) => <div key={String(label)} className="admin-panel" style={{ padding: 15 }}><div style={{ fontSize: 25, fontWeight: 900 }}>{value}</div><div style={{ fontSize: 11, color: '#667085', marginTop: 3 }}>{label}</div></div>)}
      </div>

      <section className="admin-panel" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Review queue</h2>
        <p className="admin-muted">Guided lifecycle: DISCOVERED → verify licence & attribution → LICENCE REVIEW → CONTENT REVIEW → APPROVED → Add to Content Library → IMPORTED. IMPORTED is set only by the audited library handoff.</p>
        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          {items.map((item) => {
            const licenceVerified = !item.requires_item_license_check || Boolean(item.licence_candidate && item.licence_candidate !== 'OTHER' && item.licence_verified_at);
            const attributionVerified = !item.attribution_required || Boolean(item.attribution_text?.trim());
            const approvalReady = sourceApprovalReady(item);
            return <article key={item.id} className="admin-source-card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: 17 }}>{item.title}</strong>
                  <div style={{ color: '#667085', fontSize: 12, marginTop: 4 }}>
                    {item.source_name} · {item.media_kind || 'LINK'}{item.class_hint ? ` · ${item.class_hint}` : ''}{item.subject_hint ? ` · ${item.subject_hint}` : ''}
                  </div>
                </div>
                <span style={{ padding: '5px 9px', borderRadius: 999, background: item.status === 'IMPORTED' ? '#ECFDF3' : '#FFF1E6', color: item.status === 'IMPORTED' ? '#067647' : '#9A3B00', fontSize: 11, fontWeight: 900 }}>{statusLabel(item.status)}</span>
              </div>

              <div style={{ marginTop: 9, display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
                <a href={item.source_url} target="_blank" rel="noopener noreferrer" style={{ color: '#C2410C', fontWeight: 800 }}>Open original source ↗</a>
                <span>{licenceVerified ? '✅ Licence verified' : '⚠️ Licence verification required'}</span>
                <span>{attributionVerified ? '✅ Attribution recorded' : '⚠️ Attribution required'}</span>
              </div>
              <div style={{ color: '#475467', fontSize: 12, marginTop: 7 }}>
                Licence: <strong>{item.licence_candidate || 'Not recorded'}</strong>{item.licence_verified_at ? ` · verified ${new Date(item.licence_verified_at).toLocaleDateString()}` : ''}
              </div>
              {item.attribution_text ? <p style={{ color: '#475467', fontSize: 12, marginTop: 7 }}>Attribution: {item.attribution_text}</p> : null}

              {editingId === item.id ? <div className="admin-panel-muted" style={{ padding: 13, marginTop: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 10 }}>
                  <label className="admin-label">Verified item licence
                    <select className="admin-select" value={evidence.licenceCandidate} onChange={(e) => setEvidence((v) => ({ ...v, licenceCandidate: e.target.value }))}>{LICENCES.map((v) => <option key={v}>{v}</option>)}</select>
                  </label>
                  <label className="admin-label">Reviewer note
                    <input className="admin-input" value={evidence.reviewerNote} onChange={(e) => setEvidence((v) => ({ ...v, reviewerNote: e.target.value }))} placeholder="Where/how the licence was verified" />
                  </label>
                </div>
                <label className="admin-label" style={{ marginTop: 9 }}>Verified attribution evidence
                  <textarea className="admin-textarea" style={{ minHeight: 85 }} value={evidence.attributionText} onChange={(e) => setEvidence((v) => ({ ...v, attributionText: e.target.value }))} placeholder="Author/creator, institution/publisher and visible attribution statement" />
                </label>
                <div className="admin-note" style={{ padding: 9, marginTop: 9, fontSize: 12 }}>Saving a non-OTHER licence here records the explicit item-level verification event. Use EXTERNAL_LINK_ONLY when linking is acceptable but copying/adaptation rights are not established.</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="btn-primary" type="button" disabled={evidenceMutation.isPending} onClick={() => evidenceMutation.mutate({ id: item.id, draft: evidence })}>{evidenceMutation.isPending ? 'Saving…' : 'Save verification'}</button>
                  <button type="button" style={secondaryButton} onClick={() => setEditingId('')}>Cancel</button>
                </div>
              </div> : item.status !== 'IMPORTED' ? <button type="button" style={{ ...secondaryButton, marginTop: 10 }} onClick={() => beginEvidenceEdit(item)}>Verify / edit licence & attribution</button> : null}

              {item.status !== 'APPROVED' && item.status !== 'IMPORTED' && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                {item.status === 'DISCOVERED' && <button type="button" style={secondaryButton} disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ id: item.id,status: 'LICENCE_REVIEW' })}>Start licence review</button>}
                {item.status === 'LICENCE_REVIEW' && <button type="button" style={approvalReady ? secondaryButton : mutedButton} disabled={!approvalReady || statusMutation.isPending} title={!approvalReady ? 'Save verified licence and required attribution first' : undefined} onClick={() => statusMutation.mutate({ id: item.id,status: 'CONTENT_REVIEW' })}>Continue to content review</button>}
                {item.status === 'CONTENT_REVIEW' && <button type="button" className="btn-primary" disabled={!approvalReady || statusMutation.isPending} title={!approvalReady ? 'Save verified licence and required attribution first' : undefined} onClick={() => statusMutation.mutate({ id: item.id,status: 'APPROVED' })}>Approve source</button>}
                {item.status === 'REJECTED' && <button type="button" style={secondaryButton} disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ id: item.id,status: 'LICENCE_REVIEW' })}>Reopen review</button>}
                {item.status !== 'REJECTED' && <button type="button" style={secondaryButton} disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ id: item.id,status: 'REJECTED' })}>Reject</button>}
                {!approvalReady && ['LICENCE_REVIEW','CONTENT_REVIEW'].includes(item.status) && <span style={{ alignSelf: 'center', color: '#B54708', fontSize: 12 }}>Complete item-level verification before approval.</span>}
              </div>}

              {item.status === 'APPROVED' && <div className="admin-success-note" style={{ padding: 12, marginTop: 12 }}>
                <strong>✓ Source approved.</strong> It is not learner-visible yet. Add it to Content Library, where it will enter the normal DRAFT → SUBMITTED → ACADEMIC REVIEW → APPROVED → PUBLISHED workflow.
                {importingId !== item.id ? <div style={{ marginTop: 10 }}><button type="button" className="btn-primary" onClick={() => beginImport(item)}>Add to Content Library</button></div> : <div className="admin-panel" style={{ padding: 14, marginTop: 12 }}>
                  <h3 style={{ marginTop: 0 }}>Learning destination</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(170px,1fr))', gap: 10 }}>
                    <label className="admin-label">Class
                      <select className="admin-select" value={importDraft.classNumber} onChange={(e) => setImportDraft((v) => ({ ...v,classNumber: Number(e.target.value) }))}>{Array.from({ length: 12 },(_,i) => i + 1).map((value) => <option key={value} value={value}>Class {value}</option>)}</select>
                    </label>
                    <label className="admin-label">Board
                      <select className="admin-select" value={importDraft.boardCode} onChange={(e) => setImportDraft((v) => ({ ...v,boardCode: e.target.value }))}>{(factoryQuery.data?.boards || []).map((board) => <option key={board.code} value={board.code}>{board.short_name || board.name}</option>)}</select>
                    </label>
                    <label className="admin-label">Subject
                      <select className="admin-select" value={importDraft.subjectId} onChange={(e) => setImportDraft((v) => ({ ...v,subjectId: e.target.value }))}><option value="">Select subject…</option>{(factoryQuery.data?.subjects || []).map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select>
                    </label>
                    <label className="admin-label">Chapter / unit
                      <input className="admin-input" value={importDraft.chapter} onChange={(e) => setImportDraft((v) => ({ ...v,chapter: e.target.value }))} placeholder="Optional — type chapter/unit" />
                    </label>
                    <label className="admin-label">Topic
                      <input className="admin-input" value={importDraft.topic} onChange={(e) => setImportDraft((v) => ({ ...v,topic: e.target.value }))} placeholder="Optional — type topic" />
                    </label>
                    <label className="admin-label">Language
                      <select className="admin-select" value={importDraft.language} onChange={(e) => setImportDraft((v) => ({ ...v,language: e.target.value as ImportDraft['language'] }))}><option value="en">English</option><option value="hi">Hindi</option><option value="en-hi">English + Hindi</option></select>
                    </label>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <div className="admin-label">Audience after publication</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 5 }}>
                      {([['PUBLIC','🌐 Public Free — visible under Learn without login'],['REGISTERED','👤 Class Registered Free — same-class signed-in learners'],['SUBSCRIBER','🔒 Class Subscriber — same-class eligible subscribers']] as Array<[Audience,string]>).map(([value,label]) => <label key={value} style={{ ...secondaryButton,cursor: 'pointer',borderColor: importDraft.audience === value ? '#FF6B00' : '#CBD5E1',background: importDraft.audience === value ? '#FFF4EC' : '#fff' }}><input type="radio" name={`audience-${item.id}`} checked={importDraft.audience === value} onChange={() => setImportDraft((v) => ({ ...v,audience: value }))} /> {label}</label>)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button type="button" className="btn-primary" disabled={!importDraft.subjectId || importMutation.isPending} onClick={() => submitImport(item)}>{importMutation.isPending ? 'Adding…' : 'Add as DRAFT to Content Library'}</button>
                    <button type="button" style={secondaryButton} onClick={() => setImportingId('')}>Cancel</button>
                  </div>
                </div>}
              </div>}

              {item.status === 'IMPORTED' && <div className="admin-success-note" style={{ padding: 11, marginTop: 12 }}>
                ✓ Added to Content Library{item.imported_at ? ` on ${new Date(item.imported_at).toLocaleDateString()}` : ''}. It remains governed by the Learning review workflow until PUBLISHED. <Link href="/admin/learning" style={{ fontWeight: 900,color: '#067647' }}>Open Content Library →</Link>
              </div>}
            </article>;
          })}
          {!items.length && <div className="admin-panel-muted" style={{ padding: 18, color: '#667085' }}>No source candidates are waiting for review. Search from Content Factory and select an external learning item.</div>}
        </div>
      </section>

      <details className="admin-panel" style={{ padding: 20 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 900, fontSize: 17 }}>Advanced: add a source candidate manually</summary>
        <p className="admin-muted" style={{ marginTop: 8 }}>Prefer Content Factory/Advanced Source Search whenever possible so discovery metadata is preserved. A manually added item still requires explicit verification before approval.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(220px,1fr))', gap: 10, marginTop: 12 }}>
          <label className="admin-label">Source<select className="admin-select" value={form.sourceCode} onChange={(e) => { const code = e.target.value; setForm((f) => ({ ...f, sourceCode: code, licenceCandidate: defaultLicence(code) })); }}>{SOURCE_OPTIONS.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
          <label className="admin-label">Resource title<input className="admin-input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></label>
          <label className="admin-label">Original source URL<input className="admin-input" type="url" value={form.sourceUrl} onChange={(e) => setForm((f) => ({ ...f, sourceUrl: e.target.value }))} placeholder="https://official-source/..." /></label>
          <label className="admin-label">Initial licence candidate<select className="admin-select" value={form.licenceCandidate || 'OTHER'} onChange={(e) => setForm((f) => ({ ...f, licenceCandidate: e.target.value }))}>{MANUAL_CREATE_LICENCES.map((v) => <option key={v}>{v}</option>)}</select></label>
          <label className="admin-label">Class hint<input className="admin-input" value={form.classHint || ''} onChange={(e) => setForm((f) => ({ ...f, classHint: e.target.value }))} placeholder="Class 5" /></label>
          <label className="admin-label">Subject hint<input className="admin-input" value={form.subjectHint || ''} onChange={(e) => setForm((f) => ({ ...f, subjectHint: e.target.value }))} placeholder="Mathematics" /></label>
        </div>
        <label className="admin-label" style={{ marginTop: 10 }}>Attribution candidate<textarea className="admin-textarea" style={{ minHeight: 90 }} value={form.attributionText || ''} onChange={(e) => setForm((f) => ({ ...f, attributionText: e.target.value }))} placeholder="Creator/author, institution/publisher, item title and visible attribution statement." /></label>
        <button className="btn-primary" type="button" disabled={createMutation.isPending || !form.title.trim() || !form.sourceUrl.trim()} onClick={() => createMutation.mutate()} style={{ marginTop: 12 }}>{createMutation.isPending ? 'Adding…' : 'Add to review queue'}</button>
      </details>
    </div>
  );
}
