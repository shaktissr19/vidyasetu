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

type LearningReviewStatus = 'DRAFT' | 'SUBMITTED' | 'ACADEMIC_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';

const REVIEW_STATUSES = new Set<LearningReviewStatus>([
  'DRAFT', 'SUBMITTED', 'ACADEMIC_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED',
]);

const REVIEW_TRANSITIONS: Record<LearningReviewStatus, ReadonlySet<LearningReviewStatus>> = {
  DRAFT: new Set(['SUBMITTED', 'ARCHIVED']),
  SUBMITTED: new Set(['DRAFT', 'ACADEMIC_REVIEW', 'ARCHIVED']),
  ACADEMIC_REVIEW: new Set(['SUBMITTED', 'APPROVED', 'ARCHIVED']),
  APPROVED: new Set(['ACADEMIC_REVIEW', 'PUBLISHED', 'ARCHIVED']),
  PUBLISHED: new Set(['ARCHIVED']),
  ARCHIVED: new Set(['DRAFT']),
};

function appError(message: string, statusCode = 400): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function normalizeReviewStatus(value: string): LearningReviewStatus {
  const normalized = value.trim().toUpperCase() as LearningReviewStatus;
  if (!REVIEW_STATUSES.has(normalized)) throw appError('Invalid learning review status');
  return normalized;
}

function assertReviewTransition(fromStatus: string, nextStatus: LearningReviewStatus): void {
  const from = normalizeReviewStatus(fromStatus);
  if (from === nextStatus) throw appError(`Item is already ${nextStatus}`);
  if (!REVIEW_TRANSITIONS[from].has(nextStatus)) {
    throw appError(`Invalid review transition: ${from} → ${nextStatus}. Follow DRAFT → SUBMITTED → ACADEMIC_REVIEW → APPROVED → PUBLISHED.`);
  }
}

function slugify(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 160) || `assessment-${Date.now()}`;
}

function isNroerUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
    return hostname === 'nroer.gov.in' || hostname.endsWith('.nroer.gov.in');
  } catch {
    return false;
  }
}

