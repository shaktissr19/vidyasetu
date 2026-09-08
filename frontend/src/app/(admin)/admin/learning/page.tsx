'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import LearningQualityPanel from '@/components/admin/LearningQualityPanel';
import {
  getLearningStudioResources,
  updateLearningStudioStatus,
  type LearningReviewStatus,
  type LearningStudioResource,
} from '@/services/adminLearningService';
import { apiErrorText } from '@/utils/errors';

const REVIEW_TRANSITIONS: Record<LearningReviewStatus, LearningReviewStatus[]> = {
  DRAFT: ['SUBMITTED', 'ARCHIVED'],
  SUBMITTED: ['DRAFT', 'ACADEMIC_REVIEW', 'ARCHIVED'],
  ACADEMIC_REVIEW: ['SUBMITTED', 'APPROVED', 'ARCHIVED'],
  APPROVED: ['ACADEMIC_REVIEW', 'PUBLISHED', 'ARCHIVED'],
  PUBLISHED: ['ARCHIVED'],
  ARCHIVED: ['DRAFT'],
};

function label(value: string): string { return value.replaceAll('_', ' '); }
function tone(status: string): string {
  if (status === 'PUBLISHED') return '#47d18c';
  if (status === 'APPROVED') return '#69c8ff';
  if (status === 'ACADEMIC_REVIEW' || status === 'SUBMITTED') return '#ffd166';
  if (status === 'ARCHIVED') return '#9aa4b2';
  return '#ff9f80';
}

