import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';
import { getConceptReadiness } from './learningQuality.service';

interface GradeRow extends QueryResultRow {
  id: UUID;
  code: string;
  name: string;
  name_hi: string | null;
  short_name: string;
  stage: string;
  class_number: number | null;
  sort_order: number;
}

interface TargetRow extends QueryResultRow {
  id: UUID;
  grade_id: UUID;
  grade_code: string;
  grade_name: string;
  grade_name_hi: string | null;
  stage: string;
  subject_code: string;
  subject_name: string;
  subject_name_hi: string;
  area_type: string;
  priority: string;
  academic_year: string;
  board_code: string | null;
  target_status: string;
  expected_concepts: number | null;
  source_reference: string | null;
  notes: string | null;
}

interface ConceptRow extends QueryResultRow {
  id: UUID;
  code: string;
  name: string;
  name_hi: string | null;
  subject_code: string;
  chapter_code: string | null;
  chapter_title: string | null;
  learning_outcome: string | null;
  learning_outcome_hi: string | null;
  registry_status: string;
  sequence: number;
}

export interface UpdateContentTargetInput {
  targetStatus?: 'PLANNED' | 'REGISTRY_READY' | 'AUTHORING' | 'REVIEW_READY' | 'LEARNER_READY' | 'DEFERRED';
  expectedConcepts?: number | null;
  sourceReference?: string | null;
  notes?: string | null;
}

function appError(message: string, statusCode = 400): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

async function gradeByCode(code: string): Promise<GradeRow> {
  const { rows: [grade] } = await query<GradeRow>(
    `SELECT id,code,name,name_hi,short_name,stage,class_number,sort_order
     FROM education_grade_levels
     WHERE code=$1 AND is_active=TRUE`,
    [code.trim().toUpperCase()],
  );
  if (!grade) throw appError('Unknown or inactive grade code', 404);
  return grade;
}

export async function getContentFactorySummary() {
  const { rows } = await query(
    `SELECT egl.id,egl.code,egl.name,egl.name_hi,egl.short_name,egl.stage,egl.class_number,egl.sort_order,
            COUNT(DISTINCT lct.id)::int AS target_count,
            COUNT(DISTINCT lct.id) FILTER(WHERE lct.priority='CORE')::int AS core_target_count,
            COUNT(DISTINCT lct.id) FILTER(WHERE lct.target_status='LEARNER_READY')::int AS target_ready_count,
            COUNT(DISTINCT lc.id)::int AS concept_count,
            COUNT(DISTINCT lc.id) FILTER(
              WHERE NULLIF(BTRIM(lc.name_hi),'') IS NOT NULL
                AND NULLIF(BTRIM(lc.learning_outcome),'') IS NOT NULL
                AND NULLIF(BTRIM(lc.learning_outcome_hi),'') IS NOT NULL
            )::int AS bilingual_concept_count,
            COUNT(DISTINCT lrg.resource_id) FILTER(WHERE lr.review_status='PUBLISHED')::int AS published_resource_count,
            COUNT(DISTINCT lqg.question_id) FILTER(WHERE lq.review_status='PUBLISHED')::int AS published_question_count,
            COUNT(DISTINCT lag.assessment_id) FILTER(WHERE la.review_status='PUBLISHED')::int AS published_assessment_count
     FROM education_grade_levels egl
     LEFT JOIN learning_content_targets lct ON lct.grade_id=egl.id AND lct.board_id IS NULL
     LEFT JOIN learning_concepts lc ON lc.grade_id=egl.id AND lc.is_active=TRUE
     LEFT JOIN learning_resource_grades lrg ON lrg.grade_id=egl.id
     LEFT JOIN learning_resources lr ON lr.id=lrg.resource_id
     LEFT JOIN learning_question_grades lqg ON lqg.grade_id=egl.id
     LEFT JOIN learning_questions lq ON lq.id=lqg.question_id
     LEFT JOIN learning_assessment_grades lag ON lag.grade_id=egl.id
     LEFT JOIN learning_assessments la ON la.id=lag.assessment_id
     WHERE egl.is_active=TRUE
     GROUP BY egl.id
     ORDER BY egl.sort_order`,
  );

  const totals = rows.reduce((acc: Record<string, number>, row: any) => {
    acc.targets += Number(row.target_count || 0);
    acc.concepts += Number(row.concept_count || 0);
    acc.bilingualConcepts += Number(row.bilingual_concept_count || 0);
    acc.resources += Number(row.published_resource_count || 0);
    acc.questions += Number(row.published_question_count || 0);
    acc.assessments += Number(row.published_assessment_count || 0);
    return acc;
  }, { targets: 0, concepts: 0, bilingualConcepts: 0, resources: 0, questions: 0, assessments: 0 });

  return {
    contentLanguages: [
      { code: 'en', name: 'English', nameHi: 'अंग्रेज़ी' },
      { code: 'hi', name: 'Hindi', nameHi: 'हिंदी' },
    ],
    gradeCount: rows.length,
    totals,
    grades: rows,
    policy: {
      bilingualPublicationRequired: true,
      canonicalGradeMappingRequired: true,
      academicTruthSource: 'learning_concepts + versioned curriculum/board mappings',
      contentTargetPurpose: 'production planning denominator only',
    },
  };
}

