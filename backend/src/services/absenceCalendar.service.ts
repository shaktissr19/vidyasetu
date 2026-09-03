import type { PoolClient, QueryResultRow } from 'pg';
import type { UserRole, UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';
import { saveNotification } from './notification.service';

export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type CalendarEventType = 'HOLIDAY' | 'SCHOOL_EVENT' | 'PTM' | 'EXAM' | 'ACTIVITY' | 'OTHER';

export interface LeaveCreateInput {
  startDate: string;
  endDate: string;
  reason: string;
}
export interface LeaveReviewInput {
  action: 'APPROVE' | 'REJECT';
  note?: string | null;
}
export interface CalendarEventInput {
  title: string;
  description?: string | null;
  eventType: CalendarEventType;
  startDate: string;
  endDate: string;
  isSchoolClosed?: boolean;
  classIds?: UUID[];
}
export interface AttendanceCandidate {
  studentId: UUID;
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'HOLIDAY' | 'HALF_DAY';
  remark?: string | null;
}
export type AttendanceResolved = Omit<AttendanceCandidate, 'status'> & {
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'HOLIDAY' | 'HALF_DAY' | 'EXCUSED';
};

interface StudentContextRow extends QueryResultRow {
  id: UUID;
  user_id: UUID;
  school_id: UUID;
  class_id: UUID;
  name: string;
  class_name: string;
  section: string | null;
}
interface LeaveRow extends QueryResultRow {
  id: UUID;
  school_id: UUID;
  student_id: UUID;
  requested_by: UUID;
  requester_role: 'STUDENT' | 'PARENT';
  start_date: string | Date;
  end_date: string | Date;
  reason: string;
  status: LeaveStatus;
  reviewed_by: UUID | null;
  reviewed_at: string | Date | null;
  review_note: string | null;
  cancelled_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
  student_name?: string;
  student_code?: string;
  class_id?: UUID;
  class_name?: string;
  section?: string | null;
  requester_name?: string;
  reviewer_name?: string | null;
}
interface TeacherClassRow extends QueryResultRow { class_id: UUID; }
interface CountRow extends QueryResultRow { count: number | string; }
interface CalendarRow extends QueryResultRow {
  id: UUID;
  school_id: UUID;
  title: string;
  description: string | null;
  event_type: CalendarEventType;
  start_date: string | Date;
  end_date: string | Date;
  is_school_closed: boolean;
  is_active: boolean;
  created_by: UUID;
  created_at: string | Date;
  updated_at: string | Date;
  class_ids?: UUID[];
  class_labels?: string[];
}
interface RecipientRow extends QueryResultRow {
  user_id: UUID;
  role: 'STUDENT' | 'PARENT';
}
interface ApprovedLeaveStudentRow extends QueryResultRow { student_id: UUID; }
interface ClosedDayRow extends QueryResultRow { id: UUID; title: string; }

function httpError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}
function isoDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}
function assertDateRange(startDate: string, endDate: string, maxDays = 60): void {
  if (startDate > endDate) throw httpError('Start date cannot be after end date', 400);
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) throw httpError('Invalid date range', 400);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (days > maxDays) throw httpError(`Date range cannot exceed ${maxDays} days`, 400);
}

async function studentForUser(userId: UUID): Promise<StudentContextRow> {
  const { rows: [row] } = await query<StudentContextRow>(
    `SELECT s.id,s.user_id,s.school_id,s.class_id,u.name,sc.class_name,sc.section
     FROM students s
     JOIN users u ON u.id=s.user_id
     JOIN school_classes sc ON sc.id=s.class_id
     WHERE s.user_id=$1 AND s.status='ACTIVE' AND s.school_link_status='APPROVED'
       AND s.school_id IS NOT NULL AND s.class_id IS NOT NULL
     LIMIT 1`,
    [userId],
  );
  if (!row) throw httpError('An approved active School enrollment is required for leave requests', 403);
  return row;
}

