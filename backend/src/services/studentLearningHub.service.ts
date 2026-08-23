import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';

interface StudentContextRow extends QueryResultRow {
  student_id: UUID;
  grade_level: string;
  class_name: string | null;
  school_id: UUID | null;
  school_name: string | null;
  board_code: string | null;
  board_name: string | null;
}

interface AssessmentQuestionRow extends QueryResultRow {
  id: UUID;
  public_code: string;
  prompt: string;
  prompt_hi: string | null;
  question_type: string;
  difficulty: string;
  explanation: string | null;
  correct_answer: unknown;
  marks: string | number;
  marks_override: string | number | null;
  options: Array<{ key: string; text: string; textHi?: string | null }>;
}

function appError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function gradeNumber(ctx: StudentContextRow): number {
  const source = ctx.grade_level || ctx.class_name || '8';
  const match = String(source).match(/\d{1,2}/);
  const parsed = Number.parseInt(match?.[0] || '8', 10);
  return Math.min(Math.max(parsed || 8, 1), 12);
}

async function getStudentContext(userId: UUID): Promise<StudentContextRow> {
  const { rows: [student] } = await query<StudentContextRow>(
    `SELECT s.id AS student_id, s.grade_level, sc.class_name,
            s.school_id, sch.name AS school_name,
            eb.code AS board_code, eb.name AS board_name
     FROM students s
     LEFT JOIN school_classes sc ON sc.id=s.class_id
     LEFT JOIN schools sch ON sch.id=s.school_id
     LEFT JOIN education_boards eb ON eb.id=sch.board_id
     WHERE s.user_id=$1 AND s.status='ACTIVE'`,
    [userId],
  );
  if (!student) throw appError('Student profile not found', 404);
  return student;
}

function resourceScopeSql(boardParam: number, classParam: number): string {
  return `
    (lr.class_min IS NULL OR lr.class_min <= $${classParam})
    AND (lr.class_max IS NULL OR lr.class_max >= $${classParam})
    AND EXISTS (
      SELECT 1 FROM learning_resource_boards lrb
      JOIN education_boards eb ON eb.id=lrb.board_id
      WHERE lrb.resource_id=lr.id AND (eb.code='COMMON' OR eb.code=$${boardParam})
    )`;
}

function assessmentScopeSql(boardParam: number, classParam: number): string {
  return `
    (la.class_min IS NULL OR la.class_min <= $${classParam})
    AND (la.class_max IS NULL OR la.class_max >= $${classParam})
    AND EXISTS (
      SELECT 1 FROM learning_assessment_boards lab
      JOIN education_boards eb ON eb.id=lab.board_id
      WHERE lab.assessment_id=la.id AND (eb.code='COMMON' OR eb.code=$${boardParam})
    )`;
}

