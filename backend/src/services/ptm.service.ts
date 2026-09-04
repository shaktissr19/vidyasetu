import type { PoolClient, QueryResultRow } from 'pg';
import type { UserRole, UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';
import { saveNotification } from './notification.service';

export type PtmSessionStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'COMPLETED' | 'CANCELLED';
export type PtmBookingStatus = 'BOOKED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';

export interface CreatePtmSessionInput {
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt: string;
  bookingOpensAt: string;
  bookingClosesAt: string;
}
export interface PtmSessionStatusInput { status: PtmSessionStatus; }
export interface CreatePtmSlotInput {
  teacherId: UUID;
  startsAt: string;
  endsAt: string;
  location?: string | null;
}
export interface CreatePtmBookingInput { parentNote?: string | null; }
export interface PtmOutcomeInput { status: 'COMPLETED' | 'NO_SHOW'; outcomeNote?: string | null; }

interface SessionRow extends QueryResultRow {
  id: UUID; school_id: UUID; calendar_event_id: UUID | null; title: string; description: string | null;
  starts_at: string | Date; ends_at: string | Date; booking_opens_at: string | Date; booking_closes_at: string | Date;
  status: PtmSessionStatus; created_by: UUID; created_at: string | Date; updated_at: string | Date;
  slot_count?: number; booked_count?: number;
}
interface SlotRow extends QueryResultRow {
  id: UUID; session_id: UUID; school_id: UUID; teacher_id: UUID; starts_at: string | Date; ends_at: string | Date;
  location: string | null; is_active: boolean; created_by: UUID; teacher_user_id?: UUID; teacher_name?: string;
  subjects?: string | null; is_booked?: boolean;
}
interface BookingRow extends QueryResultRow {
  id: UUID; session_id: UUID; slot_id: UUID; school_id: UUID; teacher_id: UUID; student_id: UUID; parent_user_id: UUID;
  status: PtmBookingStatus; parent_note: string | null; outcome_note: string | null; booked_at: string | Date;
  cancelled_at: string | Date | null; completed_at: string | Date | null; session_title?: string;
  starts_at?: string | Date; ends_at?: string | Date; location?: string | null; teacher_name?: string; teacher_user_id?: UUID;
  student_name?: string; student_code?: string; class_name?: string; section?: string | null; parent_name?: string;
}
interface StudentRow extends QueryResultRow {
  id: UUID; user_id: UUID; school_id: UUID; class_id: UUID; name: string; student_code: string;
  class_name: string; section: string | null;
}
interface TeacherRow extends QueryResultRow { id: UUID; user_id: UUID; school_id: UUID; name: string; }
interface IdRow extends QueryResultRow { id: UUID; }
interface RecipientRow extends QueryResultRow { user_id: UUID; }

function httpError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}
function clean(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}
function asDate(value: string, label: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw httpError(`${label} is invalid`, 400);
  return date;
}
function requireAdmin(role: UserRole): void {
  if (role !== 'SCHOOL_ADMIN' && role !== 'SUPER_ADMIN') throw httpError('School Admin access is required', 403);
}
export async function ptmSchemaReady(): Promise<boolean> {
  const { rows: [row] } = await query<{ ready: boolean } & QueryResultRow>(
    `SELECT to_regclass('public.ptm_sessions') IS NOT NULL
        AND to_regclass('public.ptm_slots') IS NOT NULL
        AND to_regclass('public.ptm_bookings') IS NOT NULL AS ready`,
  );
  return Boolean(row?.ready);
}
async function requireSchema(): Promise<void> {
  if (!await ptmSchemaReady()) throw httpError('PTM appointments are not initialized yet', 503);
}
async function teacherForUser(schoolId: UUID, userId: UUID): Promise<TeacherRow> {
  const { rows: [row] } = await query<TeacherRow>(
    `SELECT t.id,t.user_id,t.school_id,u.name FROM teachers t JOIN users u ON u.id=t.user_id
     WHERE t.user_id=$1 AND t.school_id=$2 AND t.status='ACTIVE' LIMIT 1`, [userId, schoolId],
  );
  if (!row) throw httpError('Active Teacher profile not found in this School', 403);
  return row;
}
async function activeTeacher(schoolId: UUID, teacherId: UUID): Promise<TeacherRow> {
  const { rows: [row] } = await query<TeacherRow>(
    `SELECT t.id,t.user_id,t.school_id,u.name FROM teachers t JOIN users u ON u.id=t.user_id
     WHERE t.id=$1 AND t.school_id=$2 AND t.status='ACTIVE' LIMIT 1`, [teacherId, schoolId],
  );
  if (!row) throw httpError('Active Teacher not found in this School', 404);
  return row;
}
async function studentForUser(userId: UUID): Promise<StudentRow> {
  const { rows: [row] } = await query<StudentRow>(
    `SELECT s.id,s.user_id,s.school_id,s.class_id,u.name,s.student_code,sc.class_name,sc.section
     FROM students s JOIN users u ON u.id=s.user_id JOIN school_classes sc ON sc.id=s.class_id
     WHERE s.user_id=$1 AND s.status='ACTIVE' AND s.school_link_status='APPROVED'
       AND s.school_id IS NOT NULL AND s.class_id IS NOT NULL LIMIT 1`, [userId],
  );
  if (!row) throw httpError('An approved active School enrollment is required', 403);
  return row;
}
async function parentChild(parentUserId: UUID, studentId: UUID): Promise<StudentRow> {
  const { rows: [row] } = await query<StudentRow>(
    `SELECT s.id,s.user_id,s.school_id,s.class_id,u.name,s.student_code,sc.class_name,sc.section
     FROM parent_student_links psl JOIN students s ON s.id=psl.student_id
     JOIN users u ON u.id=s.user_id JOIN school_classes sc ON sc.id=s.class_id
     WHERE psl.parent_user_id=$1 AND s.id=$2 AND s.status='ACTIVE' AND s.school_link_status='APPROVED'
       AND s.school_id IS NOT NULL AND s.class_id IS NOT NULL LIMIT 1`, [parentUserId, studentId],
  );
  if (!row) throw httpError('You are not linked to this Student', 403);
  return row;
}
async function teacherAssignedToClass(client: PoolClient, schoolId: UUID, teacherId: UUID, classId: UUID): Promise<void> {
  const { rows: [row] } = await client.query<IdRow>(
    `SELECT ta.id FROM teacher_assignments ta
     WHERE ta.school_id=$1 AND ta.teacher_id=$2 AND ta.class_id=$3 LIMIT 1`, [schoolId, teacherId, classId],
  );
  if (!row) throw httpError('This Teacher is not assigned to the Student class', 403);
}
function sessionTimes(input: CreatePtmSessionInput) {
  const starts = asDate(input.startsAt, 'PTM start');
  const ends = asDate(input.endsAt, 'PTM end');
  const opens = asDate(input.bookingOpensAt, 'Booking open time');
  const closes = asDate(input.bookingClosesAt, 'Booking close time');
  if (!(starts < ends)) throw httpError('PTM start must be before end', 400);
  if (!(opens < closes && closes <= starts)) throw httpError('Booking window must close no later than the PTM start', 400);
  return { starts, ends, opens, closes };
}

