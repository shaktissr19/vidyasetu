import 'dotenv/config';
import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';
import {
  getTodayPersonalizedJourney,
  skipPersonalizedJourneyItem,
  updatePersonalizedPreferences,
} from '../services/studentPersonalizedJourney.service';
import { getStudentConceptMastery } from '../services/studentConceptMastery.service';
import { getStudentDiagnosticProfile } from '../services/studentDiagnosticIntelligence.service';
import { getAdaptiveLearningPlan } from '../services/studentAdaptiveLearning.service';
import { enrichAdaptivePlanWithDiagnostics } from '../services/studentAdaptiveIntelligence.service';
import {
  getAIPersonalizedJourneyContext,
  personalizedJourneyContextAsTutorHistory,
} from '../services/aiPersonalizedJourneyContext.service';

interface LinkRow extends QueryResultRow {
  student_id: UUID;
  user_id: UUID;
}
interface OtherStudentRow extends QueryResultRow {
  student_id: UUID;
  user_id: UUID;
}
interface ConceptStateRow extends QueryResultRow {
  state: string;
  mastered_at: string | Date | null;
}
interface IntelligenceRow extends QueryResultRow {
  proficiency_score: number | string;
  confidence_score: number | string;
  retention_status: string;
  evidence_count: number;
}
interface PlanStatusRow extends QueryResultRow {
  status: string;
  revision: number;
}
interface CountRow extends QueryResultRow { count: number | string; }
interface AssessmentRow extends QueryResultRow {
  id: UUID;
  max_attempts: number | null;
}

const FORCE_CODE = 'C8-SCI-05-C01';

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

function sameConceptState(a: ConceptStateRow | undefined, b: ConceptStateRow | undefined): boolean {
  if (!a || !b) return a === b;
  const masteredA = a.mastered_at ? new Date(a.mastered_at).toISOString() : null;
  const masteredB = b.mastered_at ? new Date(b.mastered_at).toISOString() : null;
  return a.state === b.state && masteredA === masteredB;
}

function sameIntelligence(a: IntelligenceRow | undefined, b: IntelligenceRow | undefined): boolean {
  if (!a || !b) return a === b;
  return Number(a.proficiency_score) === Number(b.proficiency_score)
    && Number(a.confidence_score) === Number(b.confidence_score)
    && a.retention_status === b.retention_status
    && Number(a.evidence_count) === Number(b.evidence_count);
}

async function forceState(studentId: UUID): Promise<ConceptStateRow | undefined> {
  const { rows: [row] } = await query<ConceptStateRow>(
    `SELECT scp.state,scp.mastered_at
     FROM student_concept_progress scp
     JOIN learning_concepts lc ON lc.id=scp.concept_id
     WHERE scp.student_id=$1 AND lc.code=$2`,
    [studentId, FORCE_CODE],
  );
  return row;
}

async function forceIntelligence(studentId: UUID): Promise<IntelligenceRow | undefined> {
  const { rows: [row] } = await query<IntelligenceRow>(
    `SELECT sci.proficiency_score::float,sci.confidence_score::float,sci.retention_status,sci.evidence_count
     FROM student_concept_intelligence sci
     JOIN learning_concepts lc ON lc.id=sci.concept_id
     WHERE sci.student_id=$1 AND lc.code=$2`,
    [studentId, FORCE_CODE],
  );
  return row;
}

