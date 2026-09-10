import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';
import * as resourceService from './adminLearning.service';
import * as practiceService from './adminLearningPractice.service';

interface GradeRow extends QueryResultRow {
  id: UUID;
  code: string;
  class_number: number | null;
}

export interface CreateV3QuestionInput extends practiceService.SaveQuestionInput {
  gradeCodes: string[];
}

export interface CreateV3AssessmentInput extends practiceService.SaveAssessmentInput {
  gradeCodes: string[];
  summaryHi?: string | null;
}

function appError(message: string, statusCode = 400): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function canonicalGradeCode(value: string): string {
  const cleaned = value.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (['PN','PRENURSERY','PRE_NURSERY'].includes(cleaned)) return 'PRE_NURSERY';
  if (cleaned === 'NURSERY') return 'NURSERY';
  if (['LKG','LOWER_KG','LOWER_KINDERGARTEN'].includes(cleaned)) return 'LKG';
  if (['UKG','UPPER_KG','UPPER_KINDERGARTEN'].includes(cleaned)) return 'UKG';
  const match = cleaned.match(/^(?:CLASS_)?(\d{1,2})$/);
  if (match) {
    const value = Number(match[1]);
    if (value >= 1 && value <= 12) return `CLASS_${value}`;
  }
  return cleaned;
}

async function resolveGrades(gradeCodes: string[]): Promise<GradeRow[]> {
  const codes = Array.from(new Set(gradeCodes.map(canonicalGradeCode).filter(Boolean)));
  if (!codes.length) throw appError('At least one canonical grade is required');
  const { rows } = await query<GradeRow>(
    `SELECT id,code,class_number FROM education_grade_levels WHERE code=ANY($1::varchar[]) AND is_active=TRUE`,
    [codes],
  );
  if (rows.length !== codes.length) {
    const found = new Set(rows.map((row) => row.code));
    throw appError(`Unknown grade code(s): ${codes.filter((code) => !found.has(code)).join(', ')}`);
  }
  return rows;
}

function numericRange(grades: GradeRow[]): { classMin: number | null; classMax: number | null } {
  if (grades.some((grade) => grade.class_number == null)) return { classMin: null, classMax: null };
  const values = Array.from(new Set(grades.map((grade) => Number(grade.class_number)))).sort((a,b) => a-b);
  const contiguous = values.every((value,index) => index === 0 || value === values[index - 1] + 1);
  return contiguous ? { classMin: values[0], classMax: values[values.length - 1] } : { classMin: null, classMax: null };
}

function requireBilingualQuestion(input: CreateV3QuestionInput): void {
  if (!input.prompt?.trim() || !input.promptHi?.trim()) throw appError('English and Hindi question prompts are required');
  if (!input.explanation?.trim() || !input.explanationHi?.trim()) throw appError('English and Hindi explanations are required');
  if (['MCQ_SINGLE','MCQ_MULTIPLE','TRUE_FALSE'].includes(input.questionType)) {
    const options = input.options || [];
    if (options.length < 2 || options.some((option) => !option.text?.trim() || !option.textHi?.trim())) {
      throw appError('Objective questions require bilingual English and Hindi options');
    }
  }
}

export async function createResource(input: resourceService.SaveLearningResourceInput, createdBy: UUID) {
  const gradeCodes = input.gradeCodes || [];
  await resolveGrades(gradeCodes);
  if (!input.title?.trim() || !input.titleHi?.trim()) throw appError('English and Hindi resource titles are required');
  if (!input.summary?.trim() || !input.summaryHi?.trim()) throw appError('English and Hindi resource summaries are required');
  if (input.resourceType === 'ARTICLE' && (!input.bodyMarkdown?.trim() || !input.bodyMarkdownHi?.trim())) {
    throw appError('Bilingual article body is required');
  }
  return resourceService.createLearningResource({ ...input, reviewStatus: 'DRAFT', gradeCodes }, createdBy);
}

export async function createQuestion(input: CreateV3QuestionInput, createdBy: UUID) {
  requireBilingualQuestion(input);
  const grades = await resolveGrades(input.gradeCodes);
  const range = numericRange(grades);
  return transaction(async (client) => {
    const created = await practiceService.createQuestion({
      ...input,
      reviewStatus: 'DRAFT',
      classMin: range.classMin,
      classMax: range.classMax,
    }, createdBy);
    for (const grade of grades) {
      await client.query(
        `INSERT INTO learning_question_grades(question_id,grade_id) VALUES($1::uuid,$2::uuid) ON CONFLICT DO NOTHING`,
        [created.id, grade.id],
      );
    }
    return { ...created, gradeCodes: grades.map((grade) => grade.code) };
  });
}