export async function getLearningHome(userId: UUID) {
  const student = await getStudentContext(userId);
  const grade = gradeNumber(student);
  const board = student.board_code || 'COMMON';

  const [resources, assessments, bookmarks, recentAttempts, progress] = await Promise.all([
    query(
      `SELECT lr.id, lr.public_slug, lr.title, lr.summary, lr.resource_type, lr.category,
              lr.class_min, lr.class_max, lr.is_featured_public,
              lcs.name AS source_name, sub.name AS subject_name,
              COALESCE(slrp.progress_pct,0)::float AS progress_pct,
              COALESCE(slrp.is_completed,FALSE) AS is_completed,
              EXISTS (SELECT 1 FROM student_learning_bookmarks b WHERE b.student_id=$1 AND b.resource_id=lr.id) AS bookmarked
       FROM learning_resources lr
       JOIN learning_content_sources lcs ON lcs.id=lr.source_id
       LEFT JOIN subjects sub ON sub.id=lr.subject_id
       LEFT JOIN student_learning_resource_progress slrp ON slrp.resource_id=lr.id AND slrp.student_id=$1
       WHERE lr.review_status='PUBLISHED'
         AND lr.visibility IN ('PUBLIC','REGISTERED','CLASS_ONLY')
         AND ${resourceScopeSql(2, 3)}
       ORDER BY slrp.last_accessed DESC NULLS LAST, lr.is_featured_public DESC, lr.sort_order, lr.published_at DESC NULLS LAST
       LIMIT 12`,
      [student.student_id, board, grade],
    ),
    query(
      `SELECT la.id, la.public_slug, la.title, la.summary, la.assessment_type,
              la.time_limit_mins, la.passing_pct, la.max_attempts, sub.name AS subject_name,
              COUNT(laq.question_id)::int AS question_count,
              COALESCE(SUM(COALESCE(laq.marks_override,lq.marks)),0)::float AS total_marks,
              (SELECT sla.percentage::float FROM student_learning_attempts sla
               WHERE sla.student_id=$1 AND sla.assessment_id=la.id AND sla.status IN ('SUBMITTED','GRADED')
               ORDER BY sla.submitted_at DESC NULLS LAST LIMIT 1) AS last_percentage
       FROM learning_assessments la
       LEFT JOIN subjects sub ON sub.id=la.subject_id
       LEFT JOIN learning_assessment_questions laq ON laq.assessment_id=la.id
       LEFT JOIN learning_questions lq ON lq.id=laq.question_id
       WHERE la.review_status='PUBLISHED'
         AND la.visibility IN ('PUBLIC','REGISTERED','CLASS_ONLY')
         AND ${assessmentScopeSql(2, 3)}
       GROUP BY la.id, sub.id
       ORDER BY la.is_featured_public DESC, la.published_at DESC NULLS LAST
       LIMIT 8`,
      [student.student_id, board, grade],
    ),
    query(
      `SELECT lr.id, lr.public_slug, lr.title, lr.category, b.created_at
       FROM student_learning_bookmarks b
       JOIN learning_resources lr ON lr.id=b.resource_id
       WHERE b.student_id=$1
       ORDER BY b.created_at DESC LIMIT 8`,
      [student.student_id],
    ),
    query(
      `SELECT sla.id, sla.assessment_id, la.title, sla.status, sla.percentage::float,
              sla.correct_count, sla.wrong_count, sla.skipped_count, sla.submitted_at, sla.started_at
       FROM student_learning_attempts sla
       JOIN learning_assessments la ON la.id=sla.assessment_id
       WHERE sla.student_id=$1
       ORDER BY sla.started_at DESC LIMIT 6`,
      [student.student_id],
    ),
    query(
      `SELECT COUNT(*)::int AS started,
              COUNT(*) FILTER (WHERE is_completed)::int AS completed,
              COALESCE(AVG(progress_pct),0)::float AS average_progress
       FROM student_learning_resource_progress
       WHERE student_id=$1`,
      [student.student_id],
    ),
  ]);

  return {
    learner: {
      studentId: student.student_id,
      className: grade,
      schoolName: student.school_name,
      boardCode: board,
      boardName: student.board_name || 'Cross-board / Common Learning',
    },
    progress: progress.rows[0] || { started: 0, completed: 0, average_progress: 0 },
    recommendedResources: resources.rows,
    assessments: assessments.rows,
    bookmarks: bookmarks.rows,
    recentAttempts: recentAttempts.rows,
  };
}

export async function updateResourceProgress(userId: UUID, resourceId: UUID, progressPct: number) {
  const student = await getStudentContext(userId);
  const progress = Math.min(Math.max(progressPct, 0), 100);
  const { rows: [resource] } = await query(
    `SELECT id FROM learning_resources WHERE id=$1 AND review_status='PUBLISHED'`,
    [resourceId],
  );
  if (!resource) throw appError('Learning resource not found', 404);

  const { rows: [row] } = await query(
    `INSERT INTO student_learning_resource_progress
       (student_id, resource_id, progress_pct, is_completed, last_accessed, completed_at)
     VALUES (
       $1,
       $2,
       $3::numeric,
       ($3::numeric >= 100::numeric),
       NOW(),
       CASE WHEN $3::numeric >= 100::numeric THEN NOW() ELSE NULL END
     )
     ON CONFLICT (student_id,resource_id) DO UPDATE SET
       progress_pct=GREATEST(student_learning_resource_progress.progress_pct,EXCLUDED.progress_pct),
       is_completed=student_learning_resource_progress.is_completed OR EXCLUDED.is_completed,
       last_accessed=NOW(),
       completed_at=CASE
         WHEN student_learning_resource_progress.completed_at IS NOT NULL THEN student_learning_resource_progress.completed_at
         WHEN EXCLUDED.is_completed THEN NOW() ELSE NULL END,
       updated_at=NOW()
     RETURNING resource_id, progress_pct::float, is_completed, last_accessed, completed_at`,
    [student.student_id, resourceId, progress],
  );
  return row;
}

