import 'dotenv/config';
import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { pool, query } from '../config/db';
import { createCalendarEvent } from '../services/absenceCalendar.service';
import {
  cancelMyLeave,
  createMyLeave,
  getMyAttendance,
  getSchoolAttendanceSummary,
  getStaffRoster,
  listSchoolLeaves,
  markStaffAttendance,
  reviewSchoolLeave,
  staffSchemaReady,
} from '../services/staffOperations.service';

interface FixtureRow extends QueryResultRow {
  teacher_id: UUID;
  teacher_user_id: UUID;
  teacher_status: string;
  school_id: UUID;
  admin_user_id: UUID;
  class_id: UUID;
}
interface StatusRow extends QueryResultRow { status: string; }
interface CountRow extends QueryResultRow { count: number | string; }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
async function expectStatus(work: () => Promise<unknown>, statusCode: number, label: string): Promise<void> {
  try { await work(); }
  catch (error: unknown) {
    if ((error as { statusCode?: number })?.statusCode === statusCode) return;
    throw error;
  }
  throw new Error(`${label}: expected HTTP ${statusCode}`);
}
function dayOffset(days: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV !== 'test') throw new Error('Staff operations certification is test-only');
  assert(await staffSchemaReady(), 'Staff operations schema readiness probe failed after migrations 029/030');

  const { rows: [fixture] } = await query<FixtureRow>(
    `SELECT t.id AS teacher_id,t.user_id AS teacher_user_id,t.status::text AS teacher_status,
            t.school_id,sch.admin_user_id,sc.id AS class_id
     FROM teachers t
     JOIN schools sch ON sch.id=t.school_id AND sch.admin_user_id IS NOT NULL
     JOIN school_classes sc ON sc.school_id=t.school_id AND COALESCE(sc.is_active,TRUE)=TRUE
     WHERE t.status='ACTIVE'
     ORDER BY t.created_at,t.id,sc.class_name,sc.section
     LIMIT 1`,
  );
  assert(fixture, 'No active Teacher/School/Class fixture available');
  assert(fixture.teacher_status === 'ACTIVE', 'Certification Teacher must begin ACTIVE');

  const yesterday = dayOffset(-1);
  const today = dayOffset(0);
  const leave = await createMyLeave(fixture.teacher_user_id, {
    startDate: yesterday,
    endDate: today,
    reason: 'Medical appointment and recovery time for staff certification',
  });
  assert(leave.status === 'PENDING', 'Teacher leave did not start PENDING');

  const { rows: [submittedNotification] } = await query<CountRow>(
    `SELECT COUNT(*)::int AS count FROM notifications
     WHERE user_id=$1 AND type='STAFF_LEAVE_SUBMITTED' AND reference_id=$2`,
    [fixture.admin_user_id, leave.id],
  );
  assert(Number(submittedNotification?.count || 0) === 1, 'School Admin did not receive staff leave submission notification');

  await expectStatus(
    () => createMyLeave(fixture.teacher_user_id, {
      startDate: today,
      endDate: dayOffset(1),
      reason: 'Overlapping staff leave should be rejected by certification',
    }),
    409,
    'Staff leave overlap protection',
  );

  await query(
    `INSERT INTO teacher_attendance(school_id,teacher_id,date,status,remark,marked_by)
     VALUES($1,$2,$3,'ABSENT','Initial unexcused staff absence',$4)
     ON CONFLICT(teacher_id,date) DO UPDATE SET status='ABSENT',remark=EXCLUDED.remark,marked_by=EXCLUDED.marked_by`,
    [fixture.school_id, fixture.teacher_id, yesterday, fixture.admin_user_id],
  );

  const pending = await listSchoolLeaves(fixture.school_id, 'PENDING');
  assert(pending.some((item) => item.id === leave.id), 'School Admin pending queue does not contain Teacher leave');

  const approved = await reviewSchoolLeave(
    fixture.school_id,
    fixture.admin_user_id,
    leave.id,
    { action: 'APPROVE', note: 'Approved in staff operations certification' },
  );
  assert(approved.status === 'APPROVED', 'School Admin could not approve Teacher leave');

  const { rows: [retroactive] } = await query<StatusRow>(
    `SELECT status::text FROM teacher_attendance WHERE teacher_id=$1 AND date=$2`,
    [fixture.teacher_id, yesterday],
  );
  assert(retroactive?.status === 'EXCUSED', `Retroactive staff attendance expected EXCUSED, found ${retroactive?.status}`);

  const { rows: [profileAfterApproval] } = await query<StatusRow>(
    `SELECT status::text FROM teachers WHERE id=$1`, [fixture.teacher_id],
  );
  assert(profileAfterApproval?.status === 'ACTIVE', 'Dated approved leave incorrectly mutated teachers.status');

  const roster = await getStaffRoster(fixture.school_id, today);
  const teacherRoster = roster.find((row) => row.id === fixture.teacher_id);
  assert(teacherRoster?.approved_leave === true, 'Staff roster does not expose approved leave');
  assert(teacherRoster?.attendance_status === 'EXCUSED', 'Unmarked approved leave was not presented as EXCUSED');
  assert(teacherRoster?.operational_availability === 'APPROVED_LEAVE', 'Operational availability did not resolve approved leave');

  const excusedSave = await markStaffAttendance(
    fixture.school_id,
    today,
    [{ teacherId: fixture.teacher_id, status: 'ABSENT' }],
    fixture.admin_user_id,
  );
  assert(excusedSave[0]?.status === 'EXCUSED', 'Approved Teacher leave ABSENT did not normalize to EXCUSED');

  const presentOverride = await markStaffAttendance(
    fixture.school_id,
    today,
    [{ teacherId: fixture.teacher_id, status: 'PRESENT' }],
    fixture.admin_user_id,
  );
  assert(presentOverride[0]?.status === 'PRESENT', 'Actually attending Teacher could not override approved leave with PRESENT');

  const myAttendance = await getMyAttendance(fixture.teacher_user_id, new Date().getFullYear(), new Date().getMonth() + 1);
  assert(myAttendance.records.some((row) => String(row.date).slice(0, 10) === today && row.status === 'PRESENT'), 'Teacher self attendance does not show current PRESENT record');

  const { rows: [decisionNotification] } = await query<CountRow>(
    `SELECT COUNT(*)::int AS count FROM notifications
     WHERE user_id=$1 AND type='STAFF_LEAVE_APPROVED' AND reference_id=$2`,
    [fixture.teacher_user_id, leave.id],
  );
  assert(Number(decisionNotification?.count || 0) === 1, 'Teacher did not receive staff leave approval notification');

  // A class-scoped holiday does not close the whole staff register.
  const classScopedDate = dayOffset(-2);
  await createCalendarEvent(fixture.school_id, fixture.admin_user_id, {
    title: 'Certification Class-only Holiday',
    eventType: 'HOLIDAY',
    startDate: classScopedDate,
    endDate: classScopedDate,
    isSchoolClosed: true,
    classIds: [fixture.class_id],
  });
  const classScopedMark = await markStaffAttendance(
    fixture.school_id,
    classScopedDate,
    [{ teacherId: fixture.teacher_id, status: 'PRESENT' }],
    fixture.admin_user_id,
  );
  assert(classScopedMark[0]?.status === 'PRESENT', 'Class-scoped holiday incorrectly closed the whole staff register');

  // A whole-School closure does govern staff attendance.
  const closedDate = dayOffset(-3);
  await createCalendarEvent(fixture.school_id, fixture.admin_user_id, {
    title: 'Certification Whole-school Holiday',
    eventType: 'HOLIDAY',
    startDate: closedDate,
    endDate: closedDate,
    isSchoolClosed: true,
    classIds: [],
  });
  await expectStatus(
    () => markStaffAttendance(
      fixture.school_id,
      closedDate,
      [{ teacherId: fixture.teacher_id, status: 'PRESENT' }],
      fixture.admin_user_id,
    ),
    409,
    'Whole-School closure staff attendance block',
  );
  const holidaySave = await markStaffAttendance(
    fixture.school_id,
    closedDate,
    [{ teacherId: fixture.teacher_id, status: 'HOLIDAY' }],
    fixture.admin_user_id,
  );
  assert(holidaySave[0]?.status === 'HOLIDAY', 'Whole-School closure did not accept HOLIDAY staff attendance');

  const secondLeave = await createMyLeave(fixture.teacher_user_id, {
    startDate: dayOffset(5),
    endDate: dayOffset(5),
    reason: 'Personal commitment for rejection workflow certification',
  });
  const rejected = await reviewSchoolLeave(
    fixture.school_id,
    fixture.admin_user_id,
    secondLeave.id,
    { action: 'REJECT', note: 'Rejected in certification' },
  );
  assert(rejected.status === 'REJECTED', 'School Admin rejection workflow failed');

  const thirdLeave = await createMyLeave(fixture.teacher_user_id, {
    startDate: dayOffset(8),
    endDate: dayOffset(8),
    reason: 'Pending leave for cancellation workflow certification',
  });
  const cancelled = await cancelMyLeave(fixture.teacher_user_id, thirdLeave.id);
  assert(cancelled.status === 'CANCELLED', 'Teacher could not cancel own pending leave');

  const summary = await getSchoolAttendanceSummary(fixture.school_id, new Date().getFullYear(), new Date().getMonth() + 1);
  assert(summary.some((row) => row.id === fixture.teacher_id), 'School staff monthly summary omitted certification Teacher');

  const { rows: [finalProfile] } = await query<StatusRow>('SELECT status::text FROM teachers WHERE id=$1', [fixture.teacher_id]);
  assert(finalProfile?.status === 'ACTIVE', 'Staff operations changed Teacher employment/profile status');

  console.log('STAFF ATTENDANCE AND LEAVE CERTIFIED');
  console.log(`Teacher leave: ${leave.id} -> ${approved.status}`);
  console.log(`Retroactive staff attendance: ${retroactive.status}`);
  console.log('Teacher profile status remained ACTIVE');
}

main()
  .catch((error: unknown) => {
    console.error(`STAFF OPERATIONS CERTIFICATION FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => pool.end());