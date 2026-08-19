import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';
import * as studentService from './student.service';

interface StudentContextRow extends QueryResultRow {
  id: UUID;
  school_id: UUID;
  class_id: UUID;
  class_name: string;
  section?: string | null;
}
interface ExamRow extends QueryResultRow {
  id: UUID;
  title: string;
  title_hi: string | null;
  status: string;
  type: string;
  school_id: UUID | null;
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
interface RegistrationRow extends QueryResultRow { id: UUID; registered_at: string | Date; }
interface AttemptRow extends QueryResultRow {
  id: UUID;
  exam_id: UUID;
  status: string;
  started_at: string | Date;
  type?: string;
  marks_per_question?: number | string;
  negative_marks?: number | string;
  total_questions?: number;
}
interface QuestionRow extends QueryResultRow { id: UUID; correct_option: string; }
interface IdRow extends QueryResultRow { id: UUID; }
interface CountRow extends QueryResultRow { count: number | string; }
interface RankedRow extends QueryResultRow {
  attempt_id: UUID;
  student_id: UUID;
  school_id: UUID;
  total_marks: number | string;
  rank_overall: number | string;
  rank_school: number | string;
  percentile: number | string;
}

export interface ExamResponseInput { questionId: UUID; selectedOption?: string | null; }
export interface CreateExamInput {
  title: string;
  titleHi?: string | null;
  description?: string | null;
  type?: string;
  schoolId?: UUID | null;
  classNames?: string[];
  subjectCodes?: string[];
  status?: string;
  totalQuestions?: number;
  durationMins?: number;
  marksPerQuestion?: number;
  negativeMarks?: number;
  registrationStart?: string | null;
  registrationEnd?: string | null;
  startTime: string;
  endTime: string;
  resultsAt?: string | null;
  prizePool?: number;
  instructions?: string | null;
  instructionsHi?: string | null;
  bannerUrl?: string | null;
  maxRegistrations?: number | null;
}
export interface ExamQuestionInput {
  questionText: string;
  questionHi?: string | null;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  optionAHi?: string | null;
  optionBHi?: string | null;
  optionCHi?: string | null;
  optionDHi?: string | null;
  correctOption: string;
  explanation?: string | null;
  subjectCode?: string | null;
  difficulty?: string;
}

async function getStudentContextById(studentId: UUID): Promise<StudentContextRow> {
  const { rows: [student] } = await query<StudentContextRow>(
    `SELECT s.id, s.school_id, s.class_id, sc.class_name, sc.section
     FROM students s
     JOIN school_classes sc ON sc.id = s.class_id
     WHERE s.id = $1 AND s.status = 'ACTIVE'`,
    [studentId],
  );
  if (!student) throw Object.assign(new Error('Student profile not found'), { statusCode: 404 });
  return student;
}

export async function listForStudent(studentId: UUID, className: string, schoolId: UUID | null) {
  const { rows } = await query(
    `SELECT e.id, e.title, e.title_hi, e.description, e.type, e.status,
            e.class_names, e.subject_codes, e.total_questions, e.duration_mins,
            e.marks_per_question, e.negative_marks,
            (e.total_questions * e.marks_per_question) AS max_marks,
            e.registration_start, e.registration_end,
            e.start_time, e.end_time, e.results_at, e.prize_pool,
            e.instructions, e.instructions_hi, e.banner_url,
            er.id AS registration_id, er.registered_at,
            ea.id AS attempt_id, ea.status AS attempt_status,
            ea.started_at, ea.submitted_at, ea.total_marks,
            ea.correct_count, ea.wrong_count, ea.skipped_count,
            ea.percentile, ea.rank_school, ea.rank_overall
     FROM exams e
     LEFT JOIN exam_registrations er ON er.exam_id = e.id AND er.student_id = $1
     LEFT JOIN exam_attempts ea ON ea.exam_id = e.id AND ea.student_id = $1
     WHERE e.status IN ('REGISTRATION_OPEN','REGISTRATION_CLOSED','LIVE','SCORING','COMPLETED')
       AND (cardinality(e.class_names) = 0 OR $2 = ANY(e.class_names))
       AND (e.school_id IS NULL OR e.school_id = $3)
     ORDER BY CASE e.status
         WHEN 'LIVE' THEN 1 WHEN 'REGISTRATION_OPEN' THEN 2 WHEN 'REGISTRATION_CLOSED' THEN 3
         WHEN 'SCORING' THEN 4 ELSE 5 END, e.start_time ASC`,
    [studentId, className, schoolId],
  );
  return rows;
}

export async function listForUser(userId: UUID) {
  const { rows: [student] } = await query<StudentContextRow>(
    `SELECT s.id, s.school_id, s.class_id, sc.class_name, sc.section
     FROM students s
     JOIN school_classes sc ON sc.id = s.class_id
     WHERE s.user_id = $1 AND s.status = 'ACTIVE'`,
    [userId],
  );
  if (!student) throw Object.assign(new Error('Student profile not found'), { statusCode: 404 });
  return listForStudent(student.id, student.class_name, student.school_id);
}

export async function register(examId: UUID, studentId: UUID) {
  const student = await getStudentContextById(studentId);
  const { rows: [exam] } = await query<ExamRow>('SELECT * FROM exams WHERE id = $1', [examId]);
  if (!exam) throw Object.assign(new Error('Exam not found'), { statusCode: 404 });
  if (!['REGISTRATION_OPEN', 'LIVE'].includes(exam.status)) {
    throw Object.assign(new Error('Registration is not open for this exam'), { statusCode: 400 });
  }
  if (exam.school_id && exam.school_id !== student.school_id) {
    throw Object.assign(new Error('This exam is not available for your school'), { statusCode: 403 });
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
    if (Number(countRow?.count || 0) >= exam.max_registrations) {
      throw Object.assign(new Error('Registration capacity has been reached'), { statusCode: 400 });
    }
  }

  const { rows: [reg] } = await query<RegistrationRow>(
    `INSERT INTO exam_registrations (exam_id, student_id, school_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (exam_id, student_id) DO UPDATE SET school_id = EXCLUDED.school_id
     RETURNING id, registered_at`,
    [examId, studentId, student.school_id],
  );
  if (!reg) throw new Error('Exam registration returned no row');
  return { registered: true, registrationId: reg.id, registeredAt: reg.registered_at, examTitle: exam.title };
}

export async function startAttempt(examId: UUID, studentId: UUID) {
  const student = await getStudentContextById(studentId);
  const { rows: [exam] } = await query<ExamRow>('SELECT * FROM exams WHERE id = $1', [examId]);
  if (!exam) throw Object.assign(new Error('Exam not found'), { statusCode: 404 });
  if (!['LIVE', 'REGISTRATION_OPEN'].includes(exam.status)) {
    throw Object.assign(new Error('Exam is not currently available'), { statusCode: 400 });
  }
  if (new Date() > new Date(exam.end_time)) {
    throw Object.assign(new Error('Exam has ended'), { statusCode: 400 });
  }
  if (exam.school_id && exam.school_id !== student.school_id) {
    throw Object.assign(new Error('This exam is not available for your school'), { statusCode: 403 });
  }

  const { rows: [registration] } = await query<RegistrationRow>(
    'SELECT id, registered_at FROM exam_registrations WHERE exam_id = $1 AND student_id = $2',
    [examId, studentId],
  );
  if (!registration && exam.type !== 'PRACTICE') {
    throw Object.assign(new Error('You must register before starting this exam'), { statusCode: 400 });
  }

  const { rows: [existing] } = await query<AttemptRow>(
    'SELECT id, exam_id, status, started_at FROM exam_attempts WHERE exam_id = $1 AND student_id = $2',
    [examId, studentId],
  );
  if (existing) return existing;

  const { rows: [attempt] } = await query<AttemptRow>(
    `INSERT INTO exam_attempts (exam_id, student_id, school_id, status, started_at)
     VALUES ($1, $2, $3, 'IN_PROGRESS', NOW())
     RETURNING id, exam_id, status, started_at`,
    [examId, studentId, student.school_id],
  );
  if (!attempt) throw new Error('Exam attempt returned no row');
  return attempt;
}

export async function submitAttempt(examId: UUID, studentId: UUID, responses: ExamResponseInput[] = []) {
  return transaction(async client => {
    const { rows: [attempt] } = await client.query<AttemptRow>(
      `SELECT ea.id, ea.status, ea.started_at, e.marks_per_question, e.negative_marks,
              e.total_questions, e.type
       FROM exam_attempts ea
       JOIN exams e ON e.id = ea.exam_id
       WHERE ea.exam_id = $1 AND ea.student_id = $2
       FOR UPDATE`,
      [examId, studentId],
    );
    if (!attempt) throw Object.assign(new Error('Exam attempt not found'), { statusCode: 404 });
    if (attempt.status === 'SUBMITTED') {
      const { rows: [submitted] } = await client.query<AttemptRow>(
        'SELECT * FROM exam_attempts WHERE id = $1', [attempt.id],
      );
      return submitted;
    }
    if (attempt.status !== 'IN_PROGRESS') {
      throw Object.assign(new Error('Exam attempt cannot be submitted'), { statusCode: 400 });
    }

    const { rows: questions } = await client.query<QuestionRow>(
      'SELECT id, correct_option FROM exam_questions WHERE exam_id = $1', [examId],
    );
    const validQuestionIds = new Set(questions.map(question => question.id));
    const submittedByQuestion = new Map<UUID, string | null>();
    responses.forEach(response => {
      if (validQuestionIds.has(response.questionId)) {
        submittedByQuestion.set(response.questionId, response.selectedOption || null);
      }
    });

    for (const question of questions) {
      const selectedOption = submittedByQuestion.get(question.id) ?? null;
      const isCorrect = selectedOption !== null && selectedOption === question.correct_option;
      await client.query(
        `INSERT INTO exam_responses (attempt_id, question_id, selected_option, is_correct)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (attempt_id, question_id)
         DO UPDATE SET selected_option=EXCLUDED.selected_option, is_correct=EXCLUDED.is_correct, answered_at=NOW()`,
        [attempt.id, question.id, selectedOption, selectedOption === null ? null : isCorrect],
      );
    }

    const correctCount = questions.filter(q => submittedByQuestion.get(q.id) === q.correct_option).length;
    const answeredCount = questions.filter(q => submittedByQuestion.has(q.id) && submittedByQuestion.get(q.id) !== null).length;
    const wrongCount = answeredCount - correctCount;
    const skippedCount = Math.max(Number(attempt.total_questions || questions.length) - answeredCount, 0);
    const marksPerQuestion = Number(attempt.marks_per_question || 0);
    const negativeMarks = Number(attempt.negative_marks || 0);
    const totalMarks = Math.max(correctCount * marksPerQuestion - wrongCount * negativeMarks, 0);

    const { rows: [submitted] } = await client.query<AttemptRow>(
      `UPDATE exam_attempts
       SET status='SUBMITTED', submitted_at=NOW(),
           total_marks=$2, correct_count=$3, wrong_count=$4, skipped_count=$5,
           time_taken_secs=GREATEST(0, EXTRACT(EPOCH FROM (NOW() - started_at))::INT)
       WHERE id=$1
       RETURNING *`,
      [attempt.id, totalMarks, correctCount, wrongCount, skippedCount],
    );
    if (!submitted) throw new Error('Exam submission returned no row');

    if (attempt.type === 'OLYMPIAD') {
      await studentService.awardXP(studentId, 0, 'EXAM_ATTEMPT', examId, examId);
    }
    return submitted;
  });
}

export async function scoreExam(examId: UUID) {
  const { rows: attempts } = await query<AttemptRow>(
    `SELECT ea.id, ea.student_id, ea.school_id, ea.total_marks
     FROM exam_attempts ea WHERE ea.exam_id=$1 AND ea.status='SUBMITTED'`, [examId],
  );
  if (!attempts.length) return { scored: 0 };

  const sorted = [...attempts].sort((a, b) => Number(b.total_marks || 0) - Number(a.total_marks || 0));
  let previousMarks: number | null = null;
  let previousRank = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    const attempt = sorted[index];
    if (!attempt) continue;
    const marks = Number(attempt.total_marks || 0);
    const rankOverall = previousMarks === marks ? previousRank : index + 1;
    previousMarks = marks;
    previousRank = rankOverall;
    const percentile = sorted.length <= 1 ? 100 : ((sorted.length - rankOverall) / (sorted.length - 1)) * 100;
    await query(
      `UPDATE exam_attempts SET rank_overall=$2, percentile=$3 WHERE id=$1`,
      [attempt.id, rankOverall, Number(percentile.toFixed(2))],
    );
  }

