import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';
import {
  getStudentConceptMastery,
  type StudentConceptMastery,
} from './studentConceptMastery.service';

export type AdaptiveActionType =
  | 'CONTINUE_RESOURCE'
  | 'REVIEW_RESOURCE'
  | 'PRACTICE'
  | 'MASTERY_CHECK'
  | 'START_NEXT_CONCEPT';

export type AdaptiveUrgency = 'HIGH' | 'FOCUS' | 'NEXT';

export interface AdaptiveLearningTarget {
  kind: 'RESOURCE' | 'ASSESSMENT';
  id: UUID;
  publicSlug: string | null;
  title: string;
  summary: string | null;
  resourceType?: string | null;
  assessmentType?: string | null;
  evidenceRole?: 'PRACTICE' | 'MASTERY' | null;
  progressPct?: number | null;
  questionCount?: number | null;
  passingPct?: number | null;
  lastPercentage?: number | null;
}

export interface AdaptiveLearningAction {
  id: string;
  rank: number;
  urgency: AdaptiveUrgency;
  actionType: AdaptiveActionType;
  conceptId: UUID;
  conceptCode: string;
  conceptName: string;
  subjectCode: string;
  subjectName: string | null;
  chapterTitle: string | null;
  state: StudentConceptMastery['state'];
  title: string;
  reason: string;
  estimatedMinutes: number;
  target: AdaptiveLearningTarget;
}

export interface AdaptiveLearningPlan {
  generatedAt: string;
  headline: string;
  summary: {
    learning: number;
    practising: number;
    needsReview: number;
    mastered: number;
    nextActions: number;
    estimatedMinutes: number;
  };
  actions: AdaptiveLearningAction[];
}

interface StudentContextRow extends QueryResultRow {
  student_id: UUID;
  grade_level: string;
  grade_code: string | null;
  class_name: string | null;
  board_code: string | null;
}

interface ResourceAssetRow extends QueryResultRow {
  concept_id: UUID;
  id: UUID;
  public_slug: string | null;
  title: string;
  summary: string | null;
  resource_type: string;
  progress_pct: number | string;
  is_completed: boolean;
}

interface AssessmentAssetRow extends QueryResultRow {
  concept_id: UUID;
  id: UUID;
  public_slug: string | null;
  title: string;
  summary: string | null;
  assessment_type: string;
  evidence_role: 'PRACTICE' | 'MASTERY';
  passing_pct: number | string;
  question_count: number;
  last_percentage: number | string | null;
}

interface ConceptCandidateRow extends QueryResultRow {
  concept_id: UUID;
  code: string;
  name: string;
  subject_code: string;
  subject_name: string | null;
  chapter_title: string | null;
}

