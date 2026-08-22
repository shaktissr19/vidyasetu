import type { PoolClient, QueryResultRow } from 'pg';
import type { UserRole, UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';
import { saveNotification } from './notification.service';

type GroupKind = 'STUDENT' | 'PARENT' | 'TEACHER' | 'MIXED';
type GroupScope = 'PRIVATE' | 'SCHOOL' | 'CLASS';
type GroupStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED' | 'ARCHIVED';
type MemberRole = 'OWNER' | 'MODERATOR' | 'MEMBER';
type InviteStatus = 'PENDING_OWNER_APPROVAL' | 'PENDING_RECIPIENT' | 'ACCEPTED' | 'DECLINED' | 'REJECTED' | 'CANCELLED';

export interface CreateGroupInput {
  name: string;
  description?: string | null;
  kind: GroupKind;
  scope: GroupScope;
  schoolId?: UUID | null;
  classId?: UUID | null;
  maxMembers?: number;
}

export interface CreatePostInput {
  body: string;
  attachmentUrl?: string | null;
  isAnnouncement?: boolean;
}

export interface InviteInput {
  userId: UUID;
  message?: string | null;
}

export interface ReportInput {
  targetType: 'GROUP' | 'POST' | 'COMMENT' | 'MEMBER';
  targetId: UUID;
  reason: string;
  details?: string | null;
}

interface GroupRow extends QueryResultRow {
  id: UUID;
  name: string;
  description: string | null;
  kind: GroupKind;
  scope: GroupScope;
  school_id: UUID | null;
  class_id: UUID | null;
  created_by: UUID;
  owner_id: UUID;
  status: GroupStatus;
  max_members: number;
  settings: Record<string, unknown> | null;
  admin_note?: string | null;
  owner_name?: string | null;
  school_name?: string | null;
  class_name?: string | null;
  section?: string | null;
  member_count?: number | string | null;
  membership_role?: MemberRole | null;
  join_request_status?: string | null;
  invitation_status?: InviteStatus | null;
  created_at?: string | Date;
  updated_at?: string | Date;
}

interface MemberRow extends QueryResultRow {
  id: UUID;
  group_id: UUID;
  user_id: UUID;
  role: MemberRole;
  status: 'ACTIVE' | 'LEFT' | 'REMOVED';
  name?: string | null;
  mobile?: string | null;
  user_role?: UserRole;
}

interface ScopeRow extends QueryResultRow {
  school_id: UUID | null;
  class_id: UUID | null;
}

interface CountRow extends QueryResultRow { count: string; }
interface IdRow extends QueryResultRow { id: UUID; }
interface UserRow extends QueryResultRow {
  id: UUID;
  name: string | null;
  mobile: string;
  role: UserRole;
  profile_photo: string | null;
}

interface JoinRequestRow extends QueryResultRow {
  id: UUID;
  group_id: UUID;
  user_id: UUID;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
}

interface InvitationRow extends QueryResultRow {
  id: UUID;
  group_id: UUID;
  invitee_user_id: UUID;
  proposed_by: UUID;
  status: InviteStatus;
}

interface PostRow extends QueryResultRow {
  id: UUID;
  group_id: UUID;
  author_id: UUID;
  body: string;
  attachment_url: string | null;
  is_announcement: boolean;
  is_pinned: boolean;
  status: 'ACTIVE' | 'REMOVED';
  created_at: string | Date;
  updated_at: string | Date;
  author_name?: string | null;
  author_role?: UserRole;
}

interface CommentRow extends QueryResultRow {
  id: UUID;
  post_id: UUID;
  group_id: UUID;
  author_id: UUID;
  body: string;
  status: 'ACTIVE' | 'REMOVED';
  created_at: string | Date;
  author_name?: string | null;
  author_role?: UserRole;
}

interface ActorScope {
  schoolIds: Set<UUID>;
  classIds: Set<UUID>;
}

function httpError(message: string, statusCode: number): Error {
  return Object.assign(new Error(message), { statusCode });
}

function rolesForKind(kind: GroupKind): UserRole[] {
  if (kind === 'STUDENT') return ['STUDENT'];
  if (kind === 'PARENT') return ['PARENT'];
  if (kind === 'TEACHER') return ['TEACHER'];
  return ['STUDENT', 'PARENT', 'TEACHER', 'SCHOOL_ADMIN'];
}

function creatorCanUseKind(role: UserRole, kind: GroupKind): boolean {
  if (role === 'STUDENT') return kind === 'STUDENT';
  if (role === 'PARENT') return kind === 'PARENT';
  if (role === 'TEACHER') return kind === 'TEACHER' || kind === 'MIXED';
  if (role === 'SCHOOL_ADMIN') return kind === 'MIXED';
  return false;
}

function userCanJoinKind(role: UserRole, kind: GroupKind): boolean {
  return rolesForKind(kind).includes(role);
}

async function getActorScope(userId: UUID, role: UserRole): Promise<ActorScope> {
  const scope: ActorScope = { schoolIds: new Set<UUID>(), classIds: new Set<UUID>() };

  let rows: ScopeRow[] = [];
  if (role === 'STUDENT') {
    ({ rows } = await query<ScopeRow>(
      `SELECT school_id, class_id FROM students WHERE user_id = $1 AND status = 'ACTIVE'`,
      [userId],
    ));
  } else if (role === 'PARENT') {
    ({ rows } = await query<ScopeRow>(
      `SELECT DISTINCT s.school_id, s.class_id
       FROM parent_student_links psl
       JOIN students s ON s.id = psl.student_id
       WHERE psl.parent_user_id = $1 AND s.status = 'ACTIVE'`,
      [userId],
    ));
  } else if (role === 'TEACHER') {
    ({ rows } = await query<ScopeRow>(
      `SELECT DISTINCT t.school_id, ta.class_id
       FROM teachers t
       LEFT JOIN teacher_assignments ta ON ta.teacher_id = t.id
       WHERE t.user_id = $1 AND t.status IN ('ACTIVE','ON_LEAVE')`,
      [userId],
    ));
  } else if (role === 'SCHOOL_ADMIN') {
    ({ rows } = await query<ScopeRow>(
      `SELECT s.id AS school_id, sc.id AS class_id
       FROM schools s
       LEFT JOIN school_classes sc ON sc.school_id = s.id AND sc.is_active = TRUE
       WHERE s.admin_user_id = $1`,
      [userId],
    ));
  }

  for (const row of rows) {
    if (row.school_id) scope.schoolIds.add(row.school_id);
    if (row.class_id) scope.classIds.add(row.class_id);
  }
  return scope;
}

async function getGroup(groupId: UUID): Promise<GroupRow> {
  const { rows: [group] } = await query<GroupRow>(
    `SELECT g.*, u.name AS owner_name, s.name AS school_name, sc.class_name, sc.section,
            (SELECT COUNT(*) FROM collaboration_group_members gm WHERE gm.group_id = g.id AND gm.status = 'ACTIVE') AS member_count
     FROM collaboration_groups g
     JOIN users u ON u.id = g.owner_id
     LEFT JOIN schools s ON s.id = g.school_id
     LEFT JOIN school_classes sc ON sc.id = g.class_id
     WHERE g.id = $1`,
    [groupId],
  );
  if (!group) throw httpError('Group not found', 404);
  return group;
}

async function assertScopeEligible(userId: UUID, role: UserRole, group: GroupRow): Promise<void> {
  if (!userCanJoinKind(role, group.kind)) throw httpError('Your role is not eligible for this Group', 403);
  if (group.scope === 'PRIVATE') return;

  const actorScope = await getActorScope(userId, role);
  if (group.scope === 'SCHOOL') {
    if (!group.school_id || !actorScope.schoolIds.has(group.school_id)) {
      throw httpError('This Group is restricted to members of its School', 403);
    }
    return;
  }

  if (!group.school_id || !group.class_id || !actorScope.schoolIds.has(group.school_id) || !actorScope.classIds.has(group.class_id)) {
    throw httpError('This Group is restricted to members of its Class', 403);
  }
}

async function assertActiveMember(groupId: UUID, userId: UUID): Promise<MemberRow> {
  const { rows: [member] } = await query<MemberRow>(
    `SELECT gm.*, u.name, u.mobile, u.role AS user_role
     FROM collaboration_group_members gm
     JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = $1 AND gm.user_id = $2 AND gm.status = 'ACTIVE'`,
    [groupId, userId],
  );
  if (!member) throw httpError('You are not an active member of this Group', 403);
  return member;
}

async function assertModerator(groupId: UUID, userId: UUID): Promise<MemberRow> {
  const member = await assertActiveMember(groupId, userId);
  if (!['OWNER', 'MODERATOR'].includes(member.role)) throw httpError('Owner or moderator permission required', 403);
  return member;
}

async function assertOwner(groupId: UUID, userId: UUID): Promise<MemberRow> {
  const member = await assertActiveMember(groupId, userId);
  if (member.role !== 'OWNER') throw httpError('Group owner permission required', 403);
  return member;
}

async function memberCount(client: PoolClient, groupId: UUID): Promise<number> {
  const { rows: [row] } = await client.query<CountRow>(
    `SELECT COUNT(*) FROM collaboration_group_members WHERE group_id = $1 AND status = 'ACTIVE'`,
    [groupId],
  );
  return Number(row?.count || 0);
}

async function audit(
  actorId: UUID,
  actorRole: UserRole,
  action: string,
  entityType: string,
  entityId: UUID,
  schoolId?: UUID | null,
  newValue?: unknown,
): Promise<void> {
  await query(
    `INSERT INTO audit_log (actor_id, actor_role, school_id, action, entity_type, entity_id, new_value)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [actorId, actorRole, schoolId || null, action, entityType, entityId, newValue ? JSON.stringify(newValue) : null],
  );
}

export async function createGroup(userId: UUID, role: UserRole, input: CreateGroupInput): Promise<GroupRow> {
  if (!creatorCanUseKind(role, input.kind)) {
    throw httpError('This Group type cannot be created by your role', 403);
  }

  const scope = await getActorScope(userId, role);
  let schoolId: UUID | null = input.schoolId || null;
  let classId: UUID | null = input.classId || null;

  if (input.scope === 'PRIVATE') {
    schoolId = null;
    classId = null;
  } else if (input.scope === 'SCHOOL') {
    classId = null;
    if (!schoolId || !scope.schoolIds.has(schoolId)) throw httpError('You are not linked to the selected School', 403);
  } else {
    if (!schoolId || !classId || !scope.schoolIds.has(schoolId) || !scope.classIds.has(classId)) {
      throw httpError('You are not linked to the selected Class', 403);
    }
    const { rows: [validClass] } = await query<IdRow>(
      `SELECT id FROM school_classes WHERE id = $1 AND school_id = $2 AND is_active = TRUE`,
      [classId, schoolId],
    );
    if (!validClass) throw httpError('Selected Class does not belong to the selected School', 400);
  }

  const maxMembers = Math.min(Math.max(input.maxMembers || 100, 2), 500);
  const group = await transaction(async (client) => {
    const { rows: [created] } = await client.query<GroupRow>(
      `INSERT INTO collaboration_groups
        (name, description, kind, scope, school_id, class_id, created_by, owner_id, max_members)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8)
       RETURNING *`,
      [input.name.trim(), input.description?.trim() || null, input.kind, input.scope, schoolId, classId, userId, maxMembers],
    );
    if (!created) throw new Error('Group insert returned no row');

    await client.query(
      `INSERT INTO collaboration_group_members (group_id, user_id, role, status, approved_by)
       VALUES ($1,$2,'OWNER','ACTIVE',$2)`,
      [created.id, userId],
    );
    return created;
  });

  await audit(userId, role, 'GROUP_CREATION_REQUESTED', 'COLLABORATION_GROUP', group.id, schoolId, {
    name: group.name, kind: group.kind, scope: group.scope,
  });
  return group;
}

export async function getMyGroups(userId: UUID) {
  const { rows } = await query<GroupRow>(
    `SELECT g.*, u.name AS owner_name, s.name AS school_name, sc.class_name, sc.section,
            gm.role AS membership_role,
            (SELECT COUNT(*) FROM collaboration_group_members x WHERE x.group_id = g.id AND x.status = 'ACTIVE') AS member_count,
            (SELECT COUNT(*) FROM collaboration_group_join_requests jr WHERE jr.group_id = g.id AND jr.status = 'PENDING') AS pending_join_count,
            (SELECT COUNT(*) FROM collaboration_group_invitations gi WHERE gi.group_id = g.id AND gi.status = 'PENDING_OWNER_APPROVAL') AS pending_nomination_count
     FROM collaboration_groups g
     JOIN users u ON u.id = g.owner_id
     LEFT JOIN collaboration_group_members gm ON gm.group_id = g.id AND gm.user_id = $1 AND gm.status = 'ACTIVE'
     LEFT JOIN schools s ON s.id = g.school_id
     LEFT JOIN school_classes sc ON sc.id = g.class_id
     WHERE gm.id IS NOT NULL OR g.owner_id = $1
     ORDER BY CASE g.status WHEN 'ACTIVE' THEN 0 WHEN 'PENDING' THEN 1 ELSE 2 END, g.updated_at DESC`,
    [userId],
  );
  return rows;
}

export async function discoverGroups(userId: UUID, role: UserRole, search = '') {
  const actorScope = await getActorScope(userId, role);
  const { rows } = await query<GroupRow>(
    `SELECT g.*, u.name AS owner_name, s.name AS school_name, sc.class_name, sc.section,
            gm.role AS membership_role,
            (SELECT COUNT(*) FROM collaboration_group_members x WHERE x.group_id = g.id AND x.status = 'ACTIVE') AS member_count,
            (SELECT jr.status FROM collaboration_group_join_requests jr WHERE jr.group_id = g.id AND jr.user_id = $1 AND jr.status = 'PENDING' ORDER BY jr.created_at DESC LIMIT 1) AS join_request_status,
            (SELECT gi.status FROM collaboration_group_invitations gi WHERE gi.group_id = g.id AND gi.invitee_user_id = $1 AND gi.status IN ('PENDING_OWNER_APPROVAL','PENDING_RECIPIENT') ORDER BY gi.created_at DESC LIMIT 1) AS invitation_status
     FROM collaboration_groups g
     JOIN users u ON u.id = g.owner_id
     LEFT JOIN collaboration_group_members gm ON gm.group_id = g.id AND gm.user_id = $1 AND gm.status = 'ACTIVE'
     LEFT JOIN schools s ON s.id = g.school_id
     LEFT JOIN school_classes sc ON sc.id = g.class_id
     WHERE g.status = 'ACTIVE'
       AND ($2 = '' OR g.name ILIKE '%' || $2 || '%' OR COALESCE(g.description,'') ILIKE '%' || $2 || '%')
     ORDER BY g.updated_at DESC
     LIMIT 100`,
    [userId, search.trim()],
  );

  return rows.filter((group) => {
    if (!userCanJoinKind(role, group.kind)) return false;
    if (group.scope === 'PRIVATE') return true;
    if (group.scope === 'SCHOOL') return Boolean(group.school_id && actorScope.schoolIds.has(group.school_id));
    return Boolean(group.school_id && group.class_id && actorScope.schoolIds.has(group.school_id) && actorScope.classIds.has(group.class_id));
  });
}

export async function getGroupDetail(userId: UUID, role: UserRole, groupId: UUID) {
  const group = await getGroup(groupId);
  const { rows: [membership] } = await query<MemberRow>(
    `SELECT * FROM collaboration_group_members WHERE group_id = $1 AND user_id = $2 AND status = 'ACTIVE'`,
    [groupId, userId],
  );

  if (group.status !== 'ACTIVE' && group.owner_id !== userId && role !== 'SUPER_ADMIN') {
    throw httpError('Group is not available', 404);
  }
  if (group.status === 'ACTIVE' && !membership && role !== 'SUPER_ADMIN') {
    await assertScopeEligible(userId, role, group);
  }

  const [{ rows: [joinRequest] }, { rows: [invitation] }] = await Promise.all([
    query<JoinRequestRow>(
      `SELECT * FROM collaboration_group_join_requests WHERE group_id = $1 AND user_id = $2 AND status = 'PENDING' ORDER BY created_at DESC LIMIT 1`,
      [groupId, userId],
    ),
    query<InvitationRow>(
      `SELECT * FROM collaboration_group_invitations WHERE group_id = $1 AND invitee_user_id = $2 AND status IN ('PENDING_OWNER_APPROVAL','PENDING_RECIPIENT') ORDER BY created_at DESC LIMIT 1`,
      [groupId, userId],
    ),
  ]);

  return {
    ...group,
    membership_role: membership?.role || null,
    join_request_status: joinRequest?.status || null,
    invitation_status: invitation?.status || null,
  };
}

export async function requestJoin(userId: UUID, role: UserRole, groupId: UUID, message?: string | null) {
  const group = await getGroup(groupId);
  if (group.status !== 'ACTIVE') throw httpError('Group is not accepting members', 409);
  await assertScopeEligible(userId, role, group);

  const { rows: [member] } = await query<IdRow>(
    `SELECT id FROM collaboration_group_members WHERE group_id = $1 AND user_id = $2 AND status = 'ACTIVE'`,
    [groupId, userId],
  );
  if (member) throw httpError('You are already a member of this Group', 409);

  const { rows: [pendingInvite] } = await query<InvitationRow>(
    `SELECT * FROM collaboration_group_invitations
     WHERE group_id = $1 AND invitee_user_id = $2 AND status = 'PENDING_RECIPIENT' LIMIT 1`,
    [groupId, userId],
  );
  if (pendingInvite) throw httpError('You already have an invitation. Accept the invitation instead.', 409);

  let request: JoinRequestRow;
  try {
    const { rows: [created] } = await query<JoinRequestRow>(
      `INSERT INTO collaboration_group_join_requests (group_id, user_id, message)
       VALUES ($1,$2,$3) RETURNING *`,
      [groupId, userId, message?.trim() || null],
    );
    if (!created) throw new Error('Join request insert returned no row');
    request = created;
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as { code?: string }).code === '23505') {
      throw httpError('A join request is already pending', 409);
    }
    throw error;
  }

  await saveNotification({
    userId: group.owner_id,
    schoolId: group.school_id,
    type: 'GROUP_JOIN_REQUEST',
    title: `Join request for ${group.name}`,
    body: 'A VidyaSetu member has requested to join your Group.',
    refId: group.id,
    refType: 'COLLABORATION_GROUP',
  });
  return request;
}

export async function listJoinRequests(groupId: UUID, actorId: UUID) {
  await assertModerator(groupId, actorId);
  const { rows } = await query(
    `SELECT jr.*, u.name, u.mobile, u.role, u.profile_photo
     FROM collaboration_group_join_requests jr
     JOIN users u ON u.id = jr.user_id
     WHERE jr.group_id = $1 AND jr.status = 'PENDING'
     ORDER BY jr.created_at ASC`,
    [groupId],
  );
  return rows;
}

export async function decideJoinRequest(
  groupId: UUID,
  requestId: UUID,
  actorId: UUID,
  actorRole: UserRole,
  decision: 'APPROVED' | 'REJECTED',
) {
  await assertModerator(groupId, actorId);
  const group = await getGroup(groupId);

  const decided = await transaction(async (client) => {
    const { rows: [request] } = await client.query<JoinRequestRow>(
      `SELECT * FROM collaboration_group_join_requests WHERE id = $1 AND group_id = $2 FOR UPDATE`,
      [requestId, groupId],
    );
    if (!request) throw httpError('Join request not found', 404);
    if (request.status !== 'PENDING') throw httpError('Join request is already decided', 409);

    if (decision === 'APPROVED') {
      if (await memberCount(client, groupId) >= group.max_members) throw httpError('Group has reached its member limit', 409);
      await client.query(
        `INSERT INTO collaboration_group_members (group_id, user_id, role, status, approved_by)
         VALUES ($1,$2,'MEMBER','ACTIVE',$3)
         ON CONFLICT (group_id, user_id) DO UPDATE
         SET status = 'ACTIVE', role = 'MEMBER', approved_by = EXCLUDED.approved_by,
             joined_at = NOW(), left_at = NULL, removed_at = NULL`,
        [groupId, request.user_id, actorId],
      );
    }

    const { rows: [updated] } = await client.query<JoinRequestRow>(
      `UPDATE collaboration_group_join_requests
       SET status = $1, decided_by = $2, decided_at = NOW()
       WHERE id = $3 RETURNING *`,
      [decision, actorId, requestId],
    );
    if (!updated) throw new Error('Join request update returned no row');
    return updated;
  });

  await saveNotification({
    userId: decided.user_id,
    schoolId: group.school_id,
    type: decision === 'APPROVED' ? 'GROUP_JOIN_APPROVED' : 'GROUP_JOIN_REJECTED',
    title: decision === 'APPROVED' ? `Joined ${group.name}` : `Request declined: ${group.name}`,
    body: decision === 'APPROVED' ? 'Your request to join the Group was approved.' : 'Your request to join the Group was not approved.',
    refId: group.id,
    refType: 'COLLABORATION_GROUP',
  });
  await audit(actorId, actorRole, `GROUP_JOIN_${decision}`, 'COLLABORATION_GROUP', group.id, group.school_id, { userId: decided.user_id });
  return decided;
}

export async function searchEligibleUsers(groupId: UUID, actorId: UUID, search: string) {
  await assertActiveMember(groupId, actorId);
  const group = await getGroup(groupId);
  const roles = rolesForKind(group.kind);
  const params: unknown[] = [groupId, roles.map((role) => String(role)), `%${search.trim()}%`];
  const conditions = [
    `u.status = 'ACTIVE'`,
    `u.role::text = ANY($2::text[])`,
    `(u.name ILIKE $3 OR u.mobile ILIKE $3 OR COALESCE(u.email,'') ILIKE $3)`,
    `NOT EXISTS (SELECT 1 FROM collaboration_group_members gm WHERE gm.group_id = $1 AND gm.user_id = u.id AND gm.status = 'ACTIVE')`,
  ];

  if (group.scope === 'SCHOOL') {
    params.push(group.school_id);
    const p = params.length;
    conditions.push(`(
      (u.role = 'STUDENT' AND EXISTS (SELECT 1 FROM students st WHERE st.user_id = u.id AND st.school_id = $${p} AND st.status = 'ACTIVE')) OR
      (u.role = 'PARENT' AND EXISTS (SELECT 1 FROM parent_student_links psl JOIN students st ON st.id = psl.student_id WHERE psl.parent_user_id = u.id AND st.school_id = $${p} AND st.status = 'ACTIVE')) OR
      (u.role = 'TEACHER' AND EXISTS (SELECT 1 FROM teachers t WHERE t.user_id = u.id AND t.school_id = $${p} AND t.status IN ('ACTIVE','ON_LEAVE'))) OR
      (u.role = 'SCHOOL_ADMIN' AND EXISTS (SELECT 1 FROM schools s WHERE s.admin_user_id = u.id AND s.id = $${p}))
    )`);
  } else if (group.scope === 'CLASS') {
    params.push(group.class_id, group.school_id);
    const classP = params.length - 1;
    const schoolP = params.length;
    conditions.push(`(
      (u.role = 'STUDENT' AND EXISTS (SELECT 1 FROM students st WHERE st.user_id = u.id AND st.class_id = $${classP} AND st.status = 'ACTIVE')) OR
      (u.role = 'PARENT' AND EXISTS (SELECT 1 FROM parent_student_links psl JOIN students st ON st.id = psl.student_id WHERE psl.parent_user_id = u.id AND st.class_id = $${classP} AND st.status = 'ACTIVE')) OR
      (u.role = 'TEACHER' AND EXISTS (SELECT 1 FROM teachers t JOIN teacher_assignments ta ON ta.teacher_id = t.id WHERE t.user_id = u.id AND ta.class_id = $${classP})) OR
      (u.role = 'SCHOOL_ADMIN' AND EXISTS (SELECT 1 FROM schools s WHERE s.admin_user_id = u.id AND s.id = $${schoolP}))
    )`);
  }

  const { rows } = await query<UserRow>(
    `SELECT u.id, u.name, u.mobile, u.role, u.profile_photo
     FROM users u
     WHERE ${conditions.join(' AND ')}
     ORDER BY u.name NULLS LAST, u.mobile
     LIMIT 20`,
    params,
  );
  return rows;
}

export async function proposeInvitation(
  groupId: UUID,
  actorId: UUID,
  actorRole: UserRole,
  input: InviteInput,
) {
  const actorMembership = await assertActiveMember(groupId, actorId);
  const group = await getGroup(groupId);
  if (group.status !== 'ACTIVE') throw httpError('Group is not active', 409);
  if (actorId === input.userId) throw httpError('You cannot invite yourself', 400);

  const { rows: [invitee] } = await query<UserRow>(
    `SELECT id, name, mobile, role, profile_photo FROM users WHERE id = $1 AND status = 'ACTIVE'`,
    [input.userId],
  );
  if (!invitee) throw httpError('Invitee not found', 404);
  await assertScopeEligible(invitee.id, invitee.role, group);

  const { rows: [member] } = await query<IdRow>(
    `SELECT id FROM collaboration_group_members WHERE group_id = $1 AND user_id = $2 AND status = 'ACTIVE'`,
    [groupId, invitee.id],
  );
  if (member) throw httpError('User is already a Group member', 409);

  const ownerApproved = ['OWNER', 'MODERATOR'].includes(actorMembership.role);
  const status: InviteStatus = ownerApproved ? 'PENDING_RECIPIENT' : 'PENDING_OWNER_APPROVAL';

  let invitation: InvitationRow;
  try {
    const { rows: [created] } = await query<InvitationRow>(
      `INSERT INTO collaboration_group_invitations
        (group_id, invitee_user_id, proposed_by, owner_approved_by, owner_approved_at, status, message)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [groupId, invitee.id, actorId, ownerApproved ? actorId : null, ownerApproved ? new Date() : null, status, input.message?.trim() || null],
    );
    if (!created) throw new Error('Invitation insert returned no row');
    invitation = created;
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as { code?: string }).code === '23505') {
      throw httpError('An invitation or nomination is already pending for this user', 409);
    }
    throw error;
  }

  if (ownerApproved) {
    await saveNotification({
      userId: invitee.id,
      schoolId: group.school_id,
      type: 'GROUP_INVITATION',
      title: `Invitation to ${group.name}`,
      body: 'You have been invited to join a VidyaSetu Group. You choose whether to accept.',
      refId: group.id,
      refType: 'COLLABORATION_GROUP',
    });
  } else {
    await saveNotification({
      userId: group.owner_id,
      schoolId: group.school_id,
      type: 'GROUP_JOIN_REQUEST',
      title: `Member nomination for ${group.name}`,
      body: 'A member nominated someone to join. Review the nomination before an invitation is sent.',
      refId: group.id,
      refType: 'COLLABORATION_GROUP',
    });
  }
  await audit(actorId, actorRole, ownerApproved ? 'GROUP_INVITATION_SENT' : 'GROUP_MEMBER_NOMINATED', 'COLLABORATION_GROUP', group.id, group.school_id, { inviteeUserId: invitee.id });
  return invitation;
}

