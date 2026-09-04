import type { PoolClient, QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';
import { saveNotification } from './notification.service';

export type StaffLeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type StaffAttendanceInputStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY' | 'HOLIDAY';
export type StaffAttendanceStatus = StaffAttendanceInputStatus | 'EXCUSED';

export interface StaffLeaveCreateInput {
  startDate: string;
  endDate: string;
  reason: string;
}
export interface StaffLeaveReviewInput {
  action: 'APPROVE' | 'REJECT';
  note?: string | null;
}
export interface StaffAttendanceInput {
  teacherId: UUID;
  status: StaffAttendanceInputStatus;
  remark?: string | null;
}

interface SchemaRow extends QueryResultRow {
  leave_table: boolean;
  attendance_table: boolean;
  calendar_table: boolean;
  calendar_scope_table: boolean;
  status_enum: boolean;
}
interface TeacherContextRow extends QueryResultRow {
  id: UUID;
  user_id: UUID;
  school_id: UUID;
  employee_id: string | null;
  profile_status: string;
  name: string;
}
interface StaffLeaveRow extends QueryResultRow {
  id: UUID;
  school_id: UUID;
  teacher_id: UUID;
  requested_by: UUID;
  start_date: string | Date;
  end_date: string | Date;
  reason: string;
  status: StaffLeaveStatus;
  reviewed_by: UUID | null;
  reviewed_at: string | Date | null;
  review_note: string | null;
  cancelled_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
  teacher_name?: string;
  employee_id?: string | null;
  designation?: string | null;
  reviewer_name?: string | null;
}
interface CountRow extends QueryResultRow { count: number | string; }
interface AdminRow extends QueryResultRow { admin_user_id: UUID; }
interface ClosedDayRow extends QueryResultRow { id: UUID; title: string; }
interface ApprovedLeaveRow extends QueryResultRow { teacher_id: UUID; leave_id?: UUID; reason?: string; }
interface AttendanceSavedRow extends QueryResultRow {
  id: UUID;
  teacher_id: UUID;
  status: StaffAttendanceStatus;
  date: string | Date;
}
interface StaffRosterDbRow extends QueryResultRow {
  id: UUID;
  employee_id: string | null;
  designation: string | null;
  profile_status: string;
  name: string;
  attendance_status: StaffAttendanceStatus | null;
  remark: string | null;
  leave_request_id: UUID | null;
  leave_reason: string | null;
  approved_leave: boolean;
}
export type StaffRosterRow = Omit<StaffRosterDbRow, 'attendance_status' | 'remark'> & {
  attendance_status: StaffAttendanceStatus | '';
  remark: string | null;
  operational_availability: 'SCHOOL_CLOSED' | 'APPROVED_LEAVE' | 'RECORDED' | 'WORKING';
  school_closed: boolean;
  closure_title: string | null;
};

function httpError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}
function isoDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}
function assertDateRange(startDate: string, endDate: string): void {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) throw httpError('Invalid leave date range', 400);
  if (startDate > endDate) throw httpError('Leave start date cannot be after end date', 400);
  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (days > 90) throw httpError('A single staff leave request cannot exceed 90 days', 400);
}
function assertMonth(year: number, month: number): void {
  if (!Number.isInteger(year) || year < 2000 || year > 2200) throw httpError('Invalid attendance year', 400);
  if (!Number.isInteger(month) || month < 1 || month > 12) throw httpError('Invalid attendance month', 400);
}

export async function staffSchemaReady(): Promise<boolean> {
  const { rows: [row] } = await query<SchemaRow>(
    `SELECT
       to_regclass('public.teacher_leave_requests') IS NOT NULL AS leave_table,
       to_regclass('public.teacher_attendance') IS NOT NULL AS attendance_table,
       to_regclass('public.school_calendar_events') IS NOT NULL AS calendar_table,
       to_regclass('public.school_calendar_event_classes') IS NOT NULL AS calendar_scope_table,
       EXISTS (
         SELECT 1 FROM pg_type t WHERE t.typname='staff_attendance_status'
       ) AS status_enum`,
  );
  return Boolean(row?.leave_table && row?.attendance_table && row?.calendar_table && row?.calendar_scope_table && row?.status_enum);
}
async function requireSchema(): Promise<void> {
  if (!(await staffSchemaReady())) {
    throw httpError('Staff Attendance & Leave is not initialized on this environment yet', 503);
  }
}

