import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';

export type QualityEntityType = 'RESOURCE' | 'QUESTION' | 'ASSESSMENT' | 'CONCEPT';
export type QualityGateStatus = 'PENDING' | 'PASS' | 'FAIL' | 'NOT_APPLICABLE';

export const QUALITY_GATE_CODES = [
  'ACADEMIC_ACCURACY',
  'AGE_APPROPRIATENESS',
  'ENGLISH_QUALITY',
  'HINDI_QUALITY',
  'LEARNING_OUTCOME_ALIGNMENT',
  'PRACTICE_QUALITY',
  'MISCONCEPTION_COVERAGE',
  'APPLICATION',
  'ACCESSIBILITY',
  'SAFETY',
  'COPYRIGHT_LICENSING',
  'TECHNICAL_READINESS',
] as const;
export type QualityGateCode = typeof QUALITY_GATE_CODES[number];

const ENTITY_TYPES = new Set<QualityEntityType>(['RESOURCE', 'QUESTION', 'ASSESSMENT', 'CONCEPT']);
const GATE_CODES = new Set<string>(QUALITY_GATE_CODES);
const NA_ALLOWED = new Set<QualityGateCode>(['ACCESSIBILITY', 'SAFETY']);

export interface ReadinessCheck {
  code: string;
  label: string;
  passed: boolean;
  reason: string;
  weight: number;
}

export interface GateReview {
  gateCode: QualityGateCode;
  status: QualityGateStatus;
  note: string | null;
  reviewerId: UUID | null;
  reviewedAt: string | Date | null;
}

export interface EntityReadiness {
  entityType: QualityEntityType;
  entityId: UUID;
  score: number;
  readyForApproval: boolean;
  readyForPublication: boolean;
  checks: ReadinessCheck[];
  manualGates: GateReview[];
  blockers: string[];
}

interface GateRow extends QueryResultRow {
  gate_code: QualityGateCode;
  status: QualityGateStatus;
  note: string | null;
  reviewer_id: UUID | null;
  reviewed_at: string | Date | null;
}

function appError(message: string, statusCode = 400): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function normalizeEntityType(value: string): QualityEntityType {
  const normalized = value.trim().toUpperCase() as QualityEntityType;
  if (!ENTITY_TYPES.has(normalized)) throw appError('Invalid quality entity type');
  return normalized;
}

function normalizeGateCode(value: string): QualityGateCode {
  const normalized = value.trim().toUpperCase();
  if (!GATE_CODES.has(normalized)) throw appError('Invalid quality gate code');
  return normalized as QualityGateCode;
}

function normalizeGateStatus(value: string): QualityGateStatus {
  const normalized = value.trim().toUpperCase() as QualityGateStatus;
  if (!['PENDING', 'PASS', 'FAIL', 'NOT_APPLICABLE'].includes(normalized)) throw appError('Invalid quality gate status');
  return normalized;
}

function truthyText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

async function loadGateMap(entityType: QualityEntityType, entityId: UUID): Promise<Map<QualityGateCode, GateReview>> {
  const { rows } = await query<GateRow>(
    `SELECT gate_code,status,note,reviewer_id,reviewed_at
     FROM learning_quality_gate_reviews
     WHERE entity_type=$1::learning_quality_entity_type AND entity_id=$2::uuid`,
    [entityType, entityId],
  );
  return new Map(rows.map((row) => [row.gate_code, {
    gateCode: row.gate_code,
    status: row.status,
    note: row.note,
    reviewerId: row.reviewer_id,
    reviewedAt: row.reviewed_at,
  }]));
}

function manualGates(gates: Map<QualityGateCode, GateReview>, required: QualityGateCode[]): GateReview[] {
  return required.map((gateCode) => gates.get(gateCode) || {
    gateCode,
    status: 'PENDING',
    note: null,
    reviewerId: null,
    reviewedAt: null,
  });
}

