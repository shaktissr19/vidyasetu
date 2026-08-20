import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';
import * as studentService from './student.service';

interface LinkRow extends QueryResultRow { id: UUID; }
interface ParentStudentRow extends QueryResultRow {
  id: UUID;
  student_code: string;
  grade_level: string;
  school_link_status: string;
  roll_number: string | null;
  name: string;
  username: string | null;
  profile_photo: string | null;
  class_name: string;
  section: string | null;
  school_name: string | null;
  relation: string;
}
interface ChildDashboardStudentRow extends QueryResultRow {
  id: UUID;
  user_id: UUID;
  school_id: UUID | null;
  class_id: UUID | null;
  academic_year: string;
  grade_level: string;
  school_link_status: string;
  name: string;
  username: string | null;
  email: string | null;
  mobile: string;
  class_name: string;
  section: string | null;
  school_name: string | null;
  [key: string]: unknown;
}
interface TeacherRouteRow extends QueryResultRow {
  teacher_user_id: UUID;
  school_id: UUID;
}
interface ClassTeacherRow extends QueryResultRow {
  teacher_id: UUID;
  teacher_user_id: UUID;
  name: string;
  email: string | null;
  mobile: string | null;
}
interface MessageRow extends QueryResultRow { id: UUID; }
interface StudentUserRow extends QueryResultRow {
  user_id: UUID;
  academic_year: string;
}
interface AcademicYearRange { startYear: number; endYear: number; }
interface RankRow extends QueryResultRow {
  rank: number | string;
  average: number | string | null;
}
interface PerformanceSourceRow extends QueryResultRow {
  subject_code: string;
  subject_name: string | null;
  exam_id: UUID;
  exam_name: string;
  start_time: string | Date;
  marks_obtained: number | string;
  max_marks: number | string;
  percentage: number | string | null;
}
interface AnnualAttendanceRow extends QueryResultRow {
  working_days: number | string;
  present_days: number | string;
  absent_days: number | string;
  late_days: number | string;
  half_days: number | string;
  percentage: number | string | null;
}

export interface ParentPerformanceScore {
  examId: UUID;
  examName: string;
  date: string | Date;
  marks: number;
  maxMarks: number;
  percentage: number;
}

export interface ParentSubjectPerformance {
  subjectCode: string;
  subjectName: string;
  scores: ParentPerformanceScore[];
  latest: number | null;
  trend: 'IMPROVING' | 'STEADY' | 'DECLINING' | 'NEW';
}

async function assertParentLink(parentUserId: UUID, studentId: UUID): Promise<LinkRow> {
  const { rows: [link] } = await query<LinkRow>(
    `SELECT id FROM parent_student_links WHERE parent_user_id = $1 AND student_id = $2`,
    [parentUserId, studentId],
  );
  if (!link) throw Object.assign(new Error('Access denied to this student'), { statusCode: 403 });
  return link;
}

function parseAcademicYear(value: string | null | undefined): AcademicYearRange | null {
  const match = /^(\d{4})-(\d{2}|\d{4})$/.exec(value || '');
  if (!match) return null;
  const startYear = Number.parseInt(match[1], 10);
  const rawEnd = match[2];
  const endYear = rawEnd.length === 2
    ? Math.floor(startYear / 100) * 100 + Number.parseInt(rawEnd, 10)
    : Number.parseInt(rawEnd, 10);
  return { startYear, endYear };
}

export async function getChildren(parentUserId: UUID): Promise<ParentStudentRow[]> {
  const { rows } = await query<ParentStudentRow>(
    `SELECT s.id, s.student_code, s.grade_level, s.school_link_status, s.roll_number,
            u.name, u.username, u.profile_photo,
            COALESCE(sc.class_name, s.grade_level) AS class_name, sc.section,
            sch.name AS school_name,
            psl.relation
     FROM parent_student_links psl
     JOIN students s ON s.id = psl.student_id
     JOIN users u ON u.id = s.user_id
     LEFT JOIN school_classes sc ON sc.id = s.class_id
     LEFT JOIN schools sch ON sch.id = s.school_id
     WHERE psl.parent_user_id = $1
     ORDER BY u.name`,
    [parentUserId],
  );
  return rows;
}

