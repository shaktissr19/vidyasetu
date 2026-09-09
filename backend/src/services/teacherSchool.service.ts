import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';
import { getPagination, paginationMeta } from '../utils/paginate';
import * as schoolService from './school.service';

interface TeacherRow extends QueryResultRow {
  id: UUID;
  user_id: UUID;
  employee_id: string | null;
  designation: string | null;
  name: string;
}

export interface TeacherAssignmentRow extends QueryResultRow {
  id: UUID;
  class_id: UUID;
  class_name: string;
  section: string | null;
  subject_code: string;
  subject_name: string;
  subject_name_hi: string | null;
  is_class_teacher: boolean;
  academic_year: string;
}

interface StudentScopeRow extends QueryResultRow { id: UUID; class_id: UUID | null; }
interface ExamRow extends QueryResultRow {
  id: UUID;
  title: string;
  total_questions: number | string;
  marks_per_question: number | string;
  status: string;
}

function appError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

export async function getTeacherContext(
  schoolId: UUID,
  userId: UUID,
  teacherId?: UUID | null,
): Promise<{ teacher: TeacherRow; assignments: TeacherAssignmentRow[] }> {
  const params: unknown[] = [schoolId, userId];
  let teacherIdClause = '';
  if (teacherId) {
    params.push(teacherId);
    teacherIdClause = ` AND t.id=$${params.length}`;
  }
  const { rows: [teacher] } = await query<TeacherRow>(
    `SELECT t.id,t.user_id,t.employee_id,t.designation,u.name
     FROM teachers t
     JOIN users u ON u.id=t.user_id
     WHERE t.school_id=$1 AND t.user_id=$2 AND t.status='ACTIVE'${teacherIdClause}
     LIMIT 1`,
    params,
  );
  if (!teacher) throw appError('Active Teacher profile not found for this School', 403);

  const { rows: assignments } = await query<TeacherAssignmentRow>(
    `SELECT ta.id,ta.class_id,sc.class_name,sc.section,ta.subject_code,
            COALESCE(sub.name,ta.subject_code) AS subject_name,sub.name_hi AS subject_name_hi,
            ta.is_class_teacher,ta.academic_year
     FROM teacher_assignments ta
     JOIN school_classes sc ON sc.id=ta.class_id AND sc.school_id=ta.school_id AND sc.is_active=TRUE
     LEFT JOIN subjects sub ON sub.code=ta.subject_code
     WHERE ta.teacher_id=$1 AND ta.school_id=$2
     ORDER BY ta.academic_year DESC,sc.class_name,sc.section,ta.subject_code`,
    [teacher.id, schoolId],
  );
  return { teacher, assignments };
}

export async function assertTeacherClassAccess(
  schoolId: UUID,
  userId: UUID,
  classId: UUID,
  teacherId?: UUID | null,
): Promise<TeacherRow> {
  const context = await getTeacherContext(schoolId, userId, teacherId);
  if (!context.assignments.some((assignment) => assignment.class_id === classId)) {
    throw appError('Teachers can access only their assigned classes and sections', 403);
  }
  return context.teacher;
}

export async function assertTeacherClassSubjectAccess(
  schoolId: UUID,
  userId: UUID,
  classId: UUID,
  subjectCode: string,
  teacherId?: UUID | null,
): Promise<TeacherRow> {
  const normalizedSubject = subjectCode.trim().toUpperCase();
  const context = await getTeacherContext(schoolId, userId, teacherId);
  if (!context.assignments.some((assignment) =>
    assignment.class_id === classId && assignment.subject_code.toUpperCase() === normalizedSubject)) {
    throw appError('Teachers can access only their assigned class and subject', 403);
  }
  return context.teacher;
}

