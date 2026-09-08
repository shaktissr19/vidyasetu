import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';

interface StudentContextRow extends QueryResultRow {
  student_id: UUID;
  grade_level: string;
  grade_code: string | null;
  class_name: string | null;
  board_code: string | null;
}

function appError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function canonicalGradeCode(ctx: StudentContextRow): string {
  if (ctx.grade_code) return ctx.grade_code;
  const raw = String(ctx.class_name || ctx.grade_level || '').trim().toUpperCase().replace(/[\s-]+/g,'_');
  if (['PN','PRENURSERY','PRE_NURSERY'].includes(raw)) return 'PRE_NURSERY';
  if (raw === 'NURSERY') return 'NURSERY';
  if (['LKG','LOWER_KG','LOWER_KINDERGARTEN'].includes(raw)) return 'LKG';
  if (['UKG','UPPER_KG','UPPER_KINDERGARTEN'].includes(raw)) return 'UKG';
  const match = raw.match(/^(?:CLASS_)?(\d{1,2})$/);
  if (match) {
    const value = Number(match[1]);
    if (value >= 1 && value <= 12) return `CLASS_${value}`;
  }
  throw appError('Student grade is not supported by the Learning catalogue',409);
}

function gradeNumber(gradeCode: string): number | null {
  const match = gradeCode.match(/^CLASS_(\d{1,2})$/);
  if (!match) return null;
  const value = Number(match[1]);
  return value >= 1 && value <= 12 ? value : null;
}

async function studentContext(userId: UUID): Promise<StudentContextRow> {
  const { rows: [student] } = await query<StudentContextRow>(
    `SELECT s.id AS student_id,s.grade_level,s.grade_code,sc.class_name,eb.code AS board_code
     FROM students s
     LEFT JOIN school_classes sc ON sc.id=s.class_id
     LEFT JOIN schools sch ON sch.id=s.school_id
     LEFT JOIN education_boards eb ON eb.id=sch.board_id
     WHERE s.user_id=$1::uuid AND s.status='ACTIVE'`,
    [userId],
  );
  if (!student) throw appError('Student profile not found',404);
  return student;
}

function scopeSql(boardParam: number, gradeCodeParam: number, classParam: number): string {
  return `
    (
      EXISTS(
        SELECT 1 FROM learning_assessment_grades lag
        JOIN education_grade_levels egl ON egl.id=lag.grade_id
        WHERE lag.assessment_id=la.id AND egl.code=$${gradeCodeParam}
      )
      OR (
        NOT EXISTS(SELECT 1 FROM learning_assessment_grades lag0 WHERE lag0.assessment_id=la.id)
        AND $${classParam}::int IS NOT NULL
        AND (la.class_min IS NULL OR la.class_min <= $${classParam})
        AND (la.class_max IS NULL OR la.class_max >= $${classParam})
      )
    )
    AND EXISTS(
      SELECT 1 FROM learning_assessment_boards lab
      JOIN education_boards eb ON eb.id=lab.board_id
      WHERE lab.assessment_id=la.id AND (eb.code='COMMON' OR eb.code=$${boardParam})
    )`;
}

export async function listAssessments(userId: UUID) {
  const student = await studentContext(userId);
  const gradeCode = canonicalGradeCode(student);
  const grade = gradeNumber(gradeCode);
  const board = student.board_code || 'COMMON';
  const { rows } = await query(
    `SELECT la.id,la.public_slug,la.title,la.title_hi,la.summary,la.summary_hi,la.assessment_type,
            la.time_limit_mins,la.passing_pct::float,la.max_attempts,sub.name AS subject_name,
            COUNT(DISTINCT laq.question_id)::int AS question_count,
            COALESCE(SUM(COALESCE(laq.marks_override,lq.marks)),0)::float AS total_marks,
            COALESCE(ARRAY_AGG(DISTINCT egl.code) FILTER(WHERE egl.code IS NOT NULL),ARRAY[]::varchar[]) AS grade_codes,
            (SELECT sla.percentage::float FROM student_learning_attempts sla
             WHERE sla.student_id=$1::uuid AND sla.assessment_id=la.id AND sla.status IN ('SUBMITTED','GRADED')
             ORDER BY sla.submitted_at DESC NULLS LAST LIMIT 1) AS last_percentage
     FROM learning_assessments la
     LEFT JOIN subjects sub ON sub.id=la.subject_id
     LEFT JOIN learning_assessment_questions laq ON laq.assessment_id=la.id
     LEFT JOIN learning_questions lq ON lq.id=laq.question_id
     LEFT JOIN learning_assessment_grades lag ON lag.assessment_id=la.id
     LEFT JOIN education_grade_levels egl ON egl.id=lag.grade_id
     WHERE la.review_status='PUBLISHED'
       AND la.visibility IN ('PUBLIC','REGISTERED','CLASS_ONLY')
       AND ${scopeSql(2,3,4)}
     GROUP BY la.id,sub.id
     ORDER BY la.is_featured_public DESC,la.published_at DESC NULLS LAST
     LIMIT 12`,
    [student.student_id,board,gradeCode,grade],
  );
  return rows;
}

