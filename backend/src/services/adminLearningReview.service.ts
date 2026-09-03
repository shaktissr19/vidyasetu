import fs = require('fs');
import path = require('path');
import type { QueryResultRow } from 'pg';
import { query } from '../config/db';
import {
  FORCE_PRESSURE_PACK_ROOT,
  getForcePressurePackConfig,
  listForcePressurePackConfigs,
  type ContentPackConfig,
} from '../config/contentPackRegistry';

interface PackSequenceItem {
  order?: number;
  stage: string;
  assetId: string;
  type: string;
  titleEn: string;
  titleHi: string;
  durationSecs?: number;
  safetyLevel?: string;
  questionIds?: string[];
}

interface PackManifest {
  packId: string;
  version?: string;
  status: string;
  subject: string;
  theme?: string;
  concept: string;
  languages: string[];
  contentIdentity?: string[];
  learningOutcomes?: Array<{ id?: string; en: string; hi: string }>;
  sequence: PackSequenceItem[];
  publicationPolicy?: { autoPublish?: boolean; requiredReviews?: string[] };
}

interface QuestionBank {
  packId: string;
  questions: Array<{ publicCode: string }>;
}

interface ResourceRow extends QueryResultRow {
  id: string;
  public_slug: string;
  title: string;
  title_hi: string | null;
  summary: string | null;
  summary_hi: string | null;
  body_markdown: string | null;
  body_markdown_hi: string | null;
  resource_type: string;
  category: string;
  visibility: string;
  review_status: string;
  class_min: number | null;
  class_max: number | null;
  subject_label: string | null;
  topic_label: string | null;
  source_code: string;
  licence: string;
  board_codes: string[];
}

interface QuestionRow extends QueryResultRow {
  id: string;
  public_code: string;
  prompt: string;
  prompt_hi: string | null;
  question_type: string;
  difficulty: string;
  explanation: string | null;
  explanation_hi: string | null;
  correct_answer: unknown;
  marks: number;
  negative_marks: number;
  review_status: string;
  subject_label: string | null;
  topic_label: string | null;
  board_codes: string[];
  options: Array<{ key: string; text: string; textHi: string | null }>;
}

interface AssessmentRow extends QueryResultRow {
  id: string;
  public_slug: string;
  title: string;
  title_hi: string | null;
  summary: string | null;
  summary_hi: string | null;
  assessment_type: string;
  visibility: string;
  review_status: string;
  passing_pct: number;
  time_limit_mins: number | null;
  board_codes: string[];
  questions: Array<{ publicCode: string; order: number }>;
}

function notFound(message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode: 404 });
}

function readJson<T>(packDir: string, fileName: string): T {
  return JSON.parse(fs.readFileSync(path.join(packDir, fileName), 'utf8')) as T;
}

function packConfig(packKey: string): ContentPackConfig {
  try {
    return getForcePressurePackConfig(packKey);
  } catch {
    throw notFound(`Unsupported learning content pack: ${packKey}`);
  }
}

function uniqueStages(sequence: PackSequenceItem[]): string[] {
  return [...new Set(sequence.map((item) => item.stage).filter(Boolean))];
}

export function listSupportedContentPacks() {
  return listForcePressurePackConfigs().map(({ key, folder, resourceSlug }) => ({ key, folder, resourceSlug }));
}

