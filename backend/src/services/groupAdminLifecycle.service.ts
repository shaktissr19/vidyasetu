import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';
import { saveNotification } from './notification.service';

type GroupDecision = 'ACTIVE' | 'REJECTED';
type GroupLifecycleStatus = 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
type GroupReportStatus = 'REVIEWING' | 'RESOLVED' | 'DISMISSED';

interface GroupAdminRow extends QueryResultRow {
  id: UUID;
  name: string;
  owner_id: UUID;
  school_id: UUID | null;
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED' | 'ARCHIVED';
}

function httpError(message: string, statusCode: number): Error {
  return Object.assign(new Error(message), { statusCode });
}

async function getGroup(groupId: UUID): Promise<GroupAdminRow> {
  const { rows: [group] } = await query<GroupAdminRow>(
    `SELECT id, name, owner_id, school_id, status
     FROM collaboration_groups
     WHERE id = $1`,
    [groupId],
  );
  if (!group) throw httpError('Group not found', 404);
  return group;
}

async function audit(
  adminId: UUID,
  action: string,
  entityType: string,
  entityId: UUID,
  schoolId: UUID | null,
  payload?: unknown,
): Promise<void> {
  await query(
    `INSERT INTO audit_log (actor_id, actor_role, school_id, action, entity_type, entity_id, new_value)
     VALUES ($1, 'SUPER_ADMIN', $2, $3, $4, $5, $6)`,
    [adminId, schoolId, action, entityType, entityId, payload === undefined ? null : JSON.stringify(payload)],
  );
}

export async function decideGroup(
  groupId: UUID,
  adminId: UUID,
  decision: GroupDecision,
  note?: string | null,
) {
  const group = await getGroup(groupId);
  if (group.status !== 'PENDING') throw httpError('Only pending Groups can be approved or rejected', 409);

  const isApproved = decision === 'ACTIVE';
  const { rows: [updated] } = await query<GroupAdminRow>(
    `UPDATE collaboration_groups
     SET status = $1::collaboration_group_status,
         admin_note = $2,
         approved_by = COALESCE($3::uuid, approved_by),
         approved_at = COALESCE($4::timestamptz, approved_at),
         rejected_at = COALESCE($5::timestamptz, rejected_at)
     WHERE id = $6
     RETURNING id, name, owner_id, school_id, status`,
    [
      decision,
      note?.trim() || null,
      isApproved ? adminId : null,
      isApproved ? new Date() : null,
      isApproved ? null : new Date(),
      groupId,
    ],
  );
  if (!updated) throw httpError('Group not found', 404);

  await saveNotification({
    userId: group.owner_id,
    schoolId: group.school_id,
    type: isApproved ? 'GROUP_APPROVED' : 'GROUP_REJECTED',
    title: isApproved ? `Group approved: ${group.name}` : `Group request declined: ${group.name}`,
    body: isApproved ? 'Your Group is now active and can accept members.' : (note?.trim() || 'Your Group request was not approved.'),
    refId: group.id,
    refType: 'COLLABORATION_GROUP',
  });
  await audit(adminId, isApproved ? 'GROUP_APPROVED' : 'GROUP_REJECTED', 'COLLABORATION_GROUP', group.id, group.school_id, { note: note || null });
  return updated;
}

export async function updateGroupStatus(
  groupId: UUID,
  adminId: UUID,
  status: GroupLifecycleStatus,
  note?: string | null,
) {
  const group = await getGroup(groupId);
  if (group.status === 'PENDING') throw httpError('Use approve/reject for pending Groups', 409);

  const { rows: [updated] } = await query<GroupAdminRow>(
    `UPDATE collaboration_groups
     SET status = $1::collaboration_group_status,
         admin_note = $2,
         suspended_at = CASE WHEN $3::boolean THEN NOW() ELSE suspended_at END,
         archived_at = CASE WHEN $4::boolean THEN NOW() ELSE archived_at END
     WHERE id = $5
     RETURNING id, name, owner_id, school_id, status`,
    [status, note?.trim() || null, status === 'SUSPENDED', status === 'ARCHIVED', groupId],
  );
  if (!updated) throw httpError('Group not found', 404);
  await audit(adminId, `GROUP_${status}`, 'COLLABORATION_GROUP', group.id, group.school_id, { note: note || null });
  return updated;
}

export async function resolveGroupReport(
  reportId: UUID,
  adminId: UUID,
  status: GroupReportStatus,
  resolution?: string | null,
) {
  const isFinal = status === 'RESOLVED' || status === 'DISMISSED';
  const { rows: [report] } = await query(
    `UPDATE collaboration_group_reports
     SET status = $1::collaboration_report_status,
         reviewed_by = $2,
         resolution = $3,
         reviewed_at = CASE WHEN $4::boolean THEN NOW() ELSE reviewed_at END
     WHERE id = $5
     RETURNING *`,
    [status, adminId, resolution?.trim() || null, isFinal, reportId],
  );
  if (!report) throw httpError('Report not found', 404);
  await audit(adminId, `GROUP_REPORT_${status}`, 'COLLABORATION_GROUP_REPORT', reportId, null, { resolution: resolution || null });
  return report;
}