function gateSatisfied(gate: GateReview): boolean {
  return gate.status === 'PASS' || (gate.status === 'NOT_APPLICABLE' && NA_ALLOWED.has(gate.gateCode));
}

function buildReadiness(
  entityType: QualityEntityType,
  entityId: UUID,
  checks: ReadinessCheck[],
  gates: GateReview[],
  publicationExtra: ReadinessCheck[] = [],
): EntityReadiness {
  const allChecks = [...checks, ...publicationExtra];
  const totalWeight = allChecks.reduce((sum, item) => sum + item.weight, 0) || 1;
  const earned = allChecks.reduce((sum, item) => sum + (item.passed ? item.weight : 0), 0);
  const deterministicScore = Math.round((earned / totalWeight) * 70);
  const gateScore = gates.length ? Math.round((gates.filter(gateSatisfied).length / gates.length) * 30) : 30;
  const score = Math.min(100, deterministicScore + gateScore);
  const blockers = [
    ...checks.filter((item) => !item.passed).map((item) => item.reason),
    ...gates.filter((item) => !gateSatisfied(item)).map((item) => `${item.gateCode.replaceAll('_', ' ')} review is ${item.status}.`),
  ];
  const publicationBlockers = publicationExtra.filter((item) => !item.passed).map((item) => item.reason);
  return {
    entityType,
    entityId,
    score,
    readyForApproval: blockers.length === 0,
    readyForPublication: blockers.length === 0 && publicationBlockers.length === 0,
    checks: allChecks,
    manualGates: gates,
    blockers: [...blockers, ...publicationBlockers],
  };
}

export async function getResourceReadiness(resourceId: UUID): Promise<EntityReadiness> {
  const { rows: [row] } = await query<QueryResultRow>(
    `SELECT lr.id,lr.public_slug,lr.title,lr.title_hi,lr.summary,lr.summary_hi,
            lr.body_markdown,lr.body_markdown_hi,lr.resource_type::text,lr.category::text,
            lr.visibility::text,lr.class_min,lr.class_max,lr.licence::text,
            lr.source_url,lr.external_url,lr.file_key,lr.attribution_text,
            lcs.code AS source_code,lcs.source_kind,
            COUNT(DISTINCT lrb.board_id)::int AS board_count,
            COUNT(DISTINCT lrc.concept_id)::int AS concept_count,
            COUNT(DISTINCT lrc.concept_id) FILTER(WHERE lrc.journey_stage IS NOT NULL)::int AS staged_concept_count
     FROM learning_resources lr
     JOIN learning_content_sources lcs ON lcs.id=lr.source_id
     LEFT JOIN learning_resource_boards lrb ON lrb.resource_id=lr.id
     LEFT JOIN learning_resource_concepts lrc ON lrc.resource_id=lr.id
     WHERE lr.id=$1::uuid
     GROUP BY lr.id,lcs.id`,
    [resourceId],
  );
  if (!row) throw appError('Learning resource not found', 404);
  const academic = row.category === 'ACADEMIC';
  const original = row.source_code === 'VIDYASETU_ORIGINAL';
  const article = row.resource_type === 'ARTICLE';
  const technicalAsset = article
    ? truthyText(row.body_markdown) && truthyText(row.body_markdown_hi)
    : truthyText(row.file_key) || truthyText(row.external_url) || truthyText(row.source_url);
  const sourceReady = original || (
    truthyText(row.source_url) && truthyText(row.attribution_text) && row.licence !== 'OTHER'
  );
  const checks: ReadinessCheck[] = [
    { code: 'BILINGUAL_TITLE', label: 'English + Hindi title', passed: truthyText(row.title) && truthyText(row.title_hi), reason: 'English and Hindi titles are required.', weight: 15 },
    { code: 'BILINGUAL_BODY', label: 'Bilingual learner body', passed: !article || (truthyText(row.body_markdown) && truthyText(row.body_markdown_hi)), reason: 'Article resources require complete English and Hindi learner bodies.', weight: 15 },
    { code: 'CURRICULUM_SCOPE', label: 'Class and board scope', passed: !academic || (Number(row.board_count) > 0 && row.class_min != null && row.class_max != null), reason: 'Academic resources require class range and at least one board mapping.', weight: 10 },
    { code: 'CONCEPT_MAPPING', label: 'Canonical concept mapping', passed: !academic || (Number(row.concept_count) > 0 && Number(row.staged_concept_count) === Number(row.concept_count)), reason: 'Academic resources must map to a canonical concept and learning-journey stage.', weight: 20 },
    { code: 'SOURCE_LICENCE', label: 'Source and licence', passed: sourceReady, reason: 'External learning resources require verified source, attribution and licence metadata.', weight: 15 },
    { code: 'TECHNICAL_ASSET', label: 'Usable learning asset', passed: technicalAsset, reason: 'Resource requires a usable article body, file or external/source URL.', weight: 15 },
    { code: 'SUMMARY', label: 'Learner summary', passed: truthyText(row.summary) && truthyText(row.summary_hi), reason: 'English and Hindi summaries are required before academic approval.', weight: 10 },
  ];
  const gateMap = await loadGateMap('RESOURCE', resourceId);
  const gates = manualGates(gateMap, [
    'ACADEMIC_ACCURACY','AGE_APPROPRIATENESS','ENGLISH_QUALITY','HINDI_QUALITY',
    'ACCESSIBILITY','SAFETY','COPYRIGHT_LICENSING','TECHNICAL_READINESS',
  ]);
  const publication: ReadinessCheck[] = [
    { code: 'PUBLIC_SLUG', label: 'Stable public slug', passed: row.visibility !== 'PUBLIC' || truthyText(row.public_slug), reason: 'Public resources require a stable public slug.', weight: 5 },
  ];
  return buildReadiness('RESOURCE', resourceId, checks, gates, publication);
}