async function parentChild(parentUserId: UUID, studentId: UUID): Promise<StudentContextRow> {
  const { rows: [row] } = await query<StudentContextRow>(
    `SELECT s.id,s.user_id,s.school_id,s.class_id,u.name,sc.class_name,sc.section
     FROM parent_student_links psl
     JOIN students s ON s.id=psl.student_id
     JOIN users u ON u.id=s.user_id
     JOIN school_classes sc ON sc.id=s.class_id
     WHERE psl.parent_user_id=$1 AND s.id=$2
       AND s.status='ACTIVE' AND s.school_link_status='APPROVED'
       AND s.school_id IS NOT NULL AND s.class_id IS NOT NULL
     LIMIT 1`,
    [parentUserId, studentId],
  );
  if (!row) throw httpError('You are not linked to this Student', 403);
  return row;
}

async function noOverlappingLeave(
  client: PoolClient,
  studentId: UUID,
  startDate: string,
  endDate: string,
  excludeId: UUID | null = null,
): Promise<void> {
  await client.query('SELECT id FROM students WHERE id=$1 FOR UPDATE', [studentId]);
  const { rows: [overlap] } = await client.query<CountRow>(
    `SELECT COUNT(*)::int AS count
     FROM student_leave_requests
     WHERE student_id=$1 AND status IN ('PENDING','APPROVED')
       AND start_date <= $3::date AND end_date >= $2::date
       AND ($4::uuid IS NULL OR id<>$4::uuid)`,
    [studentId, startDate, endDate, excludeId],
  );
  if (Number(overlap?.count || 0) > 0) throw httpError('An overlapping pending or approved leave request already exists', 409);
}

