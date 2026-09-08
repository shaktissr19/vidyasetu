import type { QueryResultRow } from 'pg';
import { query } from '../config/db';

export interface PublicAssessmentFilters {
  className?: number | null;
  gradeCode?: string | null;
  board?: string | null;
  type?: string | null;
  limit?: number;
}

export async function listPublicAssessments(filters: PublicAssessmentFilters = {}) {
  const values: unknown[] = [];
  const conditions = ["la.visibility='PUBLIC'", "la.review_status='PUBLISHED'"];
  if (filters.gradeCode?.trim()) {
    values.push(filters.gradeCode.trim().toUpperCase());
    conditions.push(`EXISTS(
      SELECT 1 FROM learning_assessment_grades lagf
      JOIN education_grade_levels eglf ON eglf.id=lagf.grade_id
      WHERE lagf.assessment_id=la.id AND eglf.code=$${values.length}
    )`);
  } else if (filters.className) {
    values.push(filters.className);
    const p = values.length;
    conditions.push(`(
      EXISTS(
        SELECT 1 FROM learning_assessment_grades lagf
        JOIN education_grade_levels eglf ON eglf.id=lagf.grade_id
        WHERE lagf.assessment_id=la.id AND eglf.class_number=$${p}
      )
      OR (
        NOT EXISTS(SELECT 1 FROM learning_assessment_grades lag0 WHERE lag0.assessment_id=la.id)
        AND (la.class_min IS NULL OR la.class_min <= $${p})
        AND (la.class_max IS NULL OR la.class_max >= $${p})
      )
    )`);
  }
  if (filters.board) {
    values.push(filters.board.toUpperCase());
    conditions.push(`EXISTS(
      SELECT 1 FROM learning_assessment_boards labf
      JOIN education_boards ebf ON ebf.id=labf.board_id
      WHERE labf.assessment_id=la.id AND (ebf.code='COMMON' OR ebf.code=$${values.length})
    )`);
  }
  if (filters.type) {
    values.push(filters.type.toUpperCase());
    conditions.push(`la.assessment_type::text=$${values.length}`);
  }
  const limit = Math.min(Math.max(filters.limit || 24, 1), 100);
  values.push(limit);

  const { rows } = await query(
    `SELECT la.id,la.public_slug,la.title,la.title_hi,la.summary,la.summary_hi,la.assessment_type,
            la.class_min,la.class_max,la.time_limit_mins,la.passing_pct::float,la.is_featured_public,
            sub.name AS subject_name,sub.name_hi AS subject_name_hi,sub.code AS subject_code,
            COUNT(DISTINCT laq.question_id)::int AS question_count,
            COALESCE(SUM(COALESCE(laq.marks_override,lq.marks)),0)::float AS total_marks,
            COALESCE(ARRAY_AGG(DISTINCT eb.code) FILTER(WHERE eb.code IS NOT NULL),ARRAY[]::varchar[]) AS board_codes,
            COALESCE(ARRAY_AGG(DISTINCT egl.code ORDER BY egl.code) FILTER(WHERE egl.code IS NOT NULL),ARRAY[]::varchar[]) AS grade_codes
     FROM learning_assessments la
     LEFT JOIN subjects sub ON sub.id=la.subject_id
     LEFT JOIN learning_assessment_questions laq ON laq.assessment_id=la.id
     LEFT JOIN learning_questions lq ON lq.id=laq.question_id
     LEFT JOIN learning_assessment_boards lab ON lab.assessment_id=la.id
     LEFT JOIN education_boards eb ON eb.id=lab.board_id
     LEFT JOIN learning_assessment_grades lag ON lag.assessment_id=la.id
     LEFT JOIN education_grade_levels egl ON egl.id=lag.grade_id
     WHERE ${conditions.join(' AND ')}
     GROUP BY la.id,sub.id
     ORDER BY la.is_featured_public DESC,la.published_at DESC NULLS LAST,la.created_at DESC
     LIMIT $${values.length}`,
    values,
  );
  return rows;
}

export async function getPublicAssessment(slug: string) {
  const { rows: [assessment] } = await query(
    `SELECT la.id,la.public_slug,la.title,la.title_hi,la.summary,la.summary_hi,la.assessment_type,
            la.class_min,la.class_max,la.time_limit_mins,la.passing_pct::float,
            sub.name AS subject_name,sub.name_hi AS subject_name_hi,sub.code AS subject_code,
            COALESCE(ARRAY_AGG(DISTINCT eb.code) FILTER(WHERE eb.code IS NOT NULL),ARRAY[]::varchar[]) AS board_codes,
            COALESCE(ARRAY_AGG(DISTINCT egl.code ORDER BY egl.code) FILTER(WHERE egl.code IS NOT NULL),ARRAY[]::varchar[]) AS grade_codes
     FROM learning_assessments la
     LEFT JOIN subjects sub ON sub.id=la.subject_id
     LEFT JOIN learning_assessment_boards lab ON lab.assessment_id=la.id
     LEFT JOIN education_boards eb ON eb.id=lab.board_id
     LEFT JOIN learning_assessment_grades lag ON lag.assessment_id=la.id
     LEFT JOIN education_grade_levels egl ON egl.id=lag.grade_id
     WHERE la.public_slug=$1 AND la.visibility='PUBLIC' AND la.review_status='PUBLISHED'
     GROUP BY la.id,sub.id`, [slug],
  );
  if (!assessment) throw Object.assign(new Error('Public practice assessment not found'), { statusCode: 404 });

  const { rows: questions } = await query(
    `SELECT lq.id,lq.public_code,lq.prompt,lq.prompt_hi,lq.question_type,lq.difficulty,
            COALESCE(laq.marks_override,lq.marks)::float AS marks,
            COALESCE(jsonb_agg(jsonb_build_object('key',lqo.option_key,'text',lqo.option_text,'textHi',lqo.option_text_hi)
              ORDER BY lqo.sort_order) FILTER(WHERE lqo.id IS NOT NULL),'[]'::jsonb) AS options
     FROM learning_assessment_questions laq
     JOIN learning_questions lq ON lq.id=laq.question_id
     LEFT JOIN learning_question_options lqo ON lqo.question_id=lq.id
     WHERE laq.assessment_id=$1 AND lq.review_status='PUBLISHED'
     GROUP BY lq.id,laq.marks_override,laq.sort_order
     ORDER BY laq.sort_order,lq.public_code`, [assessment.id],
  );
  return { ...assessment, questions, anonymousMode: true, message: 'Sign in as a Student to submit answers, receive explanations and save progress.' };
}