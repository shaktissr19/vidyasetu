import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';
import * as notifications from './notification.service';

export type GrievanceCategory = 'ACADEMICS' | 'ATTENDANCE' | 'FEES' | 'TEACHER_CONCERN' | 'BULLYING_SAFETY' | 'TRANSPORT' | 'INFRASTRUCTURE' | 'ADMINISTRATION' | 'OTHER';
export type GrievancePriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type GrievanceStatus = 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'ESCALATED';

export interface CreateGrievanceInput {
  studentId: UUID;
  category: GrievanceCategory;
  priority?: GrievancePriority;
  subject: string;
  description: string;
}

interface ParentLinkRow extends QueryResultRow {
  student_id: UUID;
  student_name: string;
  school_id: UUID | null;
  school_name: string | null;
  school_admin_user_id: UUID | null;
  school_link_status: string;
}
interface GrievanceRow extends QueryResultRow {
  id: UUID;
  ticket_number: string;
  parent_user_id: UUID;
  student_id: UUID;
  school_id: UUID;
  category: GrievanceCategory;
  priority: GrievancePriority;
  subject: string;
  description: string;
  status: GrievanceStatus;
  assigned_to: UUID | null;
  due_at: string | Date | null;
  acknowledged_at: string | Date | null;
  resolved_at: string | Date | null;
  closed_at: string | Date | null;
  escalated_at: string | Date | null;
  resolution: string | null;
  reopen_count: number;
  created_at: string | Date;
  updated_at: string | Date;
  parent_name?: string;
  student_name?: string;
  school_name?: string;
  assigned_to_name?: string | null;
  overdue?: boolean;
}
interface GrievanceMessageRow extends QueryResultRow {
  id: UUID;
  body: string;
  is_internal: boolean;
  created_at: string | Date;
  author_user_id: UUID;
  author_name: string;
  author_role: string;
}
interface GrievanceHistoryRow extends QueryResultRow {
  id: UUID;
  action: string;
  from_status: GrievanceStatus | null;
  to_status: GrievanceStatus | null;
  note: string | null;
  created_at: string | Date;
  actor_name: string;
  actor_role: string;
}
export interface GrievanceDetail extends GrievanceRow {
  messages: GrievanceMessageRow[];
  history: GrievanceHistoryRow[];
}
interface ConfigRow extends QueryResultRow { value: string; }
interface AdminRow extends QueryResultRow { id: UUID; }

function appError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

async function parentLink(parentUserId: UUID, studentId: UUID): Promise<ParentLinkRow> {
  const { rows: [row] } = await query<ParentLinkRow>(
    `SELECT psl.student_id, su.name AS student_name, s.school_id, sch.name AS school_name,
            sch.admin_user_id AS school_admin_user_id, s.school_link_status
     FROM parent_student_links psl
     JOIN students s ON s.id = psl.student_id
     JOIN users su ON su.id = s.user_id
     LEFT JOIN schools sch ON sch.id = s.school_id
     WHERE psl.parent_user_id = $1 AND psl.student_id = $2`,
    [parentUserId, studentId],
  );
  if (!row) throw appError('This child is not linked to your Parent account', 403);
  if (!row.school_id || !row.school_admin_user_id || row.school_link_status !== 'APPROVED') {
    throw appError('The child must have an approved school link before a school concern can be raised', 409);
  }
  return row;
}

async function slaHours(): Promise<number> {
  const { rows: [row] } = await query<ConfigRow>(`SELECT value FROM platform_config WHERE key='GRIEVANCE_DEFAULT_SLA_HOURS'`);
  const n = Number.parseInt(row?.value || '72', 10);
  return Number.isFinite(n) && n > 0 ? n : 72;
}

async function reopenLimit(): Promise<number> {
  const { rows: [row] } = await query<ConfigRow>(`SELECT value FROM platform_config WHERE key='GRIEVANCE_REOPEN_LIMIT'`);
  const n = Number.parseInt(row?.value || '3', 10);
  return Number.isFinite(n) && n > 0 ? n : 3;
}

async function notifyPlatformAdmins(title: string, body: string, grievanceId: UUID): Promise<void> {
  const { rows } = await query<AdminRow>(`SELECT id FROM users WHERE role='SUPER_ADMIN' AND status='ACTIVE'`);
  await Promise.all(rows.map(a => notifications.saveNotification({
    userId: a.id, type: 'GRIEVANCE_ESCALATED', title, body, refId: grievanceId, refType: 'GRIEVANCE',
  })));
}