export default function AdminLearningStudioPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | LearningReviewStatus>('ALL');
  const [search, setSearch] = useState('');

  const resourcesQuery = useQuery({
    queryKey: ['learning-studio-resources'],
    queryFn: () => getLearningStudioResources().then((r) => r.data.data || []),
  });

  const resources = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (resourcesQuery.data || []).filter((resource) => {
      if (statusFilter !== 'ALL' && resource.review_status !== statusFilter) return false;
      if (!q) return true;
      return [resource.title, resource.title_hi, resource.source_code, resource.resource_type, ...(resource.board_codes || [])]
        .filter(Boolean).some((value) => String(value).toLowerCase().includes(q));
    });
  }, [resourcesQuery.data, search, statusFilter]);

  const selected = useMemo(() => (resourcesQuery.data || []).find((resource) => resource.id === selectedId) || null, [resourcesQuery.data, selectedId]);

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: LearningReviewStatus }) => updateLearningStudioStatus(id, status),
    onSuccess: async (_response, variables) => {
      toast.success(`Resource moved to ${label(variables.status)}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['learning-studio-resources'] }),
        queryClient.invalidateQueries({ queryKey: ['learning-readiness', 'RESOURCE', variables.id] }),
        queryClient.invalidateQueries({ queryKey: ['content-factory-summary'] }),
      ]);
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Review transition blocked')),
  });

  return (
    <div style={{ padding: 24, color: 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: '#ff9a3c', fontSize: 12, fontWeight: 900, letterSpacing: '.12em' }}>CONTENT PLATFORM 3.0</div>
          <h1 style={{ fontSize: 34, margin: '5px 0' }}>Learning Review Studio</h1>
          <p style={{ color: 'rgba(255,255,255,.62)', maxWidth: 920, lineHeight: 1.65 }}>
            Review, approve and publish governed content. New Nursery–Class 12 resources, questions and assessments are created only through Content Factory so canonical grades and English + Hindi requirements cannot be bypassed.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/admin/learning/factory" className="btn-primary">Create in Content Factory</Link>
          <Link href="/admin/learning/coverage" className="btn-secondary">Coverage & quality</Link>
          <Link href="/admin/learning/practice" className="btn-secondary">Question Bank review</Link>
          <Link href="/admin/learning/intake" className="btn-secondary">OER Intake</Link>
          <Link href="/admin/learning/imports" className="btn-secondary">Bulk Import</Link>
        </div>
      </div>

      <div style={{ margin: '16px 0', padding: 12, borderRadius: 11, border: '1px solid rgba(71,209,140,.28)', background: 'rgba(71,209,140,.06)', color: '#c8f7dc', fontSize: 12 }}>
        Single governance chain: DRAFT → SUBMITTED → ACADEMIC REVIEW → APPROVED → PUBLISHED. Publication remains blocked by deterministic bilingual/canonical-grade readiness and human quality gates.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(390px,.9fr) minmax(480px,1.1fr)', gap: 18, alignItems: 'start' }}>
        <section style={{ border: '1px solid rgba(255,255,255,.1)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: 13, background: 'rgba(255,255,255,.05)' }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Resource review queue</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 8 }}>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, source, type…" style={{ padding: '9px 10px', borderRadius: 8, background: 'rgba(255,255,255,.05)', color: 'white', border: '1px solid rgba(255,255,255,.12)' }} />
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'ALL' | LearningReviewStatus)} style={{ padding: '9px 10px', borderRadius: 8, background: '#111a32', color: 'white', border: '1px solid rgba(255,255,255,.12)' }}>
                <option value="ALL">All statuses</option>{Object.keys(REVIEW_TRANSITIONS).map((status) => <option key={status} value={status}>{label(status)}</option>)}
              </select>
            </div>
          </div>
          {resourcesQuery.isLoading && <div style={{ padding: 16, color: 'rgba(255,255,255,.55)' }}>Loading governed resources…</div>}
          {resourcesQuery.isError && <div style={{ padding: 16, color: '#ffc1b8' }}>Resources could not be loaded.</div>}
          <div style={{ maxHeight: 720, overflowY: 'auto' }}>
            {resources.map((resource) => {
              const active = resource.id === selectedId;
              return <button key={resource.id} type="button" onClick={() => setSelectedId(resource.id)} style={{ width: '100%', textAlign: 'left', padding: 13, background: active ? 'rgba(79,195,247,.1)' : 'transparent', color: 'white', border: 0, borderBottom: '1px solid rgba(255,255,255,.07)', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><strong>{resource.title}</strong><span style={{ color: tone(resource.review_status), fontSize: 11, fontWeight: 900 }}>{label(resource.review_status)}</span></div>
                {resource.title_hi && <div style={{ marginTop: 3, color: 'rgba(255,255,255,.62)' }}>{resource.title_hi}</div>}
                <div style={{ marginTop: 5, fontSize: 11, color: 'rgba(255,255,255,.42)' }}>{resource.resource_type} · {resource.source_code} · {(resource.board_codes || []).join(', ') || 'No board'} · {resource.concept_count || 0} concept(s)</div>
              </button>;
            })}
            {!resourcesQuery.isLoading && resources.length === 0 && <div style={{ padding: 16, color: 'rgba(255,255,255,.55)' }}>No resources match this queue filter.</div>}
          </div>
        </section>

        <section>
          {!selected ? <div style={{ padding: 18, borderRadius: 14, border: '1px solid rgba(255,255,255,.1)', color: 'rgba(255,255,255,.55)' }}>Select a resource to inspect readiness evidence and move it through the governed review workflow.</div> : <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ padding: 16, borderRadius: 14, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.035)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}><div><h2 style={{ margin: 0 }}>{selected.title}</h2>{selected.title_hi && <div style={{ marginTop: 4, color: 'rgba(255,255,255,.62)' }}>{selected.title_hi}</div>}</div><div style={{ color: tone(selected.review_status), fontWeight: 900 }}>{label(selected.review_status)}</div></div>
              <div style={{ marginTop: 12, color: 'rgba(255,255,255,.52)', fontSize: 12, lineHeight: 1.7 }}>Type: <b>{selected.resource_type}</b> · Source: <b>{selected.source_name}</b> · Licence: <b>{selected.licence}</b><br />Boards: <b>{(selected.board_codes || []).join(', ') || '—'}</b> · Concept mappings: <b>{selected.concept_count || 0}</b></div>
              <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(REVIEW_TRANSITIONS[selected.review_status] || []).map((status) => <button key={status} type="button" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ id: selected.id, status })} className={status === 'PUBLISHED' ? 'btn-primary' : 'btn-secondary'}>{label(status)}</button>)}
              </div>
            </div>
            <LearningQualityPanel entityType="RESOURCE" entityId={selected.id} />
          </div>}
        </section>
      </div>
    </div>
  );
}