async function recordRealCompletion(
  studentId: UUID,
  item: Awaited<ReturnType<typeof getTodayPersonalizedJourney>>['journey']['items'][number],
): Promise<void> {
  if (item.target.kind === 'RESOURCE') {
    await query(
      `INSERT INTO student_learning_resource_progress
         (student_id,resource_id,progress_pct,is_completed,last_accessed,completed_at)
       VALUES($1,$2,100,TRUE,NOW(),NOW())
       ON CONFLICT(student_id,resource_id) DO UPDATE SET
         progress_pct=100,is_completed=TRUE,last_accessed=NOW(),completed_at=COALESCE(student_learning_resource_progress.completed_at,NOW())`,
      [studentId, item.target.id],
    );
    return;
  }

  await query(
    `INSERT INTO student_learning_attempts
       (student_id,assessment_id,status,started_at,submitted_at,score,max_score,percentage,
        correct_count,wrong_count,skipped_count,time_spent_secs)
     VALUES($1,$2,'GRADED',NOW(),NOW(),0,1,0,0,0,1,30)`,
    [studentId, item.target.id],
  );
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Personalized Adaptive Learning certification is test-only and requires NODE_ENV=test');
  }

  const { rows: [link] } = await query<LinkRow>(
    `SELECT s.id AS student_id,s.user_id
     FROM parent_student_links psl
     JOIN students s ON s.id=psl.student_id
     JOIN school_classes sc ON sc.id=s.class_id
     WHERE s.status='ACTIVE' AND sc.class_name='8'
     ORDER BY psl.created_at NULLS LAST,psl.id
     LIMIT 1`,
  );
  assert(link, 'No linked Class 8 Student fixture available');

  const { rows: [other] } = await query<OtherStudentRow>(
    `SELECT id AS student_id,user_id FROM students
     WHERE id<>$1 AND status='ACTIVE' ORDER BY id LIMIT 1`,
    [link.student_id],
  );
  assert(other, 'No unrelated Student fixture available for journey isolation');

  await query(`DELETE FROM student_daily_learning_plans WHERE student_id IN ($1,$2)`, [link.student_id, other.student_id]);
  await query(`DELETE FROM student_adaptive_preferences WHERE student_id IN ($1,$2)`, [link.student_id, other.student_id]);

  const masteryBefore = await forceState(link.student_id);
  const intelligenceBefore = await forceIntelligence(link.student_id);
  assert(masteryBefore, 'Force mastery fixture is missing; run Diagnostic certification first');
  assert(intelligenceBefore, 'Force diagnostic intelligence fixture is missing; run Diagnostic certification first');

  // Concurrent reads must converge on one stable daily revision.
  const [first, concurrent] = await Promise.all([
    getTodayPersonalizedJourney(link.user_id),
    getTodayPersonalizedJourney(link.user_id),
  ]);
  assert(first.preferences.dailyMinutes === 25, 'Default daily learning budget is not 25 minutes');
  assert(first.preferences.planStyle === 'BALANCED', 'Default daily plan style is not BALANCED');
  assert(first.journey.id === concurrent.journey.id, 'Concurrent journey reads created different plans');
  assert(first.journey.revision === concurrent.journey.revision, 'Concurrent journey reads created different revisions');
  assert(first.journey.items.length > 0, 'Personalized journey has no mapped actions after diagnostic evidence');
  assert(first.journey.estimatedMinutes <= first.preferences.dailyMinutes || first.journey.items.length === 1,
    'Personalized journey exceeded the daily budget without the one-step safety fallback');

  const conceptIds = first.journey.items.map((item) => item.conceptId);
  const targets = first.journey.items.map((item) => `${item.target.kind}:${item.target.id}`);
  assert(new Set(conceptIds).size === conceptIds.length, 'Daily journey contains duplicate concepts');
  assert(new Set(targets).size === targets.length, 'Daily journey contains duplicate learning targets');
  const urgencyWeight = (urgency: string) => urgency === 'HIGH' ? 0 : urgency === 'FOCUS' ? 1 : 2;
  for (let index = 1; index < first.journey.items.length; index += 1) {
    assert(
      urgencyWeight(first.journey.items[index - 1].urgency) <= urgencyWeight(first.journey.items[index].urgency),
      'Lower-urgency action was placed ahead of a higher-urgency action',
    );
  }
  assert(
    first.journey.items.some((item) => Object.keys(item.evidenceSnapshot || {}).length > 0),
    'Diagnostic recommendation evidence snapshot was not persisted with the journey',
  );

  const stable = await getTodayPersonalizedJourney(link.user_id);
  assert(stable.journey.id === first.journey.id, 'Repeated read regenerated today’s journey');
  assert(stable.journey.items.map((item) => item.id).join(',') === first.journey.items.map((item) => item.id).join(','),
    'Repeated read changed today’s stable step ordering');

  const samePreference = await updatePersonalizedPreferences(link.user_id, { dailyMinutes: 25, planStyle: 'BALANCED' });
  assert(samePreference.journeyWillRefresh === false, 'Unchanged preference unnecessarily invalidated today’s journey');
  const stillStable = await getTodayPersonalizedJourney(link.user_id);
  assert(stillStable.journey.id === first.journey.id, 'Unchanged preference created a new journey revision');

  const aiContext = await getAIPersonalizedJourneyContext(link.student_id, FORCE_CODE);
  assert(aiContext?.planId === first.journey.id, 'VidyaBot did not receive the current daily journey');
  const aiText = personalizedJourneyContextAsTutorHistory(aiContext);
  assert(aiText?.includes('VIDYASETU VERIFIED DAILY JOURNEY'), 'VidyaBot personalized journey verification marker missing');
  assert(aiText?.includes('not academic evidence'), 'VidyaBot plan-vs-evidence safety instruction missing');

  // A deliberate budget change supersedes the old revision and rebuilds today.
  const preferenceChange = await updatePersonalizedPreferences(link.user_id, { dailyMinutes: 15, planStyle: 'BALANCED' });
  assert(preferenceChange.journeyWillRefresh, 'Changed daily budget did not request journey refresh');
  const fifteen = await getTodayPersonalizedJourney(link.user_id);
  assert(fifteen.preferences.dailyMinutes === 15, '15-minute preference did not persist');
  assert(fifteen.journey.id !== first.journey.id, 'Budget change reused the superseded journey');
  assert(fifteen.journey.revision > first.journey.revision, 'Budget change did not create a newer revision');
  const { rows: [oldPlan] } = await query<PlanStatusRow>(
    `SELECT status,revision FROM student_daily_learning_plans WHERE id=$1`,
    [first.journey.id],
  );
  assert(oldPlan?.status === 'SUPERSEDED', 'Prior journey revision was not marked SUPERSEDED');
  assert(fifteen.journey.estimatedMinutes <= 15 || fifteen.journey.items.length === 1,
    '15-minute journey ignored the learner’s selected budget');

  const pending = fifteen.journey.items.find((item) => item.status === 'PENDING');
  assert(pending, '15-minute journey has no pending step for completion/isolation certification');
  await expectStatus(
    () => skipPersonalizedJourneyItem(other.user_id, pending.id),
    404,
    'Cross-Student journey item isolation',
  );

  // Real learning activity, not a cosmetic journey button, closes the step.
  await recordRealCompletion(link.student_id, pending);
  let reconciled = await getTodayPersonalizedJourney(link.user_id);
  const completedItem = reconciled.journey.items.find((item) => item.id === pending.id);
  assert(completedItem?.status === 'COMPLETED', 'Real learning activity did not reconcile the journey step to COMPLETED');

  // Close any remaining steps for today through the learner-controlled skip.
  for (const item of [...reconciled.journey.items]) {
    if (item.status !== 'PENDING') continue;
    reconciled = await skipPersonalizedJourneyItem(link.user_id, item.id);
  }
  const completedJourney = await getTodayPersonalizedJourney(link.user_id);
  assert(completedJourney.journey.status === 'COMPLETED', 'Journey did not complete when every step was closed');
  assert(completedJourney.journey.remainingMinutes === 0, 'Completed journey still reports pending minutes');
  const repeatedCompleted = await getTodayPersonalizedJourney(link.user_id);
  assert(repeatedCompleted.journey.id === completedJourney.journey.id,
    'Completed daily journey auto-extended with new work on the same day');

  // Explicitly changing the budget after completion is allowed to create a new revision.
  const postCompleteChange = await updatePersonalizedPreferences(link.user_id, { dailyMinutes: 40, planStyle: 'BALANCED' });
  assert(postCompleteChange.journeyWillRefresh, 'Budget change after completion did not allow an intentional new revision');
  const forty = await getTodayPersonalizedJourney(link.user_id);
  assert(forty.preferences.dailyMinutes === 40, '40-minute preference did not persist');
  assert(forty.journey.revision > completedJourney.journey.revision, 'Completed journey could not be intentionally superseded');

  // Exhausted assessment targets must disappear from both base and diagnostic adaptive plans.
  const mastery = await getStudentConceptMastery(link.user_id);
  const baseBeforeExhaustion = await getAdaptiveLearningPlan(link.user_id, mastery);
  const enrichedBeforeExhaustion = await enrichAdaptivePlanWithDiagnostics(link.user_id, baseBeforeExhaustion);
  const assessmentAction = enrichedBeforeExhaustion.actions.find((action) => action.target.kind === 'ASSESSMENT');
  if (assessmentAction) {
    const { rows: [assessment] } = await query<AssessmentRow>(
      `SELECT id,max_attempts FROM learning_assessments WHERE id=$1`,
      [assessmentAction.target.id],
    );
    assert(assessment, 'Adaptive assessment target disappeared before exhaustion certification');
    await query(`UPDATE learning_assessments SET max_attempts=1 WHERE id=$1`, [assessment.id]);
    await query(
      `INSERT INTO student_learning_attempts
         (student_id,assessment_id,status,started_at,submitted_at,score,max_score,percentage,
          correct_count,wrong_count,skipped_count,time_spent_secs)
       VALUES($1,$2,'GRADED',NOW()-INTERVAL '2 hours',NOW()-INTERVAL '2 hours',0,1,0,0,0,1,30)`,
      [link.student_id, assessment.id],
    );
    const baseAfter = await getAdaptiveLearningPlan(link.user_id);
    const enrichedAfter = await enrichAdaptivePlanWithDiagnostics(link.user_id, baseAfter);
    assert(!baseAfter.actions.some((action) => action.target.id === assessment.id),
      'Base adaptive plan recommended an exhausted assessment');
    assert(!enrichedAfter.actions.some((action) => action.target.id === assessment.id),
      'Diagnostic adaptive plan reintroduced an exhausted assessment');
    await query(`UPDATE learning_assessments SET max_attempts=$2 WHERE id=$1`, [assessment.id, assessment.max_attempts]);
  }

  const masteryAfter = await forceState(link.student_id);
  const intelligenceAfter = await forceIntelligence(link.student_id);
  assert(sameConceptState(masteryBefore, masteryAfter), 'Journey generation changed historical Force mastery state');
  assert(sameIntelligence(intelligenceBefore, intelligenceAfter), 'Journey generation changed Force diagnostic intelligence');

  const { rows: [activeCount] } = await query<CountRow>(
    `SELECT COUNT(*)::int AS count FROM student_daily_learning_plans
     WHERE student_id=$1 AND plan_date=(NOW() AT TIME ZONE 'Asia/Kolkata')::date AND status='ACTIVE'`,
    [link.student_id],
  );
  assert(Number(activeCount?.count || 0) <= 1, 'More than one ACTIVE daily journey exists for the Student');

  const profile = await getStudentDiagnosticProfile(link.user_id);
  assert(profile.concepts.some((concept) => concept.code === FORCE_CODE), 'Personalized journey work broke the Student diagnostic profile');

  console.log('PERSONALIZED / ADAPTIVE LEARNING 2.0 CERTIFIED');
  console.log(`Student: ${link.student_id}`);
  console.log(`Initial plan: ${first.journey.id} (${first.journey.estimatedMinutes} min)`);
  console.log(`Latest revision: ${forty.journey.revision}; budget: ${forty.preferences.dailyMinutes} min`);
  console.log(`AI journey context: ${aiContext?.planId || 'none'}`);
}

main()
  .catch((error: unknown) => {
    console.error(`PERSONALIZED ADAPTIVE CERTIFICATION FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { pool } = await import('../config/db');
    await pool.end();
  });
