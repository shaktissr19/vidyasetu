import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';
import * as teacherSchool from '../services/teacherSchool.service';
import * as homework from '../services/homework.service';

interface FixtureRow extends QueryResultRow {
  school_id: UUID;
  academic_year: string;
  teacher_id: UUID;
  user_id: UUID;
  class_id: UUID;
  subject_code: string;
  student_id: UUID;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`TEACHER WORKFLOW CERTIFICATION FAILED: ${message}`);
}

async function expectForbidden(action: () => Promise<unknown>, message: string): Promise<void> {
  try {
    await action();
  } catch (error: unknown) {
    const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error
      ? Number((error as { statusCode?: unknown }).statusCode)
      : 0;
    assert(statusCode === 403, `${message}; expected 403, got ${statusCode || 'unknown error'}`);
    return;
  }
  throw new Error(`TEACHER WORKFLOW CERTIFICATION FAILED: ${message}; access unexpectedly succeeded`);
}

async function main(): Promise<void> {
  const { rows: [fixture] } = await query<FixtureRow>(
    `SELECT t.school_id,s.academic_year,t.id AS teacher_id,t.user_id,ta.class_id,ta.subject_code,st.id AS student_id
     FROM teachers t
     JOIN schools s ON s.id=t.school_id
     JOIN teacher_assignments ta ON ta.teacher_id=t.id AND ta.school_id=t.school_id
     JOIN students st ON st.school_id=t.school_id AND st.class_id=ta.class_id
       AND st.status='ACTIVE' AND st.school_link_status='APPROVED'
     WHERE t.status IN ('ACTIVE','ON_LEAVE')
     ORDER BY t.created_at,ta.created_at,st.created_at
     LIMIT 1`,
  );
  assert(fixture, 'Disposable baseline needs a Teacher with an assigned class and approved Student');

  const context = await teacherSchool.getTeacherContext(fixture.school_id, fixture.user_id, fixture.teacher_id);
  assert(context.teacher.id === fixture.teacher_id, 'Teacher identity must resolve to the authenticated Teacher profile');
  assert(context.assignments.some((item) => item.class_id === fixture.class_id && item.subject_code === fixture.subject_code), 'Canonical class-subject assignment must be preserved');

  const profile = await teacherSchool.getTeacherProfile(fixture.school_id, fixture.user_id, fixture.teacher_id) as Record<string, unknown>;
  assert(!('admin_name' in profile) && !('admin_email' in profile) && !('admin_mobile' in profile), 'Teacher profile response must not expose School administrator identity/contact fields');

  const overview = await teacherSchool.getTeacherOverview(fixture.school_id, fixture.user_id, fixture.teacher_id);
  assert(overview.teacher.id === fixture.teacher_id, 'Teacher dashboard must stay bound to the authenticated Teacher');
  assert(overview.assignments.length === context.assignments.length, 'Teacher dashboard assignment count must match scoped context');
  assert(Number(overview.stats.total_classes) <= new Set(context.assignments.map((item) => item.class_id)).size, 'Teacher dashboard class count must not exceed assigned classes');

  const roster = await teacherSchool.getAssignedStudents(
    fixture.school_id,
    fixture.user_id,
    fixture.teacher_id,
    { page: 1, limit: 100 },
    { classId: fixture.class_id },
  );
  assert(roster.students.length > 0, 'Assigned class roster must be visible to its Teacher');
  assert(roster.students.every((row) => row.class_id === fixture.class_id), 'Teacher roster must contain only the requested assigned class');
  assert(roster.students.every((row) => row.email === null && row.username === null && row.mobile === '—'), 'Teacher roster must mask learner account/contact PII');

  const student = await teacherSchool.getAssignedStudentDetail(fixture.school_id, fixture.user_id, fixture.student_id, fixture.teacher_id) as Record<string, unknown>;
  assert(student.id === fixture.student_id, 'Assigned Student detail must be available');
  assert(student.email === null && student.username === null && student.mobile === '—', 'Teacher Student detail must mask learner account/contact PII');
  assert(Array.isArray(student.parents) && student.parents.length === 0, 'Teacher Student detail must not expose Parent contacts');

  const foreignSection = `T${Date.now().toString().slice(-4)}`;
  const { rows: [foreignClass] } = await query<{ id: UUID } & QueryResultRow>(
    `INSERT INTO school_classes(school_id,class_name,section,academic_year,is_active)
     VALUES($1,'12',$2,$3,TRUE) RETURNING id`,
    [fixture.school_id, foreignSection, fixture.academic_year],
  );
  assert(foreignClass, 'Certification-only foreign class must be created');

  let homeworkId: UUID | null = null;
  const attendanceDate = '2099-01-15';
  try {
    await expectForbidden(
      () => teacherSchool.getAssignedStudents(
        fixture.school_id,
        fixture.user_id,
        fixture.teacher_id,
        { page: 1, limit: 20 },
        { classId: foreignClass.id },
      ),
      'Teacher must not enumerate an unassigned class',
    );

    await expectForbidden(
      () => teacherSchool.getAttendanceRoster(fixture.school_id, fixture.user_id, foreignClass.id, attendanceDate, fixture.teacher_id),
      'Teacher must not open attendance for an unassigned class',
    );

    const saved = await teacherSchool.markAttendance(
      fixture.school_id,
      fixture.user_id,
      fixture.class_id,
      attendanceDate,
      [{ studentId: fixture.student_id, status: 'PRESENT', remark: 'Teacher workflow CI' }],
      fixture.teacher_id,
    );
    assert(saved.length === 1 && saved[0]?.student_id === fixture.student_id, 'Teacher attendance write must persist inside assigned class scope');
    const attendanceRoster = await teacherSchool.getAttendanceRoster(fixture.school_id, fixture.user_id, fixture.class_id, attendanceDate, fixture.teacher_id);
    const attendanceStudent = attendanceRoster.find((row) => row.id === fixture.student_id);
    assert(attendanceStudent?.attendance_status === 'PRESENT', 'Teacher attendance read-after-write must preserve persisted status');

    const createdHomework = await homework.createHomework(
      fixture.school_id,
      fixture.user_id,
      'TEACHER',
      {
        classId: fixture.class_id,
        subjectCode: fixture.subject_code,
        title: 'Teacher workflow certification homework',
        description: 'Disposable certification assignment proving Teacher class-subject authorization.',
        dueAt: '2099-01-20T10:00:00.000Z',
        maxMarks: 10,
      },
    ) as { id?: UUID; status?: string };
    assert(createdHomework.id && createdHomework.status === 'DRAFT', 'Teacher must be able to create DRAFT homework only inside assigned class-subject scope');
    homeworkId = createdHomework.id;

    await expectForbidden(
      () => homework.createHomework(
        fixture.school_id,
        fixture.user_id,
        'TEACHER',
        {
          classId: foreignClass.id,
          subjectCode: fixture.subject_code,
          title: 'Forbidden Teacher homework',
          description: 'Must never be created outside the Teacher assignment.',
          dueAt: '2099-01-20T10:00:00.000Z',
        },
      ),
      'Teacher must not create homework for an unassigned class',
    );

    const timetable = await teacherSchool.getTeacherTimetable(fixture.school_id, fixture.user_id, fixture.class_id, fixture.teacher_id);
    assert(timetable.every((row) => row.teacher_id === fixture.teacher_id || row.is_break === true), 'Teacher timetable must contain only own teaching periods plus class breaks');

    const results = await teacherSchool.getTeacherResults(fixture.school_id, fixture.user_id, fixture.teacher_id);
    const assignedClassLabels = new Set(context.assignments.map((item) => `${item.class_name}::${item.section || ''}`));
    assert(results.every((row) => assignedClassLabels.has(`${row.class_name}::${row.section || ''}`)), 'Teacher result summary must not leak unassigned class results');
  } finally {
    if (homeworkId) await query('DELETE FROM homework_assignments WHERE id=$1', [homeworkId]);
    await query('DELETE FROM attendance WHERE student_id=$1 AND date=$2::date AND remark=$3', [fixture.student_id, attendanceDate, 'Teacher workflow CI']);
    await query('DELETE FROM school_classes WHERE id=$1', [foreignClass.id]);
  }

  console.log('TEACHER WORKFLOW E2E CERTIFIED — AUTHENTICATED TEACHER SCOPE, PII MASKING, CLASS/SUBJECT AUTHORIZATION, ATTENDANCE PERSISTENCE, HOMEWORK AND RESULT ISOLATION');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