export async function getChildDashboard(parentUserId: UUID, studentId: UUID) {
  await assertParentLink(parentUserId, studentId);

  const { rows: [student] } = await query<ChildDashboardStudentRow>(
    `SELECT s.*, u.name, u.username, u.email, u.mobile,
            COALESCE(sc.class_name, s.grade_level) AS class_name, sc.section,
            sch.name AS school_name
     FROM students s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN school_classes sc ON sc.id = s.class_id
     LEFT JOIN schools sch ON sch.id = s.school_id
     WHERE s.id = $1`,
    [studentId],
  );
  if (!student) throw Object.assign(new Error('Student not found'), { statusCode: 404 });

  const approvedSchool = student.school_link_status === 'APPROVED' && Boolean(student.school_id);

  const [attendanceResult, todayResult, subjectResult, examResult, feeResult, notificationResult, teacherResult, rankResult] = await Promise.all([
    approvedSchool ? query(
      `SELECT present_days, absent_days, late_days, half_days, working_days, percentage
       FROM attendance_monthly_summary
       WHERE student_id = $1
         AND year = EXTRACT(YEAR FROM NOW())
         AND month = EXTRACT(MONTH FROM NOW())`, [studentId],
    ) : Promise.resolve({ rows: [] as QueryResultRow[] }),
    approvedSchool ? query(
      `SELECT status, created_at FROM attendance WHERE student_id = $1 AND date = CURRENT_DATE`, [studentId],
    ) : Promise.resolve({ rows: [] as QueryResultRow[] }),
    query(
      `SELECT sub.name, sub.code, sub.color_hex,
              ROUND(COUNT(scp.id) FILTER (WHERE scp.is_completed)::DECIMAL /
                    NULLIF(COUNT(ci.id), 0) * 100) AS progress_pct
       FROM subjects sub
       JOIN chapters ch ON ch.subject_id = sub.id AND ch.class_name = $2
       JOIN content_items ci ON ci.chapter_id = ch.id AND ci.status = 'PUBLISHED'
       LEFT JOIN student_content_progress scp ON scp.content_item_id = ci.id AND scp.student_id = $1
       GROUP BY sub.id, sub.name, sub.code, sub.color_hex`,
      [studentId, student.class_name],
    ),
    query(
      `SELECT e.id AS exam_id, e.title, e.type, ea.total_marks,
              (e.total_questions * e.marks_per_question) AS max_marks,
              ROUND(CASE WHEN e.total_questions > 0 AND e.marks_per_question > 0
                THEN (ea.total_marks / (e.total_questions * e.marks_per_question)) * 100 ELSE 0 END, 1) AS percentage,
              ea.rank_school, ea.rank_overall, ea.submitted_at
       FROM exam_attempts ea
       JOIN exams e ON e.id = ea.exam_id
       WHERE ea.student_id = $1 AND ea.status = 'SCORED'
       ORDER BY ea.submitted_at DESC LIMIT 5`, [studentId],
    ),
    approvedSchool ? query(
      `SELECT fi.id, fi.invoice_number, fi.amount_due, fi.amount_paid, fi.status, fi.due_date, fi.term,
              fp.payment_mode, fp.payment_date, fp.receipt_number
       FROM fee_invoices fi
       LEFT JOIN fee_payments fp ON fp.invoice_id = fi.id
       WHERE fi.student_id = $1 AND fi.academic_year = $2
       ORDER BY fi.term`, [studentId, student.academic_year],
    ) : Promise.resolve({ rows: [] as QueryResultRow[] }),
    query(
      `SELECT id, type, title, body, sent_at AS created_at, read_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY sent_at DESC LIMIT 10`, [parentUserId],
    ),
    approvedSchool ? query<ClassTeacherRow>(
      `SELECT t.id AS teacher_id, t.user_id AS teacher_user_id, u.name, u.email, u.mobile
       FROM teacher_assignments ta
       JOIN teachers t ON t.id = ta.teacher_id
       JOIN users u ON u.id = t.user_id
       WHERE ta.class_id = $1 AND ta.is_class_teacher = TRUE
       ORDER BY ta.created_at ASC LIMIT 1`,
      [student.class_id],
    ) : Promise.resolve({ rows: [] as ClassTeacherRow[] }),
    approvedSchool && student.class_id ? query<RankRow>(
      `WITH totals AS (
         SELECT ea.student_id,
                SUM(ea.total_marks)::DECIMAL AS marks,
                SUM(e.total_questions * e.marks_per_question)::DECIMAL AS max_marks
         FROM exam_attempts ea
         JOIN exams e ON e.id = ea.exam_id
         JOIN students sx ON sx.id = ea.student_id
         WHERE sx.class_id = $1 AND ea.status = 'SCORED' AND e.type = 'SCHOOL_TEST'
         GROUP BY ea.student_id
       ), ranked AS (
         SELECT student_id,
                RANK() OVER (ORDER BY marks / NULLIF(max_marks, 0) DESC, student_id) AS rank,
                ROUND(marks / NULLIF(max_marks, 0) * 100, 1) AS average
         FROM totals
       )
       SELECT rank, average FROM ranked WHERE student_id = $2`,
      [student.class_id, studentId],
    ) : Promise.resolve({ rows: [] as RankRow[] }),
  ]);

  const pendingFees = feeResult.rows.filter((row) => ['PENDING', 'OVERDUE', 'PARTIAL'].includes(String(row.status || '')));
  const nextFee = pendingFees
    .filter((row) => row.due_date)
    .sort((a, b) => new Date(String(a.due_date)).getTime() - new Date(String(b.due_date)).getTime())[0] || null;

  return {
    student: {
      ...student,
      class_label: student.section ? `${student.class_name}-${student.section}` : `Class ${student.class_name}`,
    },
    attendance: attendanceResult.rows[0] || null,
    todayAttendance: todayResult.rows[0] || null,
    subjectProgress: subjectResult.rows,
    recentExams: examResult.rows,
    fees: feeResult.rows,
    nextFee,
    notifications: notificationResult.rows,
    classTeacher: teacherResult.rows[0] || null,
    academicRanking: rankResult.rows[0] || null,
  };
}

