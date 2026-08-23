import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';

export interface SaveQuestionInput {
  publicCode?: string;
  prompt: string;
  promptHi?: string | null;
  questionType: string;
  difficulty: string;
  explanation?: string | null;
  explanationHi?: string | null;
  correctAnswer: unknown;
  marks?: number;
  negativeMarks?: number;
  classMin?: number | null;
  classMax?: number | null;
  subjectId?: UUID | null;
  sourceCode?: string;
  sourceUrl?: string | null;
  licence?: string;
  attributionText?: string | null;
  visibility?: string;
  reviewStatus?: string;
  boardCodes?: string[];
  options?: Array<{ key: string; text: string; textHi?: string | null }>;
}

export interface SaveAssessmentInput {
  publicSlug?: string | null;
  title: string;
  titleHi?: string | null;
  summary?: string | null;
  assessmentType: string;
  visibility: string;
  reviewStatus?: string;
  classMin?: number | null;
  classMax?: number | null;
  subjectId?: UUID | null;
  timeLimitMins?: number | null;
  passingPct?: number;
  maxAttempts?: number | null;
  shuffleQuestions?: boolean;
  isFeaturedPublic?: boolean;
  boardCodes?: string[];
  questionIds: UUID[];
}

export interface SaveIntakeInput {
  sourceCode: string;
  sourceItemId?: string | null;
  title: string;
  sourceUrl: string;
  licenceCandidate?: string | null;
  attributionText?: string | null;
  classHint?: string | null;
  boardHint?: string | null;
  subjectHint?: string | null;
}

function appError(message: string, statusCode = 400): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function slugify(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 160) || `assessment-${Date.now()}`;
}

export async function listQuestions() {
  const { rows } = await query(
    `SELECT lq.id,lq.public_code,lq.prompt,lq.question_type,lq.difficulty,lq.marks::float,
            lq.class_min,lq.class_max,lq.visibility,lq.review_status,lq.created_at,
            sub.name AS subject_name,lcs.code AS source_code,
            COALESCE(ARRAY_AGG(DISTINCT eb.code) FILTER(WHERE eb.code IS NOT NULL),ARRAY[]::varchar[]) AS board_codes,
            COUNT(DISTINCT lqo.id)::int AS option_count
     FROM learning_questions lq
     JOIN learning_content_sources lcs ON lcs.id=lq.source_id
     LEFT JOIN subjects sub ON sub.id=lq.subject_id
     LEFT JOIN learning_question_boards lqb ON lqb.question_id=lq.id
     LEFT JOIN education_boards eb ON eb.id=lqb.board_id
     LEFT JOIN learning_question_options lqo ON lqo.question_id=lq.id
     GROUP BY lq.id,sub.id,lcs.id
     ORDER BY lq.updated_at DESC LIMIT 500`,
  );
  return rows;
}

export async function createQuestion(input: SaveQuestionInput, createdBy: UUID) {
  if (input.classMin && input.classMax && input.classMin > input.classMax) throw appError('classMin cannot exceed classMax');
  const sourceCode = (input.sourceCode || 'VIDYASETU_ORIGINAL').toUpperCase();
  const { rows: [source] } = await query<{ id: UUID; source_kind: string } & QueryResultRow>(
    `SELECT id,source_kind FROM learning_content_sources WHERE code=$1 AND is_active=TRUE`, [sourceCode],
  );
  if (!source) throw appError('Unknown learning source');
  if (sourceCode === 'NROER' && (!input.sourceUrl || !input.attributionText || !input.licence)) {
    throw appError('NROER questions require source URL, verified licence and attribution');
  }
  const options = input.options || [];
  if (['MCQ_SINGLE','MCQ_MULTIPLE','TRUE_FALSE'].includes(input.questionType) && options.length < 2) {
    throw appError('Objective questions require at least two answer options');
  }
  const publicCode = (input.publicCode || `VSQ-${Date.now()}`).toUpperCase();
  const boardCodes = (input.boardCodes?.length ? input.boardCodes : ['COMMON']).map((code) => code.toUpperCase());

  return transaction(async (client) => {
    const { rows: boards } = await client.query<{ id: UUID; code: string }>(
      `SELECT id,code FROM education_boards WHERE code=ANY($1::varchar[]) AND is_active=TRUE`, [boardCodes],
    );
    if (boards.length !== new Set(boardCodes).size) throw appError('One or more board codes are invalid');

    const status = input.reviewStatus || 'DRAFT';
    const { rows: [question] } = await client.query<{ id: UUID; public_code: string }>(
      `INSERT INTO learning_questions
       (public_code,prompt,prompt_hi,question_type,difficulty,explanation,explanation_hi,correct_answer,
        marks,negative_marks,class_min,class_max,subject_id,source_id,source_url,licence,attribution_text,
        visibility,review_status,created_by,reviewed_by,published_at)
       VALUES($1,$2,$3,$4::learning_question_type,$5::learning_difficulty,$6,$7,$8::jsonb,$9,$10,$11,$12,$13::uuid,$14::uuid,$15,$16::learning_license_code,$17,
              $18::learning_visibility,$19::learning_review_status,$20::uuid,
              CASE WHEN $19::learning_review_status IN ('APPROVED'::learning_review_status,'PUBLISHED'::learning_review_status) THEN $20::uuid ELSE NULL::uuid END,
              CASE WHEN $19::learning_review_status='PUBLISHED'::learning_review_status THEN NOW() ELSE NULL::timestamptz END)
       RETURNING id,public_code`,
      [publicCode,input.prompt.trim(),input.promptHi?.trim() || null,input.questionType,input.difficulty,
       input.explanation?.trim() || null,input.explanationHi?.trim() || null,JSON.stringify(input.correctAnswer),
       input.marks || 1,input.negativeMarks || 0,input.classMin || null,input.classMax || null,input.subjectId || null,
       source.id,input.sourceUrl || null,input.licence || (sourceCode === 'VIDYASETU_ORIGINAL' ? 'VIDYASETU_ORIGINAL' : 'OTHER'),
       input.attributionText || null,input.visibility || 'REGISTERED',status,createdBy],
    );

    for (let index = 0; index < options.length; index += 1) {
      const option = options[index];
      await client.query(
        `INSERT INTO learning_question_options(question_id,option_key,option_text,option_text_hi,sort_order)
         VALUES($1::uuid,$2,$3,$4,$5)`,
        [question.id, option.key.trim().toUpperCase(), option.text.trim(), option.textHi?.trim() || null, index + 1],
      );
    }
    for (const board of boards) {
      await client.query(`INSERT INTO learning_question_boards(question_id,board_id) VALUES($1::uuid,$2::uuid) ON CONFLICT DO NOTHING`, [question.id, board.id]);
    }
    return question;
  });
}

