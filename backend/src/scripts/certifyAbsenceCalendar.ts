import 'dotenv/config';
import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { pool, query } from '../config/db';
import {
  createCalendarEvent,
  createParentLeave,
  createStudentLeave,
  listParentCalendar,
  listParentLeaves,
  listSchoolLeaves,
  listStudentCalendar,
  resolveAttendanceRecords,
  reviewLeave,
} from '../services/absenceCalendar.service';

interface FixtureRow extends QueryResultRow {
  parent_user_id: UUID;
  student_id: UUID;
  student_user_id: UUID;
  school_id: UUID;
  class_id: UUID;
  academic_year: string;
  admin_user_id: UUID;
}
interface TeacherRow extends QueryResultRow { id: UUID; user_id: UUID; school_id: UUID; }
interface IdRow extends QueryResultRow { id: UUID; }
interface StatusRow extends QueryResultRow { status: string; remark: string | null; }
interface SummaryRow extends QueryResultRow { absent_days: number | string; excused_days: number | string; }
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
  throw new Error(`${label}: expected ${statusCode}`);
}
function plusDays(days: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV !== 'test') throw new Error('Absence/calendar certification is test-only and requires NODE_ENV=test');

  const { rows: [fixture] } = await query<FixtureRow>(
    `SELECT psl.parent_user_id,s.id AS student_id,s.user_id AS student_user_id,
            s.school_id,s.class_id,s.academic_year,sch.admin_user_id
     FROM parent_student_links psl
     JOIN students s ON s.id=psl.student_id AND s.status='ACTIVE' AND s.school_link_status='APPROVED'
     JOIN schools sch ON sch.id=s.school_id AND sch.admin_user_id IS NOT NULL
     WHERE s.class_id IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM teachers tx
         WHERE tx.school_id=s.school_id AND tx.status='ACTIVE'
       )
     ORDER BY psl.created_at NULLS LAST,psl.id
     LIMIT 1`,
  );
  assert(fixture, 'No linked Parent/Student fixture exists in a School with an active Teacher');

  const { rows: [classTeacher] } = await query<TeacherRow>(
    `SELECT t.id,t.user_id,t.school_id FROM teachers t
     WHERE t.school_id=$1 AND t.status='ACTIVE'
     ORDER BY t.created_at,t.id LIMIT 1`,
    [fixture.school_id],
  );
  assert(classTeacher, 'No active Teacher exists in linked Student School');

  // The generic development seed may have Teacher identities but no assignments.
  // Provision exactly one deterministic class-teacher assignment in this disposable DB.
  await query(
    `INSERT INTO teacher_assignments(teacher_id,school_id,class_id,subject_code,academic_year,is_class_teacher)
     VALUES($1,$2,$3,'SCI',$4,TRUE)
     ON CONFLICT(teacher_id,class_id,subject_code,academic_year)
     DO UPDATE SET is_class_teacher=TRUE`,
    [classTeacher.id, fixture.school_id, fixture.class_id, fixture.academic_year],
  );

  const { rows: [unlinkedParent] } = await query<IdRow>(
    `SELECT u.id FROM users u WHERE u.role='PARENT' AND u.id<>$1
       AND NOT EXISTS (SELECT 1 FROM parent_student_links psl WHERE psl.parent_user_id=u.id AND psl.student_id=$2)
     ORDER BY u.id LIMIT 1`,
    [fixture.parent_user_id, fixture.student_id],
  );
  assert(unlinkedParent, 'No unlinked Parent fixture available');

  const { rows: [otherTeacher] } = await query<TeacherRow>(
    `SELECT t.id,t.user_id,t.school_id FROM teachers t WHERE t.id<>$1 AND t.status='ACTIVE' ORDER BY t.id LIMIT 1`,
    [classTeacher.id],
  );
  assert(otherTeacher, 'No second Teacher fixture available');

  const leaveStart = plusDays(10);
  const leaveEnd = plusDays(11);
  const leave = await createStudentLeave(fixture.student_user_id, {
    startDate: leaveStart,
    endDate: leaveEnd,
    reason: 'Family medical appointment and recovery time',
  });
  assert(leave.status === 'PENDING', 'Student leave was not created PENDING');

  await expectStatus(
    () => createParentLeave(fixture.parent_user_id, fixture.student_id, {
      startDate: leaveStart,
      endDate: leaveEnd,
      reason: 'Duplicate overlapping Parent request',
    }),
    409,
    'Overlap protection',
  );
  await expectStatus(() => listParentLeaves(unlinkedParent.id, fixture.student_id), 403, 'Parent isolation');

  await query(
    `INSERT INTO attendance(student_id,school_id,class_id,date,status,marked_by,remark)
     VALUES($1,$2,$3,$4,'ABSENT',$5,'Initial unexcused absence')
     ON CONFLICT(student_id,date) DO UPDATE SET status='ABSENT',marked_by=EXCLUDED.marked_by,remark=EXCLUDED.remark`,
    [fixture.student_id, fixture.school_id, fixture.class_id, leaveStart, fixture.admin_user_id],
  );

  await expectStatus(
    () => reviewLeave(fixture.school_id, otherTeacher.user_id, 'TEACHER', otherTeacher.id, leave.id, { action: 'APPROVE' }),
    403,
    'Non-class-teacher review',
  );

  const teacherQueue = await listSchoolLeaves(fixture.school_id, 'TEACHER', classTeacher.id, 'PENDING');
  assert(teacherQueue.some((item) => item.id === leave.id), 'Class Teacher queue does not contain pending leave');

  const approved = await reviewLeave(
    fixture.school_id,
    classTeacher.user_id,
    'TEACHER',
    classTeacher.id,
    leave.id,
    { action: 'APPROVE', note: 'Approved by Class Teacher' },
  );
  assert(approved.status === 'APPROVED', 'Class Teacher approval failed');

  const { rows: [attendance] } = await query<StatusRow>(
    `SELECT status::text,remark FROM attendance WHERE student_id=$1 AND date=$2`,
    [fixture.student_id, leaveStart],
  );
  assert(attendance?.status === 'EXCUSED', `Expected retroactive EXCUSED attendance, found ${attendance?.status}`);

  const { rows: [summary] } = await query<SummaryRow>(
    `SELECT absent_days,excused_days FROM attendance_monthly_summary
     WHERE student_id=$1 AND year=EXTRACT(YEAR FROM $2::date) AND month=EXTRACT(MONTH FROM $2::date)`,
    [fixture.student_id, leaveStart],
  );
  assert(Number(summary?.absent_days || 0) === 0, 'Approved leave remained in unexcused absent summary');
  assert(Number(summary?.excused_days || 0) === 1, 'Approved leave was not counted in excused summary');

  const normalized = await resolveAttendanceRecords(fixture.school_id, fixture.class_id, leaveEnd, [
    { studentId: fixture.student_id, status: 'ABSENT' },
  ]);
  assert(normalized[0]?.status === 'EXCUSED', 'Future approved leave ABSENT did not normalize to EXCUSED');
  const presentOverride = await resolveAttendanceRecords(fixture.school_id, fixture.class_id, leaveEnd, [
    { studentId: fixture.student_id, status: 'PRESENT' },
  ]);
  assert(presentOverride[0]?.status === 'PRESENT', 'Approved leave incorrectly overrode actual PRESENT attendance');

  const { rows: [decisionNotifications] } = await query<CountRow>(
    `SELECT COUNT(*)::int AS count FROM notifications
     WHERE reference_id=$1 AND type='LEAVE_APPROVED' AND user_id IN ($2,$3)`,
    [leave.id, fixture.student_user_id, fixture.parent_user_id],
  );
  assert(Number(decisionNotifications?.count || 0) >= 2, 'Student/Parent leave approval notifications were not created');

  const holidayDate = plusDays(20);
  const holiday = await createCalendarEvent(fixture.school_id, fixture.admin_user_id, {
    title: 'Certification School Holiday',
    eventType: 'HOLIDAY',
    startDate: holidayDate,
    endDate: holidayDate,
    isSchoolClosed: true,
    classIds: [fixture.class_id],
  });
  assert(holiday.is_school_closed, 'Closed School holiday was not created');
  const studentCalendar = await listStudentCalendar(fixture.student_user_id);
  const parentCalendar = await listParentCalendar(fixture.parent_user_id, fixture.student_id);
  assert(studentCalendar.some((item) => item.id === holiday.id), 'Student cannot see applicable School holiday');
  assert(parentCalendar.some((item) => item.id === holiday.id), 'Linked Parent cannot see applicable School holiday');
  await expectStatus(() => listParentCalendar(unlinkedParent.id, fixture.student_id), 403, 'Parent calendar isolation');

  await expectStatus(
    () => resolveAttendanceRecords(fixture.school_id, fixture.class_id, holidayDate, [
      { studentId: fixture.student_id, status: 'PRESENT' },
    ]),
    409,
    'Closed-day working attendance block',
  );
  const holidayAttendance = await resolveAttendanceRecords(fixture.school_id, fixture.class_id, holidayDate, [
    { studentId: fixture.student_id, status: 'HOLIDAY' },
  ]);
  assert(holidayAttendance[0]?.status === 'HOLIDAY', 'Closed-day HOLIDAY attendance was not accepted');

  const secondLeave = await createParentLeave(fixture.parent_user_id, fixture.student_id, {
    startDate: plusDays(30), endDate: plusDays(30), reason: 'Family commitment requiring one day leave',
  });
  const rejected = await reviewLeave(
    fixture.school_id, fixture.admin_user_id, 'SCHOOL_ADMIN', undefined, secondLeave.id,
    { action: 'REJECT', note: 'School Admin certification decision' },
  );
  assert(rejected.status === 'REJECTED', 'School Admin review fallback failed');

  console.log('ABSENCE AND SCHOOL CALENDAR CERTIFIED');
  console.log(`Student leave: ${leave.id} -> ${approved.status}`);
  console.log(`Retroactive attendance: ${attendance.status}`);
  console.log(`Holiday: ${holiday.id} -> closed`);
}

main()
  .catch((error: unknown) => {
    console.error(`ABSENCE/CALENDAR CERTIFICATION FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => pool.end());