export async function getChildPerformance(parentUserId: UUID, studentId: UUID) {
  await assertParentLink(parentUserId, studentId);
  const { rows: [student] } = await query<ChildDashboardStudentRow>(
    `SELECT s.id, s.user_id, s.school_id, s.class_id, s.academic_year, s.grade_level,
            s.school_link_status, u.name, u.username, u.email, u.mobile,
            COALESCE(sc.class_name, s.grade_level) AS class_name, sc.section,
            sch.name AS school_name
     FROM students s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN school_classes sc ON sc.id = s.class_id
     LEFT JOIN schools sch ON sch.id = s.school_id
     WHERE s.id = $1`,
    [studentId],
  );
  if (!student) throw Object.assign(new Error('Student not found'), { statusCode: 404 });

  const { rows } = await query<PerformanceSourceRow>(
    `SELECT subject_code,
            COALESCE(sub.name, subject_code) AS subject_name,
            e.id AS exam_id, e.title AS exam_name, e.start_time,
            ea.total_marks AS marks_obtained,
            (e.total_questions * e.marks_per_question) AS max_marks,
            ROUND(CASE WHEN e.total_questions > 0 AND e.marks_per_question > 0
              THEN (ea.total_marks / (e.total_questions * e.marks_per_question)) * 100 ELSE 0 END, 1) AS percentage
     FROM exam_attempts ea
     JOIN exams e ON e.id = ea.exam_id
     CROSS JOIN LATERAL unnest(e.subject_codes) AS subject_code
     LEFT JOIN subjects sub ON sub.code = subject_code
     WHERE ea.student_id = $1 AND ea.status = 'SCORED' AND e.type = 'SCHOOL_TEST'
     ORDER BY subject_code, e.start_time DESC`,
    [studentId],
  );

  const grouped = new Map<string, ParentSubjectPerformance>();
  for (const row of rows) {
    const existing = grouped.get(row.subject_code) || {
      subjectCode: row.subject_code,
      subjectName: row.subject_name || row.subject_code,
      scores: [],
      latest: null,
      trend: 'NEW' as const,
    };
    if (existing.scores.length < 3) {
      existing.scores.push({
        examId: row.exam_id,
        examName: row.exam_name,
        date: row.start_time,
        marks: Number(row.marks_obtained || 0),
        maxMarks: Number(row.max_marks || 0),
        percentage: Number(row.percentage || 0),
      });
    }
    grouped.set(row.subject_code, existing);
  }

  const subjects = [...grouped.values()].map((subject) => {
    const scores = [...subject.scores].reverse();
    const latest = scores.at(-1)?.percentage ?? null;
    const previous = scores.at(-2)?.percentage;
    let trend: ParentSubjectPerformance['trend'] = 'NEW';
    if (latest !== null && previous !== undefined) {
      const delta = latest - previous;
      trend = delta >= 2 ? 'IMPROVING' : delta <= -2 ? 'DECLINING' : 'STEADY';
    }
    return { ...subject, scores, latest, trend };
  });

  return {
    student: {
      id: student.id,
      name: student.name,
      class_name: student.class_name,
      section: student.section,
      school_name: student.school_name,
      academic_year: student.academic_year,
    },
    subjects,
  };
}