async function detailById(grievanceId: UUID, extraWhere = '', params: unknown[] = []): Promise<GrievanceDetail> {
  const { rows: [g] } = await query<GrievanceRow>(
    `SELECT g.*, pu.name AS parent_name, su.name AS student_name, sch.name AS school_name,
            au.name AS assigned_to_name,
            (g.status NOT IN ('RESOLVED','CLOSED') AND g.due_at IS NOT NULL AND g.due_at < NOW()) AS overdue
     FROM parent_grievances g
     JOIN users pu ON pu.id = g.parent_user_id
     JOIN students st ON st.id = g.student_id
     JOIN users su ON su.id = st.user_id
     JOIN schools sch ON sch.id = g.school_id
     LEFT JOIN users au ON au.id = g.assigned_to
     WHERE g.id = $1 ${extraWhere}`,
    [grievanceId, ...params],
  );
  if (!g) throw appError('Concern not found', 404);
  const [messages, history] = await Promise.all([
    query<GrievanceMessageRow>(`SELECT gm.id, gm.body, gm.is_internal, gm.created_at, gm.author_user_id, u.name AS author_name, u.role AS author_role
           FROM grievance_messages gm JOIN users u ON u.id=gm.author_user_id
           WHERE gm.grievance_id=$1 ORDER BY gm.created_at ASC`, [grievanceId]),
    query<GrievanceHistoryRow>(`SELECT gh.id, gh.action, gh.from_status, gh.to_status, gh.note, gh.created_at, u.name AS actor_name, u.role AS actor_role
           FROM grievance_history gh JOIN users u ON u.id=gh.actor_user_id
           WHERE gh.grievance_id=$1 ORDER BY gh.created_at ASC`, [grievanceId]),
  ]);
  return { ...g, messages: messages.rows, history: history.rows };
}

export async function create(parentUserId: UUID, input: CreateGrievanceInput) {
  const link = await parentLink(parentUserId, input.studentId);
  const hours = await slaHours();
  const { rows: [g] } = await query<GrievanceRow>(
    `INSERT INTO parent_grievances
       (parent_user_id, student_id, school_id, category, priority, subject, description, assigned_to, due_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW()+($9::text || ' hours')::interval)
     RETURNING *`,
    [parentUserId, input.studentId, link.school_id, input.category, input.priority || 'NORMAL', input.subject.trim(), input.description.trim(), link.school_admin_user_id, hours],
  );
  if (!g) throw appError('Could not create concern', 500);
  await query(`INSERT INTO grievance_history (grievance_id, actor_user_id, action, to_status, note) VALUES ($1,$2,'SUBMITTED','OPEN'::grievance_status,$3)`, [g.id, parentUserId, input.subject.trim()]);
  await notifications.saveNotification({
    userId: link.school_admin_user_id!, schoolId: link.school_id, type: 'GRIEVANCE_SUBMITTED',
    title: `New Parent concern ${g.ticket_number}`, body: `${link.student_name}: ${input.subject}`,
    refId: g.id, refType: 'GRIEVANCE',
  });
  return detailById(g.id);
}

export async function listForParent(parentUserId: UUID) {
  const { rows } = await query<GrievanceRow>(
    `SELECT g.*, su.name AS student_name, sch.name AS school_name,
            (g.status NOT IN ('RESOLVED','CLOSED') AND g.due_at IS NOT NULL AND g.due_at < NOW()) AS overdue
     FROM parent_grievances g
     JOIN students st ON st.id=g.student_id JOIN users su ON su.id=st.user_id JOIN schools sch ON sch.id=g.school_id
     WHERE g.parent_user_id=$1 ORDER BY g.created_at DESC`, [parentUserId],
  );
  return rows;
}

export async function getForParent(parentUserId: UUID, grievanceId: UUID): Promise<GrievanceDetail> {
  const detail = await detailById(grievanceId, 'AND g.parent_user_id = $2', [parentUserId]);
  detail.messages = detail.messages.filter((m) => !m.is_internal);
  return detail;
}