export async function listAssessments() {
  const { rows } = await query(
    `SELECT la.id,la.public_slug,la.title,la.summary,la.assessment_type,la.visibility,la.review_status,
            la.class_min,la.class_max,la.time_limit_mins,la.passing_pct::float,la.max_attempts,
            la.is_featured_public,sub.name AS subject_name,
            COUNT(DISTINCT laq.question_id)::int AS question_count,
            COALESCE(SUM(COALESCE(laq.marks_override,lq.marks)),0)::float AS total_marks,
            COALESCE(ARRAY_AGG(DISTINCT eb.code) FILTER(WHERE eb.code IS NOT NULL),ARRAY[]::varchar[]) AS board_codes
     FROM learning_assessments la
     LEFT JOIN subjects sub ON sub.id=la.subject_id
     LEFT JOIN learning_assessment_questions laq ON laq.assessment_id=la.id
     LEFT JOIN learning_questions lq ON lq.id=laq.question_id
     LEFT JOIN learning_assessment_boards lab ON lab.assessment_id=la.id
     LEFT JOIN education_boards eb ON eb.id=lab.board_id
     GROUP BY la.id,sub.id ORDER BY la.updated_at DESC LIMIT 300`,
  );
  return rows;
}

export async function createAssessment(input: SaveAssessmentInput, createdBy: UUID) {
  if (!input.questionIds.length) throw appError('Assessment requires at least one question');
  if (input.classMin && input.classMax && input.classMin > input.classMax) throw appError('classMin cannot exceed classMax');
  const boardCodes = (input.boardCodes?.length ? input.boardCodes : ['COMMON']).map((code) => code.toUpperCase());
  const slug = input.publicSlug?.trim() || slugify(input.title);

  return transaction(async (client) => {
    const { rows: boards } = await client.query<{ id: UUID; code: string }>(
      `SELECT id,code FROM education_boards WHERE code=ANY($1::varchar[]) AND is_active=TRUE`, [boardCodes],
    );
    if (boards.length !== new Set(boardCodes).size) throw appError('One or more board codes are invalid');
    const { rows: questions } = await client.query<{ id: UUID }>(
      `SELECT id FROM learning_questions WHERE id=ANY($1::uuid[])`, [input.questionIds],
    );
    if (questions.length !== new Set(input.questionIds).size) throw appError('One or more question IDs are invalid');
    const status = input.reviewStatus || 'DRAFT';
    const { rows: [assessment] } = await client.query<{ id: UUID; public_slug: string }>(
      `INSERT INTO learning_assessments
       (public_slug,title,title_hi,summary,assessment_type,visibility,review_status,class_min,class_max,subject_id,
        time_limit_mins,passing_pct,max_attempts,shuffle_questions,is_featured_public,created_by,reviewed_by,published_at)
       VALUES($1,$2,$3,$4,$5::learning_assessment_type,$6::learning_visibility,$7::learning_review_status,$8,$9,$10::uuid,$11,$12,$13,$14,$15,$16::uuid,
              CASE WHEN $7::learning_review_status IN ('APPROVED'::learning_review_status,'PUBLISHED'::learning_review_status) THEN $16::uuid ELSE NULL::uuid END,
              CASE WHEN $7::learning_review_status='PUBLISHED'::learning_review_status THEN NOW() ELSE NULL::timestamptz END)
       RETURNING id,public_slug`,
      [slug,input.title.trim(),input.titleHi?.trim() || null,input.summary?.trim() || null,input.assessmentType,input.visibility,status,
       input.classMin || null,input.classMax || null,input.subjectId || null,input.timeLimitMins || null,input.passingPct ?? 40,input.maxAttempts || null,
       Boolean(input.shuffleQuestions),Boolean(input.isFeaturedPublic),createdBy],
    );
    for (const board of boards) {
      await client.query(`INSERT INTO learning_assessment_boards(assessment_id,board_id) VALUES($1::uuid,$2::uuid) ON CONFLICT DO NOTHING`, [assessment.id, board.id]);
    }
    for (let index = 0; index < input.questionIds.length; index += 1) {
      await client.query(
        `INSERT INTO learning_assessment_questions(assessment_id,question_id,sort_order) VALUES($1::uuid,$2::uuid,$3) ON CONFLICT DO NOTHING`,
        [assessment.id,input.questionIds[index],index + 1],
      );
    }
    return assessment;
  });
}