  const { rows: schoolRows } = await query<RankedRow>(
    `SELECT id AS attempt_id, student_id, school_id, total_marks,
            RANK() OVER (PARTITION BY school_id ORDER BY total_marks DESC) AS rank_school,
            rank_overall, percentile
     FROM exam_attempts
     WHERE exam_id=$1 AND status='SUBMITTED'`, [examId],
  );
  for (const row of schoolRows) {
    await query('UPDATE exam_attempts SET rank_school=$2 WHERE id=$1', [row.attempt_id, Number(row.rank_school)]);
  }

  await query("UPDATE exams SET status='COMPLETED', results_at=COALESCE(results_at, NOW()) WHERE id=$1", [examId]);
  return { scored: attempts.length };
}

export async function getResult(examId: UUID, studentId: UUID) {
  const { rows: [result] } = await query(
    `SELECT ea.*, e.title, e.title_hi, e.type, e.total_questions,
            e.marks_per_question, e.negative_marks,
            (e.total_questions * e.marks_per_question) AS max_marks
     FROM exam_attempts ea
     JOIN exams e ON e.id=ea.exam_id
     WHERE ea.exam_id=$1 AND ea.student_id=$2`,
    [examId, studentId],
  );
  if (!result) throw Object.assign(new Error('Result not found'), { statusCode: 404 });
  return result;
}

