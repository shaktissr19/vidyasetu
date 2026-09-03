import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';

interface StudentIdRow extends QueryResultRow {
  id: UUID;
}

interface ConceptMasteryRow extends QueryResultRow {
  concept_id: UUID;
  code: string;
  name: string;
  name_hi: string | null;
  node_type: string;
  subject_code: string;
  subject_name: string | null;
  chapter_code: string | null;
  chapter_title: string | null;
  state: string;
  exposure_pct: number | string;
  resource_completion_pct: number | string;
  practice_best_pct: number | string | null;
  mastery_pct: number | string | null;
  practice_attempts: number;
  mastery_attempts: number;
  needs_review: boolean;
  first_started_at: string | Date | null;
  last_activity_at: string | Date | null;
  completed_at: string | Date | null;
  mastered_at: string | Date | null;
}

export interface StudentConceptMastery {
  conceptId: UUID;
  code: string;
  name: string;
  nameHi: string | null;
  nodeType: string;
  subjectCode: string;
  subjectName: string | null;
  chapterCode: string | null;
  chapterTitle: string | null;
  state: string;
  exposurePct: number;
  resourceCompletionPct: number;
  practiceBestPct: number | null;
  masteryPct: number | null;
  practiceAttempts: number;
  masteryAttempts: number;
  needsReview: boolean;
  firstStartedAt: string | Date | null;
  lastActivityAt: string | Date | null;
  completedAt: string | Date | null;
  masteredAt: string | Date | null;
}

function appError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

async function studentIdForUser(userId: UUID): Promise<UUID> {
  const { rows: [student] } = await query<StudentIdRow>(
    `SELECT id FROM students WHERE user_id=$1 AND status='ACTIVE'`,
    [userId],
  );
  if (!student) throw appError('Student profile not found', 404);
  return student.id;
}

/**
 * Rebuild canonical concept state from persisted learning evidence.
 *
 * This is deliberately a reconciliation operation rather than a fragile
 * counter increment. It can be called after a write and again when Learning
 * Home is opened without duplicating attempts or losing evidence.
 */
