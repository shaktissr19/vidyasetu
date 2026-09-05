import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';
import type {
  AdaptiveLearningAction,
  AdaptiveLearningPlan,
  AdaptiveLearningTarget,
} from './studentAdaptiveLearning.service';
import { getStudentDiagnosticProfile } from './studentDiagnosticIntelligence.service';
import { reconcileMissingEvidenceForUser } from './studentDiagnosticRuntime.service';

type StudentDiagnosticProfile = Awaited<ReturnType<typeof getStudentDiagnosticProfile>>;
type DiagnosticConcept = StudentDiagnosticProfile['concepts'][number];

export type DiagnosticAdaptiveActionType =
  | AdaptiveLearningAction['actionType']
  | 'QUICK_DIAGNOSTIC'
  | 'REPAIR_MISCONCEPTION'
  | 'SPACED_REVIEW'
  | 'REVIEW_PREREQUISITE';

export interface DiagnosticAdaptiveAction extends Omit<AdaptiveLearningAction, 'actionType'> {
  actionType: DiagnosticAdaptiveActionType;
  diagnostic?: {
    proficiencyScore: number;
    confidenceScore: number;
    confidenceLevel: string;
    retentionStatus: string;
    misconceptionCode?: string | null;
  };
}

export interface DiagnosticAdaptivePlan extends Omit<AdaptiveLearningPlan, 'actions' | 'summary'> {
  summary: AdaptiveLearningPlan['summary'] & {
    reviewDue: number;
    activeMisconceptions: number;
    lowConfidence: number;
  };
  actions: DiagnosticAdaptiveAction[];
}

interface StudentContextRow extends QueryResultRow {
  student_id: UUID;
  grade_level: string;
  grade_code: string | null;
  class_name: string | null;
}

interface TargetRow extends QueryResultRow {
  id: UUID;
  public_slug: string | null;
  title: string;
  summary: string | null;
  item_type: 'RESOURCE' | 'ASSESSMENT';
  resource_type: string | null;
  assessment_type: string | null;
  evidence_role: 'DIAGNOSTIC' | 'PRACTICE' | 'MASTERY' | null;
  question_count: number | null;
}

interface PrerequisiteRow extends QueryResultRow {
  concept_id: UUID;
  concept_code: string;
  concept_name: string;
  subject_code: string;
  subject_name: string | null;
  chapter_title: string | null;
  proficiency_score: number | string | null;
  confidence_score: number | string | null;
  confidence_level: string | null;
}

function gradeNumber(ctx: StudentContextRow): number | null {
  const raw = String(ctx.grade_code || ctx.class_name || ctx.grade_level || '').toUpperCase();
  const match = raw.match(/(?:CLASS_)?(\d{1,2})/);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return value >= 1 && value <= 12 ? value : null;
}

async function getStudentContext(userId: UUID): Promise<StudentContextRow> {
  const { rows: [row] } = await query<StudentContextRow>(
    `SELECT s.id AS student_id,s.grade_level,s.grade_code,sc.class_name
     FROM students s LEFT JOIN school_classes sc ON sc.id=s.class_id
     WHERE s.user_id=$1 AND s.status='ACTIVE'`,
    [userId],
  );
  if (!row) throw Object.assign(new Error('Student profile not found'), { statusCode: 404 });
  return row;
}

function rowTarget(row: TargetRow): AdaptiveLearningTarget {
  return {
    kind: row.item_type,
    id: row.id,
    publicSlug: row.public_slug,
    title: row.title,
    summary: row.summary,
    resourceType: row.resource_type,
    assessmentType: row.assessment_type,
    evidenceRole: row.evidence_role === 'DIAGNOSTIC' ? null : row.evidence_role,
    questionCount: row.question_count,
  };
}