export async function addBookmark(userId: UUID, resourceId: UUID) {
  const student = await getStudentContext(userId);
  const { rows: [resource] } = await query(`SELECT id FROM learning_resources WHERE id=$1 AND review_status='PUBLISHED'`, [resourceId]);
  if (!resource) throw appError('Learning resource not found', 404);
  await query(
    `INSERT INTO student_learning_bookmarks(student_id,resource_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,
    [student.student_id, resourceId],
  );
  return { bookmarked: true };
}

export async function removeBookmark(userId: UUID, resourceId: UUID) {
  const student = await getStudentContext(userId);
  await query(`DELETE FROM student_learning_bookmarks WHERE student_id=$1 AND resource_id=$2`, [student.student_id, resourceId]);
  return { bookmarked: false };
}

export async function listAssessments(userId: UUID) {
  const home = await getLearningHome(userId);
  return home.assessments;
}

async function assessmentForStudent(userId: UUID, assessmentId: UUID) {
  const student = await getStudentContext(userId);
  const grade = gradeNumber(student);
  const board = student.board_code || 'COMMON';
  const { rows: [assessment] } = await query(
    `SELECT la.id, la.public_slug, la.title, la.summary, la.assessment_type,
            la.time_limit_mins, la.passing_pct, la.max_attempts, la.shuffle_questions
     FROM learning_assessments la
     WHERE la.id=$1 AND la.review_status='PUBLISHED'
       AND la.visibility IN ('PUBLIC','REGISTERED','CLASS_ONLY')
       AND ${assessmentScopeSql(2, 3)}`,
    [assessmentId, board, grade],
  );
  if (!assessment) throw appError('Assessment not found for this learner', 404);
  return { student, assessment };
}

export async function getAssessment(userId: UUID, assessmentId: UUID) {
  const { assessment } = await assessmentForStudent(userId, assessmentId);
  const { rows } = await query<AssessmentQuestionRow>(
    `SELECT lq.id, lq.public_code, lq.prompt, lq.prompt_hi, lq.question_type,
            lq.difficulty, NULL::text AS explanation, NULL::jsonb AS correct_answer,
            lq.marks, laq.marks_override,
            COALESCE(jsonb_agg(jsonb_build_object('key',lqo.option_key,'text',lqo.option_text,'textHi',lqo.option_text_hi)
              ORDER BY lqo.sort_order) FILTER (WHERE lqo.id IS NOT NULL),'[]'::jsonb) AS options
     FROM learning_assessment_questions laq
     JOIN learning_questions lq ON lq.id=laq.question_id
     LEFT JOIN learning_question_options lqo ON lqo.question_id=lq.id
     WHERE laq.assessment_id=$1 AND lq.review_status='PUBLISHED'
     GROUP BY lq.id, laq.marks_override, laq.sort_order
     ORDER BY laq.sort_order, lq.public_code`,
    [assessmentId],
  );
  return { ...assessment, questions: rows };
}

export async function startAssessment(userId: UUID, assessmentId: UUID) {
  const { student, assessment } = await assessmentForStudent(userId, assessmentId);
  if (assessment.max_attempts) {
    const { rows: [count] } = await query<{ count: string } & QueryResultRow>(
      `SELECT COUNT(*)::text AS count FROM student_learning_attempts
       WHERE student_id=$1 AND assessment_id=$2 AND status IN ('SUBMITTED','GRADED')`,
      [student.student_id, assessmentId],
    );
    if (Number(count?.count || 0) >= Number(assessment.max_attempts)) throw appError('Maximum attempts reached', 409);
  }
  const { rows: [attempt] } = await query(
    `INSERT INTO student_learning_attempts(student_id,assessment_id) VALUES($1,$2)
     RETURNING id, assessment_id, status, started_at`,
    [student.student_id, assessmentId],
  );
  return attempt;
}

function sameAnswer(expected: unknown, actual: unknown): boolean {
  const normalize = (value: unknown) => JSON.stringify(value, Object.keys((value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {})).sort());
  if (Array.isArray(expected) && Array.isArray(actual)) {
    return JSON.stringify([...expected].sort()) === JSON.stringify([...actual].sort());
  }
  return normalize(expected) === normalize(actual);
}

export async function submitAssessment(
  userId: UUID,
  attemptId: UUID,
  answers: Array<{ questionId: UUID; answer: unknown }>,
  timeSpentSecs?: number | null,
) {
  const student = await getStudentContext(userId);

  return transaction(async (client) => {
    const { rows: [attempt] } = await client.query<{ assessment_id: UUID; status: string }>(
      `SELECT assessment_id,status FROM student_learning_attempts
       WHERE id=$1 AND student_id=$2 FOR UPDATE`,
      [attemptId, student.student_id],
    );
    if (!attempt) throw appError('Learning attempt not found', 404);
    if (attempt.status !== 'IN_PROGRESS') throw appError('Learning attempt has already been submitted', 409);

    const { rows: questions } = await client.query<AssessmentQuestionRow>(
      `SELECT lq.id, lq.public_code, lq.prompt, lq.prompt_hi, lq.question_type,
              lq.difficulty, lq.explanation, lq.correct_answer, lq.marks, laq.marks_override,
              '[]'::jsonb AS options
       FROM learning_assessment_questions laq
       JOIN learning_questions lq ON lq.id=laq.question_id
       WHERE laq.assessment_id=$1 AND lq.review_status='PUBLISHED'
       ORDER BY laq.sort_order`,
      [attempt.assessment_id],
    );
    if (!questions.length) throw appError('Assessment has no published questions', 409);

    const submitted = new Map(answers.map((item) => [item.questionId, item.answer]));
    let score = 0;
    let maxScore = 0;
    let correct = 0;
    let wrong = 0;
    let skipped = 0;
    const feedback: Array<Record<string, unknown>> = [];

    for (const question of questions) {
      const marks = Number(question.marks_override ?? question.marks ?? 1);
      maxScore += marks;
      const answer = submitted.get(question.id);
      const hasAnswer = answer !== undefined && answer !== null && JSON.stringify(answer) !== '{}' && JSON.stringify(answer) !== '[]';
      const isCorrect = hasAnswer && sameAnswer(question.correct_answer, answer);
      const awarded = isCorrect ? marks : 0;
      score += awarded;
      if (!hasAnswer) skipped += 1;
      else if (isCorrect) correct += 1;
      else wrong += 1;

      await client.query(
        `INSERT INTO student_learning_answers(attempt_id,question_id,answer,is_correct,marks_awarded)
         VALUES($1,$2,$3::jsonb,$4,$5)
         ON CONFLICT (attempt_id,question_id) DO UPDATE SET
           answer=EXCLUDED.answer,is_correct=EXCLUDED.is_correct,marks_awarded=EXCLUDED.marks_awarded,answered_at=NOW()`,
        [attemptId, question.id, answer === undefined ? null : JSON.stringify(answer), hasAnswer ? isCorrect : null, awarded],
      );
      feedback.push({
        questionId: question.id,
        correct: hasAnswer ? isCorrect : null,
        correctAnswer: question.correct_answer,
        explanation: question.explanation,
        marksAwarded: awarded,
        maxMarks: marks,
      });
    }

    const percentage = maxScore > 0 ? Number(((score / maxScore) * 100).toFixed(2)) : 0;
    const { rows: [result] } = await client.query(
      `UPDATE student_learning_attempts SET
         status='GRADED',submitted_at=NOW(),score=$2,max_score=$3,percentage=$4,
         correct_count=$5,wrong_count=$6,skipped_count=$7,time_spent_secs=$8
       WHERE id=$1
       RETURNING id,assessment_id,status,score::float,max_score::float,percentage::float,
                 correct_count,wrong_count,skipped_count,started_at,submitted_at,time_spent_secs`,
      [attemptId, score, maxScore, percentage, correct, wrong, skipped, timeSpentSecs || null],
    );

    return { ...result, feedback };
  });
}