async function reconcileByStudentId(studentId: UUID): Promise<void> {
  await transaction(async (client) => {
    await client.query(
      `WITH resource_metrics AS (
         SELECT lrc.concept_id,
                COUNT(*)::int AS resource_count,
                COUNT(*) FILTER (WHERE COALESCE(slrp.progress_pct,0) > 0)::int AS started_count,
                COALESCE(AVG(COALESCE(slrp.progress_pct,0)),0)::numeric(5,2) AS average_progress,
                MAX(slrp.last_accessed) AS last_activity_at,
                MIN(slrp.last_accessed) FILTER (WHERE COALESCE(slrp.progress_pct,0) > 0) AS first_started_at
         FROM learning_resource_concepts lrc
         JOIN learning_resources lr ON lr.id=lrc.resource_id AND lr.review_status='PUBLISHED'
         LEFT JOIN student_learning_resource_progress slrp
           ON slrp.resource_id=lr.id AND slrp.student_id=$1
         GROUP BY lrc.concept_id
       ), active_resource_metrics AS (
         SELECT concept_id,
                ROUND((started_count::numeric / NULLIF(resource_count,0)) * 100,2) AS exposure_pct,
                average_progress AS resource_completion_pct,
                first_started_at,
                last_activity_at
         FROM resource_metrics
         WHERE started_count > 0
       )
       INSERT INTO student_concept_progress
         (student_id,concept_id,state,exposure_pct,resource_completion_pct,
          first_started_at,last_activity_at,completed_at)
       SELECT $1, concept_id, 'LEARNING', exposure_pct, resource_completion_pct,
              first_started_at, last_activity_at,
              CASE WHEN resource_completion_pct >= 100 THEN COALESCE(last_activity_at,NOW()) ELSE NULL END
       FROM active_resource_metrics
       ON CONFLICT (student_id,concept_id) DO UPDATE SET
         exposure_pct=EXCLUDED.exposure_pct,
         resource_completion_pct=EXCLUDED.resource_completion_pct,
         state=CASE
           WHEN student_concept_progress.state IN ('PRACTISING','NEEDS_REVIEW','MASTERED')
             THEN student_concept_progress.state
           WHEN EXCLUDED.resource_completion_pct > 0 THEN 'LEARNING'
           ELSE student_concept_progress.state
         END,
         first_started_at=COALESCE(student_concept_progress.first_started_at,EXCLUDED.first_started_at),
         last_activity_at=GREATEST(student_concept_progress.last_activity_at,EXCLUDED.last_activity_at),
         completed_at=CASE
           WHEN student_concept_progress.completed_at IS NOT NULL THEN student_concept_progress.completed_at
           WHEN EXCLUDED.resource_completion_pct >= 100 THEN COALESCE(EXCLUDED.last_activity_at,NOW())
           ELSE NULL
         END`,
      [studentId],
    );

    await client.query(
      `WITH per_attempt AS (
         SELECT lac.concept_id,
                lac.evidence_role,
                sla.id AS attempt_id,
                la.passing_pct::numeric AS passing_pct,
                sla.submitted_at,
                COALESCE(SUM(slaa.marks_awarded),0)::numeric AS concept_score,
                COALESCE(SUM(COALESCE(laq.marks_override,lq.marks)),0)::numeric AS concept_max_score
         FROM student_learning_attempts sla
         JOIN learning_assessments la ON la.id=sla.assessment_id
         JOIN learning_assessment_concepts lac ON lac.assessment_id=la.id
         JOIN learning_assessment_questions laq ON laq.assessment_id=la.id
         JOIN learning_questions lq ON lq.id=laq.question_id
         JOIN learning_question_concepts lqc
           ON lqc.question_id=lq.id AND lqc.concept_id=lac.concept_id
         LEFT JOIN student_learning_answers slaa
           ON slaa.attempt_id=sla.id AND slaa.question_id=lq.id
         WHERE sla.student_id=$1 AND sla.status='GRADED'
         GROUP BY lac.concept_id,lac.evidence_role,sla.id,la.passing_pct,sla.submitted_at
       ), scored AS (
         SELECT concept_id,evidence_role,attempt_id,passing_pct,submitted_at,
                CASE WHEN concept_max_score > 0
                     THEN ROUND((concept_score / concept_max_score) * 100,2)
                     ELSE 0::numeric END AS percentage
         FROM per_attempt
       ), evidence AS (
         SELECT concept_id,
                COUNT(*) FILTER (WHERE evidence_role='PRACTICE')::int AS practice_attempts,
                COUNT(*) FILTER (WHERE evidence_role='MASTERY')::int AS mastery_attempts,
                MAX(percentage) FILTER (WHERE evidence_role='PRACTICE') AS practice_best_pct,
                MAX(percentage) FILTER (WHERE evidence_role='MASTERY') AS mastery_pct,
                COALESCE(BOOL_OR(percentage >= passing_pct) FILTER (WHERE evidence_role='PRACTICE'),FALSE) AS practice_passed,
                COALESCE(BOOL_OR(percentage >= passing_pct) FILTER (WHERE evidence_role='MASTERY'),FALSE) AS mastery_passed,
                MIN(submitted_at) AS first_attempt_at,
                MAX(submitted_at) AS last_attempt_at,
                MIN(submitted_at) FILTER (WHERE evidence_role='MASTERY' AND percentage >= passing_pct) AS mastered_at
         FROM scored
         GROUP BY concept_id
       )
       INSERT INTO student_concept_progress
         (student_id,concept_id,state,practice_best_pct,mastery_pct,
          practice_attempts,mastery_attempts,needs_review,
          first_started_at,last_activity_at,completed_at,mastered_at)
       SELECT $1, concept_id,
              CASE
                WHEN mastery_passed THEN 'MASTERED'
                WHEN mastery_attempts > 0 THEN 'NEEDS_REVIEW'
                WHEN practice_attempts > 0 AND practice_passed THEN 'PRACTISING'
                WHEN practice_attempts > 0 THEN 'NEEDS_REVIEW'
                ELSE 'NOT_STARTED'
              END,
              practice_best_pct, mastery_pct, practice_attempts, mastery_attempts,
              CASE
                WHEN mastery_passed THEN FALSE
                WHEN mastery_attempts > 0 THEN TRUE
                WHEN practice_attempts > 0 AND NOT practice_passed THEN TRUE
                ELSE FALSE
              END,
              first_attempt_at,last_attempt_at,
              CASE WHEN mastery_passed THEN mastered_at ELSE NULL END,
              mastered_at
       FROM evidence
       ON CONFLICT (student_id,concept_id) DO UPDATE SET
         practice_best_pct=EXCLUDED.practice_best_pct,
         mastery_pct=EXCLUDED.mastery_pct,
         practice_attempts=EXCLUDED.practice_attempts,
         mastery_attempts=EXCLUDED.mastery_attempts,
         needs_review=EXCLUDED.needs_review,
         state=CASE
           WHEN EXCLUDED.state='MASTERED' THEN 'MASTERED'
           WHEN student_concept_progress.state='MASTERED' THEN 'MASTERED'
           ELSE EXCLUDED.state
         END,
         first_started_at=COALESCE(student_concept_progress.first_started_at,EXCLUDED.first_started_at),
         last_activity_at=GREATEST(student_concept_progress.last_activity_at,EXCLUDED.last_activity_at),
         completed_at=CASE
           WHEN EXCLUDED.state='MASTERED' THEN COALESCE(student_concept_progress.completed_at,EXCLUDED.mastered_at,NOW())
           ELSE student_concept_progress.completed_at
         END,
         mastered_at=COALESCE(student_concept_progress.mastered_at,EXCLUDED.mastered_at)`,
      [studentId],
    );
  });
}