async function createLeave(
  student: StudentContextRow,
  requestedBy: UUID,
  requesterRole: 'STUDENT' | 'PARENT',
  input: LeaveCreateInput,
): Promise<LeaveRow> {
  assertDateRange(input.startDate, input.endDate, 60);
  const leave = await transaction(async (client) => {
    await noOverlappingLeave(client, student.id, input.startDate, input.endDate);
    const { rows: [created] } = await client.query<LeaveRow>(
      `INSERT INTO student_leave_requests
         (school_id,student_id,requested_by,requester_role,start_date,end_date,reason)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [student.school_id, student.id, requestedBy, requesterRole, input.startDate, input.endDate, input.reason.trim()],
    );
    if (!created) throw new Error('Leave request insert returned no row');
    return created;
  });

  const { rows: reviewers } = await query<{ user_id: UUID } & QueryResultRow>(
    `SELECT DISTINCT u.id AS user_id
     FROM users u
     LEFT JOIN schools sch ON sch.admin_user_id=u.id AND sch.id=$1
     LEFT JOIN teachers t ON t.user_id=u.id AND t.school_id=$1 AND t.status='ACTIVE'
     LEFT JOIN teacher_assignments ta ON ta.teacher_id=t.id AND ta.class_id=$2 AND ta.is_class_teacher=TRUE
     WHERE sch.id IS NOT NULL OR ta.id IS NOT NULL`,
    [student.school_id, student.class_id],
  );
  await Promise.all(reviewers.map((reviewer) => saveNotification({
    userId: reviewer.user_id,
    schoolId: student.school_id,
    type: 'LEAVE_SUBMITTED',
    title: `Leave request · ${student.name}`,
    body: `${student.name} requested leave from ${input.startDate} to ${input.endDate}.`,
    refId: leave.id,
    refType: 'STUDENT_LEAVE_REQUEST',
  })));
  return leave;
}

export async function createStudentLeave(userId: UUID, input: LeaveCreateInput): Promise<LeaveRow> {
  const student = await studentForUser(userId);
  return createLeave(student, userId, 'STUDENT', input);
}
export async function createParentLeave(parentUserId: UUID, studentId: UUID, input: LeaveCreateInput): Promise<LeaveRow> {
  const student = await parentChild(parentUserId, studentId);
  return createLeave(student, parentUserId, 'PARENT', input);
}

function leaveSelect(whereSql: string): string {
  return `SELECT lr.*,u.name AS student_name,s.student_code,s.class_id,sc.class_name,sc.section,
                 requester.name AS requester_name,reviewer.name AS reviewer_name
          FROM student_leave_requests lr
          JOIN students s ON s.id=lr.student_id
          JOIN users u ON u.id=s.user_id
          JOIN school_classes sc ON sc.id=s.class_id
          JOIN users requester ON requester.id=lr.requested_by
          LEFT JOIN users reviewer ON reviewer.id=lr.reviewed_by
          WHERE ${whereSql}
          ORDER BY CASE lr.status WHEN 'PENDING' THEN 0 ELSE 1 END,lr.start_date DESC,lr.created_at DESC`;
}

export async function listStudentLeaves(userId: UUID): Promise<LeaveRow[]> {
  const student = await studentForUser(userId);
  return (await query<LeaveRow>(leaveSelect('lr.student_id=$1'), [student.id])).rows;
}
export async function listParentLeaves(parentUserId: UUID, studentId: UUID): Promise<LeaveRow[]> {
  await parentChild(parentUserId, studentId);
  return (await query<LeaveRow>(leaveSelect('lr.student_id=$1'), [studentId])).rows;
}

async function cancelLeave(requesterId: UUID, leaveId: UUID, studentId?: UUID): Promise<LeaveRow> {
  return transaction(async (client) => {
    const { rows: [row] } = await client.query<LeaveRow>('SELECT * FROM student_leave_requests WHERE id=$1 FOR UPDATE', [leaveId]);
    if (!row) throw httpError('Leave request not found', 404);
    if (studentId && row.student_id !== studentId) throw httpError('Leave request does not belong to this Student', 403);
    if (row.requested_by !== requesterId) throw httpError('Only the original requester can cancel this leave request', 403);
    if (row.status !== 'PENDING') throw httpError('Only a pending leave request can be cancelled', 409);
    const { rows: [updated] } = await client.query<LeaveRow>(
      `UPDATE student_leave_requests SET status='CANCELLED',cancelled_at=NOW() WHERE id=$1 RETURNING *`, [leaveId],
    );
    if (!updated) throw new Error('Leave cancellation returned no row');
    return updated;
  });
}
export async function cancelStudentLeave(userId: UUID, leaveId: UUID): Promise<LeaveRow> {
  const student = await studentForUser(userId);
  return cancelLeave(userId, leaveId, student.id);
}
export async function cancelParentLeave(parentUserId: UUID, studentId: UUID, leaveId: UUID): Promise<LeaveRow> {
  await parentChild(parentUserId, studentId);
  return cancelLeave(parentUserId, leaveId, studentId);
}

async function teacherClassIds(schoolId: UUID, teacherId: UUID): Promise<UUID[]> {
  const { rows } = await query<TeacherClassRow>(
    `SELECT DISTINCT ta.class_id FROM teacher_assignments ta
     WHERE ta.school_id=$1 AND ta.teacher_id=$2 AND ta.is_class_teacher=TRUE`,
    [schoolId, teacherId],
  );
  return rows.map((row) => row.class_id);
}

async function assertCanReview(client: PoolClient, schoolId: UUID, role: UserRole, teacherId: UUID | undefined, classId: UUID): Promise<void> {
  if (role === 'SCHOOL_ADMIN' || role === 'SUPER_ADMIN') return;
  if (role !== 'TEACHER' || !teacherId) throw httpError('Leave review is restricted to School Admins and class teachers', 403);
  const { rows: [assigned] } = await client.query<CountRow>(
    `SELECT COUNT(*)::int AS count FROM teacher_assignments
     WHERE school_id=$1 AND teacher_id=$2 AND class_id=$3 AND is_class_teacher=TRUE`,
    [schoolId, teacherId, classId],
  );
  if (Number(assigned?.count || 0) < 1) throw httpError('Only the assigned class teacher can review this leave request', 403);
}

export async function listSchoolLeaves(schoolId: UUID, role: UserRole, teacherId?: UUID, status?: LeaveStatus): Promise<LeaveRow[]> {
  let scope = 'lr.school_id=$1';
  const params: unknown[] = [schoolId];
  if (role === 'TEACHER') {
    if (!teacherId) throw httpError('Teacher profile is required', 403);
    const classes = await teacherClassIds(schoolId, teacherId);
    if (!classes.length) return [];
    params.push(classes);
    scope += ` AND s.class_id=ANY($${params.length}::uuid[])`;
  }
  if (status) {
    params.push(status);
    scope += ` AND lr.status=$${params.length}`;
  }
  return (await query<LeaveRow>(leaveSelect(scope), params)).rows;
}

async function decisionRecipients(studentId: UUID): Promise<RecipientRow[]> {
  return (await query<RecipientRow>(
    `SELECT s.user_id,'STUDENT'::text AS role FROM students s WHERE s.id=$1
     UNION ALL
     SELECT psl.parent_user_id,'PARENT'::text AS role FROM parent_student_links psl WHERE psl.student_id=$1`,
    [studentId],
  )).rows;
}

export async function reviewLeave(
  schoolId: UUID,
  reviewerUserId: UUID,
  role: UserRole,
  teacherId: UUID | undefined,
  leaveId: UUID,
  input: LeaveReviewInput,
): Promise<LeaveRow> {
  const updated = await transaction(async (client) => {
    const { rows: [row] } = await client.query<LeaveRow & { class_id: UUID }>(
      `SELECT lr.*,s.class_id FROM student_leave_requests lr
       JOIN students s ON s.id=lr.student_id
       WHERE lr.id=$1 AND lr.school_id=$2 FOR UPDATE OF lr`,
      [leaveId, schoolId],
    );
    if (!row) throw httpError('Leave request not found in this School', 404);
    if (row.status !== 'PENDING') throw httpError('Only a pending leave request can be reviewed', 409);
    await assertCanReview(client, schoolId, role, teacherId, row.class_id);
    const nextStatus: LeaveStatus = input.action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const { rows: [decision] } = await client.query<LeaveRow>(
      `UPDATE student_leave_requests SET status=$2,reviewed_by=$3,reviewed_at=NOW(),review_note=$4 WHERE id=$1 RETURNING *`,
      [leaveId, nextStatus, reviewerUserId, input.note?.trim() || null],
    );
    if (!decision) throw new Error('Leave review returned no row');
    if (nextStatus === 'APPROVED') {
      await client.query(
        `UPDATE attendance SET status='EXCUSED',remark=CASE
           WHEN remark IS NULL OR btrim(remark)='' THEN 'Approved leave'
           ELSE remark || ' · Approved leave' END,marked_by=$2
         WHERE student_id=$1 AND date BETWEEN $3::date AND $4::date AND status='ABSENT'`,
        [row.student_id, reviewerUserId, row.start_date, row.end_date],
      );
    }
    return decision;
  });

  const recipients = await decisionRecipients(updated.student_id);
  const approved = updated.status === 'APPROVED';
  await Promise.all(recipients.map((recipient) => saveNotification({
    userId: recipient.user_id,
    schoolId,
    type: approved ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
    title: approved ? 'Leave approved' : 'Leave request declined',
    body: `Leave from ${isoDate(updated.start_date)} to ${isoDate(updated.end_date)} was ${approved ? 'approved' : 'declined'}.${updated.review_note ? ` Note: ${updated.review_note}` : ''}`,
    refId: updated.id,
    refType: 'STUDENT_LEAVE_REQUEST',
  })));
  return updated;
}

async function validateCalendarClasses(client: PoolClient, schoolId: UUID, classIds: UUID[]): Promise<void> {
  if (!classIds.length) return;
  const unique = [...new Set(classIds)];
  const { rows: [count] } = await client.query<CountRow>(
    `SELECT COUNT(*)::int AS count FROM school_classes WHERE school_id=$1 AND id=ANY($2::uuid[])`,
    [schoolId, unique],
  );
  if (Number(count?.count || 0) !== unique.length) throw httpError('Calendar event contains a class outside this School', 400);
}

async function setCalendarClasses(client: PoolClient, eventId: UUID, schoolId: UUID, classIds: UUID[]): Promise<void> {
  const unique = [...new Set(classIds)];
  await validateCalendarClasses(client, schoolId, unique);
  await client.query('DELETE FROM school_calendar_event_classes WHERE event_id=$1', [eventId]);
  for (const classId of unique) await client.query('INSERT INTO school_calendar_event_classes(event_id,class_id) VALUES($1,$2)', [eventId, classId]);
}

export async function createCalendarEvent(schoolId: UUID, createdBy: UUID, input: CalendarEventInput): Promise<CalendarRow> {
  assertDateRange(input.startDate, input.endDate, 366);
  if (input.isSchoolClosed && input.eventType !== 'HOLIDAY') throw httpError('Only a HOLIDAY event can close the School', 400);
  return transaction(async (client) => {
    const { rows: [row] } = await client.query<CalendarRow>(
      `INSERT INTO school_calendar_events
         (school_id,title,description,event_type,start_date,end_date,is_school_closed,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [schoolId, input.title.trim(), input.description?.trim() || null, input.eventType,
       input.startDate, input.endDate, Boolean(input.isSchoolClosed), createdBy],
    );
    if (!row) throw new Error('Calendar event insert returned no row');
    await setCalendarClasses(client, row.id, schoolId, input.classIds || []);
    return row;
  });
}

export async function updateCalendarEvent(schoolId: UUID, eventId: UUID, input: Partial<CalendarEventInput>): Promise<CalendarRow> {
  return transaction(async (client) => {
    const { rows: [current] } = await client.query<CalendarRow>(
      'SELECT * FROM school_calendar_events WHERE id=$1 AND school_id=$2 AND is_active=TRUE FOR UPDATE',
      [eventId, schoolId],
    );
    if (!current) throw httpError('Calendar event not found', 404);
    const startDate = input.startDate || isoDate(current.start_date);
    const endDate = input.endDate || isoDate(current.end_date);
    assertDateRange(startDate, endDate, 366);
    const eventType = input.eventType || current.event_type;
    const closed = typeof input.isSchoolClosed === 'boolean' ? input.isSchoolClosed : current.is_school_closed;
    if (closed && eventType !== 'HOLIDAY') throw httpError('Only a HOLIDAY event can close the School', 400);
    const { rows: [row] } = await client.query<CalendarRow>(
      `UPDATE school_calendar_events SET
         title=COALESCE($3,title),description=CASE WHEN $4::boolean THEN $5 ELSE description END,event_type=$6,
         start_date=$7,end_date=$8,is_school_closed=$9
       WHERE id=$1 AND school_id=$2 RETURNING *`,
      [eventId, schoolId, input.title?.trim() || null, input.description !== undefined,
       input.description?.trim() || null, eventType, startDate, endDate, closed],
    );
    if (!row) throw new Error('Calendar event update returned no row');
    if (input.classIds) await setCalendarClasses(client, eventId, schoolId, input.classIds);
    return row;
  });
}

export async function archiveCalendarEvent(schoolId: UUID, eventId: UUID): Promise<CalendarRow> {
  const { rows: [row] } = await query<CalendarRow>(
    `UPDATE school_calendar_events SET is_active=FALSE WHERE id=$1 AND school_id=$2 AND is_active=TRUE RETURNING *`,
    [eventId, schoolId],
  );
  if (!row) throw httpError('Calendar event not found', 404);
  return row;
}

function calendarSelect(scope: string): string {
  return `SELECT sce.*,
          COALESCE(array_agg(scec.class_id) FILTER (WHERE scec.class_id IS NOT NULL),'{}'::uuid[]) AS class_ids,
          COALESCE(array_agg(sc.class_name || CASE WHEN sc.section IS NULL OR sc.section='' THEN '' ELSE '-' || sc.section END)
                   FILTER (WHERE sc.id IS NOT NULL),'{}'::text[]) AS class_labels
          FROM school_calendar_events sce
          LEFT JOIN school_calendar_event_classes scec ON scec.event_id=sce.id
          LEFT JOIN school_classes sc ON sc.id=scec.class_id
          WHERE sce.is_active=TRUE AND ${scope}
          GROUP BY sce.id
          ORDER BY sce.start_date,sce.title`;
}

export async function listSchoolCalendar(schoolId: UUID, from?: string, to?: string): Promise<CalendarRow[]> {
  return (await query<CalendarRow>(calendarSelect(
    `sce.school_id=$1 AND ($2::date IS NULL OR sce.end_date >= $2::date) AND ($3::date IS NULL OR sce.start_date <= $3::date)`,
  ), [schoolId, from || null, to || null])).rows;
}

async function calendarForStudent(student: StudentContextRow, from?: string, to?: string): Promise<CalendarRow[]> {
  return (await query<CalendarRow>(calendarSelect(
    `sce.school_id=$1
     AND ($3::date IS NULL OR sce.end_date >= $3::date)
     AND ($4::date IS NULL OR sce.start_date <= $4::date)
     AND (NOT EXISTS (SELECT 1 FROM school_calendar_event_classes all_scope WHERE all_scope.event_id=sce.id)
          OR EXISTS (SELECT 1 FROM school_calendar_event_classes own_scope WHERE own_scope.event_id=sce.id AND own_scope.class_id=$2))`,
  ), [student.school_id, student.class_id, from || null, to || null])).rows;
}
export async function listStudentCalendar(userId: UUID, from?: string, to?: string): Promise<CalendarRow[]> {
  return calendarForStudent(await studentForUser(userId), from, to);
}
export async function listParentCalendar(parentUserId: UUID, studentId: UUID, from?: string, to?: string): Promise<CalendarRow[]> {
  return calendarForStudent(await parentChild(parentUserId, studentId), from, to);
}

export async function resolveAttendanceRecords(
  schoolId: UUID,
  classId: UUID,
  date: string,
  records: AttendanceCandidate[],
): Promise<AttendanceResolved[]> {
  const { rows: [closedDay] } = await query<ClosedDayRow>(
    `SELECT sce.id,sce.title FROM school_calendar_events sce
     WHERE sce.school_id=$1 AND sce.is_active=TRUE AND sce.is_school_closed=TRUE
       AND $3::date BETWEEN sce.start_date AND sce.end_date
       AND (NOT EXISTS (SELECT 1 FROM school_calendar_event_classes x WHERE x.event_id=sce.id)
            OR EXISTS (SELECT 1 FROM school_calendar_event_classes y WHERE y.event_id=sce.id AND y.class_id=$2))
     ORDER BY sce.start_date LIMIT 1`,
    [schoolId, classId, date],
  );
  if (closedDay) {
    if (records.some((record) => record.status !== 'HOLIDAY')) {
      throw httpError(`Attendance cannot be marked as a working day because the School calendar is closed: ${closedDay.title}`, 409);
    }
    return records;
  }

  const studentIds = records.map((record) => record.studentId);
  const { rows: approved } = await query<ApprovedLeaveStudentRow>(
    `SELECT DISTINCT student_id FROM student_leave_requests
     WHERE school_id=$1 AND student_id=ANY($2::uuid[]) AND status='APPROVED'
       AND $3::date BETWEEN start_date AND end_date`,
    [schoolId, studentIds, date],
  );
  const excused = new Set(approved.map((row) => row.student_id));
  return records.map((record) => record.status === 'ABSENT' && excused.has(record.studentId)
    ? { ...record, status: 'EXCUSED', remark: record.remark?.trim() || 'Approved leave' }
    : record);
}