export async function assertTeacherStudentAccess(
  schoolId: UUID,
  userId: UUID,
  studentId: UUID,
  teacherId?: UUID | null,
): Promise<void> {
  const context = await getTeacherContext(schoolId, userId, teacherId);
  const classIds = [...new Set(context.assignments.map((assignment) => assignment.class_id))];
  if (!classIds.length) throw appError('Teacher has no active class assignments', 403);
  const { rows: [student] } = await query<StudentScopeRow>(
    `SELECT id,class_id FROM students
     WHERE id=$1 AND school_id=$2 AND class_id=ANY($3::uuid[])
       AND status='ACTIVE' AND school_link_status='APPROVED'`,
    [studentId, schoolId, classIds],
  );
  if (!student) throw appError('Student is outside the Teacher assigned class scope', 403);
}

export async function getTeacherProfile(schoolId: UUID, userId: UUID, teacherId?: UUID | null) {
  await getTeacherContext(schoolId, userId, teacherId);
  const { rows: [school] } = await query(
    `SELECT id,name,name_hi,udise_code,status,plan,address,city,district,state,pincode,
            mobile,email,website,academic_year,logo_url,board,affiliation_number,principal_name
     FROM schools WHERE id=$1`,
    [schoolId],
  );
  if (!school) throw appError('School not found', 404);
  return school;
}

