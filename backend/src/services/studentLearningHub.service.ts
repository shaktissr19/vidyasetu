import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';

interface StudentContextRow extends QueryResultRow {
  student_id: UUID;
  grade_level: string;
  grade_code: string | null;
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

function canonicalGradeCode(ctx: StudentContextRow): string {
  if (ctx.grade_code) return ctx.grade_code;
  const raw = String(ctx.class_name || ctx.grade_level || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (['PN', 'PRENURSERY', 'PRE_NURSERY'].includes(raw)) return 'PRE_NURSERY';
  if (raw === 'NURSERY') return 'NURSERY';
  if (['LKG', 'LOWER_KG', 'LOWER_KINDERGARTEN'].includes(raw)) return 'LKG';
  if (['UKG', 'UPPER_KG', 'UPPER_KINDERGARTEN'].includes(raw)) return 'UKG';
  const numeric = raw.match(/^(?:CLASS_)?(\d{1,2})$/);
  if (numeric) {
    const value = Number.parseInt(numeric[1], 10);
    if (value >= 1 && value <= 12) return `CLASS_${value}`;
  }
  throw appError('Student grade is not supported by the Learning catalogue', 409);
}

function gradeNumber(gradeCode: string): number | null {
  const match = gradeCode.match(/^CLASS_(\d{1,2})$/);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return value >= 1 && value <= 12 ? value : null;
}

function gradeLabel(gradeCode: string): string {
  if (gradeCode === 'PRE_NURSERY') return 'Pre-Nursery';
  if (gradeCode === 'NURSERY') return 'Nursery';
  if (gradeCode === 'LKG') return 'LKG';
  if (gradeCode === 'UKG') return 'UKG';
  const numeric = gradeNumber(gradeCode);
  return numeric ? `Class ${numeric}` : gradeCode.replaceAll('_', ' ');
}

async function getStudentContext(userId: UUID): Promise<StudentContextRow> {
  const { rows: [student] } = await query<StudentContextRow>(
    `SELECT s.id AS student_id, s.grade_level, s.grade_code, sc.class_name,
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

function resourceScopeSql(boardParam: number, gradeCodeParam: number, classParam: number): string {
  return `
    (
      EXISTS (
        SELECT 1
        FROM learning_resource_grades lrg
        JOIN education_grade_levels egl ON egl.id=lrg.grade_id
        WHERE lrg.resource_id=lr.id AND egl.code=$${gradeCodeParam}
      )
      OR (
        NOT EXISTS (SELECT 1 FROM learning_resource_grades lrg0 WHERE lrg0.resource_id=lr.id)
        AND (
          ($${classParam}::int IS NULL AND lr.class_min IS NULL AND lr.class_max IS NULL)
          OR (
            $${classParam}::int IS NOT NULL
            AND (lr.class_min IS NULL OR lr.class_min <= $${classParam})
            AND (lr.class_max IS NULL OR lr.class_max >= $${classParam})
          )
        )
      )
    )
    AND EXISTS (
      SELECT 1 FROM learning_resource_boards lrb
      JOIN education_boards eb ON eb.id=lrb.board_id
      WHERE lrb.resource_id=lr.id AND (eb.code='COMMON' OR eb.code=$${boardParam})
    )`;
}

function assessmentScopeSql(boardParam: number, classParam: number): string {
  return `
    $${classParam}::int IS NOT NULL
    AND (la.class_min IS NULL OR la.class_min <= $${classParam})
    AND (la.class_max IS NULL OR la.class_max >= $${classParam})
    AND EXISTS (
      SELECT 1 FROM learning_assessment_boards lab
      JOIN education_boards eb ON eb.id=lab.board_id
      WHERE lab.assessment_id=la.id AND (eb.code='COMMON' OR eb.code=$${boardParam})
    )`;
}

export async function getLearningHome(userId: UUID) {
  const student = await getStudentContext(userId);
  const gradeCode = canonicalGradeCode(student);
  const grade = gradeNumber(gradeCode);
  const board = student.board_code || 'COMMON';

  const [resources, assessments, bookmarks, recentAttempts, progress] = await Promise.all([
    query(
      `SELECT lr.id, lr.public_slug, lr.title, lr.title_hi, lr.summary, lr.summary_hi,
              lr.resource_type, lr.category, lr.class_min, lr.class_max, lr.is_featured_public,
              lcs.name AS source_name, sub.name AS subject_name, sub.name_hi AS subject_name_hi,
              COALESCE(slrp.progress_pct,0)::float AS progress_pct,
              COALESCE(slrp.is_completed,FALSE) AS is_completed,
              EXISTS (SELECT 1 FROM student_learning_bookmarks b WHERE b.student_id=$1 AND b.resource_id=lr.id) AS bookmarked
       FROM learning_resources lr
       JOIN learning_content_sources lcs ON lcs.id=lr.source_id
       LEFT JOIN subjects sub ON sub.id=lr.subject_id
       LEFT JOIN student_learning_resource_progress slrp ON slrp.resource_id=lr.id AND slrp.student_id=$1
       WHERE lr.review_status='PUBLISHED'
         AND lr.visibility IN ('PUBLIC','REGISTERED','CLASS_ONLY')
         AND ${resourceScopeSql(2, 3, 4)}
       ORDER BY slrp.last_accessed DESC NULLS LAST, lr.is_featured_public DESC, lr.sort_order, lr.published_at DESC NULLS LAST
       LIMIT 12`,
      [student.student_id, board, gradeCode, grade],
    ),
    query(
      `SELECT la.id, la.public_slug, la.title, la.title_hi, la.summary, la.summary_hi,
              la.assessment_type, la.time_limit_mins, la.passing_pct, la.max_attempts,
              sub.name AS subject_name, sub.name_hi AS subject_name_hi,
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
      `SELECT lr.id, lr.public_slug, lr.title, lr.title_hi, lr.category, b.created_at
       FROM student_learning_bookmarks b
       JOIN learning_resources lr ON lr.id=b.resource_id
       WHERE b.student_id=$1
       ORDER BY b.created_at DESC LIMIT 8`,
      [student.student_id],
    ),
    query(
      `SELECT sla.id, sla.assessment_id, la.title, la.title_hi, sla.status, sla.percentage::float,
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
      className: grade ?? student.grade_level,
      gradeCode,
      gradeLabel: gradeLabel(gradeCode),
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
