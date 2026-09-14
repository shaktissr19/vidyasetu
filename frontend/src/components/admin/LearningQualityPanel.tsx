'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  getLearningEntityReadiness,
  setLearningQualityGate,
  type QualityEntityType,
  type QualityGateStatus,
} from '@/services/adminLearningService';
import { apiErrorText } from '@/utils/errors';

const ALLOW_NA = new Set(['ACCESSIBILITY', 'SAFETY']);

export default function LearningQualityPanel({ entityType, entityId }: { entityType: QualityEntityType; entityId: string }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const queryKey = useMemo(() => ['learning-readiness', entityType, entityId], [entityId, entityType]);
  const readinessQuery = useQuery({
    queryKey,
    queryFn: () => getLearningEntityReadiness(entityType, entityId).then((response) => response.data.data),
    enabled: Boolean(entityId),
  });

  const gateMutation = useMutation({
    mutationFn: ({ gateCode, status }: { gateCode: string; status: QualityGateStatus }) =>
      setLearningQualityGate(entityType, entityId, gateCode, status, notes[gateCode] || null),
    onSuccess: async () => {
      toast.success('Quality gate saved');
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: unknown) => toast.error(apiErrorText(error, 'Could not save quality gate')),
  });

  if (readinessQuery.isLoading) return <div style={{ padding: 14, color: '#667085' }}>Loading readiness…</div>;
  if (readinessQuery.isError || !readinessQuery.data) return <div style={{ padding: 14, color: '#B42318' }}>Readiness could not be loaded.</div>;

  const readiness = readinessQuery.data;
  const tone = readiness.readyForPublication ? '#147D4A' : readiness.score >= 75 ? '#B26A00' : '#B42318';

  return (
    <div className="admin-panel" style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#667085', fontSize: 11, fontWeight: 800, letterSpacing: '.08em' }}>{entityType} READINESS</div>
          <div style={{ color: '#14213D', fontSize: 22, fontWeight: 900, marginTop: 3 }}>{readiness.score}/100</div>
        </div>
        <div style={{ color: tone, fontWeight: 900 }}>{readiness.readyForPublication ? 'LEARNER / PUBLISH READY' : readiness.readyForApproval ? 'APPROVAL READY' : 'BLOCKED'}</div>
      </div>

      <div style={{ display: 'grid', gap: 7, marginTop: 14 }}>
        {readiness.checks.map((check) => (
          <div key={check.code} style={{ display: 'grid', gridTemplateColumns: '24px minmax(160px,1fr) 2fr', gap: 8, alignItems: 'start', fontSize: 12 }}>
            <span>{check.passed ? '✅' : '❌'}</span>
            <strong style={{ color: check.passed ? '#147D4A' : '#B42318' }}>{check.label}</strong>
            <span style={{ color: '#667085' }}>{check.passed ? 'Complete' : check.reason}</span>
          </div>
        ))}
      </div>

      <h4 style={{ color: '#14213D', margin: '18px 0 8px' }}>Human quality gates</h4>
      <div style={{ display: 'grid', gap: 9 }}>
        {readiness.manualGates.map((gate) => {
          const noteValue = notes[gate.gateCode] ?? gate.note ?? '';
          return (
            <div key={gate.gateCode} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,1fr) 150px minmax(180px,1.4fr) 74px', gap: 8, alignItems: 'center' }}>
              <div style={{ color: '#344054', fontSize: 12, fontWeight: 800 }}>{gate.gateCode.replaceAll('_', ' ')}</div>
              <select defaultValue={gate.status} id={`gate-${entityType}-${entityId}-${gate.gateCode}`} className="admin-select" style={{ marginTop: 0 }}>
                <option value="PENDING">PENDING</option><option value="PASS">PASS</option><option value="FAIL">FAIL</option>{ALLOW_NA.has(gate.gateCode) && <option value="NOT_APPLICABLE">N/A</option>}
              </select>
              <input value={noteValue} onChange={(event) => setNotes((current) => ({ ...current, [gate.gateCode]: event.target.value }))} placeholder="Reviewer note" className="admin-input" style={{ marginTop: 0 }} />
              <button type="button" disabled={gateMutation.isPending} onClick={() => { const element = document.getElementById(`gate-${entityType}-${entityId}-${gate.gateCode}`) as HTMLSelectElement | null; gateMutation.mutate({ gateCode: gate.gateCode, status: (element?.value || gate.status) as QualityGateStatus }); }} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#14213D', fontWeight: 800, cursor: 'pointer' }}>Save</button>
            </div>
          );
        })}
      </div>

      {readiness.blockers.length > 0 && <div style={{ marginTop: 15, padding: 12, borderRadius: 10, background: '#FFF1F0', border: '1px solid #FDA29B' }}><strong style={{ color: '#B42318' }}>Current blockers</strong><ul style={{ margin: '8px 0 0 18px', color: '#7A271A', fontSize: 12, lineHeight: 1.6 }}>{readiness.blockers.slice(0,10).map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></div>}
    </div>
  );
}
