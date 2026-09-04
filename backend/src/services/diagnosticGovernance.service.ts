import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';

interface DiagnosticReadinessRow extends QueryResultRow {
  assessment_type: string;
  title: string;
  title_hi: string | null;
  question_count: number;
  published_question_count: number;
  difficulty_diversity: number;
  skill_diversity: number;
  misconception_question_count: number;
  concept_count: number;
}

export interface DiagnosticGovernanceReadiness {
  isDiagnostic: boolean;
  ready: boolean;
  blockers: string[];
  metrics: {
    questionCount: number;
    publishedQuestionCount: number;
    difficultyDiversity: number;
    skillDiversity: number;
    misconceptionQuestionCount: number;
    conceptCount: number;
  };
}

function appError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

export async function getDiagnosticGovernanceReadiness(assessmentId: UUID): Promise<DiagnosticGovernanceReadiness> {
  const { rows: [row] } = await query<DiagnosticReadinessRow>(
    `SELECT la.assessment_type::text,la.title,la.title_hi,
            COUNT(DISTINCT laq.question_id)::int AS question_count,
            COUNT(DISTINCT laq.question_id) FILTER(WHERE lq.review_status='PUBLISHED')::int AS published_question_count,
            COUNT(DISTINCT lq.difficulty)::int AS difficulty_diversity,
            COUNT(DISTINCT lq.cognitive_skill)::int AS skill_diversity,
            COUNT(DISTINCT laq.question_id) FILTER(WHERE NULLIF(BTRIM(lq.misconception_code),'') IS NOT NULL)::int AS misconception_question_count,
            COUNT(DISTINCT lac.concept_id)::int AS concept_count
     FROM learning_assessments la
     LEFT JOIN learning_assessment_questions laq ON laq.assessment_id=la.id
     LEFT JOIN learning_questions lq ON lq.id=laq.question_id
     LEFT JOIN learning_assessment_concepts lac ON lac.assessment_id=la.id
     WHERE la.id=$1
     GROUP BY la.id`,
    [assessmentId],
  );
  if (!row) throw appError('Learning assessment not found', 404);

  const metrics = {
    questionCount: Number(row.question_count || 0),
    publishedQuestionCount: Number(row.published_question_count || 0),
    difficultyDiversity: Number(row.difficulty_diversity || 0),
    skillDiversity: Number(row.skill_diversity || 0),
    misconceptionQuestionCount: Number(row.misconception_question_count || 0),
    conceptCount: Number(row.concept_count || 0),
  };
  if (row.assessment_type !== 'DIAGNOSTIC') {
    return { isDiagnostic: false, ready: true, blockers: [], metrics };
  }

  const blockers: string[] = [];
  if (!row.title?.trim() || !row.title_hi?.trim()) blockers.push('Diagnostic requires English and Hindi titles.');
  if (metrics.conceptCount < 1) blockers.push('Diagnostic must map to at least one canonical concept.');
  if (metrics.questionCount < 10) blockers.push('Diagnostic requires at least 10 evidence questions.');
  if (metrics.publishedQuestionCount !== metrics.questionCount) blockers.push('Every diagnostic question must already be PUBLISHED.');
  if (metrics.difficultyDiversity < 2) blockers.push('Diagnostic must span at least two difficulty levels.');
  if (metrics.skillDiversity < 2) blockers.push('Diagnostic must span at least two cognitive skills.');
  if (metrics.misconceptionQuestionCount < 2) blockers.push('Diagnostic requires at least two misconception-tagged questions.');

  return { isDiagnostic: true, ready: blockers.length === 0, blockers, metrics };
}

export async function assertDiagnosticGovernanceReady(assessmentId: UUID): Promise<void> {
  const readiness = await getDiagnosticGovernanceReadiness(assessmentId);
  if (readiness.isDiagnostic && !readiness.ready) {
    throw appError(`Diagnostic governance blocked approval/publication: ${readiness.blockers.join(' ')}`, 409);
  }
}
