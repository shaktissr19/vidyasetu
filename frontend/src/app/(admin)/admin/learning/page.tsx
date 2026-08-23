'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  createLearningStudioResource,
  getLearningStudioOptions,
  getLearningStudioResources,
  updateLearningStudioStatus,
  type SaveLearningStudioResource,
} from '@/services/adminLearningService';
import type { LearningCategory } from '@/services/publicService';
import { apiErrorText } from '@/utils/errors';
import styles from '@/components/public/publicLearning.module.css';

const CATEGORIES: Array<{ value: LearningCategory; label: string }> = [
  { value: 'ACADEMIC', label: 'Academic' },
  { value: 'MOTIVATION', label: 'Motivation' },
  { value: 'STUDY_SKILLS', label: 'Study Skills' },
  { value: 'WORK_ETHIC', label: 'Work Ethic' },
  { value: 'SOCIAL_RESPONSIBILITY', label: 'Social Responsibility' },
  { value: 'LIFE_SKILLS', label: 'Life Skills' },
  { value: 'WELLBEING', label: 'Well-being' },
  { value: 'CAREER_AWARENESS', label: 'Career Awareness' },
  { value: 'DIGITAL_CITIZENSHIP', label: 'Digital Citizenship' },
];

const INITIAL: SaveLearningStudioResource = {
  title: '',
  summary: '',
  bodyMarkdown: '',
  resourceType: 'ARTICLE',
  category: 'MOTIVATION',
  visibility: 'PUBLIC',
  reviewStatus: 'DRAFT',
  language: 'en',
  classMin: 6,
  classMax: 12,
  sourceCode: 'VIDYASETU_ORIGINAL',
  licence: 'VIDYASETU_ORIGINAL',
  boardCodes: ['COMMON'],
  isFeaturedPublic: false,
};

