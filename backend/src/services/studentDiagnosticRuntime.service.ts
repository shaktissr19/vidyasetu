import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { transaction } from '../config/db';
import { captureAttemptEvidenceAndRefresh } from './studentDiagnosticIntelligence.service';

interface StudentRow extends QueryResultRow {
  id: UUID;
}

interface AttemptRow extends QueryResultRow {
  id: UUID;
  assessment_id: UUID;
}

/**
 * Idempotent bridge from the existing assessment runtime into Diagnostic 2.0.
 * Kept as a separate service so the established grading implementation does
 * not need to duplicate evidence/intelligence rules.
 */
export async function captureAttemptEvidenceForUser(
  userId: UUID,
  attemptId: UUID,
  assessmentId: UUID,
): Promise<void> {
  await transaction(async (client) => {
    const { rows: [student] } = await client.query<StudentRow>(
      `SELECT id FROM students WHERE user_id=$1 AND status='ACTIVE'`,
      [userId],
    );
    if (!student) throw Object.assign(new Error('Student profile not found'), { statusCode: 404 });
    await captureAttemptEvidenceAndRefresh(client, student.id, attemptId, assessmentId);
  });
}

/**
 * Repair/reconcile graded attempts that pre-date Diagnostic 2.0 or whose
 * evidence capture was interrupted after grading. The evidence ledger's
 * unique key makes this safe to execute repeatedly.
 */
export async function reconcileMissingEvidenceForUser(userId: UUID, limit = 200): Promise<number> {
  return transaction(async (client) => {
    const { rows: [student] } = await client.query<StudentRow>(
      `SELECT id FROM students WHERE user_id=$1 AND status='ACTIVE'`,
      [userId],
    );
    if (!student) throw Object.assign(new Error('Student profile not found'), { statusCode: 404 });

    const { rows: attempts } = await client.query<AttemptRow>(
      `SELECT sla.id,sla.assessment_id
       FROM student_learning_attempts sla
       WHERE sla.student_id=$1 AND sla.status='GRADED'
         AND NOT EXISTS (
           SELECT 1 FROM student_learning_evidence sle
           WHERE sle.student_id=$1 AND sle.attempt_id=sla.id
         )
       ORDER BY sla.submitted_at ASC NULLS LAST,sla.created_at ASC
       LIMIT $2`,
      [student.id, Math.max(1, Math.min(limit, 500))],
    );

    for (const attempt of attempts) {
      await captureAttemptEvidenceAndRefresh(client, student.id, attempt.id, attempt.assessment_id);
    }
    return attempts.length;
  });
}