export async function getQuestionReadiness(questionId: UUID): Promise<EntityReadiness> {
  const { rows: [row] } = await query<QueryResultRow>(
    `SELECT lq.id,lq.public_code,lq.prompt,lq.prompt_hi,lq.explanation,lq.explanation_hi,
            lq.question_type::text,lq.negative_marks::float,lq.skill_code,lq.cognitive_skill::text,
            lq.licence::text,lq.source_url,lq.attribution_text,lcs.code AS source_code,
            COUNT(DISTINCT lqb.board_id)::int AS board_count,
            COUNT(DISTINCT lqc.concept_id)::int AS concept_count,
            COUNT(DISTINCT lqo.id)::int AS option_count,
            COUNT(DISTINCT lqo.id) FILTER(WHERE NULLIF(BTRIM(lqo.option_text_hi),'') IS NULL)::int AS missing_hindi_options
     FROM learning_questions lq
     JOIN learning_content_sources lcs ON lcs.id=lq.source_id
     LEFT JOIN learning_question_boards lqb ON lqb.question_id=lq.id
     LEFT JOIN learning_question_concepts lqc ON lqc.question_id=lq.id
     LEFT JOIN learning_question_options lqo ON lqo.question_id=lq.id
     WHERE lq.id=$1::uuid
     GROUP BY lq.id,lcs.id`,
    [questionId],
  );
  if (!row) throw appError('Learning question not found', 404);
  const objective = ['MCQ_SINGLE','MCQ_MULTIPLE','TRUE_FALSE'].includes(String(row.question_type));
  const original = row.source_code === 'VIDYASETU_ORIGINAL';
  const sourceReady = original || (truthyText(row.source_url) && truthyText(row.attribution_text) && row.licence !== 'OTHER');
  const checks: ReadinessCheck[] = [
    { code: 'PUBLIC_CODE', label: 'Stable question code', passed: truthyText(row.public_code), reason: 'Question requires a stable public code.', weight: 10 },
    { code: 'BILINGUAL_PROMPT', label: 'Bilingual prompt', passed: truthyText(row.prompt) && truthyText(row.prompt_hi), reason: 'English and Hindi question prompts are required.', weight: 15 },
    { code: 'BILINGUAL_EXPLANATION', label: 'Bilingual reasoning', passed: truthyText(row.explanation) && truthyText(row.explanation_hi), reason: 'English and Hindi answer explanations are required.', weight: 15 },
    { code: 'OBJECTIVE_OPTIONS', label: 'Bilingual answer options', passed: !objective || (Number(row.option_count) >= 2 && Number(row.missing_hindi_options) === 0), reason: 'Objective questions require at least two options and Hindi text for every option.', weight: 10 },
    { code: 'NO_NEGATIVE_LEARNING', label: 'No negative marks for learning practice', passed: Number(row.negative_marks) === 0, reason: 'Normal VidyaSetu learning questions cannot use negative marking.', weight: 10 },
    { code: 'CONCEPT_MAPPING', label: 'Canonical concept mapping', passed: Number(row.concept_count) > 0, reason: 'Question must map to at least one canonical concept.', weight: 15 },
    { code: 'SKILL_METADATA', label: 'Skill and cognitive demand', passed: truthyText(row.skill_code) && truthyText(row.cognitive_skill), reason: 'Question requires skill metadata and cognitive demand.', weight: 10 },
    { code: 'BOARD_MAPPING', label: 'Board mapping', passed: Number(row.board_count) > 0, reason: 'Question must map to at least one board/common curriculum.', weight: 5 },
    { code: 'SOURCE_LICENCE', label: 'Source and licence', passed: sourceReady, reason: 'External questions require verified source, attribution and licence.', weight: 10 },
  ];
  const gateMap = await loadGateMap('QUESTION', questionId);
  const gates = manualGates(gateMap, ['ACADEMIC_ACCURACY','AGE_APPROPRIATENESS','ENGLISH_QUALITY','HINDI_QUALITY','COPYRIGHT_LICENSING']);
  return buildReadiness('QUESTION', questionId, checks, gates);
}