export async function getTeacherOverview(schoolId: UUID, userId: UUID, teacherId?: UUID | null) {
  const { teacher, assignments } = await getTeacherContext(schoolId, userId, teacherId);
  const classIds = [...new Set(assignments.map((assignment) => assignment.class_id))];
  const subjectCodes = [...new Set(assignments.map((assignment) => assignment.subject_code))];
  const school = await getTeacherProfile(schoolId, userId, teacher.id);

  if (!classIds.length) {
    const announcements = (await query(
      'SELECT id,title,published_at FROM announcements WHERE school_id=$1 ORDER BY published_at DESC LIMIT 5',
      [schoolId],
    )).rows;
    return {
      school,
      teacher,
      assignments,
      stats: {
        total_students: 0, total_teachers: 1, total_classes: 0, assigned_subjects: 0,
        attended_today: 0, attendance_denominator: 0, today_attendance: 0,
        pending_enrollment_requests: 0, upcoming_exams: 0,
      },
      feeStats: {},
      classSummary: [],
      announcements,
      workload: { homeworkActive: 0, submissionsToReview: 0, interventionsOpen: 0 },
      todaySchedule: [],
      onboarding: { checks: {}, completed: 0, total: 0, isComplete: true },
    };
  }

  const [[stats], classSummary, announcements, workloadRows, todaySchedule] = await Promise.all([
    query(
      `SELECT COUNT(DISTINCT st.id) FILTER(WHERE st.status='ACTIVE' AND st.school_link_status='APPROVED')::int AS total_students,
              COUNT(DISTINCT st.id) FILTER(WHERE st.status='ACTIVE' AND st.school_link_status='APPROVED')::int AS attendance_denominator,
              COUNT(DISTINCT a.student_id) FILTER(WHERE a.status IN ('PRESENT','LATE','HALF_DAY'))::int AS attended_today
       FROM students st
       LEFT JOIN attendance a ON a.student_id=st.id AND a.date=CURRENT_DATE
       WHERE st.school_id=$1 AND st.class_id=ANY($2::uuid[])`,
      [schoolId, classIds],
    ).then((result) => result.rows),
    query(
      `SELECT sc.id,sc.class_name,sc.section,
              COUNT(st.id) FILTER(WHERE st.status='ACTIVE' AND st.school_link_status='APPROVED')::int AS total,
              COUNT(a.id) FILTER(WHERE a.status IN ('PRESENT','LATE','HALF_DAY'))::int AS present,
              COUNT(a.id) FILTER(WHERE a.status='ABSENT')::int AS absent
       FROM school_classes sc
       LEFT JOIN students st ON st.class_id=sc.id
       LEFT JOIN attendance a ON a.student_id=st.id AND a.date=CURRENT_DATE
       WHERE sc.school_id=$1 AND sc.id=ANY($2::uuid[]) AND sc.is_active=TRUE
       GROUP BY sc.id ORDER BY sc.class_name,sc.section`,
      [schoolId, classIds],
    ).then((result) => result.rows),
    query('SELECT id,title,published_at FROM announcements WHERE school_id=$1 ORDER BY published_at DESC LIMIT 5', [schoolId]).then((result) => result.rows),
    Promise.all([
      query(
        `SELECT COUNT(*)::int AS count FROM homework_assignments ha
         WHERE ha.school_id=$1 AND ha.status='PUBLISHED'
           AND EXISTS (SELECT 1 FROM teacher_assignments ta WHERE ta.teacher_id=$2 AND ta.school_id=ha.school_id AND ta.class_id=ha.class_id AND ta.subject_code=ha.subject_code)`,
        [schoolId, teacher.id],
      ),
      query(
        `SELECT COUNT(*)::int AS count FROM homework_submissions hs
         JOIN homework_assignments ha ON ha.id=hs.homework_id
         WHERE ha.school_id=$1 AND hs.status IN ('SUBMITTED','LATE')
           AND EXISTS (SELECT 1 FROM teacher_assignments ta WHERE ta.teacher_id=$2 AND ta.school_id=ha.school_id AND ta.class_id=ha.class_id AND ta.subject_code=ha.subject_code)`,
        [schoolId, teacher.id],
      ),
      query(
        `SELECT COUNT(*)::int AS count FROM learning_interventions li
         WHERE li.school_id=$1 AND li.teacher_id=$2 AND li.status IN ('OPEN','PARENT_ACKNOWLEDGED','IN_PROGRESS','PTM_REQUESTED')`,
        [schoolId, teacher.id],
      ),
    ]),
    query(
      `SELECT tp.id,tp.class_id,sc.class_name,sc.section,tp.day,tp.period_number,tp.start_time,tp.end_time,
              tp.subject_code,COALESCE(sub.name,tp.subject_code) AS subject,tp.room_number
       FROM timetable_periods tp
       JOIN school_classes sc ON sc.id=tp.class_id
       LEFT JOIN subjects sub ON sub.code=tp.subject_code
       WHERE tp.school_id=$1 AND tp.teacher_id=$2
         AND tp.day=CASE EXTRACT(ISODOW FROM CURRENT_DATE)::int
           WHEN 1 THEN 'MON' WHEN 2 THEN 'TUE' WHEN 3 THEN 'WED'
           WHEN 4 THEN 'THU' WHEN 5 THEN 'FRI' WHEN 6 THEN 'SAT' ELSE 'SUN' END
       ORDER BY tp.period_number`,
      [schoolId, teacher.id],
    ).then((result) => result.rows),
  ]);

  const summary = stats || { total_students: 0, attendance_denominator: 0, attended_today: 0 };
  const denominator = Number(summary.attendance_denominator || 0);
  const workload = {
    homeworkActive: Number(workloadRows[0].rows[0]?.count || 0),
    submissionsToReview: Number(workloadRows[1].rows[0]?.count || 0),
    interventionsOpen: Number(workloadRows[2].rows[0]?.count || 0),
  };
  return {
    school,
    teacher,
    assignments,
    stats: {
      ...summary,
      total_teachers: 1,
      total_classes: classIds.length,
      assigned_subjects: subjectCodes.length,
      today_attendance: denominator ? Math.round((Number(summary.attended_today || 0) / denominator) * 100) : 0,
      pending_enrollment_requests: 0,
      upcoming_exams: 0,
    },
    feeStats: {},
    classSummary,
    announcements,
    workload,
    todaySchedule,
    onboarding: { checks: {}, completed: 0, total: 0, isComplete: true },
  };
}

export async function getAssignedClasses(schoolId: UUID, userId: UUID, teacherId?: UUID | null) {
  const { teacher } = await getTeacherContext(schoolId, userId, teacherId);
  return (await query(
    `SELECT sc.id,sc.class_name,sc.section,sc.academic_year,sc.room_number,sc.is_active,
            COUNT(DISTINCT st.id) FILTER(WHERE st.status='ACTIVE' AND st.school_link_status='APPROVED')::int AS student_count,
            1::int AS teacher_count
     FROM teacher_assignments ta
     JOIN school_classes sc ON sc.id=ta.class_id AND sc.school_id=ta.school_id
     LEFT JOIN students st ON st.class_id=sc.id
     WHERE ta.teacher_id=$1 AND ta.school_id=$2 AND sc.is_active=TRUE
     GROUP BY sc.id ORDER BY sc.class_name,sc.section`,
    [teacher.id, schoolId],
  )).rows;
}

