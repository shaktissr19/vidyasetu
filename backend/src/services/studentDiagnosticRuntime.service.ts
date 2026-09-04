import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { transaction } from '../config/db';
import { captureAttemptEvidenceAndRefresh } from './studentDiagnosticIntelligence.service';

interface StudentRow extends QueryResultRow {
  id: UUID;
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
