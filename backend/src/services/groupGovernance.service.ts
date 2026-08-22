import type { PoolClient, QueryResultRow } from 'pg';
import type { UserRole, UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';
import { saveNotification } from './notification.service';

interface GroupRow extends QueryResultRow {
  id: UUID;
  name: string;
  kind: 'STUDENT' | 'PARENT' | 'TEACHER' | 'MIXED';
  school_id: UUID | null;
  owner_id: UUID;
  status: string;
}

interface MemberRow extends QueryResultRow {
  id: UUID;
  group_id: UUID;
  user_id: UUID;
  role: 'OWNER' | 'MODERATOR' | 'MEMBER';
  status: 'ACTIVE' | 'LEFT' | 'REMOVED';
  name?: string | null;
  mobile?: string | null;
  user_role?: UserRole;
  profile_photo?: string | null;
}

interface CommentRow extends QueryResultRow {
  id: UUID;
  group_id: UUID;
  post_id: UUID;
  author_id: UUID;
  status: 'ACTIVE' | 'REMOVED';
}

function httpError(message: string, statusCode: number): Error {
  return Object.assign(new Error(message), { statusCode });
}

async function getLockedGroup(client: PoolClient, groupId: UUID): Promise<GroupRow> {
  const { rows: [group] } = await client.query<GroupRow>(
    `SELECT id, name, kind, school_id, owner_id, status
     FROM collaboration_groups
     WHERE id = $1
     FOR UPDATE`,
    [groupId],
  );
  if (!group) throw httpError('Group not found', 404);
  return group;
}

async function activeMember(client: PoolClient, groupId: UUID, userId: UUID): Promise<MemberRow> {
  const { rows: [member] } = await client.query<MemberRow>(
    `SELECT gm.*, u.name, u.mobile, u.role AS user_role, u.profile_photo
     FROM collaboration_group_members gm
     JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = $1 AND gm.user_id = $2 AND gm.status = 'ACTIVE'
     FOR UPDATE OF gm`,
    [groupId, userId],
  );
  if (!member) throw httpError('Active Group member not found', 404);
  return member;
}

async function audit(
  actorId: UUID,
  actorRole: UserRole,
  action: string,
  groupId: UUID,
  schoolId: UUID | null,
  value: unknown,
): Promise<void> {
  await query(
    `INSERT INTO audit_log (actor_id, actor_role, school_id, action, entity_type, entity_id, new_value)
     VALUES ($1,$2,$3,$4,'COLLABORATION_GROUP',$5,$6)`,
    [actorId, actorRole, schoolId, action, groupId, JSON.stringify(value)],
  );
}

function ensureMixedOwnerSafety(group: GroupRow, target: MemberRow): void {
  if (group.kind === 'MIXED' && !['TEACHER', 'SCHOOL_ADMIN'].includes(target.user_role || '')) {
    throw httpError('A mixed Student/Adult Group must be owned by a Teacher or School Admin', 409);
  }
}

async function transfer(
  groupId: UUID,
  targetUserId: UUID,
  actorId: UUID,
  actorRole: UserRole,
  requireCurrentOwner: boolean,
) {
  const result = await transaction(async (client) => {
    const group = await getLockedGroup(client, groupId);
    if (!['ACTIVE', 'SUSPENDED'].includes(group.status)) {
      throw httpError('Ownership can only be transferred for an active or suspended Group', 409);
    }
    if (requireCurrentOwner && group.owner_id !== actorId) throw httpError('Only the current Group owner can transfer ownership', 403);
    if (group.owner_id === targetUserId) throw httpError('This member is already the Group owner', 409);

    const currentOwner = await activeMember(client, groupId, group.owner_id);
    if (currentOwner.role !== 'OWNER') throw httpError('Current owner membership is inconsistent', 409);
    const target = await activeMember(client, groupId, targetUserId);
    ensureMixedOwnerSafety(group, target);

    await client.query(
      `UPDATE collaboration_group_members
       SET role = 'MEMBER', updated_at = NOW()
       WHERE group_id = $1 AND user_id = $2 AND status = 'ACTIVE'`,
      [groupId, group.owner_id],
    );
    await client.query(
      `UPDATE collaboration_group_members
       SET role = 'OWNER', approved_by = $1, updated_at = NOW()
       WHERE group_id = $2 AND user_id = $3 AND status = 'ACTIVE'`,
      [actorId, groupId, targetUserId],
    );
    const { rows: [updated] } = await client.query<GroupRow>(
      `UPDATE collaboration_groups SET owner_id = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, kind, school_id, owner_id, status`,
      [targetUserId, groupId],
    );
    if (!updated) throw new Error('Ownership transfer returned no Group');
    return { group: updated, previousOwnerId: group.owner_id, target };
  });

  await Promise.all([
    saveNotification({
      userId: result.target.user_id,
      schoolId: result.group.school_id,
      type: 'SYSTEM',
      title: `You now own ${result.group.name}`,
      body: 'Group ownership was transferred to you. You can manage membership and moderators.',
      refId: result.group.id,
      refType: 'COLLABORATION_GROUP',
    }),
    saveNotification({
      userId: result.previousOwnerId,
      schoolId: result.group.school_id,
      type: 'SYSTEM',
      title: `Ownership transferred: ${result.group.name}`,
      body: 'Group ownership has been transferred to another active member.',
      refId: result.group.id,
      refType: 'COLLABORATION_GROUP',
    }),
  ]);
  await audit(actorId, actorRole, 'GROUP_OWNERSHIP_TRANSFERRED', result.group.id, result.group.school_id, {
    previousOwnerId: result.previousOwnerId,
    newOwnerId: targetUserId,
  });
  return result.group;
}

export async function transferOwnershipByOwner(
  groupId: UUID,
  targetUserId: UUID,
  actorId: UUID,
  actorRole: UserRole,
) {
  return transfer(groupId, targetUserId, actorId, actorRole, true);
}

export async function transferOwnershipByAdmin(groupId: UUID, targetUserId: UUID, adminId: UUID) {
  return transfer(groupId, targetUserId, adminId, 'SUPER_ADMIN', false);
}

export async function listMembersForAdmin(groupId: UUID) {
  const { rows: [group] } = await query<GroupRow>(
    `SELECT id, name, kind, school_id, owner_id, status FROM collaboration_groups WHERE id = $1`,
    [groupId],
  );
  if (!group) throw httpError('Group not found', 404);
  const { rows } = await query<MemberRow>(
    `SELECT gm.id, gm.group_id, gm.user_id, gm.role, gm.status,
            u.name, u.mobile, u.role AS user_role, u.profile_photo
     FROM collaboration_group_members gm
     JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = $1 AND gm.status = 'ACTIVE'
     ORDER BY CASE gm.role WHEN 'OWNER' THEN 0 WHEN 'MODERATOR' THEN 1 ELSE 2 END, u.name NULLS LAST`,
    [groupId],
  );
  return rows;
}

export async function removeComment(groupId: UUID, commentId: UUID, actorId: UUID) {
  const { rows: [actor] } = await query<MemberRow>(
    `SELECT * FROM collaboration_group_members WHERE group_id = $1 AND user_id = $2 AND status = 'ACTIVE'`,
    [groupId, actorId],
  );
  if (!actor) throw httpError('You are not an active member of this Group', 403);
  const { rows: [comment] } = await query<CommentRow>(
    `SELECT id, group_id, post_id, author_id, status
     FROM collaboration_group_comments
     WHERE id = $1 AND group_id = $2`,
    [commentId, groupId],
  );
  if (!comment || comment.status !== 'ACTIVE') throw httpError('Comment not found', 404);
  if (comment.author_id !== actorId && !['OWNER', 'MODERATOR'].includes(actor.role)) {
    throw httpError('You cannot remove this comment', 403);
  }

  const { rows: [removed] } = await query<CommentRow>(
    `UPDATE collaboration_group_comments
     SET status = 'REMOVED', removed_by = $1, removed_at = NOW(), updated_at = NOW()
     WHERE id = $2 RETURNING id, group_id, post_id, author_id, status`,
    [actorId, commentId],
  );
  return removed;
}
