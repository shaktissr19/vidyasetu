import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';
import * as academicCompetitionService from './academicCompetition.service';

export interface StudentExamContext extends QueryResultRow {
  id: UUID;
  school_id: UUID | null;
  school_link_status: string;
  class_name: string;
}

interface ExamRow extends QueryResultRow {
  id: UUID;
  school_id: UUID | null;
  title: string;
  title_hi: string | null;
  status: string;
  class_names: string[] | null;
  registration_start: string | Date | null;
  registration_end: string | Date | null;
  max_registrations: number | null;
  duration_mins: number;
  end_time: string | Date;
  total_questions: number;
  marks_per_question: number | string;
  negative_marks: number | string;
  instructions: string | null;
  subject_codes: string[];
}

interface CountRow extends QueryResultRow {
  count: number;
}

interface RegistrationRow extends QueryResultRow {
  id: UUID;
  registered_at: string | Date;
}

interface IdRow extends QueryResultRow {
  id: UUID;
}

interface ExamAttemptRow extends QueryResultRow {
  id: UUID;
  exam_id: UUID;
  student_id: UUID;
  school_id: UUID | null;
  status: string;
  started_at: string | Date;
}

export interface StudentExamQuestion extends QueryResultRow {
  id: UUID;
  question_text: string;
  question_hi: string | null;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  option_a_hi: string | null;
  option_b_hi: string | null;
  option_c_hi: string | null;
  option_d_hi: string | null;
  subject_code: string | null;
  difficulty: string | null;
  sort_order: number;
}

export async function getContext(studentId: UUID): Promise<StudentExamContext> {
  const { rows: [student] } = await query<StudentExamContext>(
    `SELECT s.id, s.school_id, s.school_link_status,
            COALESCE(sc.class_name, s.grade_level) AS class_name
     FROM students s
     LEFT JOIN school_classes sc ON sc.id = s.class_id
     WHERE s.id = $1 AND s.status = 'ACTIVE'`,
    [studentId],
  );
  if (!student) {
    throw Object.assign(new Error('Student profile not found'), { statusCode: 404 });
  }
  return student;
}

function effectiveSchoolId(student: StudentExamContext): UUID | null {
  return student.school_link_status === 'APPROVED' ? student.school_id : null;
}

export async function register(
  examId: UUID,
  studentId: UUID,
): Promise<{
  registered: true;
  registrationId: UUID;
  registeredAt: string | Date;
  examTitle: string;
}> {
  const student = await getContext(studentId);
  const schoolId = effectiveSchoolId(student);
  const { rows: [exam] } = await query<ExamRow>('SELECT * FROM exams WHERE id = $1', [examId]);
  if (!exam) throw Object.assign(new Error('Exam not found'), { statusCode: 404 });
  if (!['REGISTRATION_OPEN', 'LIVE'].includes(exam.status)) {
    throw Object.assign(new Error('Registration is not open for this exam'), { statusCode: 400 });
  }
  if (exam.school_id && exam.school_id !== schoolId) {
    throw Object.assign(
      new Error('This school exam is available only after approved school enrollment'),
      { statusCode: 403 },
    );
  }
  if (exam.class_names?.length && !exam.class_names.includes(student.class_name)) {
    throw Object.assign(new Error('This exam is not available for your class'), { statusCode: 403 });
  }
  if (exam.registration_start && new Date() < new Date(exam.registration_start)) {
    throw Object.assign(new Error('Registration has not opened yet'), { statusCode: 400 });
  }
  if (exam.registration_end && new Date() > new Date(exam.registration_end)) {
    throw Object.assign(new Error('Registration deadline has passed'), { statusCode: 400 });
  }

  if (exam.max_registrations) {
    const { rows: [countRow] } = await query<CountRow>(
      'SELECT COUNT(*)::INT AS count FROM exam_registrations WHERE exam_id = $1',
      [examId],
    );
    if (countRow && countRow.count >= exam.max_registrations) {
      throw Object.assign(new Error('Registration capacity has been reached'), { statusCode: 400 });
    }
  }

  const { rows: [registration] } = await query<RegistrationRow>(
    `INSERT INTO exam_registrations (exam_id, student_id, school_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (exam_id, student_id) DO UPDATE SET school_id = EXCLUDED.school_id
     RETURNING id, registered_at`,
    [examId, studentId, schoolId],
  );
  if (!registration) throw new Error('Exam registration did not return a row');
  return {
    registered: true,
    registrationId: registration.id,
    registeredAt: registration.registered_at,
    examTitle: exam.title,
  };
}

