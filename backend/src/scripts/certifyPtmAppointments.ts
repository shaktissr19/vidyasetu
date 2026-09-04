import { query } from '../config/db';
import * as ptm from '../services/ptm.service';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
async function expectStatus(work: () => Promise<unknown>, statusCode: number, label: string): Promise<void> {
  try { await work(); }
  catch (error: unknown) {
    assert((error as { statusCode?: number })?.statusCode === statusCode, `${label}: expected ${statusCode}`);
    return;
  }
  throw new Error(`${label}: expected failure ${statusCode}`);
}

async function main(): Promise<void> {
  const { rows: [admin] } = await query<{ user_id: string; school_id: string }>(
    `SELECT u.id AS user_id,s.id AS school_id FROM users u JOIN schools s ON s.admin_user_id=u.id WHERE u.mobile='9100000001' LIMIT 1`,
  );
  const { rows: [student] } = await query<{ id: string; user_id: string; class_id: string; school_id: string }>(
    `SELECT s.id,s.user_id,s.class_id,s.school_id FROM students s JOIN users u ON u.id=s.user_id WHERE u.mobile='9300000001' LIMIT 1`,
  );
  const { rows: [parent] } = await query<{ id: string }>(`SELECT id FROM users WHERE mobile='9400000001' LIMIT 1`);
  const { rows: [otherParent] } = await query<{ id: string }>(`SELECT id FROM users WHERE mobile='9400000002' LIMIT 1`);
  assert(admin && student && parent && otherParent, 'PTM certification identities are missing');
  const { rows: [teacher] } = await query<{ id: string; user_id: string }>(
    `SELECT t.id,t.user_id FROM teacher_assignments ta JOIN teachers t ON t.id=ta.teacher_id
     WHERE ta.school_id=$1 AND ta.class_id=$2 AND t.status='ACTIVE' LIMIT 1`, [admin.school_id, student.class_id],
  );
  assert(teacher, 'Assigned Teacher is required for PTM certification');

  const now = Date.now();
  const startsAt = new Date(now + 3 * 86_400_000);
  const endsAt = new Date(startsAt.getTime() + 3 * 60 * 60_000);
  const bookingOpensAt = new Date(now - 60 * 60_000);
  const bookingClosesAt = new Date(startsAt.getTime() - 60 * 60_000);
  const session = await ptm.createSession(admin.school_id, admin.user_id, 'SCHOOL_ADMIN', {
    title: 'CI Parent Teacher Meeting', description: 'Disposable certification PTM',
    startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(),
    bookingOpensAt: bookingOpensAt.toISOString(), bookingClosesAt: bookingClosesAt.toISOString(),
  });
  assert(session.status === 'DRAFT' && session.calendar_event_id, 'PTM session must start DRAFT and link to School Calendar');
  await ptm.changeSessionStatus(admin.school_id, 'SCHOOL_ADMIN', session.id, { status: 'OPEN' });

  const slotStart = new Date(startsAt.getTime() + 30 * 60_000);
  const slotEnd = new Date(slotStart.getTime() + 20 * 60_000);
  const slot = await ptm.createSlot(admin.school_id, admin.user_id, 'SCHOOL_ADMIN', session.id, {
    teacherId: teacher.id, startsAt: slotStart.toISOString(), endsAt: slotEnd.toISOString(), location: 'Room CI-1',
  });
  const options = await ptm.listParentOptions(parent.id, student.id);
  assert(options.some((row) => row.id === slot.id), 'Linked Parent must see assigned Teacher PTM slot');
  await expectStatus(() => ptm.listParentOptions(otherParent.id, student.id), 403, 'Parent-child isolation');

  const first = await ptm.bookParentSlot(parent.id, student.id, slot.id, { parentNote: 'Discuss learning progress' });
  assert(first.status === 'BOOKED' && first.teacher_id === teacher.id, 'PTM booking must persist Teacher and BOOKED state');
  await expectStatus(() => ptm.bookParentSlot(parent.id, student.id, slot.id, {}), 409, 'Duplicate slot booking');
  assert((await ptm.listStudentBookings(student.user_id)).some((row) => row.id === first.id), 'Student must see booked PTM');
  assert((await ptm.listParentBookings(parent.id, student.id)).some((row) => row.id === first.id), 'Parent must see booked PTM');
  assert((await ptm.listSchoolBookings(admin.school_id, teacher.user_id, 'TEACHER', session.id)).some((row) => row.id === first.id), 'Assigned Teacher must see own PTM appointment');

  const cancelled = await ptm.cancelParentBooking(parent.id, first.id);
  assert(cancelled.status === 'CANCELLED', 'Parent cancellation must be auditable');
  const second = await ptm.bookParentSlot(parent.id, student.id, slot.id, {});
  assert(second.id !== first.id && second.status === 'BOOKED', 'Cancelled slot must be re-bookable without deleting history');

  await query(`UPDATE ptm_slots SET starts_at=NOW()-INTERVAL '5 minutes',ends_at=NOW()+INTERVAL '15 minutes' WHERE id=$1`, [slot.id]);
  const completed = await ptm.updateOutcome(admin.school_id, teacher.user_id, 'TEACHER', second.id, { status: 'COMPLETED', outcomeNote: 'CI meeting completed' });
  assert(completed.status === 'COMPLETED' && completed.outcome_note === 'CI meeting completed', 'Teacher outcome must be recorded');

  const { rows: [counts] } = await query<{ cancelled: string; completed: string; notifications: string; calendar: string }>(
    `SELECT
      (SELECT COUNT(*) FROM ptm_bookings WHERE session_id=$1 AND status='CANCELLED')::text AS cancelled,
      (SELECT COUNT(*) FROM ptm_bookings WHERE session_id=$1 AND status='COMPLETED')::text AS completed,
      (SELECT COUNT(*) FROM notifications WHERE reference_type='PTM_BOOKING' AND type IN ('PTM_BOOKED','PTM_CANCELLED','PTM_UPDATED'))::text AS notifications,
      (SELECT COUNT(*) FROM school_calendar_events WHERE id=$2 AND event_type='PTM' AND is_active=TRUE)::text AS calendar`,
    [session.id, session.calendar_event_id],
  );
  assert(Number(counts?.cancelled) === 1 && Number(counts?.completed) === 1, 'PTM audit history must preserve cancellation and completion');
  assert(Number(counts?.notifications) >= 4, 'PTM booking lifecycle must create in-app notifications');
  assert(Number(counts?.calendar) === 1, 'PTM must remain integrated with the School Calendar');

  console.log('PTM CERTIFICATION PASSED');
  console.log(`Session: ${session.id}`);
  console.log(`Cancelled history: ${counts.cancelled}; completed: ${counts.completed}; notifications: ${counts.notifications}`);
}

main().then(()=>process.exit(0)).catch((error:unknown)=>{console.error(error);process.exit(1);});