export default function AdminLearningStudioPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SaveLearningStudioResource>(INITIAL);

  const optionsQuery = useQuery({
    queryKey: ['learning-studio-options'],
    queryFn: () => getLearningStudioOptions().then((response) => response.data.data),
  });
  const resourcesQuery = useQuery({
    queryKey: ['learning-studio-resources'],
    queryFn: () => getLearningStudioResources().then((response) => response.data.data || []),
  });

  const selectedSource = useMemo(
    () => optionsQuery.data?.sources.find((source) => source.code === form.sourceCode),
    [optionsQuery.data, form.sourceCode],
  );

  const createMutation = useMutation({
    mutationFn: () => createLearningStudioResource(form),
    onSuccess: async () => {
      toast.success('Learning resource created');
      setForm(INITIAL);
      await queryClient.invalidateQueries({ queryKey: ['learning-studio-resources'] });
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not create learning resource')),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateLearningStudioStatus(id, status),
    onSuccess: async () => {
      toast.success('Review status updated');
      await queryClient.invalidateQueries({ queryKey: ['learning-studio-resources'] });
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not update status')),
  });

  function toggleBoard(code: string): void {
    setForm((current) => {
      const selected = current.boardCodes || [];
      const next = selected.includes(code) ? selected.filter((item) => item !== code) : [...selected, code];
      return { ...current, boardCodes: next.length ? next : ['COMMON'] };
    });
  }

  function changeSource(code: string): void {
    const source = optionsQuery.data?.sources.find((item) => item.code === code);
    setForm((current) => ({
      ...current,
      sourceCode: code,
      licence: (source?.default_license || 'OTHER') as SaveLearningStudioResource['licence'],
      resourceType: code === 'NROER' ? 'EXTERNAL_LINK' : current.resourceType,
      visibility: code === 'NROER' ? 'PUBLIC' : current.visibility,
    }));
  }

  return (
    <div className={styles.studio}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ color: '#ff9a3c', fontSize: 12, fontWeight: 900, letterSpacing: '.12em' }}>VIDYASETU LEARNING PLATFORM</div>
        <h1 style={{ color: 'white', fontSize: 34, margin: '6px 0' }}>📚 Learning Studio</h1>
        <p style={{ color: 'rgba(255,255,255,.56)', maxWidth: 850, lineHeight: 1.7 }}>
          Create VidyaSetu Original learning and life-skills resources, register open educational resources with explicit licence/attribution,
          and control what becomes public. “Free on the internet” is never treated as permission to copy.
        </p>
      </div>

      <div className={styles.adminGrid}>
        <section className={styles.adminPanel}>
          <h2>Create learning resource</h2>

          <label className={styles.field}>Title
            <input className={styles.input} value={form.title} onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))} />
          </label>
          <label className={styles.field}>Summary
            <textarea className={styles.textarea} style={{ minHeight: 82 }} value={form.summary || ''} onChange={(event) => setForm((value) => ({ ...value, summary: event.target.value }))} />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label className={styles.field}>Category
              <select className={styles.select} value={form.category} onChange={(event) => setForm((value) => ({ ...value, category: event.target.value as LearningCategory }))}>
                {CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className={styles.field}>Resource type
              <select className={styles.select} value={form.resourceType} onChange={(event) => setForm((value) => ({ ...value, resourceType: event.target.value as SaveLearningStudioResource['resourceType'] }))}>
                {['ARTICLE','VIDEO','AUDIO','PDF','WORKSHEET','QUIZ','QUESTION_PAPER','INTERACTIVE','EXTERNAL_LINK'].map((type) => <option key={type}>{type}</option>)}
              </select>
            </label>
            <label className={styles.field}>Visibility
              <select className={styles.select} value={form.visibility} onChange={(event) => setForm((value) => ({ ...value, visibility: event.target.value as SaveLearningStudioResource['visibility'] }))}>
                {['PUBLIC','REGISTERED','CLASS_ONLY','SCHOOL_ONLY'].map((type) => <option key={type}>{type}</option>)}
              </select>
            </label>
            <label className={styles.field}>Initial review state
              <select className={styles.select} value={form.reviewStatus} onChange={(event) => setForm((value) => ({ ...value, reviewStatus: event.target.value as SaveLearningStudioResource['reviewStatus'] }))}>
                {['DRAFT','SUBMITTED','ACADEMIC_REVIEW','APPROVED','PUBLISHED'].map((type) => <option key={type}>{type}</option>)}
              </select>
            </label>
            <label className={styles.field}>From class
              <input className={styles.input} type="number" min={1} max={12} value={form.classMin || ''} onChange={(event) => setForm((value) => ({ ...value, classMin: event.target.value ? Number(event.target.value) : null }))} />
            </label>
            <label className={styles.field}>To class
              <input className={styles.input} type="number" min={1} max={12} value={form.classMax || ''} onChange={(event) => setForm((value) => ({ ...value, classMax: event.target.value ? Number(event.target.value) : null }))} />
            </label>
          </div>

          <label className={styles.field}>Content source
            <select className={styles.select} value={form.sourceCode} onChange={(event) => changeSource(event.target.value)}>
              {(optionsQuery.data?.sources || []).map((source) => <option key={source.code} value={source.code}>{source.name}</option>)}
            </select>
          </label>

          {selectedSource && (
            <div style={{ border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, padding: 11, marginBottom: 14, color: 'rgba(255,255,255,.62)', fontSize: 11, lineHeight: 1.6 }}>
              Default licence: <b>{selectedSource.default_license}</b><br />
              Item-level licence check: <b>{selectedSource.requires_item_license_check ? 'Required' : 'Not required'}</b><br />
              Rehosting by default: <b>{selectedSource.allow_rehosting_default ? 'Allowed' : 'No'}</b>
            </div>
          )}

          <label className={styles.field}>Licence
            <select className={styles.select} value={form.licence} onChange={(event) => setForm((value) => ({ ...value, licence: event.target.value as SaveLearningStudioResource['licence'] }))}>
              {['VIDYASETU_ORIGINAL','CC_BY','CC_BY_SA','CC_BY_NC_SA','CC_BY_NC_ND','PUBLIC_DOMAIN','EXTERNAL_LINK_ONLY','OTHER'].map((licence) => <option key={licence}>{licence}</option>)}
            </select>
          </label>

          {form.sourceCode !== 'VIDYASETU_ORIGINAL' && (
            <>
              <label className={styles.field}>Original source URL
                <input className={styles.input} type="url" value={form.sourceUrl || ''} onChange={(event) => setForm((value) => ({ ...value, sourceUrl: event.target.value }))} placeholder="https://…" />
              </label>
              <label className={styles.field}>Attribution
                <textarea className={styles.textarea} style={{ minHeight: 80 }} value={form.attributionText || ''} onChange={(event) => setForm((value) => ({ ...value, attributionText: event.target.value }))} placeholder="Creator, title, source, licence…" />
              </label>
              <label className={styles.field}>External resource URL
                <input className={styles.input} type="url" value={form.externalUrl || ''} onChange={(event) => setForm((value) => ({ ...value, externalUrl: event.target.value }))} placeholder="https://…" />
              </label>
            </>
          )}

          {form.resourceType === 'ARTICLE' && (
            <label className={styles.field}>Article body
              <textarea className={styles.textarea} value={form.bodyMarkdown || ''} onChange={(event) => setForm((value) => ({ ...value, bodyMarkdown: event.target.value }))} placeholder={'## Section heading\nArticle paragraph…'} />
            </label>
          )}

          <div className={styles.field}>Boards
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(optionsQuery.data?.boards || []).map((board) => {
                const active = (form.boardCodes || []).includes(board.code);
                return <button type="button" key={board.code} className={styles.tinyButton} style={active ? { borderColor: '#ff8d32', color: '#ffb27a' } : undefined} onClick={() => toggleBoard(board.code)}>{board.short_name || board.code}</button>;
              })}
            </div>
          </div>

          <label className={styles.field} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <input type="checkbox" checked={Boolean(form.isFeaturedPublic)} onChange={(event) => setForm((value) => ({ ...value, isFeaturedPublic: event.target.checked }))} />
            Feature on public Learning / homepage
          </label>

          <button
            className="btn-primary"
            disabled={createMutation.isPending || !form.title.trim() || (form.resourceType === 'ARTICLE' && !form.bodyMarkdown?.trim())}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? 'Saving…' : 'Create resource'}
          </button>
        </section>

        <section className={styles.adminPanel}>
          <h2>Library & review workflow</h2>
          <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 12, lineHeight: 1.6 }}>
            Recommended path: DRAFT → SUBMITTED → ACADEMIC REVIEW → APPROVED → PUBLISHED. Public resources only appear after PUBLISHED.
          </p>
          {resourcesQuery.isLoading ? <p>Loading…</p> : (
            <div className={styles.adminList}>
              {(resourcesQuery.data || []).map((resource) => (
                <article className={styles.adminItem} key={resource.id}>
                  <div className={styles.adminItemTop}>
                    <div>
                      <strong>{resource.title}</strong>
                      <p>{resource.source_name} · {resource.category.replaceAll('_', ' ')} · {resource.visibility} · {resource.licence}</p>
                    </div>
                    <span className={styles.badge}>{resource.review_status.replaceAll('_', ' ')}</span>
                  </div>
                  <div className={styles.pillRow}>
                    {(resource.board_codes || []).map((board) => <span className={styles.pill} key={board}>{board}</span>)}
                    {resource.class_min && <span className={styles.pill}>Class {resource.class_min}{resource.class_max && resource.class_max !== resource.class_min ? `–${resource.class_max}` : ''}</span>}
                  </div>
                  <div className={styles.statusRow}>
                    {['SUBMITTED','ACADEMIC_REVIEW','APPROVED','PUBLISHED','ARCHIVED'].map((status) => (
                      <button type="button" key={status} className={styles.tinyButton} disabled={statusMutation.isPending || resource.review_status === status} onClick={() => statusMutation.mutate({ id: resource.id, status })}>{status.replaceAll('_', ' ')}</button>
                    ))}
                  </div>
                </article>
              ))}
              {!resourcesQuery.data?.length && <p style={{ color: 'rgba(255,255,255,.5)' }}>No Learning Studio resources yet.</p>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
