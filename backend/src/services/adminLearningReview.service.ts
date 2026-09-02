import fs = require('fs');
import path = require('path');
import type { QueryResultRow } from 'pg';
import { query } from '../config/db';

interface PackSequenceItem {
  order: number;
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
  version: string;
  status: string;
  subject: string;
  theme: string;
  concept: string;
  languages: string[];
  contentIdentity: string[];
  learningOutcomes: Array<{ id: string; en: string; hi: string }>;
  sequence: PackSequenceItem[];
  publicationPolicy?: { autoPublish?: boolean; requiredReviews?: string[] };
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

const PACK_DIR = path.resolve(
  __dirname,
  '../../../content/class-8/science/force-and-pressure/pressure',
);

function readManifest(): PackManifest {
  return JSON.parse(fs.readFileSync(path.join(PACK_DIR, 'pack-manifest.json'), 'utf8')) as PackManifest;
}

export async function getPressurePackReview() {
  const manifest = readManifest();

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
       WHERE lr.public_slug='class-8-science-pressure-v1'
       GROUP BY lr.id,lcs.id`,
    ),
    query<QuestionRow>(
      `SELECT lq.id,lq.public_code,lq.prompt,lq.prompt_hi,lq.question_type,lq.difficulty,
              lq.explanation,lq.explanation_hi,lq.correct_answer,lq.marks::float,lq.review_status,
              lq.subject_label,lq.topic_label,
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
       WHERE lq.public_code LIKE 'VS8S-PRES-%'
       ORDER BY lq.public_code`,
    ),
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
       WHERE la.public_slug IN (
         'class-8-science-pressure-practice-v1',
         'class-8-science-pressure-mastery-v1'
       )
       ORDER BY la.public_slug`,
    ),
  ]);

  const resource = resourceRows[0] || null;
  const stagedTypes = new Set<string>();
  if (resource) stagedTypes.add(resource.resource_type);
  if (assessmentRows.length) stagedTypes.add('QUIZ');

  const sequence = manifest.sequence.map((item) => ({
    ...item,
    implementationStatus:
      item.type === 'ARTICLE' && item.assetId === 'VS-PRESSURE-ARTICLE-01'
        ? (resource ? 'STAGED_DRAFT' : 'MISSING')
        : item.type === 'QUIZ'
          ? (assessmentRows.some((assessment) =>
              assessment.public_slug.includes(item.assetId === 'VS-PRESSURE-MASTERY-01' ? 'mastery' : 'practice'))
              ? 'STAGED_DRAFT'
              : 'MISSING')
          : 'PRODUCTION_SCRIPT_READY',
  }));

  return {
    manifest: {
      packId: manifest.packId,
      version: manifest.version,
      status: manifest.status,
      subject: manifest.subject,
      theme: manifest.theme,
      concept: manifest.concept,
      languages: manifest.languages,
      contentIdentity: manifest.contentIdentity,
      learningOutcomes: manifest.learningOutcomes,
      requiredReviews: manifest.publicationPolicy?.requiredReviews || [],
    },
    resource,
    questions: questionRows,
    assessments: assessmentRows,
    sequence,
    completeness: {
      resourceCount: resource ? 1 : 0,
      questionCount: questionRows.length,
      assessmentCount: assessmentRows.length,
      allBilingual:
        Boolean(resource?.title_hi && resource?.body_markdown_hi) &&
        questionRows.length === 12 &&
        questionRows.every((question) => Boolean(question.prompt_hi && question.explanation_hi)),
      allDraft:
        (!resource || resource.review_status === 'DRAFT') &&
        questionRows.every((question) => question.review_status === 'DRAFT') &&
        assessmentRows.every((assessment) => assessment.review_status === 'DRAFT'),
      mediaBinariesReady: false,
      note: 'Video, practical-video, worksheet and audio production scripts exist in the pack, but final media binaries are not attached yet.',
    },
  };
}