export async function parentReply(parentUserId: UUID, grievanceId: UUID, body: string) {
  const g = await getForParent(parentUserId, grievanceId);
  if (g.status === 'CLOSED') throw appError('Closed concerns cannot receive new replies', 409);
  await query(`INSERT INTO grievance_messages (grievance_id, author_user_id, body) VALUES ($1,$2,$3)`, [grievanceId, parentUserId, body.trim()]);
  await query(`INSERT INTO grievance_history (grievance_id, actor_user_id, action, from_status, to_status, note) VALUES ($1,$2,'PARENT_REPLY',$3::grievance_status,$3::grievance_status,$4)`, [grievanceId, parentUserId, g.status, body.trim().slice(0, 500)]);
  if (g.assigned_to) await notifications.saveNotification({ userId: g.assigned_to, schoolId: g.school_id, type: 'GRIEVANCE_REPLY', title: `Parent replied to ${g.ticket_number}`, body: body.trim().slice(0, 180), refId: grievanceId, refType: 'GRIEVANCE' });
  return getForParent(parentUserId, grievanceId);
}

export async function parentAction(parentUserId: UUID, grievanceId: UUID, action: 'CLOSE'|'REOPEN'|'ESCALATE', note?: string) {
  const g = await getForParent(parentUserId, grievanceId);
  let next: GrievanceStatus;
  if (action === 'CLOSE') {
    if (g.status !== 'RESOLVED') throw appError('Only a resolved concern can be closed', 409);
    next = 'CLOSED';
  } else if (action === 'REOPEN') {
    if (!['RESOLVED','CLOSED'].includes(g.status)) throw appError('Only a resolved or closed concern can be reopened', 409);
    if (Number(g.reopen_count || 0) >= await reopenLimit()) throw appError('Reopen limit reached. Escalate this concern to Platform Admin.', 409);
    next = 'IN_PROGRESS';
  } else {
    if (g.status === 'ESCALATED') throw appError('This concern is already escalated to Platform Admin', 409);
    next = 'ESCALATED';
  }
  await query(
    `UPDATE parent_grievances SET status=$2::grievance_status,
       closed_at=CASE
         WHEN $2::grievance_status='CLOSED'::grievance_status THEN NOW()
         WHEN $2::grievance_status IN ('IN_PROGRESS'::grievance_status,'ESCALATED'::grievance_status) THEN NULL
         ELSE closed_at END,
       escalated_at=CASE WHEN $2::grievance_status='ESCALATED'::grievance_status THEN NOW() ELSE escalated_at END,
       resolved_at=CASE WHEN $2::grievance_status IN ('IN_PROGRESS'::grievance_status,'ESCALATED'::grievance_status) THEN NULL ELSE resolved_at END,
       reopen_count=reopen_count + CASE WHEN $3::text='REOPEN' THEN 1 ELSE 0 END
     WHERE id=$1`, [grievanceId, next, action],
  );
  await query(`INSERT INTO grievance_history (grievance_id, actor_user_id, action, from_status, to_status, note) VALUES ($1,$2,$3,$4::grievance_status,$5::grievance_status,$6)`, [grievanceId, parentUserId, action, g.status, next, note || null]);
  if (g.assigned_to) await notifications.saveNotification({ userId: g.assigned_to, schoolId: g.school_id, type: 'GRIEVANCE_UPDATED', title: `${g.ticket_number} ${action.toLowerCase()}`, body: note || `Parent changed status to ${next}`, refId: grievanceId, refType: 'GRIEVANCE' });
  if (next === 'ESCALATED') await notifyPlatformAdmins(`Escalated concern ${g.ticket_number}`, `${g.student_name} · ${g.school_name}: ${g.subject}`, grievanceId);
  return getForParent(parentUserId, grievanceId);
}

async function schoolIdForAdmin(adminUserId: UUID): Promise<UUID> {
  const { rows: [row] } = await query<{ id: UUID } & QueryResultRow>(`SELECT id FROM schools WHERE admin_user_id=$1`, [adminUserId]);
  if (!row) throw appError('School Admin profile not found', 403);
  return row.id;
}

export async function listForSchool(adminUserId: UUID, status?: string) {
  const schoolId = await schoolIdForAdmin(adminUserId);
  const { rows } = await query<GrievanceRow>(
    `SELECT g.*, pu.name AS parent_name, su.name AS student_name,
            (g.status NOT IN ('RESOLVED','CLOSED') AND g.due_at IS NOT NULL AND g.due_at < NOW()) AS overdue
     FROM parent_grievances g JOIN users pu ON pu.id=g.parent_user_id JOIN students st ON st.id=g.student_id JOIN users su ON su.id=st.user_id
     WHERE g.school_id=$1 AND ($2::text IS NULL OR g.status::text=$2::text) ORDER BY (g.status='ESCALATED') DESC, g.created_at DESC`,
    [schoolId, status || null],
  );
  return rows;
}