export async function listQuestions() {
  const { rows } = await query(
    `SELECT lq.id,lq.public_code,lq.prompt,lq.prompt_hi,lq.question_type,lq.difficulty,lq.marks::float,
            lq.negative_marks::float,lq.explanation,lq.explanation_hi,
            lq.class_min,lq.class_max,lq.visibility,lq.review_status,lq.created_at,
            sub.name AS subject_name,lcs.code AS source_code,
            COALESCE(ARRAY_AGG(DISTINCT eb.code) FILTER(WHERE eb.code IS NOT NULL),ARRAY[]::varchar[]) AS board_codes,
            COUNT(DISTINCT lqo.id)::int AS option_count,
            COUNT(DISTINCT lqo.id) FILTER(WHERE NULLIF(BTRIM(lqo.option_text_hi),'') IS NULL)::int AS missing_hindi_option_count
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
  const requestedStatus = normalizeReviewStatus(input.reviewStatus || 'DRAFT');
  if (requestedStatus !== 'DRAFT') {
    throw appError('New learning questions must start in DRAFT and pass the review workflow before publication.');
  }

  const sourceCode = (input.sourceCode || 'VIDYASETU_ORIGINAL').toUpperCase();
  const { rows: [source] } = await query<{ id: UUID; source_kind: string } & QueryResultRow>(
    `SELECT id,source_kind FROM learning_content_sources WHERE code=$1 AND is_active=TRUE`, [sourceCode],
  );
  if (!source) throw appError('Unknown learning source');
  if (sourceCode === 'NROER') {
    if (!input.sourceUrl?.trim()) throw appError('NROER questions require the original source URL');
    if (!isNroerUrl(input.sourceUrl)) throw appError('NROER questions require an original nroer.gov.in source URL');
    if (!input.attributionText?.trim()) throw appError('NROER questions require attribution');
    if (!input.licence || !['CC_BY','CC_BY_SA','PUBLIC_DOMAIN','EXTERNAL_LINK_ONLY'].includes(input.licence)) {
      throw appError('NROER questions require a verified open or link-only licence');
    }
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

    const { rows: [question] } = await client.query<{ id: UUID; public_code: string }>(
      `INSERT INTO learning_questions
       (public_code,prompt,prompt_hi,question_type,difficulty,explanation,explanation_hi,correct_answer,
        marks,negative_marks,class_min,class_max,subject_id,source_id,source_url,licence,attribution_text,
        visibility,review_status,created_by,reviewed_by,published_at)
       VALUES($1,$2,$3,$4::learning_question_type,$5::learning_difficulty,$6,$7,$8::jsonb,$9,$10,$11,$12,$13::uuid,$14::uuid,$15,$16::learning_license_code,$17,
              $18::learning_visibility,'DRAFT'::learning_review_status,$19::uuid,NULL::uuid,NULL::timestamptz)
       RETURNING id,public_code`,
      [publicCode,input.prompt.trim(),input.promptHi?.trim() || null,input.questionType,input.difficulty,
       input.explanation?.trim() || null,input.explanationHi?.trim() || null,JSON.stringify(input.correctAnswer),
       input.marks || 1,input.negativeMarks || 0,input.classMin || null,input.classMax || null,input.subjectId || null,
       source.id,input.sourceUrl?.trim() || null,input.licence || (sourceCode === 'VIDYASETU_ORIGINAL' ? 'VIDYASETU_ORIGINAL' : 'OTHER'),
       input.attributionText?.trim() || null,input.visibility || 'REGISTERED',createdBy],
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

export async function updateQuestionStatus(questionId: UUID, nextStatus: string, reviewerId: UUID) {
  const normalizedNextStatus = normalizeReviewStatus(nextStatus);

  return transaction(async (client) => {
    const { rows: [existing] } = await client.query<{
      review_status: string;
      prompt_hi: string | null;
      explanation_hi: string | null;
      question_type: string;
      negative_marks: number;
    }>(
      `SELECT review_status,prompt_hi,explanation_hi,question_type,negative_marks::float
       FROM learning_questions WHERE id=$1::uuid FOR UPDATE`,
      [questionId],
    );
    if (!existing) throw appError('Learning question not found', 404);
    assertReviewTransition(existing.review_status, normalizedNextStatus);

    if (['APPROVED','PUBLISHED'].includes(normalizedNextStatus)) {
      if (!existing.prompt_hi?.trim() || !existing.explanation_hi?.trim()) {
        throw appError('Academic approval requires both Hindi prompt and Hindi explanation.');
      }
      if (Number(existing.negative_marks) !== 0) {
        throw appError('VidyaSetu learning-practice questions cannot be approved with negative marking.');
      }
      if (['MCQ_SINGLE','MCQ_MULTIPLE','TRUE_FALSE'].includes(existing.question_type)) {
        const { rows: [options] } = await client.query<{ total: number; missing_hindi: number }>(
          `SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER(WHERE NULLIF(BTRIM(option_text_hi),'') IS NULL)::int AS missing_hindi
           FROM learning_question_options WHERE question_id=$1::uuid`,
          [questionId],
        );
        if (!options || options.total < 2) throw appError('Objective questions require at least two answer options before approval.');
        if (options.missing_hindi > 0) throw appError('Academic approval requires Hindi text for every answer option.');
      }
    }

    const { rows: [updated] } = await client.query(
      `UPDATE learning_questions
       SET review_status=$2::learning_review_status,
           reviewed_by=CASE WHEN $2::learning_review_status IN ('APPROVED','PUBLISHED') THEN $3::uuid ELSE reviewed_by END,
           published_at=CASE WHEN $2::learning_review_status='PUBLISHED' THEN COALESCE(published_at,NOW()) ELSE published_at END
       WHERE id=$1::uuid
       RETURNING id,public_code,review_status,published_at`,
      [questionId, normalizedNextStatus, reviewerId],
    );
    return updated;
  });
}

export async function listAssessments() {
  const { rows } = await query(
    `SELECT la.id,la.public_slug,la.title,la.summary,la.assessment_type,la.visibility,la.review_status,
            la.class_min,la.class_max,la.time_limit_mins,la.passing_pct::float,la.max_attempts,
            la.is_featured_public,sub.name AS subject_name,
            COUNT(DISTINCT laq.question_id)::int AS question_count,
            COUNT(DISTINCT laq.question_id) FILTER(WHERE lq.review_status='PUBLISHED')::int AS published_question_count,
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
  const requestedStatus = normalizeReviewStatus(input.reviewStatus || 'DRAFT');
  if (requestedStatus !== 'DRAFT') {
    throw appError('New learning assessments must start in DRAFT and pass the review workflow before publication.');
  }
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

    const { rows: [assessment] } = await client.query<{ id: UUID; public_slug: string }>(
      `INSERT INTO learning_assessments
       (public_slug,title,title_hi,summary,assessment_type,visibility,review_status,class_min,class_max,subject_id,
        time_limit_mins,passing_pct,max_attempts,shuffle_questions,is_featured_public,created_by,reviewed_by,published_at)
       VALUES($1,$2,$3,$4,$5::learning_assessment_type,$6::learning_visibility,'DRAFT'::learning_review_status,$7,$8,$9::uuid,$10,$11,$12,$13,$14,$15::uuid,NULL::uuid,NULL::timestamptz)
       RETURNING id,public_slug`,
      [slug,input.title.trim(),input.titleHi?.trim() || null,input.summary?.trim() || null,input.assessmentType,input.visibility,
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

export async function updateAssessmentStatus(assessmentId: UUID, nextStatus: string, reviewerId: UUID) {
  const normalizedNextStatus = normalizeReviewStatus(nextStatus);

  return transaction(async (client) => {
    const { rows: [existing] } = await client.query<{ review_status: string; public_slug: string | null }>(
      `SELECT review_status,public_slug FROM learning_assessments WHERE id=$1::uuid FOR UPDATE`,
      [assessmentId],
    );
    if (!existing) throw appError('Learning assessment not found', 404);
    assertReviewTransition(existing.review_status, normalizedNextStatus);

    if (normalizedNextStatus === 'PUBLISHED' && !existing.public_slug) {
      throw appError('Published assessments require a public slug.');
    }

    if (['APPROVED','PUBLISHED'].includes(normalizedNextStatus)) {
      const { rows: [questionState] } = await client.query<{
        total: number;
        not_approved: number;
        not_published: number;
      }>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER(WHERE lq.review_status NOT IN ('APPROVED','PUBLISHED'))::int AS not_approved,
                COUNT(*) FILTER(WHERE lq.review_status <> 'PUBLISHED')::int AS not_published
         FROM learning_assessment_questions laq
         JOIN learning_questions lq ON lq.id=laq.question_id
         WHERE laq.assessment_id=$1::uuid`,
        [assessmentId],
      );
      if (!questionState || questionState.total < 1) throw appError('Assessment requires at least one question before approval.');
      if (normalizedNextStatus === 'APPROVED' && questionState.not_approved > 0) {
        throw appError('All assessment questions must be APPROVED or PUBLISHED before assessment approval.');
      }
      if (normalizedNextStatus === 'PUBLISHED' && questionState.not_published > 0) {
        throw appError('All assessment questions must be PUBLISHED before the assessment can be published.');
      }
    }

    const { rows: [updated] } = await client.query(
      `UPDATE learning_assessments
       SET review_status=$2::learning_review_status,
           reviewed_by=CASE WHEN $2::learning_review_status IN ('APPROVED','PUBLISHED') THEN $3::uuid ELSE reviewed_by END,
           published_at=CASE WHEN $2::learning_review_status='PUBLISHED' THEN COALESCE(published_at,NOW()) ELSE published_at END
       WHERE id=$1::uuid
       RETURNING id,public_slug,title,review_status,published_at`,
      [assessmentId, normalizedNextStatus, reviewerId],
    );
    return updated;
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
  if (sourceCode === 'NROER' && !isNroerUrl(input.sourceUrl)) {
    throw appError('NROER intake URL must point to nroer.gov.in');
  }
  const { rows: [item] } = await query(
    `INSERT INTO learning_source_intake
     (source_id,source_item_id,title,source_url,licence_candidate,attribution_text,class_hint,board_hint,subject_hint,created_by)
     VALUES($1::uuid,$2,$3,$4,$5::learning_license_code,$6,$7,$8,$9,$10::uuid)
     ON CONFLICT(source_id,source_url) DO UPDATE SET
       title=EXCLUDED.title,source_item_id=COALESCE(EXCLUDED.source_item_id,learning_source_intake.source_item_id),updated_at=NOW()
     RETURNING id,title,status,source_url`,
    [source.id,input.sourceItemId?.trim() || null,input.title.trim(),input.sourceUrl.trim(),input.licenceCandidate || null,
     input.attributionText?.trim() || null,input.classHint?.trim() || null,input.boardHint?.trim() || null,input.subjectHint?.trim() || null,createdBy],
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