async function teacherForUser(userId: UUID): Promise<TeacherContextRow> {
  await requireSchema();
  const { rows: [teacher] } = await query<TeacherContextRow>(
    `SELECT t.id,t.user_id,t.school_id,t.employee_id,t.status::text AS profile_status,u.name
     FROM teachers t JOIN users u ON u.id=t.user_id
     WHERE t.user_id=$1 AND t.status IN ('ACTIVE','ON_LEAVE')
     LIMIT 1`,
    [userId],
  );
  if (!teacher) throw httpError('An active Teacher profile is required', 403);
  return teacher;
}

async function assertNoOverlap(
  client: PoolClient,
  teacherId: UUID,
  startDate: string,
  endDate: string,
): Promise<void> {
  const { rows: [overlap] } = await client.query<CountRow>(
    `SELECT COUNT(*)::int AS count FROM teacher_leave_requests
     WHERE teacher_id=$1 AND status IN ('PENDING','APPROVED')
       AND start_date <= $3::date AND end_date >= $2::date`,
    [teacherId, startDate, endDate],
  );
  if (Number(overlap?.count || 0) > 0) throw httpError('An overlapping pending or approved staff leave already exists', 409);
}

export async function createMyLeave(userId: UUID, input: StaffLeaveCreateInput): Promise<StaffLeaveRow> {
  assertDateRange(input.startDate, input.endDate);
  const teacher = await teacherForUser(userId);
  const leave = await transaction(async (client) => {
    // Serialize leave creation for one Teacher so concurrent requests cannot bypass overlap protection.
    await client.query('SELECT id FROM teachers WHERE id=$1 FOR UPDATE', [teacher.id]);
    await assertNoOverlap(client, teacher.id, input.startDate, input.endDate);
    const { rows: [row] } = await client.query<StaffLeaveRow>(
      `INSERT INTO teacher_leave_requests
         (school_id,teacher_id,requested_by,start_date,end_date,reason)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [teacher.school_id, teacher.id, userId, input.startDate, input.endDate, input.reason.trim()],
    );
    if (!row) throw new Error('Staff leave insert returned no row');
    return row;
  });

  const { rows: [school] } = await query<AdminRow>('SELECT admin_user_id FROM schools WHERE id=$1', [teacher.school_id]);
  if (school?.admin_user_id) {
    await saveNotification({
      userId: school.admin_user_id,
      schoolId: teacher.school_id,
      type: 'STAFF_LEAVE_SUBMITTED',
      title: `Staff leave request · ${teacher.name}`,
      body: `${teacher.name} requested leave from ${input.startDate} to ${input.endDate}.`,
      refId: leave.id,
      refType: 'TEACHER_LEAVE_REQUEST',
    });
  }
  return leave;
}

function leaveSelect(scope: string): string {
  return `SELECT lr.*,u.name AS teacher_name,t.employee_id,t.designation,reviewer.name AS reviewer_name
          FROM teacher_leave_requests lr
          JOIN teachers t ON t.id=lr.teacher_id
          JOIN users u ON u.id=t.user_id
          LEFT JOIN users reviewer ON reviewer.id=lr.reviewed_by
          WHERE ${scope}
          ORDER BY CASE lr.status WHEN 'PENDING' THEN 0 ELSE 1 END,lr.start_date DESC,lr.created_at DESC`;
}

export async function listMyLeaves(userId: UUID): Promise<StaffLeaveRow[]> {
  const teacher = await teacherForUser(userId);
  return (await query<StaffLeaveRow>(leaveSelect('lr.teacher_id=$1'), [teacher.id])).rows;
}

export async function cancelMyLeave(userId: UUID, leaveId: UUID): Promise<StaffLeaveRow> {
  const teacher = await teacherForUser(userId);
  return transaction(async (client) => {
    const { rows: [row] } = await client.query<StaffLeaveRow>(
      'SELECT * FROM teacher_leave_requests WHERE id=$1 AND teacher_id=$2 FOR UPDATE',
      [leaveId, teacher.id],
    );
    if (!row) throw httpError('Staff leave request not found', 404);
    if (row.requested_by !== userId) throw httpError('Only the original Teacher requester can cancel this leave', 403);
    if (row.status !== 'PENDING') throw httpError('Only a pending staff leave can be cancelled', 409);
    const { rows: [updated] } = await client.query<StaffLeaveRow>(
      `UPDATE teacher_leave_requests SET status='CANCELLED',cancelled_at=NOW() WHERE id=$1 RETURNING *`,
      [leaveId],
    );
    if (!updated) throw new Error('Staff leave cancellation returned no row');
    return updated;
  });
}

export async function listSchoolLeaves(schoolId: UUID, status?: StaffLeaveStatus): Promise<StaffLeaveRow[]> {
  await requireSchema();
  const params: unknown[] = [schoolId];
  let scope = 'lr.school_id=$1';
  if (status) {
    params.push(status);
    scope += ` AND lr.status=$${params.length}`;
  }
  return (await query<StaffLeaveRow>(leaveSelect(scope), params)).rows;
}

export async function reviewSchoolLeave(
  schoolId: UUID,
  reviewerUserId: UUID,
  leaveId: UUID,
  input: StaffLeaveReviewInput,
): Promise<StaffLeaveRow> {
  await requireSchema();
  const updated = await transaction(async (client) => {
    const { rows: [row] } = await client.query<StaffLeaveRow>(
      `SELECT * FROM teacher_leave_requests WHERE id=$1 AND school_id=$2 FOR UPDATE`,
      [leaveId, schoolId],
    );
    if (!row) throw httpError('Staff leave request not found in this School', 404);
    if (row.status !== 'PENDING') throw httpError('Only a pending staff leave can be reviewed', 409);
    const next: StaffLeaveStatus = input.action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const { rows: [decision] } = await client.query<StaffLeaveRow>(
      `UPDATE teacher_leave_requests
       SET status=$2,reviewed_by=$3,reviewed_at=NOW(),review_note=$4
       WHERE id=$1 RETURNING *`,
      [leaveId, next, reviewerUserId, input.note?.trim() || null],
    );
    if (!decision) throw new Error('Staff leave review returned no row');
    if (next === 'APPROVED') {
      await client.query(
        `UPDATE teacher_attendance
         SET status='EXCUSED',remark=CASE
           WHEN remark IS NULL OR btrim(remark)='' THEN 'Approved staff leave'
           ELSE remark || ' · Approved staff leave' END,
           marked_by=$2
         WHERE teacher_id=$1 AND date BETWEEN $3::date AND $4::date AND status='ABSENT'`,
        [row.teacher_id, reviewerUserId, row.start_date, row.end_date],
      );
    }
    return decision;
  });

  const { rows: [teacher] } = await query<{ user_id: UUID } & QueryResultRow>(
    'SELECT user_id FROM teachers WHERE id=$1', [updated.teacher_id],
  );
  if (teacher?.user_id) {
    const approved = updated.status === 'APPROVED';
    await saveNotification({
      userId: teacher.user_id,
      schoolId,
      type: approved ? 'STAFF_LEAVE_APPROVED' : 'STAFF_LEAVE_REJECTED',
      title: approved ? 'Staff leave approved' : 'Staff leave declined',
      body: `Leave from ${isoDate(updated.start_date)} to ${isoDate(updated.end_date)} was ${approved ? 'approved' : 'declined'}.${updated.review_note ? ` Note: ${updated.review_note}` : ''}`,
      refId: updated.id,
      refType: 'TEACHER_LEAVE_REQUEST',
    });
  }
  return updated;
}

async function wholeSchoolClosure(schoolId: UUID, date: string): Promise<ClosedDayRow | null> {
  const { rows: [closed] } = await query<ClosedDayRow>(
    `SELECT sce.id,sce.title FROM school_calendar_events sce
     WHERE sce.school_id=$1 AND sce.is_active=TRUE AND sce.is_school_closed=TRUE
       AND $2::date BETWEEN sce.start_date AND sce.end_date
       AND NOT EXISTS (
         SELECT 1 FROM school_calendar_event_classes scoped WHERE scoped.event_id=sce.id
       )
     ORDER BY sce.start_date LIMIT 1`,
    [schoolId, date],
  );
  return closed || null;
}

export async function getStaffRoster(schoolId: UUID, date: string): Promise<StaffRosterRow[]> {
  await requireSchema();
  const [closed, roster] = await Promise.all([
    wholeSchoolClosure(schoolId, date),
    query<StaffRosterDbRow>(
      `SELECT t.id,t.employee_id,t.designation,t.status::text AS profile_status,u.name,
              ta.status::text AS attendance_status,ta.remark,
              lr.id AS leave_request_id,lr.reason AS leave_reason,
              (lr.id IS NOT NULL) AS approved_leave
       FROM teachers t JOIN users u ON u.id=t.user_id
       LEFT JOIN teacher_attendance ta ON ta.teacher_id=t.id AND ta.date=$2::date
       LEFT JOIN LATERAL (
         SELECT l.id,l.reason FROM teacher_leave_requests l
         WHERE l.teacher_id=t.id AND l.school_id=$1 AND l.status='APPROVED'
           AND $2::date BETWEEN l.start_date AND l.end_date
         ORDER BY l.reviewed_at DESC NULLS LAST LIMIT 1
       ) lr ON TRUE
       WHERE t.school_id=$1 AND t.status IN ('ACTIVE','ON_LEAVE')
       ORDER BY u.name`,
      [schoolId, date],
    ),
  ]);
  return roster.rows.map((row) => ({
    ...row,
    attendance_status: row.attendance_status || (closed ? 'HOLIDAY' : row.approved_leave ? 'EXCUSED' : ''),
    remark: row.remark || (closed ? closed.title : row.approved_leave ? 'Approved staff leave' : null),
    operational_availability: closed ? 'SCHOOL_CLOSED' : row.approved_leave ? 'APPROVED_LEAVE' : row.attendance_status ? 'RECORDED' : 'WORKING',
    school_closed: Boolean(closed),
    closure_title: closed?.title || null,
  }));
}

export async function markStaffAttendance(
  schoolId: UUID,
  date: string,
  records: StaffAttendanceInput[],
  markedBy: UUID,
): Promise<AttendanceSavedRow[]> {
  await requireSchema();
  const today = new Date().toISOString().slice(0, 10);
  if (date > today) throw httpError('Future staff attendance cannot be marked', 400);
  const closed = await wholeSchoolClosure(schoolId, date);
  if (closed && records.some((record) => record.status !== 'HOLIDAY')) {
    throw httpError(`Staff attendance must be HOLIDAY because the School calendar is closed: ${closed.title}`, 409);
  }

  const teacherIds = [...new Set(records.map((record) => record.teacherId))];
  if (teacherIds.length !== records.length) throw httpError('Staff attendance contains duplicate Teacher rows', 400);
  const { rows: [valid] } = await query<CountRow>(
    `SELECT COUNT(*)::int AS count FROM teachers
     WHERE school_id=$1 AND id=ANY($2::uuid[]) AND status IN ('ACTIVE','ON_LEAVE')`,
    [schoolId, teacherIds],
  );
  if (Number(valid?.count || 0) !== teacherIds.length) throw httpError('Staff attendance contains a Teacher outside this active School roster', 400);

  const { rows: approvedRows } = await query<ApprovedLeaveRow>(
    `SELECT DISTINCT teacher_id FROM teacher_leave_requests
     WHERE school_id=$1 AND teacher_id=ANY($2::uuid[]) AND status='APPROVED'
       AND $3::date BETWEEN start_date AND end_date`,
    [schoolId, teacherIds, date],
  );
  const approved = new Set(approvedRows.map((row) => row.teacher_id));

  return transaction(async (client) => {
    const saved: AttendanceSavedRow[] = [];
    for (const record of records) {
      const status: StaffAttendanceStatus = record.status === 'ABSENT' && approved.has(record.teacherId)
        ? 'EXCUSED'
        : record.status;
      const remark = status === 'EXCUSED'
        ? record.remark?.trim() || 'Approved staff leave'
        : record.remark?.trim() || null;
      const { rows: [row] } = await client.query<AttendanceSavedRow>(
        `INSERT INTO teacher_attendance(school_id,teacher_id,date,status,remark,marked_by)
         VALUES($1,$2,$3,$4,$5,$6)
         ON CONFLICT(teacher_id,date) DO UPDATE SET
           status=EXCLUDED.status,remark=EXCLUDED.remark,marked_by=EXCLUDED.marked_by
         RETURNING id,teacher_id,status,date`,
        [schoolId, record.teacherId, date, status, remark, markedBy],
      );
      if (row) saved.push(row);
    }
    return saved;
  });
}

function monthSummarySql(where: string): string {
  return `SELECT
            COUNT(*) FILTER (WHERE status<>'HOLIDAY')::int AS working_days,
            COUNT(*) FILTER (WHERE status='PRESENT')::int AS present_days,
            COUNT(*) FILTER (WHERE status='ABSENT')::int AS absent_days,
            COUNT(*) FILTER (WHERE status='LATE')::int AS late_days,
            COUNT(*) FILTER (WHERE status='HALF_DAY')::int AS half_days,
            COUNT(*) FILTER (WHERE status='EXCUSED')::int AS excused_days,
            COUNT(*) FILTER (WHERE status='HOLIDAY')::int AS holiday_days,
            COALESCE(ROUND(
              COUNT(*) FILTER (WHERE status IN ('PRESENT','LATE','HALF_DAY'))::decimal
              / NULLIF(COUNT(*) FILTER (WHERE status<>'HOLIDAY'),0) * 100,2
            ),0) AS attendance_percentage
          FROM teacher_attendance
          WHERE ${where}`;
}

export async function getMyAttendance(userId: UUID, year: number, month: number) {
  assertMonth(year, month);
  const teacher = await teacherForUser(userId);
  const [records, summary] = await Promise.all([
    query(
      `SELECT date,status::text,remark,created_at,updated_at FROM teacher_attendance
       WHERE teacher_id=$1 AND EXTRACT(YEAR FROM date)=$2 AND EXTRACT(MONTH FROM date)=$3
       ORDER BY date`,
      [teacher.id, year, month],
    ),
    query(monthSummarySql('teacher_id=$1 AND EXTRACT(YEAR FROM date)=$2 AND EXTRACT(MONTH FROM date)=$3'), [teacher.id, year, month]),
  ]);
  return { teacher, records: records.rows, summary: summary.rows[0] || null };
}

export async function getSchoolAttendanceSummary(schoolId: UUID, year: number, month: number) {
  await requireSchema();
  assertMonth(year, month);
  const { rows } = await query(
    `SELECT t.id,t.employee_id,t.designation,t.status::text AS profile_status,u.name,
            COUNT(ta.id) FILTER (WHERE ta.status<>'HOLIDAY')::int AS working_days,
            COUNT(ta.id) FILTER (WHERE ta.status='PRESENT')::int AS present_days,
            COUNT(ta.id) FILTER (WHERE ta.status='ABSENT')::int AS absent_days,
            COUNT(ta.id) FILTER (WHERE ta.status='LATE')::int AS late_days,
            COUNT(ta.id) FILTER (WHERE ta.status='HALF_DAY')::int AS half_days,
            COUNT(ta.id) FILTER (WHERE ta.status='EXCUSED')::int AS excused_days,
            COUNT(ta.id) FILTER (WHERE ta.status='HOLIDAY')::int AS holiday_days,
            COALESCE(ROUND(
              COUNT(ta.id) FILTER (WHERE ta.status IN ('PRESENT','LATE','HALF_DAY'))::decimal
              / NULLIF(COUNT(ta.id) FILTER (WHERE ta.status<>'HOLIDAY'),0) * 100,2
            ),0) AS attendance_percentage
     FROM teachers t JOIN users u ON u.id=t.user_id
     LEFT JOIN teacher_attendance ta ON ta.teacher_id=t.id
       AND EXTRACT(YEAR FROM ta.date)=$2 AND EXTRACT(MONTH FROM ta.date)=$3
     WHERE t.school_id=$1 AND t.status IN ('ACTIVE','ON_LEAVE')
     GROUP BY t.id,u.id ORDER BY u.name`,
    [schoolId, year, month],
  );
  return rows;
}