function minimumAssessmentQuestions(type: string): number {
  if (type === 'MOCK') return 20;
  if (type === 'UNIT_TEST') return 15;
  if (type === 'DAILY') return 5;
  return 10;
}

export async function getAssessmentReadiness(assessmentId: UUID): Promise<EntityReadiness> {
  const { rows: [row] } = await query<QueryResultRow>(
    `SELECT la.id,la.public_slug,la.title,la.title_hi,la.assessment_type::text,la.visibility::text,
            COUNT(DISTINCT lab.board_id)::int AS board_count,
            COUNT(DISTINCT lac.concept_id)::int AS concept_count,
            COUNT(DISTINCT laq.question_id)::int AS question_count,
            COUNT(DISTINCT laq.question_id) FILTER(WHERE lq.review_status='PUBLISHED')::int AS published_question_count
     FROM learning_assessments la
     LEFT JOIN learning_assessment_boards lab ON lab.assessment_id=la.id
     LEFT JOIN learning_assessment_concepts lac ON lac.assessment_id=la.id
     LEFT JOIN learning_assessment_questions laq ON laq.assessment_id=la.id
     LEFT JOIN learning_questions lq ON lq.id=laq.question_id
     WHERE la.id=$1::uuid
     GROUP BY la.id`,
    [assessmentId],
  );
  if (!row) throw appError('Learning assessment not found', 404);
  const minimum = minimumAssessmentQuestions(String(row.assessment_type));
  const checks: ReadinessCheck[] = [
    { code: 'BILINGUAL_TITLE', label: 'Bilingual assessment title', passed: truthyText(row.title) && truthyText(row.title_hi), reason: 'Assessment requires English and Hindi titles.', weight: 15 },
    { code: 'CONCEPT_MAPPING', label: 'Canonical concept mapping', passed: Number(row.concept_count) > 0, reason: 'Assessment must map to at least one canonical concept.', weight: 20 },
    { code: 'BOARD_MAPPING', label: 'Board mapping', passed: Number(row.board_count) > 0, reason: 'Assessment must map to at least one board/common curriculum.', weight: 10 },
    { code: 'QUESTION_DEPTH', label: `Question depth (${minimum}+)`, passed: Number(row.question_count) >= minimum, reason: `${String(row.assessment_type).replaceAll('_', ' ')} requires at least ${minimum} questions.`, weight: 25 },
    { code: 'PUBLISHED_QUESTIONS', label: 'All questions learner-ready', passed: Number(row.question_count) > 0 && Number(row.published_question_count) === Number(row.question_count), reason: 'Every assessment question must be PUBLISHED before assessment publication.', weight: 20 },
    { code: 'STABLE_SLUG', label: 'Stable assessment slug', passed: truthyText(row.public_slug), reason: 'Assessment requires a stable public slug.', weight: 10 },
  ];
  const gateMap = await loadGateMap('ASSESSMENT', assessmentId);
  const gates = manualGates(gateMap, [
    'ACADEMIC_ACCURACY','AGE_APPROPRIATENESS','ENGLISH_QUALITY','HINDI_QUALITY',
    'LEARNING_OUTCOME_ALIGNMENT','PRACTICE_QUALITY','ACCESSIBILITY','TECHNICAL_READINESS',
  ]);
  return buildReadiness('ASSESSMENT', assessmentId, checks, gates);
}

