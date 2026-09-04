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

interface FixtureRow {
  school_id: string;
  admin_user_id: string;
  student_id: string;
  student_user_id: string;
  class_id: string;
  parent_user_id: string;
  teacher_id: string;
  teacher_user_id: string;
}

async function main(): Promise<void> {
  const { rows: [fixture] } = await query<FixtureRow>(
    `SELECT s.school_id,sch.admin_user_id,s.id AS student_id,s.user_id AS student_user_id,s.class_id,
            psl.parent_user_id,t.id AS teacher_id,t.user_id AS teacher_user_id
     FROM students s
     JOIN schools sch ON sch.id=s.school_id
     JOIN parent_student_links psl ON psl.student_id=s.id
     JOIN teacher_assignments ta ON ta.school_id=s.school_id AND ta.class_id=s.class_id
     JOIN teachers t ON t.id=ta.teacher_id AND t.school_id=s.school_id AND t.status='ACTIVE'
     WHERE s.status='ACTIVE' AND s.school_link_status='APPROVED'
       AND s.school_id IS NOT NULL AND s.class_id IS NOT NULL
     ORDER BY s.created_at,s.id,ta.id
     LIMIT 1`,
  );
  assert(fixture, 'PTM certification requires an active linked Student with an assigned Teacher');

  const { rows: [otherParent] } = await query<{ id: string }>(
    `SELECT u.id FROM users u
     WHERE u.role='PARENT'
       AND NOT EXISTS (
         SELECT 1 FROM parent_student_links psl
         WHERE psl.parent_user_id=u.id AND psl.student_id=$1
       )
     ORDER BY u.created_at,u.id
     LIMIT 1`,
    [fixture.student_id],
  );
  assert(otherParent, 'PTM certification requires an unrelated Parent identity');

  const now = Date.now();
  const startsAt = new Date(now + 3 * 86_400_000);
  const endsAt = new Date(startsAt.getTime() + 3 * 60 * 60_000);
  const bookingOpensAt = new Date(now - 60 * 60_000);
  const bookingClosesAt = new Date(startsAt.getTime() - 60 * 60_000);
  const session = await ptm.createSession(fixture.school_id, fixture.admin_user_id, 'SCHOOL_ADMIN', {
    title: 'CI Parent Teacher Meeting', description: 'Disposable certification PTM',
    startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(),
    bookingOpensAt: bookingOpensAt.toISOString(), bookingClosesAt: bookingClosesAt.toISOString(),
  });
  assert(session.status === 'DRAFT' && session.calendar_event_id, 'PTM session must start DRAFT and link to School Calendar');
  await ptm.changeSessionStatus(fixture.school_id, 'SCHOOL_ADMIN', session.id, { status: 'OPEN' });

  const slotStart = new Date(startsAt.getTime() + 30 * 60_000);
  const slotEnd = new Date(slotStart.getTime() + 20 * 60_000);
  const slot = await ptm.createSlot(fixture.school_id, fixture.admin_user_id, 'SCHOOL_ADMIN', session.id, {
    teacherId: fixture.teacher_id, startsAt: slotStart.toISOString(), endsAt: slotEnd.toISOString(), location: 'Room CI-1',
  });
  const options = await ptm.listParentOptions(fixture.parent_user_id, fixture.student_id);
  assert(options.some((row) => row.id === slot.id), 'Linked Parent must see assigned Teacher PTM slot');
  await expectStatus(() => ptm.listParentOptions(otherParent.id, fixture.student_id), 403, 'Parent-child isolation');

  const first = await ptm.bookParentSlot(fixture.parent_user_id, fixture.student_id, slot.id, { parentNote: 'Discuss learning progress' });
  assert(first.status === 'BOOKED' && first.teacher_id === fixture.teacher_id, 'PTM booking must persist Teacher and BOOKED state');
  await expectStatus(() => ptm.bookParentSlot(fixture.parent_user_id, fixture.student_id, slot.id, {}), 409, 'Duplicate slot booking');
  assert((await ptm.listStudentBookings(fixture.student_user_id)).some((row) => row.id === first.id), 'Student must see booked PTM');
  assert((await ptm.listParentBookings(fixture.parent_user_id, fixture.student_id)).some((row) => row.id === first.id), 'Parent must see booked PTM');
  assert((await ptm.listSchoolBookings(fixture.school_id, fixture.teacher_user_id, 'TEACHER', session.id)).some((row) => row.id === first.id), 'Assigned Teacher must see own PTM appointment');

  const cancelled = await ptm.cancelParentBooking(fixture.parent_user_id, first.id);
  assert(cancelled.status === 'CANCELLED', 'Parent cancellation must be auditable');
  const second = await ptm.bookParentSlot(fixture.parent_user_id, fixture.student_id, slot.id, {});
  assert(second.id !== first.id && second.status === 'BOOKED', 'Cancelled slot must be re-bookable without deleting history');

  await query(`UPDATE ptm_slots SET starts_at=NOW()-INTERVAL '5 minutes',ends_at=NOW()+INTERVAL '15 minutes' WHERE id=$1`, [slot.id]);
  const completed = await ptm.updateOutcome(fixture.school_id, fixture.teacher_user_id, 'TEACHER', second.id, { status: 'COMPLETED', outcomeNote: 'CI meeting completed' });
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