export async function createSession(schoolId: UUID, actorId: UUID, role: UserRole, input: CreatePtmSessionInput): Promise<SessionRow> {
  await requireSchema(); requireAdmin(role);
  const { starts, ends, opens, closes } = sessionTimes(input);
  return transaction(async (client) => {
    const { rows: [calendar] } = await client.query<IdRow>(
      `INSERT INTO school_calendar_events(school_id,title,description,event_type,start_date,end_date,is_school_closed,created_by)
       VALUES($1,$2,$3,'PTM',$4::date,$5::date,FALSE,$6) RETURNING id`,
      [schoolId, input.title.trim(), clean(input.description), starts.toISOString(), ends.toISOString(), actorId],
    );
    if (!calendar) throw new Error('PTM calendar event insert returned no row');
    const { rows: [session] } = await client.query<SessionRow>(
      `INSERT INTO ptm_sessions(school_id,calendar_event_id,title,description,starts_at,ends_at,booking_opens_at,booking_closes_at,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [schoolId, calendar.id, input.title.trim(), clean(input.description), starts.toISOString(), ends.toISOString(), opens.toISOString(), closes.toISOString(), actorId],
    );
    if (!session) throw new Error('PTM session insert returned no row');
    return session;
  });
}

const allowedTransitions: Record<PtmSessionStatus, PtmSessionStatus[]> = {
  DRAFT: ['OPEN','CANCELLED'], OPEN: ['CLOSED','CANCELLED'], CLOSED: ['COMPLETED','CANCELLED'], COMPLETED: [], CANCELLED: [],
};
export async function changeSessionStatus(schoolId: UUID, role: UserRole, sessionId: UUID, input: PtmSessionStatusInput): Promise<SessionRow> {
  await requireSchema(); requireAdmin(role);
  return transaction(async (client) => {
    const { rows: [current] } = await client.query<SessionRow>('SELECT * FROM ptm_sessions WHERE id=$1 AND school_id=$2 FOR UPDATE', [sessionId, schoolId]);
    if (!current) throw httpError('PTM session not found', 404);
    if (!allowedTransitions[current.status].includes(input.status)) throw httpError(`PTM cannot move from ${current.status} to ${input.status}`, 409);
    if (input.status === 'OPEN' && new Date(current.booking_closes_at) <= new Date()) throw httpError('Booking window has already closed', 409);
    const { rows: [updated] } = await client.query<SessionRow>('UPDATE ptm_sessions SET status=$3 WHERE id=$1 AND school_id=$2 RETURNING *', [sessionId, schoolId, input.status]);
    if (input.status === 'CANCELLED' && current.calendar_event_id) {
      await client.query('UPDATE school_calendar_events SET is_active=FALSE WHERE id=$1 AND school_id=$2', [current.calendar_event_id, schoolId]);
      await client.query(`UPDATE ptm_bookings SET status='CANCELLED',cancelled_at=NOW() WHERE session_id=$1 AND status='BOOKED'`, [sessionId]);
    }
    if (!updated) throw new Error('PTM status update returned no row');
    return updated;
  });
}

export async function listSchoolSessions(schoolId: UUID): Promise<SessionRow[]> {
  await requireSchema();
  const { rows } = await query<SessionRow>(
    `SELECT s.*,COUNT(sl.id)::int AS slot_count,
       COUNT(b.id) FILTER (WHERE b.status='BOOKED')::int AS booked_count
     FROM ptm_sessions s LEFT JOIN ptm_slots sl ON sl.session_id=s.id AND sl.is_active=TRUE
     LEFT JOIN ptm_bookings b ON b.slot_id=sl.id
     WHERE s.school_id=$1 GROUP BY s.id ORDER BY s.starts_at DESC`, [schoolId],
  );
  return rows;
}

export async function createSlot(schoolId: UUID, actorId: UUID, role: UserRole, sessionId: UUID, input: CreatePtmSlotInput): Promise<SlotRow> {
  await requireSchema();
  const teacher = await activeTeacher(schoolId, input.teacherId);
  if (role === 'TEACHER') {
    const self = await teacherForUser(schoolId, actorId);
    if (self.id !== teacher.id) throw httpError('Teachers may create slots only for themselves', 403);
  } else requireAdmin(role);
  const starts = asDate(input.startsAt, 'Slot start');
  const ends = asDate(input.endsAt, 'Slot end');
  if (!(starts < ends)) throw httpError('Slot start must be before end', 400);
  const { rows: [session] } = await query<SessionRow>('SELECT * FROM ptm_sessions WHERE id=$1 AND school_id=$2', [sessionId, schoolId]);
  if (!session) throw httpError('PTM session not found', 404);
  if (['COMPLETED','CANCELLED'].includes(session.status)) throw httpError('Slots cannot be added to a completed or cancelled PTM', 409);
  if (starts < new Date(session.starts_at) || ends > new Date(session.ends_at)) throw httpError('Teacher slot must fall inside the PTM session window', 400);
  try {
    const { rows: [row] } = await query<SlotRow>(
      `INSERT INTO ptm_slots(session_id,school_id,teacher_id,starts_at,ends_at,location,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [sessionId, schoolId, teacher.id, starts.toISOString(), ends.toISOString(), clean(input.location), actorId],
    );
    if (!row) throw new Error('PTM slot insert returned no row');
    return row;
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === '23505') throw httpError('This Teacher already has a PTM slot at that start time', 409);
    throw error;
  }
}

function bookingSelect(where: string): string {
  return `SELECT b.*,ps.title AS session_title,sl.starts_at,sl.ends_at,sl.location,
    tu.name AS teacher_name,t.user_id AS teacher_user_id,su.name AS student_name,s.student_code,sc.class_name,sc.section,pu.name AS parent_name
    FROM ptm_bookings b JOIN ptm_sessions ps ON ps.id=b.session_id JOIN ptm_slots sl ON sl.id=b.slot_id
    JOIN teachers t ON t.id=b.teacher_id JOIN users tu ON tu.id=t.user_id
    JOIN students s ON s.id=b.student_id JOIN users su ON su.id=s.user_id JOIN school_classes sc ON sc.id=s.class_id
    JOIN users pu ON pu.id=b.parent_user_id WHERE ${where}`;
}
export async function listSchoolBookings(schoolId: UUID, actorId: UUID, role: UserRole, sessionId?: UUID): Promise<BookingRow[]> {
  await requireSchema();
  const params: unknown[] = [schoolId]; let where = 'b.school_id=$1';
  if (role === 'TEACHER') {
    const teacher = await teacherForUser(schoolId, actorId); params.push(teacher.id); where += ` AND b.teacher_id=$${params.length}`;
  } else requireAdmin(role);
  if (sessionId) { params.push(sessionId); where += ` AND b.session_id=$${params.length}`; }
  return (await query<BookingRow>(`${bookingSelect(where)} ORDER BY sl.starts_at,b.booked_at`, params)).rows;
}

export async function listSchoolSlots(schoolId: UUID, actorId: UUID, role: UserRole, sessionId?: UUID): Promise<SlotRow[]> {
  await requireSchema();
  const params: unknown[] = [schoolId]; let where = 'sl.school_id=$1';
  if (role === 'TEACHER') { const teacher = await teacherForUser(schoolId, actorId); params.push(teacher.id); where += ` AND sl.teacher_id=$${params.length}`; }
  else requireAdmin(role);
  if (sessionId) { params.push(sessionId); where += ` AND sl.session_id=$${params.length}`; }
  const { rows } = await query<SlotRow>(
    `SELECT sl.*,t.user_id AS teacher_user_id,u.name AS teacher_name,
      EXISTS(SELECT 1 FROM ptm_bookings b WHERE b.slot_id=sl.id AND b.status='BOOKED') AS is_booked
     FROM ptm_slots sl JOIN teachers t ON t.id=sl.teacher_id JOIN users u ON u.id=t.user_id
     WHERE ${where} ORDER BY sl.starts_at`, params,
  );
  return rows;
}

export async function listParentOptions(parentUserId: UUID, studentId: UUID): Promise<SlotRow[]> {
  await requireSchema(); const student = await parentChild(parentUserId, studentId);
  const { rows } = await query<SlotRow>(
    `SELECT sl.*,t.user_id AS teacher_user_id,u.name AS teacher_name,
       STRING_AGG(DISTINCT subj.name,', ' ORDER BY subj.name) AS subjects,FALSE AS is_booked
     FROM ptm_slots sl JOIN ptm_sessions ps ON ps.id=sl.session_id
     JOIN teachers t ON t.id=sl.teacher_id JOIN users u ON u.id=t.user_id
     JOIN teacher_assignments ta ON ta.teacher_id=t.id AND ta.school_id=sl.school_id AND ta.class_id=$2
     LEFT JOIN subjects subj ON subj.id=ta.subject_id
     WHERE sl.school_id=$1 AND sl.is_active=TRUE AND ps.status='OPEN'
       AND NOW() BETWEEN ps.booking_opens_at AND ps.booking_closes_at AND sl.starts_at>NOW()
       AND NOT EXISTS(SELECT 1 FROM ptm_bookings b WHERE b.slot_id=sl.id AND b.status='BOOKED')
       AND NOT EXISTS(SELECT 1 FROM ptm_bookings b WHERE b.session_id=ps.id AND b.student_id=$3 AND b.teacher_id=t.id AND b.status='BOOKED')
     GROUP BY sl.id,t.user_id,u.name ORDER BY sl.starts_at`, [student.school_id, student.class_id, student.id],
  );
  return rows;
}

async function familyRecipients(studentId: UUID): Promise<UUID[]> {
  const { rows } = await query<RecipientRow>(
    `SELECT s.user_id FROM students s WHERE s.id=$1 UNION SELECT psl.parent_user_id FROM parent_student_links psl WHERE psl.student_id=$1`, [studentId],
  );
  return rows.map((row) => row.user_id);
}
export async function bookParentSlot(parentUserId: UUID, studentId: UUID, slotId: UUID, input: CreatePtmBookingInput): Promise<BookingRow> {
  await requireSchema(); const student = await parentChild(parentUserId, studentId);
  const booking = await transaction(async (client) => {
    const { rows: [slot] } = await client.query<SlotRow & { session_status: PtmSessionStatus; booking_opens_at: string | Date; booking_closes_at: string | Date }>(
      `SELECT sl.*,ps.status AS session_status,ps.booking_opens_at,ps.booking_closes_at FROM ptm_slots sl JOIN ptm_sessions ps ON ps.id=sl.session_id
       WHERE sl.id=$1 AND sl.school_id=$2 FOR UPDATE OF sl`, [slotId, student.school_id],
    );
    if (!slot || !slot.is_active) throw httpError('PTM slot is not available', 404);
    if (slot.session_status !== 'OPEN' || new Date() < new Date(slot.booking_opens_at) || new Date() > new Date(slot.booking_closes_at)) throw httpError('PTM booking is not open', 409);
    if (new Date(slot.starts_at) <= new Date()) throw httpError('This PTM slot has already started', 409);
    await teacherAssignedToClass(client, student.school_id, slot.teacher_id, student.class_id);
    try {
      const { rows: [created] } = await client.query<BookingRow>(
        `INSERT INTO ptm_bookings(session_id,slot_id,school_id,teacher_id,student_id,parent_user_id,parent_note)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [slot.session_id, slot.id, student.school_id, slot.teacher_id, student.id, parentUserId, clean(input.parentNote)],
      );
      if (!created) throw new Error('PTM booking insert returned no row');
      return created;
    } catch (error: unknown) {
      if ((error as { code?: string })?.code === '23505') throw httpError('This PTM slot or Teacher meeting is already booked', 409);
      throw error;
    }
  });
  const { rows: [full] } = await query<BookingRow>(`${bookingSelect('b.id=$1')} LIMIT 1`, [booking.id]);
  if (!full) throw new Error('PTM booking could not be read back');
  const recipients = new Set<UUID>(await familyRecipients(student.id)); if (full.teacher_user_id) recipients.add(full.teacher_user_id);
  await Promise.all([...recipients].map((userId) => saveNotification({
    userId, schoolId: student.school_id, type: 'PTM_BOOKED', title: `PTM booked · ${student.name}`,
    body: `${full.teacher_name || 'Teacher'} · ${new Date(full.starts_at as string).toLocaleString('en-IN')}.`, refId: full.id, refType: 'PTM_BOOKING',
  })));
  return full;
}

export async function cancelParentBooking(parentUserId: UUID, bookingId: UUID): Promise<BookingRow> {
  await requireSchema();
  const updated = await transaction(async (client) => {
    const { rows: [row] } = await client.query<BookingRow>('SELECT * FROM ptm_bookings WHERE id=$1 FOR UPDATE', [bookingId]);
    if (!row) throw httpError('PTM booking not found', 404);
    if (row.parent_user_id !== parentUserId) throw httpError('Only the Parent who booked this appointment can cancel it', 403);
    if (row.status !== 'BOOKED') throw httpError('Only a booked PTM appointment can be cancelled', 409);
    const { rows: [slot] } = await client.query<SlotRow>('SELECT * FROM ptm_slots WHERE id=$1', [row.slot_id]);
    if (slot && new Date(slot.starts_at) <= new Date()) throw httpError('A PTM appointment cannot be cancelled after it starts', 409);
    const { rows: [next] } = await client.query<BookingRow>(`UPDATE ptm_bookings SET status='CANCELLED',cancelled_at=NOW() WHERE id=$1 RETURNING *`, [bookingId]);
    if (!next) throw new Error('PTM cancellation returned no row');
    return next;
  });
  const { rows: [full] } = await query<BookingRow>(`${bookingSelect('b.id=$1')} LIMIT 1`, [updated.id]);
  if (!full) throw new Error('Cancelled PTM booking could not be read back');
  const recipients = new Set<UUID>(await familyRecipients(full.student_id)); if (full.teacher_user_id) recipients.add(full.teacher_user_id);
  await Promise.all([...recipients].map((userId) => saveNotification({ userId, schoolId: full.school_id, type: 'PTM_CANCELLED', title: 'PTM appointment cancelled', body: `${full.student_name} · ${full.teacher_name}`, refId: full.id, refType: 'PTM_BOOKING' })));
  return full;
}

export async function updateOutcome(schoolId: UUID, actorId: UUID, role: UserRole, bookingId: UUID, input: PtmOutcomeInput): Promise<BookingRow> {
  await requireSchema();
  const updated = await transaction(async (client) => {
    const { rows: [row] } = await client.query<BookingRow & { slot_starts_at: string | Date }>(
      `SELECT b.*,sl.starts_at AS slot_starts_at FROM ptm_bookings b JOIN ptm_slots sl ON sl.id=b.slot_id
       WHERE b.id=$1 AND b.school_id=$2 FOR UPDATE OF b`, [bookingId, schoolId],
    );
    if (!row) throw httpError('PTM booking not found in this School', 404);
    if (row.status !== 'BOOKED') throw httpError('Only a booked appointment can be completed', 409);
    if (role === 'TEACHER') { const teacher = await teacherForUser(schoolId, actorId); if (teacher.id !== row.teacher_id) throw httpError('Teachers may update only their own PTM appointments', 403); }
    else requireAdmin(role);
    if (new Date(row.slot_starts_at) > new Date()) throw httpError('PTM outcome cannot be recorded before the appointment starts', 409);
    const { rows: [next] } = await client.query<BookingRow>(
      `UPDATE ptm_bookings SET status=$2,outcome_note=$3,completed_at=NOW() WHERE id=$1 RETURNING *`, [bookingId, input.status, clean(input.outcomeNote)],
    );
    if (!next) throw new Error('PTM outcome update returned no row');
    return next;
  });
  const { rows: [full] } = await query<BookingRow>(`${bookingSelect('b.id=$1')} LIMIT 1`, [updated.id]);
  if (!full) throw new Error('Updated PTM booking could not be read back');
  await Promise.all((await familyRecipients(full.student_id)).map((userId) => saveNotification({ userId, schoolId, type: 'PTM_UPDATED', title: `PTM ${input.status === 'COMPLETED' ? 'completed' : 'marked no-show'}`, body: `${full.teacher_name || 'Teacher'} · ${full.student_name}`, refId: full.id, refType: 'PTM_BOOKING' })));
  return full;
}

export async function listParentBookings(parentUserId: UUID, studentId: UUID): Promise<BookingRow[]> {
  await requireSchema(); await parentChild(parentUserId, studentId);
  return (await query<BookingRow>(`${bookingSelect('b.student_id=$1')} ORDER BY sl.starts_at DESC`, [studentId])).rows;
}
export async function listStudentBookings(userId: UUID): Promise<BookingRow[]> {
  await requireSchema(); const student = await studentForUser(userId);
  return (await query<BookingRow>(`${bookingSelect('b.student_id=$1')} ORDER BY sl.starts_at DESC`, [student.id])).rows;
}