export async function getConceptReadiness(conceptId: UUID): Promise<EntityReadiness> {
  const { rows: [row] } = await query<QueryResultRow>(
    `SELECT lc.id,lc.code,lc.name,lc.name_hi,lc.description,lc.description_hi,lc.learning_outcome,lc.learning_outcome_hi,
            lc.grade_id,lc.subject_id,lc.subject_code,lc.chapter_code,
            COUNT(DISTINCT lrc.resource_id) FILTER(WHERE lr.review_status='PUBLISHED')::int AS published_resources,
            COUNT(DISTINCT lrc.resource_id) FILTER(WHERE lr.review_status='PUBLISHED' AND NULLIF(BTRIM(lr.title_hi),'') IS NOT NULL)::int AS bilingual_resources,
            COUNT(DISTINCT lrc.resource_id) FILTER(WHERE lr.review_status='PUBLISHED' AND lr.resource_type='VIDEO')::int AS videos,
            COUNT(DISTINCT lrc.resource_id) FILTER(WHERE lr.review_status='PUBLISHED' AND lrc.journey_stage IN ('DO','APPLY'))::int AS practical_apply_resources,
            COUNT(DISTINCT lrc.resource_id) FILTER(WHERE lr.review_status='PUBLISHED' AND lrc.journey_stage='APPLY')::int AS apply_resources,
            COUNT(DISTINCT lrc.resource_id) FILTER(WHERE lr.review_status='PUBLISHED' AND lrc.journey_stage='REVISE')::int AS revision_resources,
            COUNT(DISTINCT lqc.question_id) FILTER(WHERE lq.review_status='PUBLISHED')::int AS published_questions,
            COUNT(DISTINCT lqc.question_id) FILTER(WHERE lq.review_status='PUBLISHED' AND lq.misconception_code IS NOT NULL)::int AS misconception_questions,
            COUNT(DISTINCT lac.assessment_id) FILTER(WHERE la.review_status='PUBLISHED')::int AS published_assessments,
            COUNT(DISTINCT lrb.board_id)::int AS board_mappings
     FROM learning_concepts lc
     LEFT JOIN learning_resource_concepts lrc ON lrc.concept_id=lc.id
     LEFT JOIN learning_resources lr ON lr.id=lrc.resource_id
     LEFT JOIN learning_resource_boards lrb ON lrb.resource_id=lr.id
     LEFT JOIN learning_question_concepts lqc ON lqc.concept_id=lc.id
     LEFT JOIN learning_questions lq ON lq.id=lqc.question_id
     LEFT JOIN learning_assessment_concepts lac ON lac.concept_id=lc.id
     LEFT JOIN learning_assessments la ON la.id=lac.assessment_id
     WHERE lc.id=$1::uuid
     GROUP BY lc.id`,
    [conceptId],
  );
  if (!row) throw appError('Learning concept not found', 404);
  const checks: ReadinessCheck[] = [
    { code: 'STRUCTURE_OUTCOME', label: 'Concept structure + bilingual outcomes', passed: truthyText(row.name) && truthyText(row.name_hi) && truthyText(row.learning_outcome) && truthyText(row.learning_outcome_hi), reason: 'Concept requires English/Hindi name and learning outcome.', weight: 10 },
    { code: 'ENGLISH_LESSON', label: 'English learner lesson', passed: Number(row.published_resources) > 0, reason: 'At least one published learner lesson is required.', weight: 10 },
    { code: 'HINDI_LESSON', label: 'Hindi learner lesson', passed: Number(row.bilingual_resources) > 0, reason: 'At least one published bilingual learner lesson is required.', weight: 10 },
    { code: 'CONCEPT_VIDEO', label: 'Concept video', passed: Number(row.videos) > 0, reason: 'Final published concept video is missing.', weight: 10 },
    { code: 'PRACTICAL_VISUAL', label: 'Practical / worked learning', passed: Number(row.practical_apply_resources) > 0, reason: 'A published DO/APPLY learning asset is required.', weight: 10 },
    { code: 'PRACTICE_BANK', label: '10+ bilingual practice questions', passed: Number(row.published_questions) >= 10, reason: 'Concept requires at least 10 published bilingual questions.', weight: 15 },
    { code: 'MISCONCEPTIONS', label: 'Misconception coverage', passed: Number(row.misconception_questions) >= 2, reason: 'At least two published misconception-diagnostic questions are required.', weight: 5 },
    { code: 'APPLICATION', label: 'Real-life / transfer application', passed: Number(row.apply_resources) > 0, reason: 'A published APPLY-stage resource is required.', weight: 5 },
    { code: 'REVISION', label: 'Revision resource', passed: Number(row.revision_resources) > 0, reason: 'A published REVISE-stage resource is required.', weight: 5 },
    { code: 'METADATA', label: 'Curriculum + board metadata', passed: Boolean(row.grade_id && row.subject_code) && Number(row.board_mappings) > 0, reason: 'Concept requires grade, subject and mapped board metadata.', weight: 5 },
    { code: 'MASTERY', label: 'Published assessment', passed: Number(row.published_assessments) > 0, reason: 'At least one published mapped assessment is required.', weight: 10 },
  ];
  const gateMap = await loadGateMap('CONCEPT', conceptId);
  const gates = manualGates(gateMap, ['ACADEMIC_ACCURACY','ENGLISH_QUALITY','HINDI_QUALITY','ACCESSIBILITY']);
  return buildReadiness('CONCEPT', conceptId, checks, gates);
}