async function bestTargetForConcept(
  conceptId: UUID,
  classNumber: number | null,
  preference: 'DIAGNOSTIC' | 'REPAIR' | 'REVIEW',
): Promise<TargetRow | null> {
  const { rows: [row] } = await query<TargetRow>(
    `WITH candidates AS (
       SELECT la.id,la.public_slug,la.title,la.summary,'ASSESSMENT'::text AS item_type,
              NULL::text AS resource_type,la.assessment_type::text AS assessment_type,
              lac.evidence_role,COUNT(laq.question_id)::int AS question_count,
              CASE
                WHEN $3='DIAGNOSTIC' AND (la.assessment_type::text='DIAGNOSTIC' OR lac.evidence_role='DIAGNOSTIC') THEN 0
                WHEN $3='REVIEW' AND lac.evidence_role='PRACTICE' THEN 1
                WHEN $3='REPAIR' AND lac.evidence_role='PRACTICE' THEN 1
                WHEN lac.evidence_role='MASTERY' THEN 4 ELSE 3 END AS priority
       FROM learning_assessment_concepts lac
       JOIN learning_assessments la ON la.id=lac.assessment_id
       LEFT JOIN learning_assessment_questions laq ON laq.assessment_id=la.id
       WHERE lac.concept_id=$1 AND la.review_status='PUBLISHED'
         AND la.visibility IN ('PUBLIC','REGISTERED','CLASS_ONLY')
         AND ($2::int IS NULL OR ((la.class_min IS NULL OR la.class_min <= $2) AND (la.class_max IS NULL OR la.class_max >= $2)))
       GROUP BY la.id,lac.evidence_role
       UNION ALL
       SELECT lr.id,lr.public_slug,lr.title,lr.summary,'RESOURCE'::text,
              lr.resource_type::text,NULL::text,NULL::varchar,NULL::int,
              CASE
                WHEN $3='REPAIR' AND lrc.journey_stage IN ('UNDERSTAND','DO') THEN 0
                WHEN $3='REVIEW' AND lrc.journey_stage='REVISE' THEN 0
                WHEN lrc.journey_stage='UNDERSTAND' THEN 2 ELSE 5 END
       FROM learning_resource_concepts lrc
       JOIN learning_resources lr ON lr.id=lrc.resource_id
       WHERE lrc.concept_id=$1 AND lr.review_status='PUBLISHED'
         AND lr.visibility IN ('PUBLIC','REGISTERED','CLASS_ONLY')
         AND ($2::int IS NULL OR ((lr.class_min IS NULL OR lr.class_min <= $2) AND (lr.class_max IS NULL OR lr.class_max >= $2)))
     )
     SELECT id,public_slug,title,summary,item_type::text,resource_type,assessment_type,evidence_role,
            question_count
     FROM candidates
     ORDER BY priority,item_type DESC,id
     LIMIT 1`,
    [conceptId, classNumber, preference],
  );
  return row || null;
}

async function weakPrerequisite(studentId: UUID, conceptId: UUID): Promise<PrerequisiteRow | null> {
  const { rows: [row] } = await query<PrerequisiteRow>(
    `SELECT pre.id AS concept_id,pre.code AS concept_code,pre.name AS concept_name,
            pre.subject_code,sub.name AS subject_name,pre.chapter_title,
            sci.proficiency_score::float,sci.confidence_score::float,sci.confidence_level
     FROM learning_concept_prerequisites lcp
     JOIN learning_concepts pre ON pre.id=lcp.prerequisite_concept_id AND pre.is_active=TRUE
     LEFT JOIN subjects sub ON sub.id=pre.subject_id
     LEFT JOIN student_concept_intelligence sci
       ON sci.student_id=$1 AND sci.concept_id=pre.id
     WHERE lcp.concept_id=$2
       AND (sci.concept_id IS NULL OR sci.proficiency_score < 60 OR sci.confidence_score < 45)
     ORDER BY CASE lcp.strength WHEN 'REQUIRED' THEN 0 ELSE 1 END,
              sci.proficiency_score ASC NULLS FIRST,pre.sequence,pre.code
     LIMIT 1`,
    [studentId, conceptId],
  );
  return row || null;
}

function diagnosticMeta(concept: DiagnosticConcept) {
  return {
    proficiencyScore: Number(concept.proficiencyScore || 0),
    confidenceScore: Number(concept.confidenceScore || 0),
    confidenceLevel: String(concept.confidenceLevel || 'NONE'),
    retentionStatus: String(concept.retentionStatus || 'NOT_ASSESSED'),
    misconceptionCode: concept.dominantMisconceptionCode || null,
  };
}

/**
 * Enrich the established adaptive plan instead of replacing it. Deterministic
 * diagnostic signals may outrank generic actions; existing plan actions remain
 * available as fallbacks and keep their original mastery semantics.
 */