export async function listPendingNominations(groupId: UUID, actorId: UUID) {
  await assertModerator(groupId, actorId);
  const { rows } = await query(
    `SELECT gi.*, invitee.name AS invitee_name, invitee.mobile AS invitee_mobile, invitee.role AS invitee_role,
            proposer.name AS proposed_by_name
     FROM collaboration_group_invitations gi
     JOIN users invitee ON invitee.id = gi.invitee_user_id
     JOIN users proposer ON proposer.id = gi.proposed_by
     WHERE gi.group_id = $1 AND gi.status = 'PENDING_OWNER_APPROVAL'
     ORDER BY gi.created_at ASC`,
    [groupId],
  );
  return rows;
}

export async function decideNomination(
  groupId: UUID,
  invitationId: UUID,
  actorId: UUID,
  actorRole: UserRole,
  decision: 'APPROVED' | 'REJECTED',
) {
  await assertModerator(groupId, actorId);
  const group = await getGroup(groupId);
  const { rows: [invitation] } = await query<InvitationRow>(
    `SELECT * FROM collaboration_group_invitations WHERE id = $1 AND group_id = $2`,
    [invitationId, groupId],
  );
  if (!invitation) throw httpError('Nomination not found', 404);
  if (invitation.status !== 'PENDING_OWNER_APPROVAL') throw httpError('Nomination is already decided', 409);

  const nextStatus: InviteStatus = decision === 'APPROVED' ? 'PENDING_RECIPIENT' : 'REJECTED';
  const { rows: [updated] } = await query<InvitationRow>(
    `UPDATE collaboration_group_invitations
     SET status = $1, owner_approved_by = $2, owner_approved_at = NOW()
     WHERE id = $3 RETURNING *`,
    [nextStatus, actorId, invitationId],
  );
  if (!updated) throw new Error('Nomination update returned no row');

  if (decision === 'APPROVED') {
    await saveNotification({
      userId: invitation.invitee_user_id,
      schoolId: group.school_id,
      type: 'GROUP_INVITATION',
      title: `Invitation to ${group.name}`,
      body: 'The Group owner approved your invitation. Accept it to become a member.',
      refId: group.id,
      refType: 'COLLABORATION_GROUP',
    });
  }
  if (invitation.proposed_by !== actorId) {
    await saveNotification({
      userId: invitation.proposed_by,
      schoolId: group.school_id,
      type: decision === 'APPROVED' ? 'GROUP_INVITE_APPROVED' : 'GROUP_INVITE_REJECTED',
      title: decision === 'APPROVED' ? 'Member nomination approved' : 'Member nomination declined',
      body: decision === 'APPROVED' ? `Your nomination for ${group.name} was approved.` : `Your nomination for ${group.name} was not approved.`,
      refId: group.id,
      refType: 'COLLABORATION_GROUP',
    });
  }
  await audit(actorId, actorRole, `GROUP_NOMINATION_${decision}`, 'COLLABORATION_GROUP', group.id, group.school_id, { invitationId });
  return updated;
}

