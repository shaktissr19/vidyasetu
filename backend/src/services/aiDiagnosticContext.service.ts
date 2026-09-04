import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';

export interface AIDiagnosticContext {
  conceptId: UUID;
  conceptCode: string;
  conceptName: string;
  proficiencyScore: number;
  confidenceScore: number;
  confidenceLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  evidenceCount: number;
  retentionStatus: 'NOT_ASSESSED' | 'ACTIVE_LEARNING' | 'STABLE' | 'REVIEW_SOON' | 'REVIEW_DUE';
  nextReviewAt: string | Date | null;
  dominantMisconceptionCode: string | null;
  misconceptionState: 'SUSPECTED' | 'ACTIVE' | 'RESOLVED' | null;
}

interface ContextRow extends QueryResultRow {
  concept_id: UUID;
  concept_code: string;
  concept_name: string;
  proficiency_score: number | string;
  confidence_score: number | string;
  confidence_level: AIDiagnosticContext['confidenceLevel'];
  evidence_count: number;
  retention_status: AIDiagnosticContext['retentionStatus'];
  next_review_at: string | Date | null;
  dominant_misconception_code: string | null;
  misconception_state: AIDiagnosticContext['misconceptionState'];
}

/**
 * Returns only explainable learner evidence for the authenticated Student.
 * The caller already owns studentId; no broader learner lookup is performed.
 */
export async function getAIDiagnosticContext(
  studentId: UUID,
  conceptCode?: string | null,
): Promise<AIDiagnosticContext | null> {
  const values: unknown[] = [studentId];
  const conceptFilter = conceptCode?.trim()
    ? (values.push(conceptCode.trim()), `AND lc.code=$${values.length}`)
    : '';

  const { rows: [row] } = await query<ContextRow>(
    `SELECT sci.concept_id,lc.code AS concept_code,lc.name AS concept_name,
            sci.proficiency_score::float,sci.confidence_score::float,
            sci.confidence_level,sci.evidence_count,sci.retention_status,sci.next_review_at,
            sci.dominant_misconception_code,scm.state AS misconception_state
     FROM student_concept_intelligence sci
     JOIN learning_concepts lc ON lc.id=sci.concept_id AND lc.is_active=TRUE
     LEFT JOIN student_concept_misconceptions scm
       ON scm.student_id=sci.student_id
      AND scm.concept_id=sci.concept_id
      AND scm.misconception_code=sci.dominant_misconception_code
     WHERE sci.student_id=$1 ${conceptFilter}
     ORDER BY
       CASE sci.retention_status WHEN 'REVIEW_DUE' THEN 0 WHEN 'REVIEW_SOON' THEN 1 ELSE 2 END,
       CASE WHEN scm.state='ACTIVE' THEN 0 WHEN scm.state='SUSPECTED' THEN 1 ELSE 2 END,
       sci.confidence_score ASC,sci.proficiency_score ASC,sci.last_evidence_at DESC NULLS LAST
     LIMIT 1`,
    values,
  );
  if (!row) return null;

  return {
    conceptId: row.concept_id,
    conceptCode: row.concept_code,
    conceptName: row.concept_name,
    proficiencyScore: Number(row.proficiency_score || 0),
    confidenceScore: Number(row.confidence_score || 0),
    confidenceLevel: row.confidence_level,
    evidenceCount: Number(row.evidence_count || 0),
    retentionStatus: row.retention_status,
    nextReviewAt: row.next_review_at,
    dominantMisconceptionCode: row.dominant_misconception_code,
    misconceptionState: row.misconception_state,
  };
}

export function diagnosticContextAsTutorHistory(context: AIDiagnosticContext | null): string | null {
  if (!context) return null;
  return [
    'VIDYASETU VERIFIED LEARNER EVIDENCE — use as private tutoring context, not as a score to shame or label the learner.',
    `Concept: ${context.conceptName} (${context.conceptCode})`,
    `Proficiency evidence: ${Math.round(context.proficiencyScore)} / 100`,
    `Confidence in that estimate: ${context.confidenceLevel} (${Math.round(context.confidenceScore)} / 100) from ${context.evidenceCount} evidence item(s)`,
    `Retention: ${context.retentionStatus}${context.nextReviewAt ? `; next review ${new Date(context.nextReviewAt).toISOString()}` : ''}`,
    context.dominantMisconceptionCode
      ? `Misconception signal: ${context.dominantMisconceptionCode} (${context.misconceptionState || 'SUSPECTED'})`
      : 'Misconception signal: none active in current evidence',
    'Use this evidence to choose explanation depth and the next helpful step. Do not claim certainty when confidence is LOW/NONE. Historical mastery is not erased merely because retention review is due.',
  ].join('\n');
}
