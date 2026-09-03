import type { QueryResultRow } from 'pg';
import type { UserRole, UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';
import { createNotification } from './notification.service';
import logger = require('../utils/logger');

export type HomeworkAssignmentStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED';
export type HomeworkSubmissionStatus = 'SUBMITTED' | 'LATE' | 'REVIEWED' | 'RETURNED';

export interface HomeworkCreateInput {
  classId: UUID;
  subjectCode: string;
  title: string;
  description: string;
  instructions?: string | null;
  attachmentUrl?: string | null;
  dueAt: string;
  maxMarks?: number | null;
}

export interface HomeworkUpdateInput {
  classId?: UUID;
  subjectCode?: string;
  title?: string;
  description?: string;
  instructions?: string | null;
  attachmentUrl?: string | null;
  dueAt?: string;
  maxMarks?: number | null;
}

export interface HomeworkSubmissionInput {
  answerText?: string | null;
  attachmentUrl?: string | null;
}

export interface HomeworkReviewInput {
  marksAwarded?: number | null;
  feedback?: string | null;
  returnForRevision?: boolean;
}

interface StudentContextRow extends QueryResultRow {
  id: UUID;
  user_id: UUID;
  school_id: UUID | null;
  class_id: UUID | null;
  school_link_status: string | null;
}

interface ActorRow extends QueryResultRow {
  teacher_id: UUID | null;
}

interface IdRow extends QueryResultRow { id: UUID; }
interface UserIdRow extends QueryResultRow { user_id: UUID; }

interface AssignmentAccessRow extends QueryResultRow {
  id: UUID;
  school_id: UUID;
  class_id: UUID;
  subject_code: string;
  title: string;
  due_at: string | Date;
  max_marks: string | number | null;
  status: HomeworkAssignmentStatus;
  created_by: UUID;
}

interface SubmissionAccessRow extends QueryResultRow {
  id: UUID;
  homework_id: UUID;
  student_id: UUID;
  student_user_id: UUID;
  status: HomeworkSubmissionStatus;
}

function appError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function cleanRequired(value: string | undefined | null, label: string): string {
  const cleaned = String(value || '').trim();
  if (!cleaned) throw appError(`${label} is required`, 400);
  return cleaned;
}

function cleanOptional(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const cleaned = String(value).trim();
  return cleaned || null;
}

function parseDueAt(value: string | undefined | null): Date {
  const due = new Date(String(value || ''));
  if (Number.isNaN(due.getTime())) throw appError('A valid homework due date is required', 400);
  return due;
}

function normalizeMarks(value: number | null | undefined, label = 'Marks'): number | null {
  if (value === undefined || value === null) return null;
  const marks = Number(value);
  if (!Number.isFinite(marks) || marks < 0) throw appError(`${label} must be zero or greater`, 400);
  return marks;
}

async function getStudentContext(userId: UUID): Promise<StudentContextRow> {
  const { rows: [student] } = await query<StudentContextRow>(
    `SELECT id,user_id,school_id,class_id,school_link_status
     FROM students
     WHERE user_id=$1 AND status='ACTIVE'
     LIMIT 1`,
    [userId],
  );
  if (!student) throw appError('Student profile not found', 404);
  if (student.school_link_status !== 'APPROVED' || !student.school_id || !student.class_id) {
    throw appError('Homework becomes available after School enrollment is approved', 409);
  }
  return student;
}

async function getTeacherId(userId: UUID, schoolId: UUID): Promise<UUID> {
  const { rows: [actor] } = await query<ActorRow>(
    `SELECT id AS teacher_id
     FROM teachers
     WHERE user_id=$1 AND school_id=$2 AND status='ACTIVE'
     LIMIT 1`,
    [userId, schoolId],
  );
  if (!actor?.teacher_id) throw appError('Active Teacher profile not found for this School', 403);
  return actor.teacher_id;
}

async function assertClassSubjectAccess(
  schoolId: UUID,
  userId: UUID,
  role: UserRole,
  classId: UUID,
  subjectCode: string,
): Promise<void> {
  const { rows: [validClass] } = await query<IdRow>(
    `SELECT id FROM school_classes WHERE id=$1 AND school_id=$2 AND is_active=TRUE`,
    [classId, schoolId],
  );
  if (!validClass) throw appError('Class is not active in this School', 400);

  const { rows: [subject] } = await query<IdRow>(
    `SELECT id FROM subjects WHERE code=$1 LIMIT 1`,
    [subjectCode],
  );
  if (!subject) throw appError('Subject is not available', 400);

  if (role !== 'TEACHER') return;
  const teacherId = await getTeacherId(userId, schoolId);
  const { rows: [assignment] } = await query<IdRow>(
    `SELECT id
     FROM teacher_assignments
     WHERE teacher_id=$1 AND school_id=$2 AND class_id=$3 AND subject_code=$4
     ORDER BY academic_year DESC
     LIMIT 1`,
    [teacherId, schoolId, classId, subjectCode],
  );
  if (!assignment) {
    throw appError('Teachers can manage homework only for their assigned class and subject', 403);
  }
}

async function getStaffAssignment(
  schoolId: UUID,
  userId: UUID,
  role: UserRole,
  homeworkId: UUID,
): Promise<AssignmentAccessRow> {
  const { rows: [assignment] } = await query<AssignmentAccessRow>(
    `SELECT id,school_id,class_id,subject_code,title,due_at,max_marks,status,created_by
     FROM homework_assignments
     WHERE id=$1 AND school_id=$2`,
    [homeworkId, schoolId],
  );
  if (!assignment) throw appError('Homework not found', 404);
  await assertClassSubjectAccess(schoolId, userId, role, assignment.class_id, assignment.subject_code);
  return assignment;
}

export async function listStudentHomework(userId: UUID, filter?: string | null) {
  const student = await getStudentContext(userId);
  const conditions = [
    'ha.school_id=$1',
    'ha.class_id=$2',
    "ha.status IN ('PUBLISHED','CLOSED')",
  ];
  const params: unknown[] = [student.school_id, student.class_id, student.id];
  const normalized = String(filter || '').trim().toUpperCase();
  if (normalized === 'PENDING') conditions.push('hs.id IS NULL');
  if (normalized === 'SUBMITTED') conditions.push("hs.status IN ('SUBMITTED','LATE')");
  if (normalized === 'REVIEWED') conditions.push("hs.status IN ('REVIEWED','RETURNED')");

  const { rows } = await query(
    `SELECT ha.id,ha.title,ha.description,ha.instructions,ha.attachment_url,
            ha.subject_code,sub.name AS subject_name,sub.name_hi AS subject_name_hi,
            ha.due_at,ha.max_marks,ha.status,ha.published_at,
            sc.class_name,sc.section,
            hs.id AS submission_id,hs.status AS submission_status,hs.submitted_at,
            hs.marks_awarded,hs.feedback,hs.reviewed_at,
            CASE
              WHEN hs.id IS NULL THEN 'PENDING'
              WHEN hs.status IN ('REVIEWED','RETURNED') THEN 'REVIEWED'
              ELSE 'SUBMITTED'
            END AS learner_status
     FROM homework_assignments ha
     JOIN school_classes sc ON sc.id=ha.class_id
     LEFT JOIN subjects sub ON sub.code=ha.subject_code
     LEFT JOIN homework_submissions hs ON hs.homework_id=ha.id AND hs.student_id=$3
     WHERE ${conditions.join(' AND ')}
     ORDER BY
       CASE WHEN hs.id IS NULL AND ha.status='PUBLISHED' THEN 0 ELSE 1 END,
       ha.due_at ASC,
       ha.created_at DESC`,
    params,
  );
  return rows;
}

export async function getStudentHomework(userId: UUID, homeworkId: UUID) {
  const student = await getStudentContext(userId);
  const { rows: [row] } = await query(
    `SELECT ha.id,ha.title,ha.description,ha.instructions,ha.attachment_url,
            ha.subject_code,sub.name AS subject_name,sub.name_hi AS subject_name_hi,
            ha.due_at,ha.max_marks,ha.status,ha.published_at,
            sc.class_name,sc.section,
            hs.id AS submission_id,hs.answer_text,hs.attachment_url AS submission_attachment_url,
            hs.status AS submission_status,hs.submitted_at,hs.marks_awarded,hs.feedback,hs.reviewed_at
     FROM homework_assignments ha
     JOIN school_classes sc ON sc.id=ha.class_id
     LEFT JOIN subjects sub ON sub.code=ha.subject_code
     LEFT JOIN homework_submissions hs ON hs.homework_id=ha.id AND hs.student_id=$4
     WHERE ha.id=$1 AND ha.school_id=$2 AND ha.class_id=$3
       AND ha.status IN ('PUBLISHED','CLOSED')`,
    [homeworkId, student.school_id, student.class_id, student.id],
  );
  if (!row) throw appError('Homework not found', 404);
  return row;
}

export async function submitStudentHomework(
  userId: UUID,
  homeworkId: UUID,
  input: HomeworkSubmissionInput,
) {
  const student = await getStudentContext(userId);
  const answerText = cleanOptional(input.answerText);
  const attachmentUrl = cleanOptional(input.attachmentUrl);
  if (!answerText && !attachmentUrl) throw appError('Add an answer or attachment before submitting', 400);

  const { rows: [assignment] } = await query<AssignmentAccessRow>(
    `SELECT id,school_id,class_id,subject_code,title,due_at,max_marks,status,created_by
     FROM homework_assignments
     WHERE id=$1 AND school_id=$2 AND class_id=$3`,
    [homeworkId, student.school_id, student.class_id],
  );
  if (!assignment || assignment.status === 'DRAFT') throw appError('Homework not found', 404);
  if (assignment.status !== 'PUBLISHED') throw appError('This homework is closed for submissions', 409);

  const submissionStatus: HomeworkSubmissionStatus =
    Date.now() > new Date(assignment.due_at).getTime() ? 'LATE' : 'SUBMITTED';

  const { rows: [submission] } = await query(
    `INSERT INTO homework_submissions
       (homework_id,student_id,answer_text,attachment_url,status,submitted_at)
     VALUES ($1,$2,$3,$4,$5,NOW())
     ON CONFLICT (homework_id,student_id) DO UPDATE SET
       answer_text=EXCLUDED.answer_text,
       attachment_url=EXCLUDED.attachment_url,
       status=EXCLUDED.status,
       submitted_at=NOW(),
       marks_awarded=NULL,
       feedback=NULL,
       reviewed_by=NULL,
       reviewed_at=NULL,
       updated_at=NOW()
     RETURNING *`,
    [homeworkId, student.id, answerText, attachmentUrl, submissionStatus],
  );
  return submission;
}

export async function listSchoolHomework(
  schoolId: UUID,
  userId: UUID,
  role: UserRole,
  status?: string | null,
) {
  const params: unknown[] = [schoolId];
  const conditions = ['ha.school_id=$1'];
  const normalizedStatus = String(status || '').trim().toUpperCase();
  if (['DRAFT','PUBLISHED','CLOSED'].includes(normalizedStatus)) {
    params.push(normalizedStatus);
    conditions.push(`ha.status=$${params.length}`);
  }

  if (role === 'TEACHER') {
    const teacherId = await getTeacherId(userId, schoolId);
    params.push(teacherId);
    conditions.push(`EXISTS (
      SELECT 1 FROM teacher_assignments ta
      WHERE ta.teacher_id=$${params.length}
        AND ta.school_id=ha.school_id
        AND ta.class_id=ha.class_id
        AND ta.subject_code=ha.subject_code
    )`);
  }

  const { rows } = await query(
    `SELECT ha.id,ha.title,ha.description,ha.instructions,ha.attachment_url,
            ha.subject_code,sub.name AS subject_name,ha.due_at,ha.max_marks,ha.status,
            ha.published_at,ha.closed_at,ha.created_at,
            sc.class_name,sc.section,u.name AS created_by_name,
            COUNT(hs.id)::int AS submitted_count,
            COUNT(hs.id) FILTER (WHERE hs.status IN ('REVIEWED','RETURNED'))::int AS reviewed_count,
            COUNT(st.id)::int AS class_student_count
     FROM homework_assignments ha
     JOIN school_classes sc ON sc.id=ha.class_id
     LEFT JOIN subjects sub ON sub.code=ha.subject_code
     JOIN users u ON u.id=ha.created_by
     LEFT JOIN homework_submissions hs ON hs.homework_id=ha.id
     LEFT JOIN students st ON st.class_id=ha.class_id AND st.school_id=ha.school_id
       AND st.school_link_status='APPROVED' AND st.status='ACTIVE'
     WHERE ${conditions.join(' AND ')}
     GROUP BY ha.id,sc.id,sub.id,u.id
     ORDER BY CASE ha.status WHEN 'DRAFT' THEN 0 WHEN 'PUBLISHED' THEN 1 ELSE 2 END,
              ha.due_at ASC,ha.created_at DESC`,
    params,
  );

  // Joining submissions and students can multiply counts. Return exact counts from correlated queries.
  return Promise.all(rows.map(async (row: QueryResultRow) => {
    const [{ rows: [submissions] }, { rows: [students] }] = await Promise.all([
      query<{ count: string } & QueryResultRow>(
        `SELECT COUNT(*)::text AS count FROM homework_submissions WHERE homework_id=$1`, [row.id],
      ),
      query<{ count: string } & QueryResultRow>(
        `SELECT COUNT(*)::text AS count FROM students
         WHERE school_id=$1 AND class_id=$2 AND school_link_status='APPROVED' AND status='ACTIVE'`,
        [schoolId, row.class_id],
      ),
    ]);
    return {
      ...row,
      submitted_count: Number.parseInt(submissions?.count || '0', 10),
      class_student_count: Number.parseInt(students?.count || '0', 10),
    };
  }));
}

export async function createHomework(
  schoolId: UUID,
  userId: UUID,
  role: UserRole,
  input: HomeworkCreateInput,
) {
  const title = cleanRequired(input.title, 'Title');
  const description = cleanRequired(input.description, 'Description');
  const subjectCode = cleanRequired(input.subjectCode, 'Subject');
  const dueAt = parseDueAt(input.dueAt);
  const maxMarks = normalizeMarks(input.maxMarks, 'Maximum marks');
  if (dueAt.getTime() <= Date.now()) throw appError('Homework due date must be in the future', 400);

  await assertClassSubjectAccess(schoolId, userId, role, input.classId, subjectCode);
  const { rows: [created] } = await query(
    `INSERT INTO homework_assignments
       (school_id,class_id,subject_code,title,description,instructions,attachment_url,due_at,max_marks,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      schoolId,
      input.classId,
      subjectCode,
      title,
      description,
      cleanOptional(input.instructions),
      cleanOptional(input.attachmentUrl),
      dueAt.toISOString(),
      maxMarks,
      userId,
    ],
  );
  return created;
}

export async function updateHomework(
  schoolId: UUID,
  userId: UUID,
  role: UserRole,
  homeworkId: UUID,
  input: HomeworkUpdateInput,
) {
  const existing = await getStaffAssignment(schoolId, userId, role, homeworkId);
  if (existing.status !== 'DRAFT') throw appError('Only draft homework can be edited', 409);

  const classId = input.classId || existing.class_id;
  const subjectCode = input.subjectCode ? cleanRequired(input.subjectCode, 'Subject') : existing.subject_code;
  await assertClassSubjectAccess(schoolId, userId, role, classId, subjectCode);

  const dueAt = input.dueAt ? parseDueAt(input.dueAt) : new Date(existing.due_at);
  if (dueAt.getTime() <= Date.now()) throw appError('Homework due date must be in the future', 400);
  const maxMarks = input.maxMarks === undefined
    ? (existing.max_marks === null ? null : Number(existing.max_marks))
    : normalizeMarks(input.maxMarks, 'Maximum marks');

  const { rows: [updated] } = await query(
    `UPDATE homework_assignments SET
       class_id=$1,
       subject_code=$2,
       title=COALESCE($3,title),
       description=COALESCE($4,description),
       instructions=CASE WHEN $5::boolean THEN $6 ELSE instructions END,
       attachment_url=CASE WHEN $7::boolean THEN $8 ELSE attachment_url END,
       due_at=$9,
       max_marks=$10,
       updated_at=NOW()
     WHERE id=$11 AND school_id=$12
     RETURNING *`,
    [
      classId,
      subjectCode,
      input.title === undefined ? null : cleanRequired(input.title, 'Title'),
      input.description === undefined ? null : cleanRequired(input.description, 'Description'),
      input.instructions !== undefined,
      cleanOptional(input.instructions),
      input.attachmentUrl !== undefined,
      cleanOptional(input.attachmentUrl),
      dueAt.toISOString(),
      maxMarks,
      homeworkId,
      schoolId,
    ],
  );
  return updated;
}

async function notifyClassHomework(assignment: AssignmentAccessRow): Promise<void> {
  const { rows: students } = await query<UserIdRow>(
    `SELECT user_id
     FROM students
     WHERE school_id=$1 AND class_id=$2
       AND school_link_status='APPROVED' AND status='ACTIVE'`,
    [assignment.school_id, assignment.class_id],
  );
  const due = new Date(assignment.due_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const results = await Promise.allSettled(students.map((student) => createNotification({
    userId: student.user_id,
    type: 'HOMEWORK_ASSIGNED',
    title: `New homework: ${assignment.title}`,
    body: `${assignment.subject_code} homework is due ${due}.`,
    data: {
      homeworkId: assignment.id,
      subjectCode: assignment.subject_code,
      dueAt: assignment.due_at,
      href: '/student/homework',
    },
    channels: ['IN_APP'],
  })));
  const failed = results.filter((result) => result.status === 'rejected').length;
  if (failed) logger.warn(`Homework ${assignment.id}: ${failed} Student notifications failed`);
}

export async function publishHomework(
  schoolId: UUID,
  userId: UUID,
  role: UserRole,
  homeworkId: UUID,
) {
  const assignment = await getStaffAssignment(schoolId, userId, role, homeworkId);
  if (assignment.status === 'PUBLISHED') return assignment;
  if (assignment.status !== 'DRAFT') throw appError('Closed homework cannot be published again', 409);
  if (new Date(assignment.due_at).getTime() <= Date.now()) {
    throw appError('Move the due date into the future before publishing', 400);
  }
  const { rows: [published] } = await query<AssignmentAccessRow>(
    `UPDATE homework_assignments
     SET status='PUBLISHED',published_at=NOW(),updated_at=NOW()
     WHERE id=$1 AND school_id=$2 AND status='DRAFT'
     RETURNING id,school_id,class_id,subject_code,title,due_at,max_marks,status,created_by`,
    [homeworkId, schoolId],
  );
  if (!published) throw appError('Homework publication state changed; refresh and retry', 409);
  await notifyClassHomework(published);
  return published;
}

export async function closeHomework(
  schoolId: UUID,
  userId: UUID,
  role: UserRole,
  homeworkId: UUID,
) {
  const assignment = await getStaffAssignment(schoolId, userId, role, homeworkId);
  if (assignment.status === 'CLOSED') return assignment;
  if (assignment.status !== 'PUBLISHED') throw appError('Only published homework can be closed', 409);
  const { rows: [closed] } = await query(
    `UPDATE homework_assignments
     SET status='CLOSED',closed_at=NOW(),updated_at=NOW()
     WHERE id=$1 AND school_id=$2
     RETURNING *`,
    [homeworkId, schoolId],
  );
  return closed;
}

export async function listHomeworkSubmissions(
  schoolId: UUID,
  userId: UUID,
  role: UserRole,
  homeworkId: UUID,
) {
  const assignment = await getStaffAssignment(schoolId, userId, role, homeworkId);
  const { rows } = await query(
    `SELECT st.id AS student_id,st.student_code,u.name AS student_name,
            hs.id AS submission_id,hs.answer_text,hs.attachment_url,
            COALESCE(hs.status,'NOT_SUBMITTED') AS submission_status,
            hs.submitted_at,hs.marks_awarded,hs.feedback,hs.reviewed_at
     FROM students st
     JOIN users u ON u.id=st.user_id
     LEFT JOIN homework_submissions hs ON hs.student_id=st.id AND hs.homework_id=$1
     WHERE st.school_id=$2 AND st.class_id=$3
       AND st.school_link_status='APPROVED' AND st.status='ACTIVE'
     ORDER BY CASE WHEN hs.id IS NULL THEN 1 ELSE 0 END,u.name`,
    [homeworkId, schoolId, assignment.class_id],
  );
  return { assignment, students: rows };
}

export async function reviewHomeworkSubmission(
  schoolId: UUID,
  userId: UUID,
  role: UserRole,
  homeworkId: UUID,
  submissionId: UUID,
  input: HomeworkReviewInput,
) {
  const assignment = await getStaffAssignment(schoolId, userId, role, homeworkId);
  const marks = normalizeMarks(input.marksAwarded, 'Awarded marks');
  const maximum = assignment.max_marks === null ? null : Number(assignment.max_marks);
  if (marks !== null && maximum !== null && marks > maximum) {
    throw appError(`Awarded marks cannot exceed ${maximum}`, 400);
  }
  if (marks !== null && maximum === null) {
    throw appError('Set maximum marks on the homework before awarding marks', 400);
  }

  const { rows: [submission] } = await query<SubmissionAccessRow>(
    `SELECT hs.id,hs.homework_id,hs.student_id,st.user_id AS student_user_id,hs.status
     FROM homework_submissions hs
     JOIN students st ON st.id=hs.student_id
     WHERE hs.id=$1 AND hs.homework_id=$2
       AND st.school_id=$3 AND st.class_id=$4`,
    [submissionId, homeworkId, schoolId, assignment.class_id],
  );
  if (!submission) throw appError('Homework submission not found', 404);

  const nextStatus: HomeworkSubmissionStatus = input.returnForRevision ? 'RETURNED' : 'REVIEWED';
  const feedback = cleanOptional(input.feedback);
  if (nextStatus === 'RETURNED' && !feedback) throw appError('Feedback is required when returning work for revision', 400);

  const { rows: [updated] } = await query(
    `UPDATE homework_submissions SET
       status=$1,marks_awarded=$2,feedback=$3,reviewed_by=$4,reviewed_at=NOW(),updated_at=NOW()
     WHERE id=$5
     RETURNING *`,
    [nextStatus, marks, feedback, userId, submissionId],
  );

  await createNotification({
    userId: submission.student_user_id,
    type: 'HOMEWORK_FEEDBACK',
    title: input.returnForRevision ? `Homework returned: ${assignment.title}` : `Homework reviewed: ${assignment.title}`,
    body: input.returnForRevision
      ? (feedback || 'Your Teacher has asked you to revise this homework.')
      : (marks !== null && maximum !== null
        ? `Your homework was reviewed: ${marks}/${maximum}.${feedback ? ` ${feedback}` : ''}`
        : (feedback || 'Your homework has been reviewed.')),
    data: {
      homeworkId,
      submissionId,
      status: nextStatus,
      marksAwarded: marks,
      maxMarks: maximum,
      href: '/student/homework',
    },
    channels: ['IN_APP'],
  }).catch((error: unknown) => {
    logger.warn('Homework feedback notification failed', {
      homeworkId,
      submissionId,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  return updated;
}