export async function getEntityReadiness(entityTypeInput: string, entityId: UUID): Promise<EntityReadiness> {
  const entityType = normalizeEntityType(entityTypeInput);
  if (entityType === 'RESOURCE') return getResourceReadiness(entityId);
  if (entityType === 'QUESTION') return getQuestionReadiness(entityId);
  if (entityType === 'ASSESSMENT') return getAssessmentReadiness(entityId);
  return getConceptReadiness(entityId);
}

export async function setQualityGate(
  entityTypeInput: string,
  entityId: UUID,
  gateCodeInput: string,
  statusInput: string,
  reviewerId: UUID,
  note?: string | null,
) {
  const entityType = normalizeEntityType(entityTypeInput);
  const gateCode = normalizeGateCode(gateCodeInput);
  const status = normalizeGateStatus(statusInput);
  if (status === 'NOT_APPLICABLE' && !NA_ALLOWED.has(gateCode)) {
    throw appError(`${gateCode.replaceAll('_', ' ')} cannot be marked NOT_APPLICABLE.`);
  }
  // Make sure the referenced entity exists before recording an audit decision.
  await getEntityReadiness(entityType, entityId);
  const { rows: [row] } = await query(
    `INSERT INTO learning_quality_gate_reviews
       (entity_type,entity_id,gate_code,status,note,reviewer_id,reviewed_at)
     VALUES($1::learning_quality_entity_type,$2::uuid,$3,$4::learning_quality_gate_status,$5,$6::uuid,NOW())
     ON CONFLICT(entity_type,entity_id,gate_code) DO UPDATE SET
       status=EXCLUDED.status,note=EXCLUDED.note,reviewer_id=EXCLUDED.reviewer_id,reviewed_at=NOW(),updated_at=NOW()
     RETURNING entity_type,entity_id,gate_code,status,note,reviewer_id,reviewed_at`,
    [entityType, entityId, gateCode, status, note?.trim() || null, reviewerId],
  );
  return row;
}