export async function createExam(input: CreateExamInput, createdBy: UUID) {
  const { rows: [exam] } = await query<ExamRow>(
    `INSERT INTO exams (
       title, title_hi, description, type, school_id, class_names, subject_codes, status,
       total_questions, duration_mins, marks_per_question, negative_marks,
       registration_start, registration_end, start_time, end_time, results_at,
       prize_pool, instructions, instructions_hi, banner_url, max_registrations, created_by
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
     ) RETURNING *`,
    [
      input.title, input.titleHi || null, input.description || null, input.type || 'OLYMPIAD', input.schoolId || null,
      input.classNames || [], input.subjectCodes || [], input.status || 'DRAFT', input.totalQuestions || 0,
      input.durationMins || 60, input.marksPerQuestion || 4, input.negativeMarks || 0,
      input.registrationStart || null, input.registrationEnd || null, input.startTime, input.endTime,
      input.resultsAt || null, input.prizePool || 0, input.instructions || null, input.instructionsHi || null,
      input.bannerUrl || null, input.maxRegistrations || null, createdBy,
    ],
  );
  if (!exam) throw new Error('Exam creation returned no row');
  return exam;
}

export async function addQuestions(examId: UUID, questions: ExamQuestionInput[]) {
  let count = 0;
  await transaction(async client => {
    for (const question of questions) {
      await client.query(
        `INSERT INTO exam_questions (
           exam_id, question_text, question_hi, option_a, option_b, option_c, option_d,
           option_a_hi, option_b_hi, option_c_hi, option_d_hi, correct_option, explanation,
           subject_code, difficulty, sequence_no
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          examId, question.questionText, question.questionHi || null,
          question.optionA, question.optionB, question.optionC, question.optionD,
          question.optionAHi || null, question.optionBHi || null, question.optionCHi || null, question.optionDHi || null,
          question.correctOption, question.explanation || null, question.subjectCode || null,
          question.difficulty || 'MEDIUM', count + 1,
        ],
      );
      count += 1;
    }
    await client.query('UPDATE exams SET total_questions=$2 WHERE id=$1', [examId, count]);
  });
  return { added: count };
}

export async function updateStatus(examId: UUID, status: string) {
  const { rows: [exam] } = await query<ExamRow>('UPDATE exams SET status=$2 WHERE id=$1 RETURNING *', [examId, status]);
  if (!exam) throw Object.assign(new Error('Exam not found'), { statusCode: 404 });
  return exam;
}

export async function deleteExam(examId: UUID) {
  const { rows: [deleted] } = await query<IdRow>("DELETE FROM exams WHERE id=$1 AND status='DRAFT' RETURNING id", [examId]);
  if (!deleted) throw Object.assign(new Error('Only draft exams can be deleted'), { statusCode: 400 });
  return { deleted: true };
}