export async function getMyInvitations(userId: UUID) {
  const { rows } = await query(
    `SELECT gi.*, g.name AS group_name, g.kind, g.scope, g.school_id, g.class_id,
            proposer.name AS proposed_by_name
     FROM collaboration_group_invitations gi
     JOIN collaboration_groups g ON g.id = gi.group_id
     JOIN users proposer ON proposer.id = gi.proposed_by
     WHERE gi.invitee_user_id = $1 AND gi.status = 'PENDING_RECIPIENT' AND g.status = 'ACTIVE'
     ORDER BY gi.created_at DESC`,
    [userId],
  );
  return rows;
}

export async function respondToInvitation(
  invitationId: UUID,
  userId: UUID,
  role: UserRole,
  decision: 'ACCEPTED' | 'DECLINED',
) {
  const { rows: [invitation] } = await query<InvitationRow>(
    `SELECT * FROM collaboration_group_invitations WHERE id = $1 AND invitee_user_id = $2`,
    [invitationId, userId],
  );
  if (!invitation) throw httpError('Invitation not found', 404);
  if (invitation.status !== 'PENDING_RECIPIENT') throw httpError('Invitation is no longer pending', 409);
  const group = await getGroup(invitation.group_id);
  if (group.status !== 'ACTIVE') throw httpError('Group is not active', 409);
  await assertScopeEligible(userId, role, group);

  const updated = await transaction(async (client) => {
    if (decision === 'ACCEPTED') {
      if (await memberCount(client, group.id) >= group.max_members) throw httpError('Group has reached its member limit', 409);
      await client.query(
        `INSERT INTO collaboration_group_members (group_id, user_id, role, status, approved_by)
         VALUES ($1,$2,'MEMBER','ACTIVE',$3)
         ON CONFLICT (group_id, user_id) DO UPDATE
         SET status = 'ACTIVE', role = 'MEMBER', approved_by = EXCLUDED.approved_by,
             joined_at = NOW(), left_at = NULL, removed_at = NULL`,
        [group.id, userId, invitation.owner_approved_by || group.owner_id],
      );
    }
    const { rows: [row] } = await client.query<InvitationRow>(
      `UPDATE collaboration_group_invitations SET status = $1, responded_at = NOW() WHERE id = $2 RETURNING *`,
      [decision, invitationId],
    );
    if (!row) throw new Error('Invitation response returned no row');
    return row;
  });

  await audit(userId, role, `GROUP_INVITATION_${decision}`, 'COLLABORATION_GROUP', group.id, group.school_id);
  return updated;
}