export async function listConceptCoverage(filters: { classNumber?: number | null; subjectCode?: string | null } = {}) {
  const values: unknown[] = [];
  const conditions = ['lc.is_active=TRUE'];
  if (filters.classNumber) {
    values.push(filters.classNumber);
    conditions.push(`egl.class_number=$${values.length}`);
  }
  if (filters.subjectCode) {
    values.push(filters.subjectCode.toUpperCase());
    conditions.push(`lc.subject_code=$${values.length}`);
  }
  const { rows } = await query<QueryResultRow>(
    `SELECT lc.id,lc.code,lc.name,lc.name_hi,lc.node_type,lc.academic_year,lc.subject_code,lc.chapter_code,lc.chapter_title,
            lc.registry_status,lc.sequence,lc.learning_outcome,lc.learning_outcome_hi,
            egl.code AS grade_code,egl.name AS grade_name,egl.class_number,
            COALESCE(sub.name,lc.subject_code) AS subject_name
     FROM learning_concepts lc
     JOIN education_grade_levels egl ON egl.id=lc.grade_id
     LEFT JOIN subjects sub ON sub.id=lc.subject_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY egl.sort_order,lc.subject_code,lc.sequence,lc.code
     LIMIT 1000`,
    values,
  );
  const result = [];
  for (const row of rows) {
    const readiness = await getConceptReadiness(row.id as UUID);
    result.push({ ...row, readiness: {
      score: readiness.score,
      learnerReady: readiness.readyForPublication && readiness.score >= 90,
      blockers: readiness.blockers.slice(0, 6),
    } });
  }
  return result;
}

export async function getCoverageSummary(filters: { classNumber?: number | null; subjectCode?: string | null } = {}) {
  const concepts = await listConceptCoverage(filters);
  const total = concepts.length;
  const ready = concepts.filter((item) => item.readiness.learnerReady).length;
  const reviewReady = concepts.filter((item) => item.readiness.score >= 75).length;
  const bilingualOutcome = concepts.filter((item) => truthyText(item.learning_outcome) && truthyText(item.learning_outcome_hi)).length;
  const averageScore = total ? Math.round(concepts.reduce((sum, item) => sum + Number(item.readiness.score || 0), 0) / total) : 0;
  return { totalConcepts: total, learnerReadyConcepts: ready, reviewReadyConcepts: reviewReady, bilingualOutcomeConcepts: bilingualOutcome, averageCompletenessScore: averageScore, concepts };
}