export async function getForSchool(adminUserId: UUID, grievanceId: UUID): Promise<GrievanceDetail> {
  const schoolId = await schoolIdForAdmin(adminUserId);
  return detailById(grievanceId, 'AND g.school_id = $2', [schoolId]);
}

export async function schoolReply(adminUserId: UUID, grievanceId: UUID, body: string, internal = false) {
  const g = await getForSchool(adminUserId, grievanceId);
  if (g.status === 'CLOSED') throw appError('Closed concerns cannot receive replies', 409);
  await query(`INSERT INTO grievance_messages (grievance_id, author_user_id, body, is_internal) VALUES ($1,$2,$3,$4)`, [grievanceId, adminUserId, body.trim(), internal]);
  await query(`INSERT INTO grievance_history (grievance_id, actor_user_id, action, from_status, to_status, note) VALUES ($1,$2,$3,$4::grievance_status,$4::grievance_status,$5)`, [grievanceId, adminUserId, internal ? 'INTERNAL_NOTE' : 'SCHOOL_REPLY', g.status, body.trim().slice(0, 500)]);
  if (!internal) await notifications.saveNotification({ userId: g.parent_user_id, schoolId: g.school_id, type: 'GRIEVANCE_REPLY', title: `School replied to ${g.ticket_number}`, body: body.trim().slice(0, 180), refId: grievanceId, refType: 'GRIEVANCE' });
  return getForSchool(adminUserId, grievanceId);
}

export async function schoolAction(adminUserId: UUID, grievanceId: UUID, action: 'ACKNOWLEDGE'|'START'|'RESOLVE', note?: string) {
  const g = await getForSchool(adminUserId, grievanceId);
  if (g.status === 'CLOSED') throw appError('Closed concern cannot be changed', 409);
  if (g.status === 'ESCALATED') throw appError('Escalated concerns are controlled by Platform Admin. The School may still reply, but cannot downgrade the status.', 409);
  const next: GrievanceStatus = action === 'ACKNOWLEDGE' ? 'ACKNOWLEDGED' : action === 'START' ? 'IN_PROGRESS' : 'RESOLVED';
  if (action === 'ACKNOWLEDGE' && g.status !== 'OPEN') throw appError('Only an open concern can be acknowledged', 409);
  if (action === 'START' && !['OPEN','ACKNOWLEDGED'].includes(g.status)) throw appError('Concern cannot enter review from its current status', 409);
  if (action === 'RESOLVE' && !['ACKNOWLEDGED','IN_PROGRESS'].includes(g.status)) throw appError('Concern must be acknowledged or in review before resolution', 409);
  if (action === 'RESOLVE' && !note?.trim()) throw appError('Resolution is required', 400);
  await query(
    `UPDATE parent_grievances SET status=$2::grievance_status,
       acknowledged_at=CASE WHEN $2::grievance_status='ACKNOWLEDGED'::grievance_status THEN COALESCE(acknowledged_at,NOW()) ELSE acknowledged_at END,
       resolved_at=CASE WHEN $2::grievance_status='RESOLVED'::grievance_status THEN NOW() ELSE resolved_at END,
       resolution=CASE WHEN $2::grievance_status='RESOLVED'::grievance_status THEN $3::text ELSE resolution END
     WHERE id=$1`, [grievanceId, next, note || null],
  );
  await query(`INSERT INTO grievance_history (grievance_id, actor_user_id, action, from_status, to_status, note) VALUES ($1,$2,$3,$4::grievance_status,$5::grievance_status,$6)`, [grievanceId, adminUserId, action, g.status, next, note || null]);
  await notifications.saveNotification({ userId: g.parent_user_id, schoolId: g.school_id, type: next === 'RESOLVED' ? 'GRIEVANCE_RESOLVED' : 'GRIEVANCE_UPDATED', title: `${g.ticket_number}: ${next.replace('_',' ')}`, body: note || `School updated your concern to ${next}`, refId: grievanceId, refType: 'GRIEVANCE' });
  return getForSchool(adminUserId, grievanceId);
}