export async function listMembers(groupId: UUID, actorId: UUID) {
  await assertActiveMember(groupId, actorId);
  const { rows } = await query(
    `SELECT gm.id, gm.user_id, gm.role, gm.status, gm.joined_at,
            u.name, u.mobile, u.role AS user_role, u.profile_photo
     FROM collaboration_group_members gm
     JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = $1 AND gm.status = 'ACTIVE'
     ORDER BY CASE gm.role WHEN 'OWNER' THEN 0 WHEN 'MODERATOR' THEN 1 ELSE 2 END, u.name NULLS LAST`,
    [groupId],
  );
  return rows;
}

export async function updateMemberRole(
  groupId: UUID,
  targetUserId: UUID,
  actorId: UUID,
  actorRole: UserRole,
  newRole: 'MODERATOR' | 'MEMBER',
) {
  await assertOwner(groupId, actorId);
  if (targetUserId === actorId) throw httpError('Owner role cannot be changed here', 400);
  const group = await getGroup(groupId);
  const { rows: [member] } = await query<MemberRow>(
    `UPDATE collaboration_group_members SET role = $1
     WHERE group_id = $2 AND user_id = $3 AND status = 'ACTIVE' AND role <> 'OWNER'
     RETURNING *`,
    [newRole, groupId, targetUserId],
  );
  if (!member) throw httpError('Active member not found', 404);
  await audit(actorId, actorRole, 'GROUP_MEMBER_ROLE_UPDATED', 'COLLABORATION_GROUP', group.id, group.school_id, { targetUserId, role: newRole });
  return member;
}