export async function getChildAttendance(parentUserId: UUID, studentId: UUID, year: number, month: number) {
  await assertParentLink(parentUserId, studentId);
  const { rows: [student] } = await query<StudentUserRow>(
    `SELECT user_id, academic_year FROM students WHERE id = $1`,
    [studentId],
  );
  if (!student) throw Object.assign(new Error('Student not found'), { statusCode: 404 });

  const { rows } = await query(
    `SELECT date, status, remark FROM attendance
     WHERE student_id = $1
       AND EXTRACT(YEAR FROM date) = $2
       AND EXTRACT(MONTH FROM date) = $3
     ORDER BY date`,
    [studentId, year, month],
  );
  const { rows: [summary] } = await query(
    `SELECT * FROM attendance_monthly_summary
     WHERE student_id = $1 AND year = $2 AND month = $3`,
    [studentId, year, month],
  );

  const academicRange = parseAcademicYear(student.academic_year);
  let annualSummary: AnnualAttendanceRow | null = null;
  if (academicRange) {
    const { rows: [annual] } = await query<AnnualAttendanceRow>(
      `SELECT COALESCE(SUM(working_days), 0) AS working_days,
              COALESCE(SUM(present_days), 0) AS present_days,
              COALESCE(SUM(absent_days), 0) AS absent_days,
              COALESCE(SUM(late_days), 0) AS late_days,
              COALESCE(SUM(half_days), 0) AS half_days,
              ROUND((COALESCE(SUM(present_days), 0) + COALESCE(SUM(late_days), 0) + COALESCE(SUM(half_days), 0))::DECIMAL
                / NULLIF(COALESCE(SUM(working_days), 0), 0) * 100, 1) AS percentage
       FROM attendance_monthly_summary
       WHERE student_id = $1
         AND ((year = $2 AND month BETWEEN 4 AND 12) OR (year = $3 AND month BETWEEN 1 AND 3))`,
      [studentId, academicRange.startYear, academicRange.endYear],
    );
    annualSummary = annual || null;
  }

  return { records: rows, summary: summary || null, annualSummary, academicYear: student.academic_year };
}