export async function reconcileStudentConceptProgress(userId: UUID): Promise<void> {
  const studentId = await studentIdForUser(userId);
  await reconcileByStudentId(studentId);
}

export async function getStudentConceptMastery(userId: UUID): Promise<StudentConceptMastery[]> {
  const studentId = await studentIdForUser(userId);
  await reconcileByStudentId(studentId);

  const { rows } = await query<ConceptMasteryRow>(
    `SELECT scp.concept_id,lc.code,lc.name,lc.name_hi,lc.node_type,
            lc.subject_code,sub.name AS subject_name,lc.chapter_code,lc.chapter_title,
            scp.state,scp.exposure_pct::float,scp.resource_completion_pct::float,
            scp.practice_best_pct::float,scp.mastery_pct::float,
            scp.practice_attempts,scp.mastery_attempts,scp.needs_review,
            scp.first_started_at,scp.last_activity_at,scp.completed_at,scp.mastered_at
     FROM student_concept_progress scp
     JOIN learning_concepts lc ON lc.id=scp.concept_id AND lc.is_active=TRUE
     LEFT JOIN subjects sub ON sub.id=lc.subject_id
     WHERE scp.student_id=$1
     ORDER BY
       CASE scp.state
         WHEN 'NEEDS_REVIEW' THEN 0
         WHEN 'PRACTISING' THEN 1
         WHEN 'LEARNING' THEN 2
         WHEN 'MASTERED' THEN 3
         ELSE 4
       END,
       scp.last_activity_at DESC NULLS LAST,
       lc.subject_code,lc.sequence,lc.code
     LIMIT 24`,
    [studentId],
  );

  return rows.map((row) => ({
    conceptId: row.concept_id,
    code: row.code,
    name: row.name,
    nameHi: row.name_hi,
    nodeType: row.node_type,
    subjectCode: row.subject_code,
    subjectName: row.subject_name,
    chapterCode: row.chapter_code,
    chapterTitle: row.chapter_title,
    state: row.state,
    exposurePct: Number(row.exposure_pct || 0),
    resourceCompletionPct: Number(row.resource_completion_pct || 0),
    practiceBestPct: row.practice_best_pct == null ? null : Number(row.practice_best_pct),
    masteryPct: row.mastery_pct == null ? null : Number(row.mastery_pct),
    practiceAttempts: Number(row.practice_attempts || 0),
    masteryAttempts: Number(row.mastery_attempts || 0),
    needsReview: row.needs_review,
    firstStartedAt: row.first_started_at,
    lastActivityAt: row.last_activity_at,
    completedAt: row.completed_at,
    masteredAt: row.mastered_at,
  }));
}