export async function enrichAdaptivePlanWithDiagnostics(
  userId: UUID,
  basePlan: AdaptiveLearningPlan,
): Promise<DiagnosticAdaptivePlan> {
  await reconcileMissingEvidenceForUser(userId);
  const [student, profile] = await Promise.all([
    getStudentContext(userId),
    getStudentDiagnosticProfile(userId),
  ]);
  const classNumber = gradeNumber(student);
  const injected: DiagnosticAdaptiveAction[] = [];

  for (const concept of profile.concepts) {
    if (injected.length >= 4) break;
    const meta = diagnosticMeta(concept);
    const activeMisconception = concept.misconceptions.find((item) => item.state === 'ACTIVE')
      || concept.misconceptions.find((item) => item.state === 'SUSPECTED');

    if (activeMisconception) {
      const target = await bestTargetForConcept(concept.conceptId, classNumber, 'REPAIR');
      if (target) {
        injected.push({
          id: `${concept.code}:misconception:${activeMisconception.misconception_code}:${target.id}`,
          rank: 0,
          urgency: 'HIGH',
          actionType: 'REPAIR_MISCONCEPTION',
          conceptId: concept.conceptId,
          conceptCode: concept.code,
          conceptName: concept.name,
          subjectCode: concept.subjectCode,
          subjectName: concept.subjectName,
          chapterTitle: concept.chapterTitle,
          state: 'NEEDS_REVIEW',
          title: `Repair a misconception in ${concept.name}`,
          reason: `Your recent answers repeatedly show the ${activeMisconception.misconception_code} misconception. Fix that idea before adding harder questions.`,
          estimatedMinutes: target.item_type === 'RESOURCE' ? 12 : 8,
          target: rowTarget(target),
          diagnostic: { ...meta, misconceptionCode: activeMisconception.misconception_code },
        });
        continue;
      }
    }

    if (concept.retentionStatus === 'REVIEW_DUE' || concept.retentionStatus === 'REVIEW_SOON') {
      const target = await bestTargetForConcept(concept.conceptId, classNumber, 'REVIEW');
      if (target) {
        injected.push({
          id: `${concept.code}:spaced-review:${target.id}`,
          rank: 0,
          urgency: concept.retentionStatus === 'REVIEW_DUE' ? 'HIGH' : 'FOCUS',
          actionType: 'SPACED_REVIEW',
          conceptId: concept.conceptId,
          conceptCode: concept.code,
          conceptName: concept.name,
          subjectCode: concept.subjectCode,
          subjectName: concept.subjectName,
          chapterTitle: concept.chapterTitle,
          state: 'MASTERED',
          title: `Refresh ${concept.name}`,
          reason: 'You already mastered this concept. A short spaced review now helps keep that learning stable without removing your mastery achievement.',
          estimatedMinutes: target.item_type === 'RESOURCE' ? 6 : 7,
          target: rowTarget(target),
          diagnostic: meta,
        });
        continue;
      }
    }

    if (Number(concept.proficiencyScore) < 60) {
      const prerequisite = await weakPrerequisite(student.student_id, concept.conceptId);
      if (prerequisite) {
        const target = await bestTargetForConcept(prerequisite.concept_id, classNumber, 'REPAIR');
        if (target) {
          injected.push({
            id: `${concept.code}:prerequisite:${prerequisite.concept_code}:${target.id}`,
            rank: 0,
            urgency: 'HIGH',
            actionType: 'REVIEW_PREREQUISITE',
            conceptId: prerequisite.concept_id,
            conceptCode: prerequisite.concept_code,
            conceptName: prerequisite.concept_name,
            subjectCode: prerequisite.subject_code,
            subjectName: prerequisite.subject_name,
            chapterTitle: prerequisite.chapter_title,
            state: 'NEEDS_REVIEW',
            title: `Strengthen ${prerequisite.concept_name} first`,
            reason: `${concept.name} depends on this earlier concept. Repairing the prerequisite is more useful than repeatedly giving harder ${concept.name} questions.`,
            estimatedMinutes: target.item_type === 'RESOURCE' ? 12 : 8,
            target: rowTarget(target),
            diagnostic: meta,
          });
          continue;
        }
      }
    }

    if (concept.confidenceLevel === 'LOW' && Number(concept.evidenceCount) < 5) {
      const target = await bestTargetForConcept(concept.conceptId, classNumber, 'DIAGNOSTIC');
      if (target && target.assessment_type === 'DIAGNOSTIC') {
        injected.push({
          id: `${concept.code}:diagnostic:${target.id}`,
          rank: 0,
          urgency: 'FOCUS',
          actionType: 'QUICK_DIAGNOSTIC',
          conceptId: concept.conceptId,
          conceptCode: concept.code,
          conceptName: concept.name,
          subjectCode: concept.subjectCode,
          subjectName: concept.subjectName,
          chapterTitle: concept.chapterTitle,
          state: 'LEARNING',
          title: `Quick check: ${concept.name}`,
          reason: 'VidyaSetu has too little reliable evidence to recommend harder work confidently. A short diagnostic will sharpen your next step.',
          estimatedMinutes: 6,
          target: rowTarget(target),
          diagnostic: meta,
        });
      }
    }
  }

  const seen = new Set(injected.map((item) => `${item.conceptId}:${item.target.id}`));
  const merged: DiagnosticAdaptiveAction[] = [...injected];
  for (const action of basePlan.actions) {
    if (merged.length >= 4) break;
    if (seen.has(`${action.conceptId}:${action.target.id}`)) continue;
    merged.push(action);
    seen.add(`${action.conceptId}:${action.target.id}`);
  }
  merged.forEach((action, index) => { action.rank = index + 1; });

  let headline = basePlan.headline;
  const first = merged[0];
  if (first?.actionType === 'REPAIR_MISCONCEPTION') headline = 'Fix the misunderstanding first, then continue the learning path.';
  else if (first?.actionType === 'REVIEW_PREREQUISITE') headline = 'Strengthen the prerequisite first so the current concept becomes easier.';
  else if (first?.actionType === 'SPACED_REVIEW') headline = 'A short review is due to keep previously mastered learning strong.';
  else if (first?.actionType === 'QUICK_DIAGNOSTIC') headline = 'A quick check will give VidyaSetu enough evidence to choose the right next step.';

  return {
    ...basePlan,
    headline,
    summary: {
      ...basePlan.summary,
      nextActions: merged.length,
      estimatedMinutes: merged.reduce((sum, action) => sum + action.estimatedMinutes, 0),
      reviewDue: profile.summary.reviewDue,
      activeMisconceptions: profile.summary.activeMisconceptions,
      lowConfidence: profile.summary.lowConfidence,
    },
    actions: merged,
  };
}