export async function createAssessment(input: CreateV3AssessmentInput, createdBy: UUID) {
  if (!input.title?.trim() || !input.titleHi?.trim()) throw appError('English and Hindi assessment titles are required');
  if (!input.summary?.trim() || !input.summaryHi?.trim()) throw appError('English and Hindi assessment summaries are required');
  const summaryHi = input.summaryHi.trim();
  const grades = await resolveGrades(input.gradeCodes);
  const range = numericRange(grades);
  return transaction(async (client) => {
    const created = await practiceService.createAssessment({
      ...input,
      reviewStatus: 'DRAFT',
      classMin: range.classMin,
      classMax: range.classMax,
    }, createdBy);
    await client.query(`UPDATE learning_assessments SET summary_hi=$2 WHERE id=$1::uuid`, [created.id, summaryHi]);
    for (const grade of grades) {
      await client.query(
        `INSERT INTO learning_assessment_grades(assessment_id,grade_id) VALUES($1::uuid,$2::uuid) ON CONFLICT DO NOTHING`,
        [created.id, grade.id],
      );
    }
    return { ...created, gradeCodes: grades.map((grade) => grade.code) };
  });
}

export async function listQuestionsForGrade(gradeCode?: string | null) {
  const values: unknown[] = [];
  const conditions = ['1=1'];
  if (gradeCode?.trim()) {
    values.push(canonicalGradeCode(gradeCode));
    conditions.push(`EXISTS(SELECT 1 FROM learning_question_grades lqg JOIN education_grade_levels egl ON egl.id=lqg.grade_id WHERE lqg.question_id=lq.id AND egl.code=$${values.length})`);
  }
  const { rows } = await query(
    `SELECT lq.id,lq.public_code,lq.prompt,lq.prompt_hi,lq.question_type,lq.difficulty,lq.review_status,
            lq.explanation,lq.explanation_hi,lq.cognitive_skill,lq.skill_code,
            COALESCE(ARRAY_AGG(DISTINCT egl.code) FILTER(WHERE egl.code IS NOT NULL),ARRAY[]::varchar[]) AS grade_codes,
            COALESCE(ARRAY_AGG(DISTINCT eb.code) FILTER(WHERE eb.code IS NOT NULL),ARRAY[]::varchar[]) AS board_codes,
            COUNT(DISTINCT lqo.id)::int AS option_count
     FROM learning_questions lq
     LEFT JOIN learning_question_grades lqg0 ON lqg0.question_id=lq.id
     LEFT JOIN education_grade_levels egl ON egl.id=lqg0.grade_id
     LEFT JOIN learning_question_boards lqb ON lqb.question_id=lq.id
     LEFT JOIN education_boards eb ON eb.id=lqb.board_id
     LEFT JOIN learning_question_options lqo ON lqo.question_id=lq.id
     WHERE ${conditions.join(' AND ')}
     GROUP BY lq.id ORDER BY lq.updated_at DESC LIMIT 500`,
    values,
  );
  return rows;
}

export async function listAssessmentsForGrade(gradeCode?: string | null) {
  const values: unknown[] = [];
  const conditions = ['1=1'];
  if (gradeCode?.trim()) {
    values.push(canonicalGradeCode(gradeCode));
    conditions.push(`EXISTS(SELECT 1 FROM learning_assessment_grades lagf JOIN education_grade_levels eglf ON eglf.id=lagf.grade_id WHERE lagf.assessment_id=la.id AND eglf.code=$${values.length})`);
  }
  const { rows } = await query(
    `SELECT la.id,la.public_slug,la.title,la.title_hi,la.summary,la.summary_hi,la.assessment_type,la.visibility,la.review_status,
            la.time_limit_mins,la.passing_pct::float,la.max_attempts,la.is_featured_public,
            COALESCE(ARRAY_AGG(DISTINCT egl.code) FILTER(WHERE egl.code IS NOT NULL),ARRAY[]::varchar[]) AS grade_codes,
            COALESCE(ARRAY_AGG(DISTINCT eb.code) FILTER(WHERE eb.code IS NOT NULL),ARRAY[]::varchar[]) AS board_codes,
            COUNT(DISTINCT laq.question_id)::int AS question_count
     FROM learning_assessments la
     LEFT JOIN learning_assessment_grades lag ON lag.assessment_id=la.id
     LEFT JOIN education_grade_levels egl ON egl.id=lag.grade_id
     LEFT JOIN learning_assessment_boards lab ON lab.assessment_id=la.id
     LEFT JOIN education_boards eb ON eb.id=lab.board_id
     LEFT JOIN learning_assessment_questions laq ON laq.assessment_id=la.id
     WHERE ${conditions.join(' AND ')}
     GROUP BY la.id ORDER BY la.updated_at DESC LIMIT 300`,
    values,
  );
  return rows;
}