function appError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function canonicalGradeCode(ctx: StudentContextRow): string {
  if (ctx.grade_code) return ctx.grade_code;
  const raw = String(ctx.class_name || ctx.grade_level || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (['PN', 'PRENURSERY', 'PRE_NURSERY'].includes(raw)) return 'PRE_NURSERY';
  if (raw === 'NURSERY') return 'NURSERY';
  if (['LKG', 'LOWER_KG', 'LOWER_KINDERGARTEN'].includes(raw)) return 'LKG';
  if (['UKG', 'UPPER_KG', 'UPPER_KINDERGARTEN'].includes(raw)) return 'UKG';
  const numeric = raw.match(/^(?:CLASS_)?(\d{1,2})$/);
  if (numeric) {
    const value = Number.parseInt(numeric[1], 10);
    if (value >= 1 && value <= 12) return `CLASS_${value}`;
  }
  throw appError('Student grade is not supported by adaptive learning', 409);
}

function gradeNumber(gradeCode: string): number | null {
  const match = gradeCode.match(/^CLASS_(\d{1,2})$/);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return value >= 1 && value <= 12 ? value : null;
}

async function getStudentContext(userId: UUID): Promise<StudentContextRow> {
  const { rows: [student] } = await query<StudentContextRow>(
    `SELECT s.id AS student_id,s.grade_level,s.grade_code,sc.class_name,eb.code AS board_code
     FROM students s
     LEFT JOIN school_classes sc ON sc.id=s.class_id
     LEFT JOIN schools sch ON sch.id=s.school_id
     LEFT JOIN education_boards eb ON eb.id=sch.board_id
     WHERE s.user_id=$1 AND s.status='ACTIVE'`,
    [userId],
  );
  if (!student) throw appError('Student profile not found', 404);
  return student;
}

function resourceScopeSql(boardParam: number, gradeCodeParam: number, classParam: number): string {
  return `
    (
      EXISTS (
        SELECT 1
        FROM learning_resource_grades lrg
        JOIN education_grade_levels egl ON egl.id=lrg.grade_id
        WHERE lrg.resource_id=lr.id AND egl.code=$${gradeCodeParam}
      )
      OR (
        NOT EXISTS (SELECT 1 FROM learning_resource_grades lrg0 WHERE lrg0.resource_id=lr.id)
        AND (
          ($${classParam}::int IS NULL AND lr.class_min IS NULL AND lr.class_max IS NULL)
          OR (
            $${classParam}::int IS NOT NULL
            AND (lr.class_min IS NULL OR lr.class_min <= $${classParam})
            AND (lr.class_max IS NULL OR lr.class_max >= $${classParam})
          )
        )
      )
    )
    AND EXISTS (
      SELECT 1 FROM learning_resource_boards lrb
      JOIN education_boards eb ON eb.id=lrb.board_id
      WHERE lrb.resource_id=lr.id AND (eb.code='COMMON' OR eb.code=$${boardParam})
    )`;
}

function assessmentScopeSql(boardParam: number, classParam: number): string {
  return `
    $${classParam}::int IS NOT NULL
    AND (la.class_min IS NULL OR la.class_min <= $${classParam})
    AND (la.class_max IS NULL OR la.class_max >= $${classParam})
    AND EXISTS (
      SELECT 1 FROM learning_assessment_boards lab
      JOIN education_boards eb ON eb.id=lab.board_id
      WHERE lab.assessment_id=la.id AND (eb.code='COMMON' OR eb.code=$${boardParam})
    )`;
}

async function loadAssets(
  studentId: UUID,
  conceptIds: UUID[],
  board: string,
  gradeCode: string,
  grade: number | null,
): Promise<{ resources: Map<UUID, ResourceAssetRow[]>; assessments: Map<UUID, AssessmentAssetRow[]> }> {
  const resources = new Map<UUID, ResourceAssetRow[]>();
  const assessments = new Map<UUID, AssessmentAssetRow[]>();
  if (conceptIds.length === 0) return { resources, assessments };

  const [resourceRows, assessmentRows] = await Promise.all([
    query<ResourceAssetRow>(
      `SELECT lrc.concept_id,lr.id,lr.public_slug,lr.title,lr.summary,lr.resource_type,
              COALESCE(slrp.progress_pct,0)::float AS progress_pct,
              COALESCE(slrp.is_completed,FALSE) AS is_completed
       FROM learning_resource_concepts lrc
       JOIN learning_resources lr ON lr.id=lrc.resource_id
       LEFT JOIN student_learning_resource_progress slrp
         ON slrp.resource_id=lr.id AND slrp.student_id=$1
       WHERE lrc.concept_id=ANY($2::uuid[])
         AND lr.review_status='PUBLISHED'
         AND lr.visibility IN ('PUBLIC','REGISTERED','CLASS_ONLY')
         AND ${resourceScopeSql(3, 4, 5)}
       ORDER BY lrc.concept_id,
                COALESCE(slrp.is_completed,FALSE) ASC,
                (COALESCE(slrp.progress_pct,0) > 0) DESC,
                COALESCE(slrp.progress_pct,0) DESC,
                lr.is_featured_public DESC,
                lr.published_at DESC NULLS LAST`,
      [studentId, conceptIds, board, gradeCode, grade],
    ),
    query<AssessmentAssetRow>(
      `SELECT lac.concept_id,la.id,la.public_slug,la.title,la.summary,la.assessment_type,
              lac.evidence_role,la.passing_pct::float,
              COUNT(laq.question_id)::int AS question_count,
              (SELECT sla.percentage::float
               FROM student_learning_attempts sla
               WHERE sla.student_id=$1 AND sla.assessment_id=la.id AND sla.status='GRADED'
               ORDER BY sla.submitted_at DESC NULLS LAST LIMIT 1) AS last_percentage
       FROM learning_assessment_concepts lac
       JOIN learning_assessments la ON la.id=lac.assessment_id
       LEFT JOIN learning_assessment_questions laq ON laq.assessment_id=la.id
       WHERE lac.concept_id=ANY($2::uuid[])
         AND la.review_status='PUBLISHED'
         AND la.visibility IN ('PUBLIC','REGISTERED','CLASS_ONLY')
         AND ${assessmentScopeSql(3, 4)}
       GROUP BY lac.concept_id,la.id,lac.evidence_role
       HAVING COUNT(laq.question_id) > 0
       ORDER BY lac.concept_id,
                CASE lac.evidence_role WHEN 'PRACTICE' THEN 0 ELSE 1 END,
                la.published_at DESC NULLS LAST`,
      [studentId, conceptIds, board, grade],
    ),
  ]);

  for (const row of resourceRows.rows) {
    const list = resources.get(row.concept_id) || [];
    list.push(row);
    resources.set(row.concept_id, list);
  }
  for (const row of assessmentRows.rows) {
    const list = assessments.get(row.concept_id) || [];
    list.push(row);
    assessments.set(row.concept_id, list);
  }
  return { resources, assessments };
}

function resourceTarget(row: ResourceAssetRow): AdaptiveLearningTarget {
  return {
    kind: 'RESOURCE',
    id: row.id,
    publicSlug: row.public_slug,
    title: row.title,
    summary: row.summary,
    resourceType: row.resource_type,
    progressPct: Number(row.progress_pct || 0),
  };
}

function assessmentTarget(row: AssessmentAssetRow): AdaptiveLearningTarget {
  return {
    kind: 'ASSESSMENT',
    id: row.id,
    publicSlug: row.public_slug,
    title: row.title,
    summary: row.summary,
    assessmentType: row.assessment_type,
    evidenceRole: row.evidence_role,
    questionCount: Number(row.question_count || 0),
    passingPct: Number(row.passing_pct || 0),
    lastPercentage: row.last_percentage == null ? null : Number(row.last_percentage),
  };
}

function actionForConcept(
  concept: StudentConceptMastery,
  resources: ResourceAssetRow[],
  assessments: AssessmentAssetRow[],
): Omit<AdaptiveLearningAction, 'rank'> | null {
  const incompleteResource = resources.find((item) => !item.is_completed) || resources[0];
  const practice = assessments.find((item) => item.evidence_role === 'PRACTICE');
  const mastery = assessments.find((item) => item.evidence_role === 'MASTERY');

  const base = {
    conceptId: concept.conceptId,
    conceptCode: concept.code,
    conceptName: concept.name,
    subjectCode: concept.subjectCode,
    subjectName: concept.subjectName,
    chapterTitle: concept.chapterTitle,
    state: concept.state,
  };

  if (concept.state === 'NEEDS_REVIEW') {
    if (incompleteResource) {
      return {
        ...base,
        id: `${concept.code}:review:${incompleteResource.id}`,
        urgency: 'HIGH',
        actionType: 'REVIEW_RESOURCE',
        title: `Review ${concept.name}`,
        reason: 'Your recent practice shows this concept needs another pass. Review the mapped lesson before trying again.',
        estimatedMinutes: 12,
        target: resourceTarget(incompleteResource),
      };
    }
    if (practice) {
      return {
        ...base,
        id: `${concept.code}:practice:${practice.id}`,
        urgency: 'HIGH',
        actionType: 'PRACTICE',
        title: `Retry practice for ${concept.name}`,
        reason: 'A focused retry is the fastest available way to repair the gaps detected in your recent attempt.',
        estimatedMinutes: 10,
        target: assessmentTarget(practice),
      };
    }
    if (mastery) {
      return {
        ...base,
        id: `${concept.code}:mastery:${mastery.id}`,
        urgency: 'HIGH',
        actionType: 'MASTERY_CHECK',
        title: `Recheck ${concept.name}`,
        reason: 'This concept still needs evidence of mastery. Use the available mastery check when you are ready.',
        estimatedMinutes: 12,
        target: assessmentTarget(mastery),
      };
    }
  }

  if (concept.state === 'PRACTISING') {
    if (mastery) {
      return {
        ...base,
        id: `${concept.code}:mastery:${mastery.id}`,
        urgency: 'FOCUS',
        actionType: 'MASTERY_CHECK',
        title: `Prove mastery of ${concept.name}`,
        reason: 'Your practice evidence is strong enough to move to the mastery check.',
        estimatedMinutes: 12,
        target: assessmentTarget(mastery),
      };
    }
    if (practice) {
      return {
        ...base,
        id: `${concept.code}:practice:${practice.id}`,
        urgency: 'FOCUS',
        actionType: 'PRACTICE',
        title: `Keep practising ${concept.name}`,
        reason: 'Continue with focused practice until a mastery check is available.',
        estimatedMinutes: 10,
        target: assessmentTarget(practice),
      };
    }
  }

  if (concept.state === 'LEARNING') {
    if (incompleteResource) {
      return {
        ...base,
        id: `${concept.code}:continue:${incompleteResource.id}`,
        urgency: 'FOCUS',
        actionType: 'CONTINUE_RESOURCE',
        title: `Continue ${concept.name}`,
        reason: `You have started this concept. Continue the mapped lesson from about ${Math.round(Number(incompleteResource.progress_pct || 0))}% progress.`,
        estimatedMinutes: 12,
        target: resourceTarget(incompleteResource),
      };
    }
    if (practice) {
      return {
        ...base,
        id: `${concept.code}:practice:${practice.id}`,
        urgency: 'FOCUS',
        actionType: 'PRACTICE',
        title: `Practise ${concept.name}`,
        reason: 'The learning resource is complete. Use practice now to check understanding before mastery.',
        estimatedMinutes: 10,
        target: assessmentTarget(practice),
      };
    }
  }

  return null;
}

async function nextConceptCandidate(
  studentId: UUID,
  gradeCode: string,
): Promise<ConceptCandidateRow | null> {
  const { rows: [row] } = await query<ConceptCandidateRow>(
    `SELECT lc.id AS concept_id,lc.code,lc.name,lc.subject_code,
            sub.name AS subject_name,lc.chapter_title
     FROM learning_concepts lc
     JOIN education_grade_levels egl ON egl.id=lc.grade_id
     LEFT JOIN subjects sub ON sub.id=lc.subject_id
     WHERE egl.code=$2 AND lc.is_active=TRUE
       AND NOT EXISTS (
         SELECT 1 FROM student_concept_progress scp
         WHERE scp.student_id=$1 AND scp.concept_id=lc.id
       )
       AND (
         EXISTS (
           SELECT 1 FROM learning_resource_concepts lrc
           JOIN learning_resources lr ON lr.id=lrc.resource_id
           WHERE lrc.concept_id=lc.id AND lr.review_status='PUBLISHED'
         )
         OR EXISTS (
           SELECT 1 FROM learning_assessment_concepts lac
           JOIN learning_assessments la ON la.id=lac.assessment_id
           WHERE lac.concept_id=lc.id AND la.review_status='PUBLISHED'
         )
       )
     ORDER BY lc.sequence,lc.code
     LIMIT 1`,
    [studentId, gradeCode],
  );
  return row || null;
}

function planHeadline(actions: AdaptiveLearningAction[]): string {
  const first = actions[0];
  if (!first) return 'You are caught up. New mapped learning steps will appear here as they become available.';
  if (first.urgency === 'HIGH') return 'Repair the weakest concept first, then continue your learning path.';
  if (first.actionType === 'MASTERY_CHECK') return 'You are ready to turn practice into verified mastery.';
  if (first.actionType === 'START_NEXT_CONCEPT') return 'Your current mapped work is on track. Start the next concept when ready.';
  return 'Continue from the strongest next step based on your actual learning evidence.';
}

export async function getAdaptiveLearningPlan(
  userId: UUID,
  conceptMasteryInput?: StudentConceptMastery[],
): Promise<AdaptiveLearningPlan> {
  const student = await getStudentContext(userId);
  const gradeCode = canonicalGradeCode(student);
  const grade = gradeNumber(gradeCode);
  const board = student.board_code || 'COMMON';
  const conceptMastery = conceptMasteryInput || await getStudentConceptMastery(userId);

  const priorityConcepts = conceptMastery
    .filter((item) => item.state !== 'MASTERED' && item.state !== 'NOT_STARTED')
    .sort((a, b) => {
      const weight = (state: string) => state === 'NEEDS_REVIEW' ? 0 : state === 'PRACTISING' ? 1 : 2;
      const difference = weight(a.state) - weight(b.state);
      if (difference !== 0) return difference;
      return Number(a.masteryPct ?? a.practiceBestPct ?? a.resourceCompletionPct ?? 0)
        - Number(b.masteryPct ?? b.practiceBestPct ?? b.resourceCompletionPct ?? 0);
    })
    .slice(0, 8);

  const assets = await loadAssets(
    student.student_id,
    priorityConcepts.map((item) => item.conceptId),
    board,
    gradeCode,
    grade,
  );

  const actions: AdaptiveLearningAction[] = [];
  for (const concept of priorityConcepts) {
    const action = actionForConcept(
      concept,
      assets.resources.get(concept.conceptId) || [],
      assets.assessments.get(concept.conceptId) || [],
    );
    if (action) actions.push({ ...action, rank: actions.length + 1 });
    if (actions.length >= 4) break;
  }

  if (actions.length < 4) {
    const next = await nextConceptCandidate(student.student_id, gradeCode);
    if (next) {
      const nextAssets = await loadAssets(student.student_id, [next.concept_id], board, gradeCode, grade);
      const resource = (nextAssets.resources.get(next.concept_id) || [])[0];
      const practice = (nextAssets.assessments.get(next.concept_id) || []).find((item) => item.evidence_role === 'PRACTICE');
      const target = resource ? resourceTarget(resource) : practice ? assessmentTarget(practice) : null;
      if (target) {
        actions.push({
          id: `${next.code}:next:${target.id}`,
          rank: actions.length + 1,
          urgency: 'NEXT',
          actionType: 'START_NEXT_CONCEPT',
          conceptId: next.concept_id,
          conceptCode: next.code,
          conceptName: next.name,
          subjectCode: next.subject_code,
          subjectName: next.subject_name,
          chapterTitle: next.chapter_title,
          state: 'NOT_STARTED',
          title: `Start ${next.name}`,
          reason: 'This is the next mapped concept available for your grade after your current priority work.',
          estimatedMinutes: target.kind === 'RESOURCE' ? 12 : 10,
          target,
        });
      }
    }
  }

  const summary = {
    learning: conceptMastery.filter((item) => item.state === 'LEARNING').length,
    practising: conceptMastery.filter((item) => item.state === 'PRACTISING').length,
    needsReview: conceptMastery.filter((item) => item.state === 'NEEDS_REVIEW').length,
    mastered: conceptMastery.filter((item) => item.state === 'MASTERED').length,
    nextActions: actions.length,
    estimatedMinutes: actions.reduce((total, item) => total + item.estimatedMinutes, 0),
  };

  return {
    generatedAt: new Date().toISOString(),
    headline: planHeadline(actions),
    summary,
    actions,
  };
}