export async function removeMember(
  groupId: UUID,
  targetUserId: UUID,
  actorId: UUID,
  actorRole: UserRole,
) {
  const actor = await assertModerator(groupId, actorId);
  if (targetUserId === actorId) throw httpError('Use Leave Group to leave', 400);
  const group = await getGroup(groupId);
  const { rows: [target] } = await query<MemberRow>(
    `SELECT * FROM collaboration_group_members WHERE group_id = $1 AND user_id = $2 AND status = 'ACTIVE'`,
    [groupId, targetUserId],
  );
  if (!target) throw httpError('Active member not found', 404);
  if (target.role === 'OWNER') throw httpError('Group owner cannot be removed', 403);
  if (target.role === 'MODERATOR' && actor.role !== 'OWNER') throw httpError('Only the owner can remove a moderator', 403);

  const { rows: [removed] } = await query<MemberRow>(
    `UPDATE collaboration_group_members
     SET status = 'REMOVED', removed_at = NOW()
     WHERE group_id = $1 AND user_id = $2 RETURNING *`,
    [groupId, targetUserId],
  );
  await audit(actorId, actorRole, 'GROUP_MEMBER_REMOVED', 'COLLABORATION_GROUP', group.id, group.school_id, { targetUserId });
  return removed;
}

export async function leaveGroup(groupId: UUID, userId: UUID, role: UserRole) {
  const member = await assertActiveMember(groupId, userId);
  if (member.role === 'OWNER') throw httpError('Transfer or archive the Group before the owner can leave', 409);
  const group = await getGroup(groupId);
  const { rows: [updated] } = await query<MemberRow>(
    `UPDATE collaboration_group_members SET status = 'LEFT', left_at = NOW()
     WHERE group_id = $1 AND user_id = $2 RETURNING *`,
    [groupId, userId],
  );
  await audit(userId, role, 'GROUP_LEFT', 'COLLABORATION_GROUP', group.id, group.school_id);
  return updated;
}