export async function listIntake() {
  const { rows } = await query(
    `SELECT lsi.id,lsi.source_item_id,lsi.title,lsi.source_url,lsi.licence_candidate,lsi.attribution_text,
            lsi.class_hint,lsi.board_hint,lsi.subject_hint,lsi.status,lsi.reviewer_note,lsi.created_at,lsi.reviewed_at,
            lcs.code AS source_code,lcs.name AS source_name
     FROM learning_source_intake lsi
     JOIN learning_content_sources lcs ON lcs.id=lsi.source_id
     ORDER BY CASE lsi.status WHEN 'DISCOVERED' THEN 1 WHEN 'LICENCE_REVIEW' THEN 2 WHEN 'CONTENT_REVIEW' THEN 3 ELSE 9 END, lsi.created_at DESC
     LIMIT 300`,
  );
  return rows;
}

export async function createIntake(input: SaveIntakeInput, createdBy: UUID) {
  const sourceCode = input.sourceCode.toUpperCase();
  const { rows: [source] } = await query<{ id: UUID } & QueryResultRow>(
    `SELECT id FROM learning_content_sources WHERE code=$1 AND is_active=TRUE`, [sourceCode],
  );
  if (!source) throw appError('Unknown learning source');
  if (sourceCode === 'NROER' && !input.sourceUrl.includes('nroer.gov.in')) {
    throw appError('NROER intake URL must point to nroer.gov.in');
  }
  const { rows: [item] } = await query(
    `INSERT INTO learning_source_intake
     (source_id,source_item_id,title,source_url,licence_candidate,attribution_text,class_hint,board_hint,subject_hint,created_by)
     VALUES($1::uuid,$2,$3,$4,$5::learning_license_code,$6,$7,$8,$9,$10::uuid)
     ON CONFLICT(source_id,source_url) DO UPDATE SET
       title=EXCLUDED.title,source_item_id=COALESCE(EXCLUDED.source_item_id,learning_source_intake.source_item_id),updated_at=NOW()
     RETURNING id,title,status,source_url`,
    [source.id,input.sourceItemId || null,input.title.trim(),input.sourceUrl,input.licenceCandidate || null,
     input.attributionText || null,input.classHint || null,input.boardHint || null,input.subjectHint || null,createdBy],
  );
  return item;
}

export async function updateIntakeStatus(intakeId: UUID, status: string, reviewerId: UUID, note?: string | null) {
  const { rows: [item] } = await query<{ source_code: string; licence_candidate: string | null; attribution_text: string | null } & QueryResultRow>(
    `SELECT lcs.code AS source_code,lsi.licence_candidate,lsi.attribution_text
     FROM learning_source_intake lsi JOIN learning_content_sources lcs ON lcs.id=lsi.source_id WHERE lsi.id=$1::uuid`, [intakeId],
  );
  if (!item) throw appError('OER intake item not found', 404);
  if (['APPROVED','IMPORTED'].includes(status) && item.source_code === 'NROER') {
    if (!item.licence_candidate || !['CC_BY','CC_BY_SA','PUBLIC_DOMAIN','EXTERNAL_LINK_ONLY'].includes(item.licence_candidate)) {
      throw appError('NROER approval requires a verified open or link-only licence');
    }
    if (!item.attribution_text?.trim()) throw appError('NROER approval requires attribution');
  }
  const { rows: [updated] } = await query(
    `UPDATE learning_source_intake SET status=$2::learning_intake_status,reviewer_note=$3,reviewed_by=$4::uuid,reviewed_at=NOW(),updated_at=NOW()
     WHERE id=$1::uuid RETURNING id,title,status,reviewer_note,reviewed_at`,
    [intakeId,status,note?.trim() || null,reviewerId],
  );
  return updated;
}
