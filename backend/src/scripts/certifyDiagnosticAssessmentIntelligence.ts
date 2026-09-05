import 'dotenv/config';
import type { PoolClient, QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { pool, query, transaction } from '../config/db';
import {
  captureAttemptEvidenceAndRefresh,
  getStudentDiagnosticProfile,
} from '../services/studentDiagnosticIntelligence.service';
import { getAdaptiveLearningPlan } from '../services/studentAdaptiveLearning.service';
import { enrichAdaptivePlanWithDiagnostics } from '../services/studentAdaptiveIntelligence.service';
import {
  getParentDiagnosticInsight,
  getSchoolDiagnosticOverview,
} from '../services/diagnosticVisibility.service';
import {
  diagnosticContextAsTutorHistory,
  getAIDiagnosticContext,
} from '../services/aiDiagnosticContext.service';
import { replaceConceptPrerequisites } from '../services/learningPrerequisiteAdmin.service';
import { getDiagnosticGovernanceReadiness } from '../services/diagnosticGovernance.service';

interface LinkRow extends QueryResultRow {
  parent_user_id: UUID;
  student_id: UUID;
  student_user_id: UUID;
  class_id: UUID;
  school_id: UUID;
}
interface ConceptRow extends QueryResultRow {
  id: UUID;
  code: string;
  name: string;
  subject_id: UUID | null;
  subject_code: string;
  grade_id: UUID;
}
interface QuestionRow extends QueryResultRow {
  id: UUID;
  public_code: string;
  correct_answer: unknown;
  misconception_code: string | null;
}
interface IdRow extends QueryResultRow { id: UUID; }
interface IntelligenceRow extends QueryResultRow {
  proficiency_score: number | string;
  confidence_score: number | string;
  confidence_level: string;
  evidence_count: number;
  retention_status: string;
  dominant_misconception_code: string | null;
}
interface CountRow extends QueryResultRow { count: number | string; }
interface StateRow extends QueryResultRow { state: string; }
interface AdminRow extends QueryResultRow { user_id: UUID; }

const DIAGNOSTIC_SLUG = 'ci-diagnostic-force-v2';
const FORCE_CODE = 'C8-SCI-05-C01';
const MISCONCEPTION = 'CI-FORCE-MISCONCEPTION';
const ADMIN_ID = '00000000-0000-0000-0000-000000000001' as UUID;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectStatus(work: () => Promise<unknown>, statusCode: number, label: string): Promise<void> {
  try {
    await work();
  } catch (error: unknown) {
    if ((error as { statusCode?: number })?.statusCode === statusCode) return;
    throw error;
  }
  throw new Error(`${label}: expected status ${statusCode}`);
}

async function schoolAdminUserId(schoolId: UUID): Promise<UUID> {
  const { rows: [row] } = await query<AdminRow>(
    `SELECT admin_user_id AS user_id FROM schools WHERE id=$1 AND admin_user_id IS NOT NULL`,
    [schoolId],
  );
  assert(row, 'School Admin fixture missing');
  return row.user_id;
}

async function createAttempt(
  studentId: UUID,
  assessmentId: UUID,
  questions: QuestionRow[],
  occurredAt: Date,
  mode: 'ONE_CORRECT' | 'TAGGED_WRONG' | 'TAGGED_CORRECT',
): Promise<UUID> {
  return transaction(async (client: PoolClient) => {
    const answeredQuestions = questions.filter((question, index) => {
      if (mode === 'ONE_CORRECT') return index === 0;
      return question.misconception_code === MISCONCEPTION;
    });
    const correct = mode === 'TAGGED_WRONG' ? 0 : answeredQuestions.length;
    const wrong = mode === 'TAGGED_WRONG' ? answeredQuestions.length : 0;
    const skipped = questions.length - answeredQuestions.length;
    const percentage = questions.length ? (correct / questions.length) * 100 : 0;
    const { rows: [attempt] } = await client.query<IdRow>(
      `INSERT INTO student_learning_attempts
         (student_id,assessment_id,status,started_at,submitted_at,score,max_score,percentage,
          correct_count,wrong_count,skipped_count,time_spent_secs)
       VALUES($1,$2,'GRADED',$3,$3,$4,$5,$6,$7,$8,$9,90)
       RETURNING id`,
      [studentId, assessmentId, occurredAt, correct, questions.length, percentage, correct, wrong, skipped],
    );
    assert(attempt, 'Could not create diagnostic attempt');

    for (let index = 0; index < questions.length; index += 1) {
      const question = questions[index];
      const shouldAnswer = mode === 'ONE_CORRECT'
        ? index === 0
        : question.misconception_code === MISCONCEPTION;
      const isCorrect = !shouldAnswer ? null : mode !== 'TAGGED_WRONG';
      await client.query(
        `INSERT INTO student_learning_answers
           (attempt_id,question_id,answer,is_correct,marks_awarded,answered_at)
         VALUES($1,$2,$3::jsonb,$4,$5,$6)`,
        [
          attempt.id,
          question.id,
          shouldAnswer ? JSON.stringify(isCorrect ? question.correct_answer : { option: '__CI_WRONG__' }) : null,
          isCorrect,
          isCorrect ? 1 : 0,
          occurredAt,
        ],
      );
    }

    await captureAttemptEvidenceAndRefresh(client, studentId, attempt.id, assessmentId);
    return attempt.id;
  });
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Diagnostic certification is test-only and requires NODE_ENV=test');
  }

  const { rows: [link] } = await query<LinkRow>(
    `SELECT psl.parent_user_id,psl.student_id,s.user_id AS student_user_id,s.class_id,s.school_id
     FROM parent_student_links psl
     JOIN students s ON s.id=psl.student_id
     JOIN school_classes sc ON sc.id=s.class_id
     WHERE s.status='ACTIVE' AND s.class_id IS NOT NULL AND s.school_id IS NOT NULL
       AND sc.class_name='8'
     ORDER BY psl.created_at NULLS LAST,psl.id
     LIMIT 1`,
  );
  assert(link, 'No linked Class 8 Parent/Student fixture available');

  const { rows: [force] } = await query<ConceptRow>(
    `SELECT lc.id,lc.code,lc.name,lc.subject_id,sub.code AS subject_code,lc.grade_id
     FROM learning_concepts lc
     JOIN subjects sub ON sub.id=lc.subject_id AND sub.is_active=TRUE
     WHERE lc.code=$1 AND lc.is_active=TRUE`,
    [FORCE_CODE],
  );
  assert(force, 'Canonical Force concept or operational Science subject missing');

  const schoolAdmin = await schoolAdminUserId(link.school_id);

  // Promote only disposable CI fixtures. Production content governance is not
  // touched by this test-only certification.
  await query(
    `UPDATE learning_questions
     SET review_status='PUBLISHED',reviewed_by=$1,published_at=COALESCE(published_at,NOW()),
         cognitive_skill=(CASE
           WHEN public_code IN ('VS8S-FORC-001','VS8S-FORC-004','VS8S-FORC-007','VS8S-FORC-010') THEN 'UNDERSTAND'
           WHEN public_code IN ('VS8S-FORC-002','VS8S-FORC-005','VS8S-FORC-008','VS8S-FORC-011') THEN 'APPLY'
           ELSE 'ANALYSE' END)::learning_cognitive_skill,
         skill_code=COALESCE(NULLIF(skill_code,''),'CI-FORCE-EVIDENCE'),
         misconception_code=CASE WHEN public_code IN ('VS8S-FORC-004','VS8S-FORC-005') THEN $2 ELSE NULL END,
         misconception_text=CASE WHEN public_code IN ('VS8S-FORC-004','VS8S-FORC-005') THEN 'Force only exists when visible motion occurs.' ELSE misconception_text END,
         misconception_text_hi=CASE WHEN public_code IN ('VS8S-FORC-004','VS8S-FORC-005') THEN 'बल केवल तभी होता है जब स्पष्ट गति दिखाई दे।' ELSE misconception_text_hi END
     WHERE public_code LIKE 'VS8S-FORC-%'`,
    [ADMIN_ID, MISCONCEPTION],
  );
  await query(
    `UPDATE learning_resources
     SET review_status='PUBLISHED',reviewed_by=$1,published_at=COALESCE(published_at,NOW())
     WHERE public_slug='class-8-science-force-v1'`,
    [ADMIN_ID],
  );
  await query(
    `UPDATE learning_assessments
     SET review_status='PUBLISHED',reviewed_by=$1,published_at=COALESCE(published_at,NOW())
     WHERE public_slug='class-8-science-force-practice-v1'`,
    [ADMIN_ID],
  );

  const { rows: questions } = await query<QuestionRow>(
    `SELECT lq.id,lq.public_code,lq.correct_answer,lq.misconception_code
     FROM learning_questions lq
     JOIN learning_question_concepts lqc ON lqc.question_id=lq.id
     WHERE lqc.concept_id=$1 AND lq.public_code LIKE 'VS8S-FORC-%'
     ORDER BY lq.public_code
     LIMIT 10`,
    [force.id],
  );
  assert(questions.length === 10, `Expected 10 mapped Force questions, found ${questions.length}`);
  assert(questions.filter((item) => item.misconception_code === MISCONCEPTION).length === 2, 'Misconception fixture depth is not 2');

  await query(`DELETE FROM learning_assessments WHERE public_slug=$1`, [DIAGNOSTIC_SLUG]);
  const { rows: [assessment] } = await query<IdRow>(
    `INSERT INTO learning_assessments
       (public_slug,title,title_hi,summary,assessment_type,visibility,review_status,class_min,class_max,
        subject_id,time_limit_mins,passing_pct,max_attempts,shuffle_questions,is_featured_public,
        created_by,reviewed_by,published_at)
     VALUES($1,'CI Force diagnostic','सीआई बल त्वरित जाँच','Disposable Diagnostic 2.0 certification fixture.',
            'DIAGNOSTIC','REGISTERED','PUBLISHED',8,8,$2,10,60,NULL,TRUE,FALSE,$3,$3,NOW())
     RETURNING id`,
    [DIAGNOSTIC_SLUG, force.subject_id, ADMIN_ID],
  );
  assert(assessment, 'Could not create diagnostic fixture');

  await query(
    `INSERT INTO learning_assessment_boards(assessment_id,board_id)
     SELECT $1,id FROM education_boards WHERE code='COMMON' ON CONFLICT DO NOTHING`,
    [assessment.id],
  );
  await query(
    `INSERT INTO learning_assessment_concepts(assessment_id,concept_id,is_primary,sort_order,evidence_role)
     VALUES($1,$2,TRUE,1,'PRACTICE')`,
    [assessment.id, force.id],
  );
  const { rows: [roleRow] } = await query<{ evidence_role: string } & QueryResultRow>(
    `SELECT evidence_role FROM learning_assessment_concepts WHERE assessment_id=$1 AND concept_id=$2`,
    [assessment.id, force.id],
  );
  assert(roleRow?.evidence_role === 'DIAGNOSTIC', 'Migration 038 trigger did not canonicalise DIAGNOSTIC evidence role');

  for (let index = 0; index < questions.length; index += 1) {
    await query(
      `INSERT INTO learning_assessment_questions(assessment_id,question_id,sort_order)
       VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,
      [assessment.id, questions[index].id, index + 1],
    );
  }

  const governance = await getDiagnosticGovernanceReadiness(assessment.id);
  assert(governance.ready, `Governed diagnostic fixture is unexpectedly blocked: ${governance.blockers.join(' ')}`);
  assert(governance.metrics.difficultyDiversity >= 2, 'Diagnostic difficulty diversity was not certified');
  assert(governance.metrics.skillDiversity >= 2, 'Diagnostic cognitive-skill diversity was not certified');
  assert(governance.metrics.misconceptionQuestionCount >= 2, 'Diagnostic misconception coverage was not certified');

  await query(`DELETE FROM student_learning_attempts WHERE student_id=$1 AND assessment_id=$2`, [link.student_id, assessment.id]);
  await query(`DELETE FROM student_concept_intelligence WHERE student_id=$1 AND concept_id=$2`, [link.student_id, force.id]);
  await query(`DELETE FROM student_concept_misconceptions WHERE student_id=$1 AND concept_id=$2`, [link.student_id, force.id]);
  await query(`DELETE FROM student_learning_evidence WHERE student_id=$1 AND concept_id=$2`, [link.student_id, force.id]);

  const now = Date.now();
  const singleAttempt = await createAttempt(link.student_id, assessment.id, questions, new Date(now - 4 * 3_600_000), 'ONE_CORRECT');
  const { rows: [single] } = await query<IntelligenceRow>(
    `SELECT proficiency_score::float,confidence_score::float,confidence_level,evidence_count,
            retention_status,dominant_misconception_code
     FROM student_concept_intelligence WHERE student_id=$1 AND concept_id=$2`,
    [link.student_id, force.id],
  );
  assert(single, 'Single-answer intelligence row missing');
  assert(Number(single.evidence_count) === 1, `One answered question produced ${single.evidence_count} answered evidence items`);
  assert(single.confidence_level === 'LOW', `One easy answer produced ${single.confidence_level} confidence instead of LOW`);
  assert(Number(single.confidence_score) < 45, 'One easy answer produced false medium/high confidence');

  const { rows: [ledgerBefore] } = await query<CountRow>(
    `SELECT COUNT(*)::int AS count FROM student_learning_evidence WHERE student_id=$1 AND attempt_id=$2`,
    [link.student_id, singleAttempt],
  );
  await transaction(async (client) => {
    await captureAttemptEvidenceAndRefresh(client, link.student_id, singleAttempt, assessment.id);
  });
  const { rows: [ledgerAfter] } = await query<CountRow>(
    `SELECT COUNT(*)::int AS count FROM student_learning_evidence WHERE student_id=$1 AND attempt_id=$2`,
    [link.student_id, singleAttempt],
  );
  assert(Number(ledgerBefore.count) === Number(ledgerAfter.count), 'Evidence reconciliation duplicated ledger rows');

  await createAttempt(link.student_id, assessment.id, questions, new Date(now - 3 * 3_600_000), 'TAGGED_WRONG');
  const { rows: [active] } = await query<StateRow>(
    `SELECT state FROM student_concept_misconceptions
     WHERE student_id=$1 AND concept_id=$2 AND misconception_code=$3`,
    [link.student_id, force.id, MISCONCEPTION],
  );
  assert(active?.state === 'ACTIVE', `Two misconception-tagged wrong answers produced ${active?.state || 'no'} state instead of ACTIVE`);

  const resolvedAttempt = await createAttempt(link.student_id, assessment.id, questions, new Date(now - 2 * 3_600_000), 'TAGGED_CORRECT');
  const { rows: [resolved] } = await query<StateRow>(
    `SELECT state FROM student_concept_misconceptions
     WHERE student_id=$1 AND concept_id=$2 AND misconception_code=$3`,
    [link.student_id, force.id, MISCONCEPTION],
  );
  assert(resolved?.state === 'RESOLVED', `Later correct evidence produced ${resolved?.state || 'no'} state instead of RESOLVED`);

  await query(
    `INSERT INTO student_concept_progress
       (student_id,concept_id,state,exposure_pct,resource_completion_pct,needs_review,mastered_at,last_activity_at)
     VALUES($1,$2,'MASTERED',100,100,FALSE,NOW()-INTERVAL '45 days',NOW())
     ON CONFLICT(student_id,concept_id) DO UPDATE SET
       state='MASTERED',exposure_pct=100,resource_completion_pct=100,needs_review=FALSE,
       mastered_at=NOW()-INTERVAL '45 days',last_activity_at=NOW()`,
    [link.student_id, force.id],
  );
  await transaction(async (client) => {
    await captureAttemptEvidenceAndRefresh(client, link.student_id, resolvedAttempt, assessment.id);
  });
  const { rows: [masteryState] } = await query<StateRow>(
    `SELECT state FROM student_concept_progress WHERE student_id=$1 AND concept_id=$2`,
    [link.student_id, force.id],
  );
  const { rows: [retained] } = await query<IntelligenceRow>(
    `SELECT proficiency_score::float,confidence_score::float,confidence_level,evidence_count,
            retention_status,dominant_misconception_code
     FROM student_concept_intelligence WHERE student_id=$1 AND concept_id=$2`,
    [link.student_id, force.id],
  );
  assert(masteryState?.state === 'MASTERED', 'Retention refresh erased historical mastery');
  assert(retained?.retention_status === 'REVIEW_DUE', `45-day-old mastery produced ${retained?.retention_status || 'no'} retention state instead of REVIEW_DUE`);

  const profile = await getStudentDiagnosticProfile(link.student_user_id);
  const forceProfile = profile.concepts.find((item) => item.code === FORCE_CODE);
  assert(forceProfile, 'Student Knowledge Map profile omitted Force');
  assert(forceProfile.retentionStatus === 'REVIEW_DUE', 'Student diagnostic profile did not expose review due');
  assert(forceProfile.misconceptions.some((item) => item.misconception_code === MISCONCEPTION && item.state === 'RESOLVED'), 'Resolved misconception history missing from profile');

  const basePlan = await getAdaptiveLearningPlan(link.student_user_id);
  const enrichedPlan = await enrichAdaptivePlanWithDiagnostics(link.student_user_id, basePlan);
  assert(
    enrichedPlan.actions.some((item) => item.conceptCode === FORCE_CODE && item.actionType === 'SPACED_REVIEW'),
    'Diagnostic-aware adaptive plan did not prioritise spaced review for old mastery',
  );

  const parent = await getParentDiagnosticInsight(link.parent_user_id, link.student_id);
  assert(parent.summary.reviewDue >= 1, 'Parent diagnostic guidance did not expose revision due');
  const { rows: [otherStudent] } = await query<IdRow>(
    `SELECT id FROM students
     WHERE id<>$1 AND NOT EXISTS (
       SELECT 1 FROM parent_student_links psl WHERE psl.parent_user_id=$2 AND psl.student_id=students.id
     ) ORDER BY id LIMIT 1`,
    [link.student_id, link.parent_user_id],
  );
  assert(otherStudent, 'No unrelated Student fixture available for Parent isolation check');
  await expectStatus(
    () => getParentDiagnosticInsight(link.parent_user_id, otherStudent.id),
    403,
    'Parent-child diagnostic isolation',
  );

  const schoolOverview = await getSchoolDiagnosticOverview(
    link.school_id,
    schoolAdmin,
    'SCHOOL_ADMIN',
    link.class_id,
    force.subject_code,
    null,
  );
  assert(schoolOverview.summary.studentsWithEvidence >= 1, 'School diagnostic overview did not expose learner evidence');
  assert(schoolOverview.summary.reviewDueStudents >= 1, 'School diagnostic overview did not expose revision due');

  const aiContext = await getAIDiagnosticContext(link.student_id, FORCE_CODE);
  assert(aiContext?.retentionStatus === 'REVIEW_DUE', 'VidyaBot diagnostic context disagrees with learner retention evidence');
  assert(aiContext?.confidenceLevel !== 'NONE', 'VidyaBot did not receive confidence evidence');
  const aiText = diagnosticContextAsTutorHistory(aiContext);
  assert(aiText?.includes('VIDYASETU VERIFIED LEARNER EVIDENCE'), 'VidyaBot verified evidence marker missing');
  assert(aiText?.includes('Historical mastery is not erased'), 'VidyaBot mastery/retention safety instruction missing');

  const { rows: [otherConcept] } = await query<ConceptRow>(
    `SELECT lc.id,lc.code,lc.name,lc.subject_id,sub.code AS subject_code,lc.grade_id
     FROM learning_concepts lc
     JOIN subjects sub ON sub.id=lc.subject_id AND sub.is_active=TRUE
     WHERE lc.grade_id=$1 AND lc.id<>$2 AND lc.is_active=TRUE
     ORDER BY lc.sequence,lc.code LIMIT 1`,
    [force.grade_id, force.id],
  );
  assert(otherConcept, 'No same-grade concept available for prerequisite cycle certification');
  await replaceConceptPrerequisites(force.id, [{ conceptId: otherConcept.id, strength: 'REQUIRED', rationale: 'CI dependency' }]);
  await expectStatus(
    () => replaceConceptPrerequisites(otherConcept.id, [{ conceptId: force.id, strength: 'REQUIRED', rationale: 'Should cycle' }]),
    409,
    'Prerequisite cycle protection',
  );
  await replaceConceptPrerequisites(force.id, []);
  await replaceConceptPrerequisites(otherConcept.id, []);

  console.log('DIAGNOSTIC & ASSESSMENT INTELLIGENCE 2.0 CERTIFIED');
  console.log(`Diagnostic assessment: ${assessment.id}`);
  console.log(`Student: ${link.student_id}`);
  console.log(`Final confidence: ${Math.round(Number(retained.confidence_score || 0))}% (${retained.confidence_level})`);
  console.log(`Retention: ${retained.retention_status}; mastery preserved: ${masteryState.state}`);
}

main()
  .catch((error: unknown) => {
    console.error(`DIAGNOSTIC CERTIFICATION FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => pool.end());
