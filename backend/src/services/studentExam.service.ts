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
  type: string;
  class_names: string[] | null;
  registration_start: string | Date | null;
  registration_end: string | Date | null;
  max_registrations: number | null;
  duration_mins: number;
  start_time: string | Date;
  end_time: string | Date;
  total_questions: number;
  marks_per_question: number | string;
  negative_marks: number | string;
  instructions: string | null;
  instructions_hi?: string | null;
  subject_codes: string[];
  require_registration?: boolean;
  shuffle_questions?: boolean;
}

interface CountRow extends QueryResultRow { count: number; }
interface RegistrationRow extends QueryResultRow { id: UUID; registered_at: string | Date; }
interface IdRow extends QueryResultRow { id: UUID; }
interface QuestionIdRow extends QueryResultRow { id: UUID; }

interface ExamAttemptRow extends QueryResultRow {
  id: UUID;
  exam_id: UUID;
  student_id: UUID;
  school_id: UUID | null;
  status: string;
  started_at: string | Date;
  deadline_at?: string | Date | null;
  question_order?: UUID[] | null;
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

async function supportsCompetitionV2(): Promise<boolean> {
  const { rows: [row] } = await query<{ available: boolean } & QueryResultRow>(
    `SELECT EXISTS(
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='exam_attempts' AND column_name='question_order'
     ) AS available`,
  );
  return Boolean(row?.available);
}

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
  }
  return copy;
}

export async function getContext(studentId: UUID): Promise<StudentExamContext> {
  const { rows: [student] } = await query<StudentExamContext>(
    `SELECT s.id,s.school_id,s.school_link_status,COALESCE(sc.class_name,s.grade_level) AS class_name
     FROM students s LEFT JOIN school_classes sc ON sc.id=s.class_id
     WHERE s.id=$1 AND s.status='ACTIVE'`,
    [studentId],
  );
  if (!student) throw Object.assign(new Error('Student profile not found'), { statusCode: 404 });
  return student;
}

function effectiveSchoolId(student: StudentExamContext): UUID | null {
  return student.school_link_status === 'APPROVED' ? student.school_id : null;
}