export async function startAttempt(
  examId: UUID,
  studentId: UUID,
): Promise<{
  attemptId: UUID;
  exam: {
    id: UUID;
    title: string;
    titleHi: string | null;
    durationMins: number;
    totalQuestions: number;
    marksPerQuestion: number;
    negativeMarks: number;
    instructions: string | null;
    subjectCodes: string[];
  };
  startedAt: string | Date;
  endsAt: string;
  questions: StudentExamQuestion[];
}> {
  const student = await getContext(studentId);
  const schoolId = effectiveSchoolId(student);
  const { rows: [exam] } = await query<ExamRow>('SELECT * FROM exams WHERE id = $1', [examId]);
  if (!exam) throw Object.assign(new Error('Exam not found'), { statusCode: 404 });
  if (exam.status !== 'LIVE') {
    throw Object.assign(new Error('Exam is not live right now'), { statusCode: 400 });
  }
  if (exam.school_id && exam.school_id !== schoolId) {
    throw Object.assign(
      new Error('This school exam is available only after approved school enrollment'),
      { statusCode: 403 },
    );
  }
  if (exam.class_names?.length && !exam.class_names.includes(student.class_name)) {
    throw Object.assign(new Error('This exam is not available for your class'), { statusCode: 403 });
  }

  const { rows: [registration] } = await query<IdRow>(
    'SELECT id FROM exam_registrations WHERE exam_id = $1 AND student_id = $2',
    [examId, studentId],
  );
  if (!registration) await register(examId, studentId);

  const { rows: [existing] } = await query<ExamAttemptRow>(
    'SELECT * FROM exam_attempts WHERE exam_id = $1 AND student_id = $2',
    [examId, studentId],
  );
  if (existing && existing.status !== 'IN_PROGRESS') {
    throw Object.assign(new Error('You have already submitted this exam'), { statusCode: 409 });
  }

  let attempt = existing;
  if (!attempt) {
    const { rows: [created] } = await query<ExamAttemptRow>(
      `INSERT INTO exam_attempts (exam_id, student_id, school_id, status)
       VALUES ($1, $2, $3, 'IN_PROGRESS') RETURNING *`,
      [examId, studentId, schoolId],
    );
    if (!created) throw new Error('Exam attempt insert did not return a row');
    attempt = created;
  }

  const { rows: questions } = await query<StudentExamQuestion>(
    `SELECT id, question_text, question_hi,
            option_a, option_b, option_c, option_d,
            option_a_hi, option_b_hi, option_c_hi, option_d_hi,
            subject_code, difficulty, sort_order
     FROM exam_questions WHERE exam_id = $1 ORDER BY sort_order, created_at`,
    [examId],
  );

  const durationEnd = new Date(new Date(attempt.started_at).getTime() + exam.duration_mins * 60000);
  const hardEnd = new Date(exam.end_time);
  return {
    attemptId: attempt.id,
    exam: {
      id: exam.id,
      title: exam.title,
      titleHi: exam.title_hi,
      durationMins: exam.duration_mins,
      totalQuestions: exam.total_questions,
      marksPerQuestion: Number(exam.marks_per_question),
      negativeMarks: Number(exam.negative_marks),
      instructions: exam.instructions,
      subjectCodes: exam.subject_codes,
    },
    startedAt: attempt.started_at,
    endsAt: (durationEnd < hardEnd ? durationEnd : hardEnd).toISOString(),
    questions,
  };
}

export async function submitAttempt(
  attemptId: UUID,
  studentId: UUID,
  responses: academicCompetitionService.ExamResponseInput[],
): Promise<academicCompetitionService.SubmittedAttemptResult> {
  return academicCompetitionService.submitAttempt(attemptId, studentId, responses);
}