export async function getContentFactoryGrade(gradeCode: string) {
  const grade = await gradeByCode(gradeCode);
  const { rows: targets } = await query<TargetRow>(
    `SELECT lct.id,lct.grade_id,egl.code AS grade_code,egl.name AS grade_name,egl.name_hi AS grade_name_hi,egl.stage,
            lct.subject_code,lct.subject_name,lct.subject_name_hi,lct.area_type,lct.priority,lct.academic_year,
            eb.code AS board_code,lct.target_status,lct.expected_concepts,lct.source_reference,lct.notes
     FROM learning_content_targets lct
     JOIN education_grade_levels egl ON egl.id=lct.grade_id
     LEFT JOIN education_boards eb ON eb.id=lct.board_id
     WHERE lct.grade_id=$1::uuid
     ORDER BY CASE lct.priority WHEN 'CORE' THEN 1 WHEN 'ELECTIVE' THEN 2 ELSE 3 END,lct.subject_name`,
    [grade.id],
  );
  const { rows: concepts } = await query<ConceptRow>(
    `SELECT id,code,name,name_hi,subject_code,chapter_code,chapter_title,learning_outcome,learning_outcome_hi,registry_status,sequence
     FROM learning_concepts
     WHERE grade_id=$1::uuid AND is_active=TRUE
     ORDER BY subject_code,sequence,code`,
    [grade.id],
  );

  const conceptReadiness = [] as Array<ConceptRow & { readiness: { score: number; learnerReady: boolean; blockers: string[] } }>;
  for (const concept of concepts) {
    const readiness = await getConceptReadiness(concept.id);
    conceptReadiness.push({
      ...concept,
      readiness: {
        score: readiness.score,
        learnerReady: readiness.readyForPublication && readiness.score >= 90,
        blockers: readiness.blockers.slice(0, 8),
      },
    });
  }

  const targetMetrics = targets.map((target) => {
    const subjectConcepts = conceptReadiness.filter((concept) => concept.subject_code === target.subject_code);
    const ready = subjectConcepts.filter((concept) => concept.readiness.learnerReady).length;
    const avg = subjectConcepts.length
      ? Math.round(subjectConcepts.reduce((sum, concept) => sum + concept.readiness.score, 0) / subjectConcepts.length)
      : 0;
    return {
      ...target,
      registeredConcepts: subjectConcepts.length,
      learnerReadyConcepts: ready,
      averageCompletenessScore: avg,
      gap: target.expected_concepts == null ? null : Math.max(Number(target.expected_concepts) - subjectConcepts.length, 0),
    };
  });

  return {
    grade,
    targets: targetMetrics,
    concepts: conceptReadiness,
    summary: {
      targetAreas: targets.length,
      registeredConcepts: conceptReadiness.length,
      learnerReadyConcepts: conceptReadiness.filter((concept) => concept.readiness.learnerReady).length,
      bilingualConcepts: conceptReadiness.filter((concept) => concept.name_hi?.trim() && concept.learning_outcome?.trim() && concept.learning_outcome_hi?.trim()).length,
      averageCompletenessScore: conceptReadiness.length
        ? Math.round(conceptReadiness.reduce((sum, concept) => sum + concept.readiness.score, 0) / conceptReadiness.length)
        : 0,
    },
  };
}

export async function updateContentTarget(targetId: UUID, input: UpdateContentTargetInput) {
  if (!Object.keys(input).length) throw appError('At least one target field is required');
  if (input.expectedConcepts != null && (!Number.isInteger(input.expectedConcepts) || input.expectedConcepts < 0 || input.expectedConcepts > 1000)) {
    throw appError('expectedConcepts must be an integer between 0 and 1000');
  }
  const { rows: [updated] } = await query(
    `UPDATE learning_content_targets
     SET target_status=COALESCE($2,target_status),
         expected_concepts=CASE WHEN $3::boolean THEN $4::int ELSE expected_concepts END,
         source_reference=CASE WHEN $5::boolean THEN $6 ELSE source_reference END,
         notes=CASE WHEN $7::boolean THEN $8 ELSE notes END,
         updated_at=NOW()
     WHERE id=$1::uuid
     RETURNING id,grade_id,subject_code,subject_name,subject_name_hi,area_type,priority,academic_year,target_status,
               expected_concepts,source_reference,notes,updated_at`,
    [
      targetId,
      input.targetStatus || null,
      Object.prototype.hasOwnProperty.call(input, 'expectedConcepts'), input.expectedConcepts ?? null,
      Object.prototype.hasOwnProperty.call(input, 'sourceReference'), input.sourceReference?.trim() || null,
      Object.prototype.hasOwnProperty.call(input, 'notes'), input.notes?.trim() || null,
    ],
  );
  if (!updated) throw appError('Content target not found', 404);
  return updated;
}