export async function createPost(groupId: UUID, userId: UUID, input: CreatePostInput) {
  const member = await assertActiveMember(groupId, userId);
  const group = await getGroup(groupId);
  if (group.status !== 'ACTIVE') throw httpError('Group is not active', 409);
  const settings = group.settings || {};
  if (member.role === 'MEMBER' && settings.allow_member_posts === false) throw httpError('Only moderators can post in this Group', 403);
  if (input.isAnnouncement && !['OWNER', 'MODERATOR'].includes(member.role)) throw httpError('Only owner/moderator can publish announcements', 403);

  const { rows: [post] } = await query<PostRow>(
    `INSERT INTO collaboration_group_posts (group_id, author_id, body, attachment_url, is_announcement)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [groupId, userId, input.body.trim(), input.attachmentUrl?.trim() || null, Boolean(input.isAnnouncement)],
  );
  if (!post) throw new Error('Post insert returned no row');

  if (input.isAnnouncement) {
    const { rows: members } = await query<{ user_id: UUID } & QueryResultRow>(
      `SELECT user_id FROM collaboration_group_members WHERE group_id = $1 AND status = 'ACTIVE' AND user_id <> $2`,
      [groupId, userId],
    );
    await Promise.all(members.slice(0, 500).map((m) => saveNotification({
      userId: m.user_id,
      schoolId: group.school_id,
      type: 'GROUP_POST',
      title: `Announcement in ${group.name}`,
      body: input.body.trim().slice(0, 240),
      refId: group.id,
      refType: 'COLLABORATION_GROUP',
    })));
  }
  return post;
}

export async function listPosts(groupId: UUID, userId: UUID, page = 1, limit = 20) {
  await assertActiveMember(groupId, userId);
  const group = await getGroup(groupId);
  if (group.status !== 'ACTIVE') throw httpError('Group is not active', 409);
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const offset = (Math.max(page, 1) - 1) * safeLimit;

  const { rows: posts } = await query<PostRow>(
    `SELECT p.*, u.name AS author_name, u.role AS author_role
     FROM collaboration_group_posts p
     JOIN users u ON u.id = p.author_id
     WHERE p.group_id = $1 AND p.status = 'ACTIVE'
     ORDER BY p.is_pinned DESC, p.created_at DESC
     LIMIT $2 OFFSET $3`,
    [groupId, safeLimit, offset],
  );
  if (!posts.length) return [];

  const postIds = posts.map((post) => post.id);
  const { rows: comments } = await query<CommentRow>(
    `SELECT c.*, u.name AS author_name, u.role AS author_role
     FROM collaboration_group_comments c
     JOIN users u ON u.id = c.author_id
     WHERE c.post_id = ANY($1::uuid[]) AND c.status = 'ACTIVE'
     ORDER BY c.created_at ASC`,
    [postIds],
  );
  const commentsByPost = new Map<UUID, CommentRow[]>();
  for (const comment of comments) {
    const existing = commentsByPost.get(comment.post_id) || [];
    existing.push(comment);
    commentsByPost.set(comment.post_id, existing);
  }
  return posts.map((post) => ({ ...post, comments: commentsByPost.get(post.id) || [] }));
}

export async function addComment(groupId: UUID, postId: UUID, userId: UUID, body: string) {
  const member = await assertActiveMember(groupId, userId);
  const group = await getGroup(groupId);
  if (group.status !== 'ACTIVE') throw httpError('Group is not active', 409);
  const settings = group.settings || {};
  if (member.role === 'MEMBER' && settings.allow_member_comments === false) throw httpError('Comments are restricted in this Group', 403);

  const { rows: [post] } = await query<IdRow>(
    `SELECT id FROM collaboration_group_posts WHERE id = $1 AND group_id = $2 AND status = 'ACTIVE'`,
    [postId, groupId],
  );
  if (!post) throw httpError('Post not found', 404);
  const { rows: [comment] } = await query<CommentRow>(
    `INSERT INTO collaboration_group_comments (post_id, group_id, author_id, body)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [postId, groupId, userId, body.trim()],
  );
  return comment;
}