export async function register(
  examId: UUID,
  studentId: UUID,
): Promise<{ registered: true; registrationId: UUID; registeredAt: string | Date; examTitle: string }> {
  const student = await getContext(studentId);
  const schoolId = effectiveSchoolId(student);
  const { rows: [exam] } = await query<ExamRow>('SELECT * FROM exams WHERE id=$1', [examId]);
  if (!exam) throw Object.assign(new Error('Exam not found'), { statusCode: 404 });
  if (!['REGISTRATION_OPEN', 'LIVE'].includes(exam.status)) {
    throw Object.assign(new Error('Registration is not open for this exam'), { statusCode: 400 });
  }
  if (exam.school_id && exam.school_id !== schoolId) {
    throw Object.assign(new Error('This school exam is available only after approved school enrollment'), { statusCode: 403 });
  }
  if (exam.class_names?.length && !exam.class_names.includes(student.class_name)) {
    throw Object.assign(new Error('This exam is not available for your class'), { statusCode: 403 });
  }
  const now = new Date();
  if (exam.registration_start && now < new Date(exam.registration_start)) {
    throw Object.assign(new Error('Registration has not opened yet'), { statusCode: 400 });
  }
  if (exam.registration_end && now > new Date(exam.registration_end)) {
    throw Object.assign(new Error('Registration deadline has passed'), { statusCode: 400 });
  }
  if (exam.max_registrations) {
    const { rows: [countRow] } = await query<CountRow>('SELECT COUNT(*)::INT AS count FROM exam_registrations WHERE exam_id=$1', [examId]);
    if (countRow && countRow.count >= exam.max_registrations) {
      const { rows: [existing] } = await query<IdRow>('SELECT id FROM exam_registrations WHERE exam_id=$1 AND student_id=$2', [examId, studentId]);
      if (!existing) throw Object.assign(new Error('Registration capacity has been reached'), { statusCode: 400 });
    }
  }
  const { rows: [registration] } = await query<RegistrationRow>(
    `INSERT INTO exam_registrations(exam_id,student_id,school_id) VALUES($1,$2,$3)
     ON CONFLICT(exam_id,student_id) DO UPDATE SET school_id=EXCLUDED.school_id
     RETURNING id,registered_at`,
    [examId,studentId,schoolId],
  );
  if (!registration) throw new Error('Exam registration did not return a row');
  return { registered: true, registrationId: registration.id, registeredAt: registration.registered_at, examTitle: exam.title };
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
    instructionsHi: string | null;
    subjectCodes: string[];
  };
  startedAt: string | Date;
  endsAt: string;
  questions: StudentExamQuestion[];
}> {
  const student = await getContext(studentId);
  const schoolId = effectiveSchoolId(student);
  const v2 = await supportsCompetitionV2();
  const { rows: [exam] } = await query<ExamRow>('SELECT * FROM exams WHERE id=$1', [examId]);
  if (!exam) throw Object.assign(new Error('Exam not found'), { statusCode: 404 });
  if (exam.status !== 'LIVE') throw Object.assign(new Error('Exam is not live right now'), { statusCode: 400 });
  if (exam.school_id && exam.school_id !== schoolId) {
    throw Object.assign(new Error('This school exam is available only after approved school enrollment'), { statusCode: 403 });
  }
  if (exam.class_names?.length && !exam.class_names.includes(student.class_name)) {
    throw Object.assign(new Error('This exam is not available for your class'), { statusCode: 403 });
  }
  const now = new Date();
  if (v2 && exam.type === 'OLYMPIAD' && (now < new Date(exam.start_time) || now >= new Date(exam.end_time))) {
    throw Object.assign(new Error('Competition attempt can start only inside the scheduled competition window'), { statusCode: 409 });
  }

  const { rows: [registration] } = await query<IdRow>('SELECT id FROM exam_registrations WHERE exam_id=$1 AND student_id=$2', [examId, studentId]);
  if (!registration) {
    if (v2 && exam.type === 'OLYMPIAD' && exam.require_registration !== false) {
      throw Object.assign(new Error('Register for this competition before the attempt window opens'), { statusCode: 409 });
    }
    await register(examId, studentId);
  }

  const { rows: questionIds } = await query<QuestionIdRow>('SELECT id FROM exam_questions WHERE exam_id=$1 ORDER BY sort_order,created_at', [examId]);
  if (!questionIds.length) throw Object.assign(new Error('This competition does not have questions yet'), { statusCode: 400 });

  const { rows: [existing] } = await query<ExamAttemptRow>('SELECT * FROM exam_attempts WHERE exam_id=$1 AND student_id=$2', [examId, studentId]);
  if (existing && existing.status !== 'IN_PROGRESS') throw Object.assign(new Error('You have already submitted this exam'), { statusCode: 409 });

  let attempt = existing;
  if (!attempt) {
    const startedAt = new Date();
    const durationEnd = new Date(startedAt.getTime() + exam.duration_mins * 60_000);
    const hardEnd = new Date(exam.end_time);
    const deadline = durationEnd < hardEnd ? durationEnd : hardEnd;
    const order = exam.shuffle_questions === false ? questionIds.map((item) => item.id) : shuffled(questionIds.map((item) => item.id));
    if (v2) {
      const { rows: [created] } = await query<ExamAttemptRow>(
        `INSERT INTO exam_attempts(exam_id,student_id,school_id,status,deadline_at,question_order)
         VALUES($1,$2,$3,'IN_PROGRESS',$4,$5::uuid[]) RETURNING *`,
        [examId,studentId,schoolId,deadline.toISOString(),order],
      );
      if (!created) throw new Error('Competition attempt insert did not return a row');
      attempt = created;
    } else {
      const { rows: [created] } = await query<ExamAttemptRow>(
        `INSERT INTO exam_attempts(exam_id,student_id,school_id,status) VALUES($1,$2,$3,'IN_PROGRESS') RETURNING *`,
        [examId,studentId,schoolId],
      );
      if (!created) throw new Error('Exam attempt insert did not return a row');
      attempt = created;
    }
  }

  let order = v2 && attempt.question_order?.length ? attempt.question_order : questionIds.map((item) => item.id);
  if (v2 && (!attempt.question_order || !attempt.question_order.length)) {
    order = exam.shuffle_questions === false ? order : shuffled(order);
    await query('UPDATE exam_attempts SET question_order=$1::uuid[] WHERE id=$2', [order, attempt.id]);
  }
  const { rows: questions } = v2
    ? await query<StudentExamQuestion>(
        `SELECT id,question_text,question_hi,option_a,option_b,option_c,option_d,
                option_a_hi,option_b_hi,option_c_hi,option_d_hi,subject_code,difficulty,sort_order
         FROM exam_questions WHERE exam_id=$1
         ORDER BY COALESCE(array_position($2::uuid[],id),32767),sort_order,created_at`,
        [examId,order],
      )
    : await query<StudentExamQuestion>(
        `SELECT id,question_text,question_hi,option_a,option_b,option_c,option_d,
                option_a_hi,option_b_hi,option_c_hi,option_d_hi,subject_code,difficulty,sort_order
         FROM exam_questions WHERE exam_id=$1 ORDER BY sort_order,created_at`,
        [examId],
      );

  const computedDurationEnd = new Date(new Date(attempt.started_at).getTime() + exam.duration_mins * 60_000);
  const hardEnd = new Date(exam.end_time);
  const fallbackDeadline = computedDurationEnd < hardEnd ? computedDurationEnd : hardEnd;
  const deadline = attempt.deadline_at ? new Date(attempt.deadline_at) : fallbackDeadline;
  return {
    attemptId: attempt.id,
    exam: {
      id: exam.id,
      title: exam.title,
      titleHi: exam.title_hi,
      durationMins: exam.duration_mins,
      totalQuestions: questionIds.length,
      marksPerQuestion: Number(exam.marks_per_question),
      negativeMarks: Number(exam.negative_marks),
      instructions: exam.instructions,
      instructionsHi: exam.instructions_hi || null,
      subjectCodes: exam.subject_codes,
    },
    startedAt: attempt.started_at,
    endsAt: deadline.toISOString(),
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
