'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  createLearningStudioIntake,
  getLearningStudioIntake,
  updateLearningStudioIntakeStatus,
  type SaveLearningStudioIntake,
} from '@/services/adminLearningService';
import { apiErrorText } from '@/utils/errors';
import styles from '@/components/public/publicLearning.module.css';

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

export default function LearningIntakePage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SaveLearningStudioIntake>(INITIAL);

  const intakeQuery = useQuery({ queryKey: ['learning-studio-intake'], queryFn: () => getLearningStudioIntake().then((r) => r.data.data || []) });
  const createMutation = useMutation({
    mutationFn: () => createLearningStudioIntake(form),
    onSuccess: async () => { toast.success('OER candidate added to review queue'); setForm(INITIAL); await queryClient.invalidateQueries({ queryKey: ['learning-studio-intake'] }); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not add intake item')),
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateLearningStudioIntakeStatus(id, status),
    onSuccess: async () => { toast.success('Intake review status updated'); await queryClient.invalidateQueries({ queryKey: ['learning-studio-intake'] }); },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not update intake status')),
  });

  return (
    <div className={styles.studio}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ color: '#ff9a3c', fontSize: 12, fontWeight: 900, letterSpacing: '.12em' }}>LEARNING PLATFORM · SOURCE GOVERNANCE</div>
        <h1 style={{ color: 'white', fontSize: 34, margin: '6px 0' }}>🌐 NROER / OER Intake</h1>
        <p style={{ color: 'rgba(255,255,255,.58)', maxWidth: 900, lineHeight: 1.7 }}>Discovery does not mean publication. Every candidate passes licence review and content review before it can be approved or imported into VidyaSetu.</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><Link className={styles.tinyButton} href="/admin/learning">← Learning Studio</Link><Link className={styles.tinyButton} href="/admin/learning/practice">Question Bank & Practice →</Link></div>
      </div>

      <div className={styles.adminGrid}>
        <section className={styles.adminPanel}>
          <h2>Add source candidate</h2>
          <label className={styles.field}>Source<select className={styles.select} value={form.sourceCode} onChange={(e) => setForm((f) => ({ ...f, sourceCode: e.target.value }))}><option value="NROER">NROER</option><option value="EXTERNAL_OFFICIAL">Other official external source</option></select></label>
          <label className={styles.field}>Resource title<input className={styles.input} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></label>
          <label className={styles.field}>Original source URL<input className={styles.input} type="url" value={form.sourceUrl} onChange={(e) => setForm((f) => ({ ...f, sourceUrl: e.target.value }))} placeholder="https://nroer.gov.in/…" /></label>
          <label className={styles.field}>Licence candidate<select className={styles.select} value={form.licenceCandidate || ''} onChange={(e) => setForm((f) => ({ ...f, licenceCandidate: e.target.value }))}>{['CC_BY','CC_BY_SA','PUBLIC_DOMAIN','EXTERNAL_LINK_ONLY','OTHER'].map((v) => <option key={v}>{v}</option>)}</select></label>
          <label className={styles.field}>Attribution evidence<textarea className={styles.textarea} style={{ minHeight: 100 }} value={form.attributionText || ''} onChange={(e) => setForm((f) => ({ ...f, attributionText: e.target.value }))} placeholder="Creator / institution, title, source and licence statement visible on the item." /></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <label className={styles.field}>Class hint<input className={styles.input} value={form.classHint || ''} onChange={(e) => setForm((f) => ({ ...f, classHint: e.target.value }))} /></label>
            <label className={styles.field}>Board hint<input className={styles.input} value={form.boardHint || ''} onChange={(e) => setForm((f) => ({ ...f, boardHint: e.target.value }))} /></label>
            <label className={styles.field}>Subject hint<input className={styles.input} value={form.subjectHint || ''} onChange={(e) => setForm((f) => ({ ...f, subjectHint: e.target.value }))} /></label>
          </div>
          <div className={styles.note}>For NROER, the backend requires a real <strong>nroer.gov.in</strong> URL. Approval is blocked until a verified open/link-only licence and attribution are recorded.</div>
          <button className="btn-primary" disabled={createMutation.isPending || !form.title.trim() || !form.sourceUrl.trim()} onClick={() => createMutation.mutate()}>{createMutation.isPending ? 'Adding…' : 'Add to review queue'}</button>
        </section>

        <section className={styles.adminPanel}>
          <h2>Review queue</h2>
          <p style={{ color: 'rgba(255,255,255,.52)', lineHeight: 1.6 }}>Recommended lifecycle: DISCOVERED → LICENCE REVIEW → CONTENT REVIEW → APPROVED → IMPORTED. Reject anything with unclear rights, poor academic quality or unsafe/irrelevant material.</p>
          <div className={styles.adminList}>
            {(intakeQuery.data || []).map((item) => (
              <article className={styles.adminItem} key={item.id}>
                <div className={styles.adminItemTop}><div><strong>{item.title}</strong><p>{item.source_name} · {item.licence_candidate || 'Licence not verified'}{item.class_hint ? ` · Class ${item.class_hint}` : ''}{item.subject_hint ? ` · ${item.subject_hint}` : ''}</p></div><span className={styles.badge}>{item.status.replaceAll('_', ' ')}</span></div>
                <a href={item.source_url} target="_blank" rel="noopener noreferrer" style={{ color: '#8fc8ff', fontSize: 12 }}>Open original source ↗</a>
                {item.attribution_text && <p style={{ color: 'rgba(255,255,255,.48)', fontSize: 11 }}>Attribution: {item.attribution_text}</p>}
                <div className={styles.statusRow}>{['LICENCE_REVIEW','CONTENT_REVIEW','APPROVED','REJECTED','IMPORTED'].map((status) => <button key={status} type="button" className={styles.tinyButton} disabled={statusMutation.isPending || item.status === status} onClick={() => statusMutation.mutate({ id: item.id, status })}>{status.replaceAll('_', ' ')}</button>)}</div>
              </article>
            ))}
            {!intakeQuery.data?.length && <p style={{ color: 'rgba(255,255,255,.5)' }}>No OER candidates in the intake queue yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