export async function togglePin(groupId: UUID, postId: UUID, actorId: UUID, pinned: boolean) {
  await assertModerator(groupId, actorId);
  const { rows: [post] } = await query<PostRow>(
    `UPDATE collaboration_group_posts SET is_pinned = $1
     WHERE id = $2 AND group_id = $3 AND status = 'ACTIVE' RETURNING *`,
    [pinned, postId, groupId],
  );
  if (!post) throw httpError('Post not found', 404);
  return post;
}

export async function removePost(groupId: UUID, postId: UUID, actorId: UUID) {
  const member = await assertActiveMember(groupId, actorId);
  const { rows: [post] } = await query<PostRow>(
    `SELECT * FROM collaboration_group_posts WHERE id = $1 AND group_id = $2 AND status = 'ACTIVE'`,
    [postId, groupId],
  );
  if (!post) throw httpError('Post not found', 404);
  if (post.author_id !== actorId && !['OWNER', 'MODERATOR'].includes(member.role)) throw httpError('You cannot remove this post', 403);
  const { rows: [removed] } = await query<PostRow>(
    `UPDATE collaboration_group_posts SET status = 'REMOVED', removed_by = $1, removed_at = NOW()
     WHERE id = $2 RETURNING *`,
    [actorId, postId],
  );
  return removed;
}