export async function getAssignedSubjects(schoolId: UUID, userId: UUID, teacherId?: UUID | null) {
  const { teacher } = await getTeacherContext(schoolId, userId, teacherId);
  return (await query(
    `SELECT DISTINCT sub.id,ta.subject_code AS code,COALESCE(sub.name,ta.subject_code) AS name,
            sub.name_hi,sub.color_hex,sub.board
     FROM teacher_assignments ta
     LEFT JOIN subjects sub ON sub.code=ta.subject_code
     WHERE ta.teacher_id=$1 AND ta.school_id=$2
     ORDER BY name,code`,
    [teacher.id, schoolId],
  )).rows;
}

export async function getAssignedStudents(
  schoolId: UUID,
  userId: UUID,
  teacherId: UUID | null | undefined,
  paginationQuery: { page?: unknown; limit?: unknown },
  filters: { status?: string; classId?: UUID; search?: string },
) {
  const { assignments } = await getTeacherContext(schoolId, userId, teacherId);
  const classIds = [...new Set(assignments.map((assignment) => assignment.class_id))];
  if (filters.classId && !classIds.includes(filters.classId)) {
    throw appError('Teachers can list Students only from their assigned classes', 403);
  }
  const { limit, offset, page } = getPagination(paginationQuery);
  if (!classIds.length) return { students: [], meta: paginationMeta(0, page, limit) };

  const conditions = [
    'st.school_id=$1',
    'st.class_id=ANY($2::uuid[])',
    "st.school_link_status='APPROVED'",
    'st.status=$3',
  ];
  const params: unknown[] = [schoolId, classIds, filters.status || 'ACTIVE'];
  if (filters.classId) {
    params.push(filters.classId);
    conditions.push(`st.class_id=$${params.length}`);
  }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(`(u.name ILIKE $${params.length} OR st.student_code ILIKE $${params.length})`);
  }
  const where = conditions.join(' AND ');
  const [{ rows }, { rows: [count] }] = await Promise.all([
    query(
      `SELECT st.id,st.student_code,st.roll_number,st.grade_level,st.status,st.school_link_status,
              u.name,NULL::text AS username,NULL::text AS email,'—'::text AS mobile,
              sc.id AS class_id,sc.class_name,sc.section,
              ams.percentage AS attendance_pct,NULL::text AS fee_status
       FROM students st
       JOIN users u ON u.id=st.user_id
       JOIN school_classes sc ON sc.id=st.class_id
       LEFT JOIN attendance_monthly_summary ams ON ams.student_id=st.id
         AND ams.year=EXTRACT(YEAR FROM NOW()) AND ams.month=EXTRACT(MONTH FROM NOW())
       WHERE ${where}
       ORDER BY sc.class_name,sc.section,st.roll_number NULLS LAST,u.name
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    ),
    query<{ count: string } & QueryResultRow>(
      `SELECT COUNT(*) FROM students st JOIN users u ON u.id=st.user_id WHERE ${where}`,
      params,
    ),
  ]);
  const total = Number.parseInt(count?.count || '0', 10);
  return { students: rows, meta: paginationMeta(total, page, limit) };
}

export async function getAssignedStudentDetail(schoolId: UUID, userId: UUID, studentId: UUID, teacherId?: UUID | null) {
  await assertTeacherStudentAccess(schoolId, userId, studentId, teacherId);
  const { rows: [student] } = await query(
    `SELECT s.id,s.student_code,s.roll_number,s.grade_level,s.academic_year,s.status,s.school_link_status,
            u.name,NULL::text AS username,NULL::text AS email,'—'::text AS mobile,
            sc.id AS class_id,sc.class_name,sc.section
     FROM students s JOIN users u ON u.id=s.user_id
     JOIN school_classes sc ON sc.id=s.class_id
     WHERE s.id=$1 AND s.school_id=$2`,
    [studentId, schoolId],
  );
  if (!student) throw appError('Student not found', 404);
  const [attendance, results] = await Promise.all([
    query(
      `SELECT year,month,working_days,present_days,absent_days,late_days,half_days,percentage
       FROM attendance_monthly_summary WHERE student_id=$1 ORDER BY year DESC,month DESC LIMIT 12`,
      [studentId],
    ).then((result) => result.rows),
    query(
      `SELECT e.id,e.title,e.subject_codes,ea.total_marks,ea.correct_count,ea.wrong_count,ea.rank_school,ea.submitted_at,
              ROUND((ea.total_marks/NULLIF(e.total_questions*e.marks_per_question,0))*100,1) AS percentage
       FROM exam_attempts ea JOIN exams e ON e.id=ea.exam_id
       WHERE ea.student_id=$1 AND ea.status='SCORED' ORDER BY ea.submitted_at DESC LIMIT 10`,
      [studentId],
    ).then((result) => result.rows),
  ]);
  return { ...student, attendance, results, parents: [] };
}

export async function getAttendanceRoster(
  schoolId: UUID,
  userId: UUID,
  classId: UUID,
  date: string,
  teacherId?: UUID | null,
) {
  await assertTeacherClassAccess(schoolId, userId, classId, teacherId);
  return schoolService.getAttendanceRoster(schoolId, classId, date);
}

export async function markAttendance(
  schoolId: UUID,
  userId: UUID,
  classId: UUID,
  date: string,
  records: schoolService.AttendanceInput[],
  teacherId?: UUID | null,
) {
  await assertTeacherClassAccess(schoolId, userId, classId, teacherId);
  return schoolService.markAttendance(schoolId, classId, date, records, userId);
}

export async function getAttendanceSummary(schoolId: UUID, userId: UUID, date: string, teacherId?: UUID | null) {
  const { assignments } = await getTeacherContext(schoolId, userId, teacherId);
  const classIds = [...new Set(assignments.map((assignment) => assignment.class_id))];
  if (!classIds.length) return [];
  return (await query(
    `SELECT sc.id,sc.class_name,sc.section,
            COUNT(st.id) FILTER(WHERE st.status='ACTIVE' AND st.school_link_status='APPROVED')::int AS total_students,
            COUNT(a.id) FILTER(WHERE a.status='PRESENT')::int AS present,
            COUNT(a.id) FILTER(WHERE a.status='ABSENT')::int AS absent,
            COUNT(a.id) FILTER(WHERE a.status='LATE')::int AS late,
            COUNT(a.id) FILTER(WHERE a.status='HALF_DAY')::int AS half_day,
            COUNT(a.id) FILTER(WHERE a.status='HOLIDAY')::int AS holiday
     FROM school_classes sc
     LEFT JOIN students st ON st.class_id=sc.id
     LEFT JOIN attendance a ON a.student_id=st.id AND a.date=$3
     WHERE sc.school_id=$1 AND sc.id=ANY($2::uuid[]) AND sc.is_active=TRUE
     GROUP BY sc.id ORDER BY sc.class_name,sc.section`,
    [schoolId, classIds, date],
  )).rows;
}

export async function getTeacherTimetable(schoolId: UUID, userId: UUID, classId: UUID, teacherId?: UUID | null) {
  const teacher = await assertTeacherClassAccess(schoolId, userId, classId, teacherId);
  return (await query(
    `SELECT tp.id,tp.day,tp.period_number,tp.start_time,tp.end_time,tp.subject_code,tp.teacher_id,tp.room_number,
            tp.is_break,tp.break_label,tp.academic_year,subj.name AS subject,subj.name_hi AS subject_hi,u.name AS teacher_name
     FROM timetable_periods tp
     LEFT JOIN subjects subj ON subj.code=tp.subject_code
     LEFT JOIN teachers t ON t.id=tp.teacher_id
     LEFT JOIN users u ON u.id=t.user_id
     WHERE tp.class_id=$1 AND tp.school_id=$2 AND (tp.teacher_id=$3 OR tp.is_break=TRUE)
     ORDER BY tp.day,tp.period_number`,
    [classId, schoolId, teacher.id],
  )).rows;
}

export async function getTeacherResults(schoolId: UUID, userId: UUID, teacherId?: UUID | null) {
  const { teacher } = await getTeacherContext(schoolId, userId, teacherId);
  return (await query(
    `SELECT e.id AS exam_id,e.title AS exam_name,e.total_questions,e.marks_per_question,sc.class_name,sc.section,
            ROUND(AVG((ea.total_marks/NULLIF(e.total_questions*e.marks_per_question,0))*100),1) AS avg_score,
            COUNT(ea.id) FILTER(WHERE (ea.total_marks/NULLIF(e.total_questions*e.marks_per_question,0))*100>=33)::int AS pass_count,
            COUNT(ea.id)::int AS total_attempts
     FROM exams e
     JOIN exam_attempts ea ON ea.exam_id=e.id AND ea.status='SCORED'
     JOIN students st ON st.id=ea.student_id AND st.school_id=$1 AND st.school_link_status='APPROVED'
     JOIN school_classes sc ON sc.id=st.class_id
     JOIN teacher_assignments ta ON ta.teacher_id=$2 AND ta.school_id=$1 AND ta.class_id=sc.id
       AND (COALESCE(cardinality(e.subject_codes),0)=0 OR ta.subject_code=ANY(e.subject_codes))
     WHERE e.school_id=$1
     GROUP BY e.id,sc.id ORDER BY e.start_time DESC,sc.class_name,sc.section`,
    [schoolId, teacher.id],
  )).rows;
}

export async function getTeacherResultDetail(
  schoolId: UUID,
  userId: UUID,
  examId: UUID,
  teacherId?: UUID | null,
) {
  const { teacher } = await getTeacherContext(schoolId, userId, teacherId);
  const { rows: [exam] } = await query<ExamRow>(
    `SELECT e.id,e.title,e.total_questions,e.marks_per_question,e.status
     FROM exams e
     WHERE e.id=$1 AND e.school_id=$2 AND EXISTS (
       SELECT 1 FROM teacher_assignments ta
       JOIN school_classes sc ON sc.id=ta.class_id AND sc.school_id=ta.school_id
       WHERE ta.teacher_id=$3 AND ta.school_id=$2
         AND (COALESCE(cardinality(e.class_names),0)=0 OR sc.class_name=ANY(e.class_names))
         AND (COALESCE(cardinality(e.subject_codes),0)=0 OR ta.subject_code=ANY(e.subject_codes))
     )`,
    [examId, schoolId, teacher.id],
  );
  if (!exam) throw appError('Exam result is outside the Teacher assigned scope', 403);
  const maxMarks = Number(exam.total_questions) * Number(exam.marks_per_question);
  const { rows: students } = await query(
    `SELECT st.id AS student_id,st.student_code,st.roll_number,u.name,sc.class_name,sc.section,
            ea.total_marks,ea.correct_count,ea.wrong_count,ea.skipped_count,ea.rank_school,ea.submitted_at,
            ROUND((ea.total_marks/NULLIF($4::numeric,0))*100,1) AS percentage
     FROM exam_attempts ea
     JOIN students st ON st.id=ea.student_id
     JOIN users u ON u.id=st.user_id
     JOIN school_classes sc ON sc.id=st.class_id
     WHERE ea.exam_id=$1 AND st.school_id=$2 AND st.school_link_status='APPROVED' AND ea.status='SCORED'
       AND EXISTS (
         SELECT 1 FROM teacher_assignments ta
         JOIN exams ex ON ex.id=$1
         WHERE ta.teacher_id=$3 AND ta.school_id=$2 AND ta.class_id=sc.id
           AND (COALESCE(cardinality(ex.subject_codes),0)=0 OR ta.subject_code=ANY(ex.subject_codes))
       )
     ORDER BY ea.total_marks DESC,ea.submitted_at`,
    [examId, schoolId, teacher.id, maxMarks],
  );
  return { exam, students };
}
