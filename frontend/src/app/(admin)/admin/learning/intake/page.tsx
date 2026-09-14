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
import styles from '@/components/public/publicLearning.module.css';

const LICENCES = ['CC_BY','CC_BY_SA','CC_BY_NC_SA','CC_BY_NC_ND','PUBLIC_DOMAIN','EXTERNAL_LINK_ONLY','OTHER'] as const;

const INITIAL: SaveLearningStudioIntake = {
  sourceCode: 'NROER',
  title: '',
  sourceUrl: '',
  licenceCandidate: 'CC_BY_SA',
  attributionText: '',
  classHint: '',
  boardHint: 'COMMON',
  subjectHint: '',
};

interface EvidenceDraft { licenceCandidate: string; attributionText: string; reviewerNote: string; }

export default function LearningIntakePage() {
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
    onSuccess: async () => { toast.success('OER candidate added to review queue'); setForm(INITIAL); await refresh(); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not add intake item')),
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateLearningStudioIntakeStatus(id, status),
    onSuccess: async (_response, variables) => { toast.success(`Intake moved to ${variables.status.replaceAll('_',' ')}`); await refresh(); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Review transition blocked')),
  });
  const evidenceMutation = useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: EvidenceDraft }) => updateContentCreatorIntakeEvidence(id, {
      licenceCandidate: draft.licenceCandidate,
      attributionText: draft.attributionText,
      reviewerNote: draft.reviewerNote.trim() || null,
    }),
    onSuccess: async () => { toast.success('Licence and attribution evidence saved'); setEditingId(''); await refresh(); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not save OER evidence')),
  });

  function beginEvidenceEdit(item: LearningStudioIntake): void {
    setEditingId(item.id);
    setEvidence({
      licenceCandidate: item.licence_candidate || 'OTHER',
      attributionText: item.attribution_text || '',
      reviewerNote: item.reviewer_note || '',
    });
  }

  return (
    <div className={styles.studio}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ color: '#ff9a3c', fontSize: 12, fontWeight: 900, letterSpacing: '.12em' }}>LEARNING PLATFORM · SOURCE GOVERNANCE</div>
        <h1 style={{ color: 'white', fontSize: 34, margin: '6px 0' }}>🌐 OER Licence & Content Intake</h1>
        <p style={{ color: 'rgba(255,255,255,.58)', maxWidth: 950, lineHeight: 1.7 }}>
          Discovery is not approval. NROER, DIKSHA and other external candidates must carry verified item-level licence and attribution evidence before they can become approved Creator grounding sources.
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <Link className={styles.tinyButton} href="/admin/learning">← Learning Studio</Link>
          <Link className={styles.tinyButton} href="/admin/learning/creator">AI Content Creator</Link>
          <Link className={styles.tinyButton} href="/admin/learning/creator/discovery">🔎 Source Discovery</Link>
          <Link className={styles.tinyButton} href="/admin/learning/practice">Question Bank →</Link>
        </div>
      </div>

      <div className={styles.note} style={{ marginBottom: 14 }}>
        Governance boundary: a discovered licence is only a candidate. For sources requiring item review, <strong>APPROVED/IMPORTED is blocked at database level</strong> until licence and required attribution evidence are recorded.
      </div>

      <div className={styles.adminGrid}>
        <section className={styles.adminPanel}>
          <h2>Add source candidate manually</h2>
          <label className={styles.field}>Source<select className={styles.select} value={form.sourceCode} onChange={(e) => setForm((f) => ({ ...f, sourceCode: e.target.value, licenceCandidate: e.target.value === 'DIKSHA' ? 'OTHER' : f.licenceCandidate }))}><option value="NROER">NROER</option><option value="DIKSHA">DIKSHA</option><option value="EXTERNAL_OFFICIAL">Other official external source</option></select></label>
          <label className={styles.field}>Resource title<input className={styles.input} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></label>
          <label className={styles.field}>Original source URL<input className={styles.input} type="url" value={form.sourceUrl} onChange={(e) => setForm((f) => ({ ...f, sourceUrl: e.target.value }))} placeholder={form.sourceCode === 'NROER' ? 'https://nroer.gov.in/…' : form.sourceCode === 'DIKSHA' ? 'https://diksha.gov.in/resources/play/content/…' : 'https://…'} /></label>
          <label className={styles.field}>Licence evidence<select className={styles.select} value={form.licenceCandidate || 'OTHER'} onChange={(e) => setForm((f) => ({ ...f, licenceCandidate: e.target.value }))}>{LICENCES.map((v) => <option key={v}>{v}</option>)}</select></label>
          <label className={styles.field}>Attribution evidence<textarea className={styles.textarea} style={{ minHeight: 100 }} value={form.attributionText || ''} onChange={(e) => setForm((f) => ({ ...f, attributionText: e.target.value }))} placeholder="Creator/author, institution/publisher, item title, visible copyright/licence statement and source." /></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <label className={styles.field}>Class hint<input className={styles.input} value={form.classHint || ''} onChange={(e) => setForm((f) => ({ ...f, classHint: e.target.value }))} /></label>
            <label className={styles.field}>Board hint<input className={styles.input} value={form.boardHint || ''} onChange={(e) => setForm((f) => ({ ...f, boardHint: e.target.value }))} /></label>
            <label className={styles.field}>Subject hint<input className={styles.input} value={form.subjectHint || ''} onChange={(e) => setForm((f) => ({ ...f, subjectHint: e.target.value }))} /></label>
          </div>
          <div className={styles.note}>NROER URLs are domain-validated. DIKSHA and other item-level-review sources should normally enter here from <Link href="/admin/learning/creator/discovery">Source Discovery</Link>; licence metadata must still be independently confirmed before approval.</div>
          <button className="btn-primary" disabled={createMutation.isPending || !form.title.trim() || !form.sourceUrl.trim()} onClick={() => createMutation.mutate()}>{createMutation.isPending ? 'Adding…' : 'Add to review queue'}</button>
        </section>

        <section className={styles.adminPanel}>
          <h2>Review queue</h2>
          <p style={{ color: 'rgba(255,255,255,.52)', lineHeight: 1.6 }}>Lifecycle: DISCOVERED → LICENCE REVIEW → CONTENT REVIEW → APPROVED → IMPORTED. Reject unclear rights, missing attribution, poor academic quality or unsafe material.</p>
          <div className={styles.adminList}>
            {(intakeQuery.data || []).map((item) => (
              <article className={styles.adminItem} key={item.id}>
                <div className={styles.adminItemTop}><div><strong>{item.title}</strong><p>{item.source_name} · {item.licence_candidate || 'Licence not verified'}{item.class_hint ? ` · ${item.class_hint}` : ''}{item.subject_hint ? ` · ${item.subject_hint}` : ''}</p></div><span className={styles.badge}>{item.status.replaceAll('_', ' ')}</span></div>
                <a href={item.source_url} target="_blank" rel="noopener noreferrer" style={{ color: '#8fc8ff', fontSize: 12 }}>Open original source ↗</a>
                {item.attribution_text ? <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 11 }}>Attribution: {item.attribution_text}</p> : <p style={{ color: '#ffc59d', fontSize: 11 }}>Attribution evidence not recorded.</p>}

                {editingId === item.id ? <div style={{ padding: 10, marginTop: 9, borderRadius: 9, border: '1px solid rgba(79,195,247,.25)', background: 'rgba(79,195,247,.05)' }}>
                  <label className={styles.field}>Verified licence<select className={styles.select} value={evidence.licenceCandidate} onChange={(e) => setEvidence((v) => ({ ...v, licenceCandidate: e.target.value }))}>{LICENCES.map((v) => <option key={v}>{v}</option>)}</select></label>
                  <label className={styles.field}>Verified attribution evidence<textarea className={styles.textarea} style={{ minHeight: 85 }} value={evidence.attributionText} onChange={(e) => setEvidence((v) => ({ ...v, attributionText: e.target.value }))} /></label>
                  <label className={styles.field}>Reviewer note<textarea className={styles.textarea} style={{ minHeight: 60 }} value={evidence.reviewerNote} onChange={(e) => setEvidence((v) => ({ ...v, reviewerNote: e.target.value }))} /></label>
                  <div style={{ display: 'flex', gap: 7 }}><button className="btn-primary" disabled={evidenceMutation.isPending} onClick={() => evidenceMutation.mutate({ id: item.id, draft: evidence })}>{evidenceMutation.isPending ? 'Saving…' : 'Save evidence'}</button><button className={styles.tinyButton} type="button" onClick={() => setEditingId('')}>Cancel</button></div>
                </div> : <button type="button" className={styles.tinyButton} style={{ marginTop: 8 }} onClick={() => beginEvidenceEdit(item)}>Edit licence & attribution evidence</button>}

                <div className={styles.statusRow}>{['LICENCE_REVIEW','CONTENT_REVIEW','APPROVED','REJECTED','IMPORTED'].map((status) => <button key={status} type="button" className={styles.tinyButton} disabled={statusMutation.isPending || item.status === status} onClick={() => statusMutation.mutate({ id: item.id, status })}>{status.replaceAll('_', ' ')}</button>)}</div>
                {item.status === 'APPROVED' && <div style={{ marginTop: 8, color: '#bdeed0', fontSize: 11 }}>✓ Approved source can now be selected in AI Content Creator. External grounding still requires an excerpt/evidence snapshot for the generation job.</div>}
              </article>
            ))}
            {!intakeQuery.data?.length && <p style={{ color: 'rgba(255,255,255,.5)' }}>No OER candidates in the intake queue yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