export async function reportGroupContent(groupId: UUID, userId: UUID, input: ReportInput) {
  await assertActiveMember(groupId, userId);
  const group = await getGroup(groupId);
  if (input.targetType === 'GROUP' && input.targetId !== groupId) throw httpError('Invalid report target', 400);

  if (input.targetType === 'POST') {
    const { rows: [target] } = await query<IdRow>(`SELECT id FROM collaboration_group_posts WHERE id = $1 AND group_id = $2`, [input.targetId, groupId]);
    if (!target) throw httpError('Report target not found', 404);
  } else if (input.targetType === 'COMMENT') {
    const { rows: [target] } = await query<IdRow>(`SELECT id FROM collaboration_group_comments WHERE id = $1 AND group_id = $2`, [input.targetId, groupId]);
    if (!target) throw httpError('Report target not found', 404);
  } else if (input.targetType === 'MEMBER') {
    const { rows: [target] } = await query<IdRow>(`SELECT id FROM collaboration_group_members WHERE user_id = $1 AND group_id = $2 AND status = 'ACTIVE'`, [input.targetId, groupId]);
    if (!target) throw httpError('Report target not found', 404);
  }

  const { rows: [report] } = await query(
    `INSERT INTO collaboration_group_reports (group_id, reported_by, target_type, target_id, reason, details)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [groupId, userId, input.targetType, input.targetId, input.reason.trim(), input.details?.trim() || null],
  );
  return report;
}

export async function adminListGroups(status?: string, search = '') {
  const params: unknown[] = [search.trim()];
  let statusClause = '';
  if (status) {
    params.push(status);
    statusClause = `AND g.status::text = $${params.length}`;
  }
  const { rows } = await query(
    `SELECT g.*, owner.name AS owner_name, owner.role AS owner_role, s.name AS school_name,
            sc.class_name, sc.section,
            (SELECT COUNT(*) FROM collaboration_group_members gm WHERE gm.group_id = g.id AND gm.status = 'ACTIVE') AS member_count,
            (SELECT COUNT(*) FROM collaboration_group_reports r WHERE r.group_id = g.id AND r.status IN ('OPEN','REVIEWING')) AS open_report_count
     FROM collaboration_groups g
     JOIN users owner ON owner.id = g.owner_id
     LEFT JOIN schools s ON s.id = g.school_id
     LEFT JOIN school_classes sc ON sc.id = g.class_id
     WHERE ($1 = '' OR g.name ILIKE '%' || $1 || '%' OR owner.name ILIKE '%' || $1 || '%')
       ${statusClause}
     ORDER BY CASE g.status WHEN 'PENDING' THEN 0 WHEN 'ACTIVE' THEN 1 WHEN 'SUSPENDED' THEN 2 ELSE 3 END, g.created_at DESC
     LIMIT 200`,
    params,
  );
  return rows;
}

export async function adminDecideGroup(
  groupId: UUID,
  adminId: UUID,
  decision: 'ACTIVE' | 'REJECTED',
  note?: string | null,
) {
  const group = await getGroup(groupId);
  if (group.status !== 'PENDING') throw httpError('Only pending Groups can be approved or rejected', 409);
  const { rows: [updated] } = await query<GroupRow>(
    `UPDATE collaboration_groups
     SET status = $1, admin_note = $2, approved_by = CASE WHEN $1 = 'ACTIVE' THEN $3 ELSE approved_by END,
         approved_at = CASE WHEN $1 = 'ACTIVE' THEN NOW() ELSE approved_at END,
         rejected_at = CASE WHEN $1 = 'REJECTED' THEN NOW() ELSE rejected_at END
     WHERE id = $4 RETURNING *`,
    [decision, note?.trim() || null, adminId, groupId],
  );
  if (!updated) throw new Error('Group decision returned no row');

  await saveNotification({
    userId: group.owner_id,
    schoolId: group.school_id,
    type: decision === 'ACTIVE' ? 'GROUP_APPROVED' : 'GROUP_REJECTED',
    title: decision === 'ACTIVE' ? `Group approved: ${group.name}` : `Group request declined: ${group.name}`,
    body: decision === 'ACTIVE' ? 'Your Group is now active and can accept members.' : (note?.trim() || 'Your Group request was not approved.'),
    refId: group.id,
    refType: 'COLLABORATION_GROUP',
  });
  await audit(adminId, 'SUPER_ADMIN', decision === 'ACTIVE' ? 'GROUP_APPROVED' : 'GROUP_REJECTED', 'COLLABORATION_GROUP', group.id, group.school_id, { note: note || null });
  return updated;
}

export async function adminUpdateGroupStatus(
  groupId: UUID,
  adminId: UUID,
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED',
  note?: string | null,
) {
  const group = await getGroup(groupId);
  if (group.status === 'PENDING') throw httpError('Use approve/reject for pending Groups', 409);
  const { rows: [updated] } = await query<GroupRow>(
    `UPDATE collaboration_groups
     SET status = $1, admin_note = $2,
         suspended_at = CASE WHEN $1 = 'SUSPENDED' THEN NOW() ELSE suspended_at END,
         archived_at = CASE WHEN $1 = 'ARCHIVED' THEN NOW() ELSE archived_at END
     WHERE id = $3 RETURNING *`,
    [status, note?.trim() || null, groupId],
  );
  if (!updated) throw httpError('Group not found', 404);
  await audit(adminId, 'SUPER_ADMIN', `GROUP_${status}`, 'COLLABORATION_GROUP', group.id, group.school_id, { note: note || null });
  return updated;
}

export async function adminListReports(status?: string) {
  const params: unknown[] = [];
  let where = '';
  if (status) { params.push(status); where = `WHERE r.status::text = $1`; }
  const { rows } = await query(
    `SELECT r.*, g.name AS group_name, reporter.name AS reported_by_name, reporter.role AS reported_by_role
     FROM collaboration_group_reports r
     JOIN collaboration_groups g ON g.id = r.group_id
     JOIN users reporter ON reporter.id = r.reported_by
     ${where}
     ORDER BY CASE r.status WHEN 'OPEN' THEN 0 WHEN 'REVIEWING' THEN 1 ELSE 2 END, r.created_at DESC
     LIMIT 200`,
    params,
  );
  return rows;
}

export async function adminResolveReport(
  reportId: UUID,
  adminId: UUID,
  status: 'REVIEWING' | 'RESOLVED' | 'DISMISSED',
  resolution?: string | null,
) {
  const { rows: [report] } = await query(
    `UPDATE collaboration_group_reports
     SET status = $1, reviewed_by = $2, resolution = $3,
         reviewed_at = CASE WHEN $1 IN ('RESOLVED','DISMISSED') THEN NOW() ELSE reviewed_at END
     WHERE id = $4 RETURNING *`,
    [status, adminId, resolution?.trim() || null, reportId],
  );
  if (!report) throw httpError('Report not found', 404);
  await audit(adminId, 'SUPER_ADMIN', `GROUP_REPORT_${status}`, 'COLLABORATION_GROUP_REPORT', reportId, null, { resolution: resolution || null });
  return report;
}