export async function getChildReportCard(
  parentUserId: UUID,
  studentId: UUID,
  term?: string | null,
  academicYear?: string | null,
) {
  await assertParentLink(parentUserId, studentId);
  const { rows: [student] } = await query<StudentUserRow>(
    `SELECT user_id, academic_year FROM students WHERE id = $1`,
    [studentId],
  );
  if (!student) throw Object.assign(new Error('Student not found'), { statusCode: 404 });
  return studentService.getReportCard(student.user_id, term, academicYear || student.academic_year);
}

export async function getChildTeacher(parentUserId: UUID, studentId: UUID) {
  await assertParentLink(parentUserId, studentId);
  const { rows: [teacher] } = await query<ClassTeacherRow>(
    `SELECT t.id AS teacher_id, t.user_id AS teacher_user_id, u.name, u.email, u.mobile
     FROM students s
     JOIN teacher_assignments ta ON ta.class_id = s.class_id AND ta.is_class_teacher = TRUE
     JOIN teachers t ON t.id = ta.teacher_id
     JOIN users u ON u.id = t.user_id
     WHERE s.id = $1
     ORDER BY ta.created_at ASC LIMIT 1`,
    [studentId],
  );
  return teacher || null;
}

export async function getChildFees(parentUserId: UUID, studentId: UUID) {
  await assertParentLink(parentUserId, studentId);
  const { rows } = await query(
    `SELECT fi.*, fp.payment_mode, fp.payment_date, fp.receipt_number
     FROM fee_invoices fi
     LEFT JOIN fee_payments fp ON fp.invoice_id = fi.id
     WHERE fi.student_id = $1
     ORDER BY fi.academic_year DESC, fi.term`,
    [studentId],
  );
  return rows;
}

export async function getMessages(parentUserId: UUID, studentId: UUID) {
  await assertParentLink(parentUserId, studentId);
  const { rows } = await query(
    `SELECT m.*, u.name AS sender_name
     FROM teacher_parent_messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.student_id = $2 AND (m.sender_id = $1 OR m.receiver_id = $1)
     ORDER BY m.created_at ASC`,
    [parentUserId, studentId],
  );
  return rows;
}

export async function sendMessage(parentUserId: UUID, studentId: UUID, body: string) {
  await assertParentLink(parentUserId, studentId);
  const { rows: [teacher] } = await query<TeacherRouteRow>(
    `SELECT t.user_id AS teacher_user_id, s.school_id
     FROM students s
     JOIN teacher_assignments ta ON ta.class_id = s.class_id AND ta.is_class_teacher = TRUE
     JOIN teachers t ON t.id = ta.teacher_id
     WHERE s.id = $1
     LIMIT 1`,
    [studentId],
  );
  if (!teacher) throw Object.assign(new Error('No class teacher assigned yet'), { statusCode: 404 });

  const { rows: [msg] } = await query<MessageRow>(
    `INSERT INTO teacher_parent_messages (school_id, student_id, sender_id, receiver_id, body)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [teacher.school_id, studentId, parentUserId, teacher.teacher_user_id, body],
  );
  if (!msg) throw new Error('Message insert returned no row');
  return msg;
}

export async function getNotifications(parentUserId: UUID) {
  const { rows } = await query(
    `SELECT * FROM notifications WHERE user_id = $1 ORDER BY sent_at DESC LIMIT 50`,
    [parentUserId],
  );
  return rows;
}

export async function markNotificationRead(parentUserId: UUID, notificationId: UUID) {
  const { rows: [notification] } = await query(
    `UPDATE notifications SET read_at = COALESCE(read_at, NOW())
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [notificationId, parentUserId],
  );
  if (!notification) throw Object.assign(new Error('Notification not found'), { statusCode: 404 });
  return notification;
}

export async function markAllNotificationsRead(parentUserId: UUID) {
  const { rowCount } = await query(
    `UPDATE notifications SET read_at = COALESCE(read_at, NOW())
     WHERE user_id = $1 AND read_at IS NULL`,
    [parentUserId],
  );
  return { updated: rowCount || 0 };
}