export async function getContentPackReview(packKey: string) {
  const config = packConfig(packKey);
  const packDir = path.join(FORCE_PRESSURE_PACK_ROOT, config.folder);
  const manifest = readJson<PackManifest>(packDir, 'pack-manifest.json');
  const bank = readJson<QuestionBank>(packDir, 'question-bank.json');

  if (bank.packId !== manifest.packId) {
    throw new Error(`Question bank packId does not match manifest for ${config.key}`);
  }

  const questionCodes = bank.questions.map((question) => question.publicCode);
  const assessmentSlugs = [...config.assessmentSlugs];

  const [{ rows: resourceRows }, { rows: questionRows }, { rows: assessmentRows }] = await Promise.all([
    query<ResourceRow>(
      `SELECT lr.id,lr.public_slug,lr.title,lr.title_hi,lr.summary,lr.summary_hi,
              lr.body_markdown,lr.body_markdown_hi,lr.resource_type,lr.category,lr.visibility,
              lr.review_status,lr.class_min,lr.class_max,lr.subject_label,lr.topic_label,
              lcs.code AS source_code,lr.licence,
              COALESCE(ARRAY_AGG(DISTINCT eb.code) FILTER(WHERE eb.code IS NOT NULL),ARRAY[]::varchar[]) AS board_codes
       FROM learning_resources lr
       JOIN learning_content_sources lcs ON lcs.id=lr.source_id
       LEFT JOIN learning_resource_boards lrb ON lrb.resource_id=lr.id
       LEFT JOIN education_boards eb ON eb.id=lrb.board_id
       WHERE lr.public_slug=$1
       GROUP BY lr.id,lcs.id`,
      [config.resourceSlug],
    ),
    questionCodes.length
      ? query<QuestionRow>(
          `SELECT lq.id,lq.public_code,lq.prompt,lq.prompt_hi,lq.question_type,lq.difficulty,
                  lq.explanation,lq.explanation_hi,lq.correct_answer,lq.marks::float,lq.negative_marks::float,
                  lq.review_status,lq.subject_label,lq.topic_label,
                  COALESCE((
                    SELECT ARRAY_AGG(DISTINCT eb.code ORDER BY eb.code)
                    FROM learning_question_boards lqb
                    JOIN education_boards eb ON eb.id=lqb.board_id
                    WHERE lqb.question_id=lq.id
                  ),ARRAY[]::varchar[]) AS board_codes,
                  COALESCE((
                    SELECT JSON_AGG(JSON_BUILD_OBJECT(
                      'key',lqo.option_key,
                      'text',lqo.option_text,
                      'textHi',lqo.option_text_hi
                    ) ORDER BY lqo.sort_order)
                    FROM learning_question_options lqo
                    WHERE lqo.question_id=lq.id
                  ),'[]'::json) AS options
           FROM learning_questions lq
           WHERE lq.public_code=ANY($1::varchar[])
           ORDER BY ARRAY_POSITION($1::varchar[],lq.public_code)`,
          [questionCodes],
        )
      : Promise.resolve({ rows: [] as QuestionRow[] } as { rows: QuestionRow[] }),
    query<AssessmentRow>(
      `SELECT la.id,la.public_slug,la.title,la.title_hi,la.summary,la.summary_hi,
              la.assessment_type,la.visibility,la.review_status,la.passing_pct::float,
              la.time_limit_mins,
              COALESCE((
                SELECT ARRAY_AGG(DISTINCT eb.code ORDER BY eb.code)
                FROM learning_assessment_boards lab
                JOIN education_boards eb ON eb.id=lab.board_id
                WHERE lab.assessment_id=la.id
              ),ARRAY[]::varchar[]) AS board_codes,
              COALESCE((
                SELECT JSON_AGG(JSON_BUILD_OBJECT(
                  'publicCode',lq.public_code,
                  'order',laq.sort_order
                ) ORDER BY laq.sort_order)
                FROM learning_assessment_questions laq
                JOIN learning_questions lq ON lq.id=laq.question_id
                WHERE laq.assessment_id=la.id
              ),'[]'::json) AS questions
       FROM learning_assessments la
       WHERE la.public_slug=ANY($1::varchar[])
       ORDER BY ARRAY_POSITION($1::varchar[],la.public_slug)`,
      [assessmentSlugs],
    ),
  ]);

  const resource = resourceRows[0] || null;
  const assessmentBySlug = new Map(assessmentRows.map((assessment) => [assessment.public_slug, assessment]));
  const quizItems = manifest.sequence.filter((item) => item.type === 'QUIZ');
  const quizAssetToSlug = new Map<string, string>();
  quizItems.forEach((item, index) => {
    const slug = assessmentSlugs[index];
    if (slug) quizAssetToSlug.set(item.assetId, slug);
  });

  const hasProductionScripts = fs.existsSync(path.join(packDir, 'media-scripts.md'));
  const sequence = manifest.sequence.map((item, index) => {
    let implementationStatus: string;
    if (item.assetId === config.resourceAssetId) {
      implementationStatus = resource ? `STAGED_${resource.review_status}` : 'MISSING';
    } else if (item.type === 'QUIZ') {
      const slug = quizAssetToSlug.get(item.assetId);
      const assessment = slug ? assessmentBySlug.get(slug) : undefined;
      implementationStatus = assessment ? `STAGED_${assessment.review_status}` : 'MISSING';
    } else {
      implementationStatus = hasProductionScripts ? 'PRODUCTION_SCRIPT_READY' : 'AUTHORING_READY';
    }

    return {
      ...item,
      order: item.order ?? index + 1,
      implementationStatus,
    };
  });

  const allQuestionsPresent = questionRows.length === questionCodes.length;
  const allQuestionTextBilingual = allQuestionsPresent && questionRows.every((question) =>
    Boolean(question.prompt_hi?.trim() && question.explanation_hi?.trim()),
  );
  const allObjectiveOptionsBilingual = questionRows.every((question) =>
    question.options.length === 0 || question.options.every((option) => Boolean(option.textHi?.trim())),
  );

  return {
    packKey: config.key,
    supportedPacks: listSupportedContentPacks(),
    manifest: {
      packId: manifest.packId,
      version: manifest.version || 'unversioned',
      status: manifest.status,
      subject: manifest.subject,
      theme: manifest.theme || 'Force and Pressure',
      concept: manifest.concept,
      languages: manifest.languages,
      contentIdentity: manifest.contentIdentity?.length ? manifest.contentIdentity : uniqueStages(manifest.sequence),
      learningOutcomes: manifest.learningOutcomes || [],
      requiredReviews: manifest.publicationPolicy?.requiredReviews || [],
      publicationPolicyDeclared: Boolean(manifest.publicationPolicy),
    },
    resource,
    questions: questionRows,
    assessments: assessmentRows,
    sequence,
    completeness: {
      resourceCount: resource ? 1 : 0,
      expectedResourceCount: 1,
      questionCount: questionRows.length,
      expectedQuestionCount: questionCodes.length,
      assessmentCount: assessmentRows.length,
      expectedAssessmentCount: assessmentSlugs.length,
      allBilingual:
        Boolean(resource?.title_hi && resource?.body_markdown_hi) &&
        allQuestionTextBilingual &&
        allObjectiveOptionsBilingual,
      allDraft:
        (!resource || resource.review_status === 'DRAFT') &&
        questionRows.every((question) => question.review_status === 'DRAFT') &&
        assessmentRows.every((assessment) => assessment.review_status === 'DRAFT'),
      noNegativeMarking: questionRows.every((question) => Number(question.negative_marks) === 0),
      mediaBinariesReady: false,
      note: hasProductionScripts
        ? 'Production scripts/specifications exist for non-database media assets, but final video, practical-video, worksheet and audio binaries are not attached yet.'
        : 'Final media binaries are not attached and this pack does not currently expose a media-scripts.md production specification.',
    },
  };
}

export async function getPressurePackReview() {
  return getContentPackReview('pressure');
}