async function assessmentForStudent(userId: UUID, assessmentId: UUID) {
  const student = await studentContext(userId);
  const gradeCode = canonicalGradeCode(student);
  const grade = gradeNumber(gradeCode);
  const board = student.board_code || 'COMMON';
  const { rows: [assessment] } = await query(
    `SELECT la.id,la.public_slug,la.title,la.title_hi,la.summary,la.summary_hi,la.assessment_type,
            la.time_limit_mins,la.passing_pct::float,la.max_attempts,la.shuffle_questions
     FROM learning_assessments la
     WHERE la.id=$1::uuid AND la.review_status='PUBLISHED'
       AND la.visibility IN ('PUBLIC','REGISTERED','CLASS_ONLY')
       AND ${scopeSql(2,3,4)}`,
    [assessmentId,board,gradeCode,grade],
  );
  if (!assessment) throw appError('Assessment not found for this learner',404);
  return { student,assessment };
}

export async function getAssessment(userId: UUID, assessmentId: UUID) {
  const { assessment } = await assessmentForStudent(userId,assessmentId);
  const { rows: questions } = await query(
    `SELECT lq.id,lq.public_code,lq.prompt,lq.prompt_hi,lq.question_type,lq.difficulty,
            lq.marks::float,laq.marks_override::float,
            COALESCE(jsonb_agg(jsonb_build_object('key',lqo.option_key,'text',lqo.option_text,'textHi',lqo.option_text_hi)
              ORDER BY lqo.sort_order) FILTER(WHERE lqo.id IS NOT NULL),'[]'::jsonb) AS options
     FROM learning_assessment_questions laq
     JOIN learning_questions lq ON lq.id=laq.question_id
     LEFT JOIN learning_question_options lqo ON lqo.question_id=lq.id
     WHERE laq.assessment_id=$1::uuid AND lq.review_status='PUBLISHED'
     GROUP BY lq.id,laq.marks_override,laq.sort_order
     ORDER BY laq.sort_order,lq.public_code`,
    [assessmentId],
  );
  return { ...assessment,questions };
}

export async function startAssessment(userId: UUID, assessmentId: UUID) {
  const { student,assessment } = await assessmentForStudent(userId,assessmentId);
  if (assessment.max_attempts) {
    const { rows: [count] } = await query<{ count: string } & QueryResultRow>(
      `SELECT COUNT(*)::text AS count FROM student_learning_attempts
       WHERE student_id=$1::uuid AND assessment_id=$2::uuid AND status IN ('SUBMITTED','GRADED')`,
      [student.student_id,assessmentId],
    );
    if (Number(count?.count || 0) >= Number(assessment.max_attempts)) throw appError('Maximum attempts reached',409);
  }
  const { rows: [attempt] } = await query(
    `INSERT INTO student_learning_attempts(student_id,assessment_id) VALUES($1::uuid,$2::uuid)
     RETURNING id,assessment_id,status,started_at`,
    [student.student_id,assessmentId],
  );
  return attempt;
}

export async function replaceHomeAssessments<T extends { assessments?: unknown[] }>(userId: UUID, home: T): Promise<T> {
  return { ...home, assessments: await listAssessments(userId) };
}
