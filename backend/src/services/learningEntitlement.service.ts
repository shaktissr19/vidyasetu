import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';

export type LearningAccessRequirement = 'PUBLIC' | 'REGISTERED' | 'SUBSCRIBER';
export type LearningAccessTier = 'REGISTERED' | 'SUBSCRIBER' | 'SCHOOL_LICENSED';

interface EntitlementRow extends QueryResultRow {
  student_id: UUID;
  school_id: UUID | null;
  individual_subscriber: boolean;
  school_licensed: boolean;
}

interface AccessRow extends QueryResultRow {
  id: UUID;
  access_requirement: LearningAccessRequirement;
}

export interface LearningAccessContext {
  studentId: UUID;
  schoolId: UUID | null;
  tier: LearningAccessTier;
  individualSubscriber: boolean;
  schoolLicensed: boolean;
  subscriberAccess: boolean;
}

function appError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

/**
 * Commercial Learning entitlement is intentionally independent from content
 * visibility. A REGISTERED resource can be free for every signed-in learner;
 * a SUBSCRIBER resource needs either an active individual subscription or an
 * active school Learning licence.
 */
export async function getLearningAccessContext(userId: UUID): Promise<LearningAccessContext> {
  const { rows: [row] } = await query<EntitlementRow>(
    `SELECT s.id AS student_id,
            s.school_id,
            EXISTS (
              SELECT 1
              FROM learning_entitlements le
              WHERE le.user_id=$1::uuid
                AND le.entitlement_code='LEARNING_SUBSCRIBER'
                AND le.status='ACTIVE'
                AND le.starts_at <= NOW()
                AND (le.ends_at IS NULL OR le.ends_at > NOW())
            ) AS individual_subscriber,
            CASE WHEN s.school_id IS NULL THEN FALSE ELSE EXISTS (
              SELECT 1
              FROM learning_entitlements le
              WHERE le.school_id=s.school_id
                AND le.entitlement_code='LEARNING_SCHOOL_LICENSE'
                AND le.status='ACTIVE'
                AND le.starts_at <= NOW()
                AND (le.ends_at IS NULL OR le.ends_at > NOW())
            ) END AS school_licensed
     FROM students s
     WHERE s.user_id=$1::uuid AND s.status='ACTIVE'`,
    [userId],
  );

  if (!row) throw appError('Student profile not found', 404);

  const individualSubscriber = Boolean(row.individual_subscriber);
  const schoolLicensed = Boolean(row.school_licensed);
  const tier: LearningAccessTier = schoolLicensed
    ? 'SCHOOL_LICENSED'
    : individualSubscriber
      ? 'SUBSCRIBER'
      : 'REGISTERED';

  return {
    studentId: row.student_id,
    schoolId: row.school_id,
    tier,
    individualSubscriber,
    schoolLicensed,
    subscriberAccess: individualSubscriber || schoolLicensed,
  };
}

export function canAccessLearningRequirement(
  requirement: LearningAccessRequirement | string | null | undefined,
  access: LearningAccessContext,
): boolean {
  const normalized = String(requirement || 'REGISTERED').toUpperCase();
  if (normalized === 'PUBLIC' || normalized === 'REGISTERED') return true;
  if (normalized === 'SUBSCRIBER') return access.subscriberAccess;
  return false;
}

export function learningAccessLockReason(
  requirement: LearningAccessRequirement | string | null | undefined,
  access: LearningAccessContext,
): string | null {
  if (canAccessLearningRequirement(requirement, access)) return null;
  if (String(requirement || '').toUpperCase() === 'SUBSCRIBER') {
    return 'Subscriber Learning access required';
  }
  return 'Learning access not available';
}

export async function accessibleLearningResourceIds(
  resourceIds: UUID[],
  access: LearningAccessContext,
): Promise<Set<string>> {
  if (!resourceIds.length) return new Set<string>();
  const { rows } = await query<AccessRow>(
    `SELECT id, access_requirement
     FROM learning_resources
     WHERE id=ANY($1::uuid[])`,
    [resourceIds],
  );
  return new Set(
    rows
      .filter((row) => canAccessLearningRequirement(row.access_requirement, access))
      .map((row) => String(row.id)),
  );
}

export async function accessibleLearningAssessmentIds(
  assessmentIds: UUID[],
  access: LearningAccessContext,
): Promise<Set<string>> {
  if (!assessmentIds.length) return new Set<string>();
  const { rows } = await query<AccessRow>(
    `SELECT id, access_requirement
     FROM learning_assessments
     WHERE id=ANY($1::uuid[])`,
    [assessmentIds],
  );
  return new Set(
    rows
      .filter((row) => canAccessLearningRequirement(row.access_requirement, access))
      .map((row) => String(row.id)),
  );
}