export async function listForAdmin(status?: string, schoolId?: string) {
  const { rows } = await query<GrievanceRow>(
    `SELECT g.*, pu.name AS parent_name, su.name AS student_name, sch.name AS school_name,
            (g.status NOT IN ('RESOLVED','CLOSED') AND g.due_at IS NOT NULL AND g.due_at < NOW()) AS overdue
     FROM parent_grievances g JOIN users pu ON pu.id=g.parent_user_id JOIN students st ON st.id=g.student_id JOIN users su ON su.id=st.user_id JOIN schools sch ON sch.id=g.school_id
     WHERE ($1::text IS NULL OR g.status::text=$1::text) AND ($2::uuid IS NULL OR g.school_id=$2::uuid)
     ORDER BY (g.status='ESCALATED') DESC, (g.due_at < NOW() AND g.status NOT IN ('RESOLVED','CLOSED')) DESC, g.created_at DESC`,
    [status || null, schoolId || null],
  );
  return rows;
}

export async function getForAdmin(grievanceId: UUID): Promise<GrievanceDetail> { return detailById(grievanceId); }

export async function adminReply(adminUserId: UUID, grievanceId: UUID, body: string, internal = false) {
  const g = await getForAdmin(grievanceId);
  await query(`INSERT INTO grievance_messages (grievance_id, author_user_id, body, is_internal) VALUES ($1,$2,$3,$4)`, [grievanceId, adminUserId, body.trim(), internal]);
  await query(`INSERT INTO grievance_history (grievance_id, actor_user_id, action, from_status, to_status, note) VALUES ($1,$2,$3,$4::grievance_status,$4::grievance_status,$5)`, [grievanceId, adminUserId, internal ? 'ADMIN_INTERNAL_NOTE' : 'ADMIN_REPLY', g.status, body.trim().slice(0, 500)]);
  if (!internal) await notifications.saveNotification({ userId: g.parent_user_id, schoolId: g.school_id, type: 'GRIEVANCE_REPLY', title: `Platform Admin replied to ${g.ticket_number}`, body: body.trim().slice(0, 180), refId: grievanceId, refType: 'GRIEVANCE' });
  return getForAdmin(grievanceId);
}

export async function adminAction(adminUserId: UUID, grievanceId: UUID, status: GrievanceStatus, note?: string) {
  const g = await getForAdmin(grievanceId);
  await query(
    `UPDATE parent_grievances SET status=$2::grievance_status,
       resolved_at=CASE
         WHEN $2::grievance_status='RESOLVED'::grievance_status THEN NOW()
         WHEN $2::grievance_status IN ('OPEN'::grievance_status,'ACKNOWLEDGED'::grievance_status,'IN_PROGRESS'::grievance_status,'ESCALATED'::grievance_status) THEN NULL
         ELSE resolved_at END,
       closed_at=CASE WHEN $2::grievance_status='CLOSED'::grievance_status THEN NOW() ELSE NULL END,
       escalated_at=CASE WHEN $2::grievance_status='ESCALATED'::grievance_status THEN COALESCE(escalated_at,NOW()) ELSE escalated_at END,
       resolution=CASE WHEN $2::grievance_status='RESOLVED'::grievance_status AND $3::text IS NOT NULL THEN $3::text ELSE resolution END
     WHERE id=$1`,
    [grievanceId, status, note || null],
  );
  await query(`INSERT INTO grievance_history (grievance_id, actor_user_id, action, from_status, to_status, note) VALUES ($1,$2,'ADMIN_STATUS',$3::grievance_status,$4::grievance_status,$5)`, [grievanceId, adminUserId, g.status, status, note || null]);
  await notifications.saveNotification({ userId: g.parent_user_id, schoolId: g.school_id, type: status === 'RESOLVED' ? 'GRIEVANCE_RESOLVED' : 'GRIEVANCE_UPDATED', title: `${g.ticket_number}: Platform Admin update`, body: note || `Status changed to ${status}`, refId: grievanceId, refType: 'GRIEVANCE' });
  if (g.assigned_to) await notifications.saveNotification({ userId: g.assigned_to, schoolId: g.school_id, type: 'GRIEVANCE_UPDATED', title: `${g.ticket_number}: Platform Admin update`, body: note || `Status changed to ${status}`, refId: grievanceId, refType: 'GRIEVANCE' });
  return getForAdmin(grievanceId);
}
