import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';

interface StudentIdRow extends QueryResultRow {
  id: UUID;
}

interface ContentItemRow extends QueryResultRow {
  id: UUID;
  type: string;
  status: string;
}

interface ProgressRow extends QueryResultRow {
  id: UUID;
  is_completed: boolean;
  quiz_score?: number | string | null;
  attempts?: number | string | null;
}

interface QuizQuestionRow extends QueryResultRow {
  id: UUID;
  correct_option: string;
  explanation: string | null;
  explanation_hi: string | null;
}

export interface QuizAnswerInput {
  questionId: UUID;
  selectedOption?: string | null;
}

async function getStudent(userId: UUID): Promise<StudentIdRow> {
  const { rows: [student] } = await query<StudentIdRow>(
    `SELECT id FROM students WHERE user_id = $1 AND status = 'ACTIVE'`,
    [userId],
  );
  if (!student) throw Object.assign(new Error('Student not found'), { statusCode: 404 });
  return student;
}

export async function markContentComplete(userId: UUID, contentItemId: UUID) {
  const student = await getStudent(userId);
  const { rows: [item] } = await query<ContentItemRow>(
    `SELECT id, type, status FROM content_items WHERE id = $1`,
    [contentItemId],
  );
  if (!item || item.status !== 'PUBLISHED') {
    throw Object.assign(new Error('Content item not found'), { statusCode: 404 });
  }
  if (item.type === 'QUIZ') {
    throw Object.assign(new Error('Quiz completion must be recorded through quiz submission'), { statusCode: 400 });
  }

  const { rows: [existing] } = await query<ProgressRow>(
    `SELECT id, is_completed FROM student_content_progress
     WHERE student_id = $1 AND content_item_id = $2`,
    [student.id, contentItemId],
  );
  if (existing?.is_completed) {
    return { alreadyCompleted: true, completed: true, progressPct: 100 };
  }

  await query(
    `INSERT INTO student_content_progress
       (student_id, content_item_id, is_completed, progress_pct, last_accessed, completed_at)
     VALUES ($1, $2, TRUE, 100, NOW(), NOW())
     ON CONFLICT (student_id, content_item_id) DO UPDATE
     SET is_completed = TRUE,
         progress_pct = 100,
         last_accessed = NOW(),
         completed_at = COALESCE(student_content_progress.completed_at, NOW())`,
    [student.id, contentItemId],
  );

  return { alreadyCompleted: false, completed: true, progressPct: 100 };
}

export async function submitQuiz(
  contentItemId: UUID,
  userId: UUID,
  answers: QuizAnswerInput[] = [],
) {
  const student = await getStudent(userId);
  const { rows: [contentItem] } = await query<ContentItemRow>(
    `SELECT id, type, status FROM content_items WHERE id = $1`,
    [contentItemId],
  );
  if (!contentItem || contentItem.status !== 'PUBLISHED' || contentItem.type !== 'QUIZ') {
    throw Object.assign(new Error('Quiz not found'), { statusCode: 404 });
  }

  const { rows: questions } = await query<QuizQuestionRow>(
    `SELECT id, correct_option, explanation, explanation_hi
     FROM quiz_questions
     WHERE content_item_id = $1
     ORDER BY sort_order, created_at`,
    [contentItemId],
  );
  if (!questions.length) {
    throw Object.assign(new Error('This quiz does not have any questions yet'), { statusCode: 400 });
  }

  const supplied = new Map<UUID, string>(
    answers.map((answer) => [answer.questionId, String(answer.selectedOption || '').toUpperCase()]),
  );
  let correctCount = 0;
  const results = questions.map((question) => {
    const selectedOption = supplied.get(question.id) || null;
    const isCorrect = selectedOption === question.correct_option;
    if (isCorrect) correctCount += 1;
    return {
      questionId: question.id,
      selectedOption,
      isCorrect,
      correctOption: question.correct_option,
      explanation: question.explanation,
      explanationHi: question.explanation_hi,
    };
  });

  const score = Math.round((correctCount / questions.length) * 100);
  const passed = score >= 60;
  const isPerfect = score === 100;

  const { rows: [existingProgress] } = await query<ProgressRow>(
    `SELECT id, is_completed, quiz_score, attempts
     FROM student_content_progress
     WHERE student_id = $1 AND content_item_id = $2`,
    [student.id, contentItemId],
  );

  await query(
    `INSERT INTO student_content_progress
       (student_id, content_item_id, is_completed, progress_pct, quiz_score,
        attempts, last_accessed, completed_at)
     VALUES ($1, $2, $3, $4, $5, 1, NOW(), CASE WHEN $3 THEN NOW() ELSE NULL END)
     ON CONFLICT (student_id, content_item_id) DO UPDATE
     SET is_completed = student_content_progress.is_completed OR EXCLUDED.is_completed,
         progress_pct = GREATEST(student_content_progress.progress_pct, EXCLUDED.progress_pct),
         quiz_score = GREATEST(COALESCE(student_content_progress.quiz_score, 0), EXCLUDED.quiz_score),
         attempts = student_content_progress.attempts + 1,
         last_accessed = NOW(),
         completed_at = CASE
           WHEN student_content_progress.completed_at IS NOT NULL THEN student_content_progress.completed_at
           WHEN EXCLUDED.is_completed THEN NOW()
           ELSE NULL
         END`,
    [student.id, contentItemId, passed, passed ? 100 : score, score],
  );

  return {
    score,
    passed,
    isPerfect,
    correctCount,
    totalQuestions: questions.length,
    attempts: Number(existingProgress?.attempts || 0) + 1,
    progressPct: passed ? 100 : score,
    results,
  };
}
