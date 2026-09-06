import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';
import { getStudentConceptMastery } from './studentConceptMastery.service';
import { getAdaptiveLearningPlan, type AdaptiveLearningPlan } from './studentAdaptiveLearning.service';
import {
  enrichAdaptivePlanWithDiagnostics,
  type DiagnosticAdaptiveAction,
  type DiagnosticAdaptivePlan,
} from './studentAdaptiveIntelligence.service';
import { diagnosticIntelligenceAvailable } from './studentDiagnosticRuntime.service';

export type PersonalizedPlanStyle = 'BALANCED' | 'FOCUS';
export type PersonalizedItemStatus = 'PENDING' | 'COMPLETED' | 'SKIPPED';

type JourneyAction = DiagnosticAdaptiveAction;
type JourneyPlanSource = DiagnosticAdaptivePlan | AdaptiveLearningPlan;

interface StudentRow extends QueryResultRow { id: UUID; }
interface PreferenceRow extends QueryResultRow {
  daily_minutes: number;
  plan_style: PersonalizedPlanStyle;
}
interface PlanRow extends QueryResultRow {
  id: UUID;
  plan_date: string | Date;
  revision: number;
  status: 'ACTIVE' | 'COMPLETED' | 'SUPERSEDED';
  daily_minutes: number;
  plan_style: PersonalizedPlanStyle;
  headline: string;
  explanation: string;
  estimated_minutes: number;
  source_generated_at: string | Date | null;
  completed_at: string | Date | null;
  created_at: string | Date;
}
interface ItemRow extends QueryResultRow {
  id: UUID;
  position: number;
  source_action_id: string;
  concept_id: UUID;
  action_type: JourneyAction['actionType'];
  urgency: JourneyAction['urgency'];
  target_kind: JourneyAction['target']['kind'];
  target_id: UUID;
  target_public_slug: string | null;
  target_title: string;
  title: string;
  reason: string;
  estimated_minutes: number;
  status: PersonalizedItemStatus;
  completed_at: string | Date | null;
  skipped_at: string | Date | null;
  created_at: string | Date;
}
interface RevisionRow extends QueryResultRow { revision: number; }
interface CountRow extends QueryResultRow { count: number | string; }

const DEFAULT_DAILY_MINUTES = 25;
const DEFAULT_PLAN_STYLE: PersonalizedPlanStyle = 'BALANCED';
const MAX_DAILY_ACTIONS = 4;

function appError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function indiaDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

async function studentIdForUser(userId: UUID): Promise<UUID> {
  const { rows: [student] } = await query<StudentRow>(
    `SELECT id FROM students WHERE user_id=$1 AND status='ACTIVE'`,
    [userId],
  );
  if (!student) throw appError('Student profile not found', 404);
  return student.id;
}

async function preferencesByStudentId(studentId: UUID): Promise<{ dailyMinutes: number; planStyle: PersonalizedPlanStyle }> {
  const { rows: [row] } = await query<PreferenceRow>(
    `SELECT daily_minutes,plan_style FROM student_adaptive_preferences WHERE student_id=$1`,
    [studentId],
  );
  return {
    dailyMinutes: Number(row?.daily_minutes || DEFAULT_DAILY_MINUTES),
    planStyle: row?.plan_style || DEFAULT_PLAN_STYLE,
  };
}

async function buildSourcePlan(userId: UUID): Promise<JourneyPlanSource> {
  const mastery = await getStudentConceptMastery(userId);
  const base = await getAdaptiveLearningPlan(userId, mastery);
  if (!(await diagnosticIntelligenceAvailable())) return base;
  return enrichAdaptivePlanWithDiagnostics(userId, base);
}

function urgencyWeight(urgency: JourneyAction['urgency']): number {
  return urgency === 'HIGH' ? 0 : urgency === 'FOCUS' ? 100 : 200;
}

function selectActions(
  plan: JourneyPlanSource,
  dailyMinutes: number,
  planStyle: PersonalizedPlanStyle,
): JourneyAction[] {
  const source = plan.actions as JourneyAction[];
  const remaining = [...source];
  const chosen: JourneyAction[] = [];
  const usedConcepts = new Set<string>();
  const usedTargets = new Set<string>();
  let minutesLeft = dailyMinutes;
  let lastSubject: string | null = null;

  while (remaining.length > 0 && chosen.length < MAX_DAILY_ACTIONS) {
    const candidates = remaining
      .filter((action) => !usedConcepts.has(action.conceptId) && !usedTargets.has(`${action.target.kind}:${action.target.id}`))
      .filter((action) => action.estimatedMinutes <= minutesLeft)
      .sort((a, b) => {
        const urgency = urgencyWeight(a.urgency) - urgencyWeight(b.urgency);
        if (urgency !== 0) return urgency;
        const balanceA = planStyle === 'BALANCED' && lastSubject && a.subjectCode === lastSubject ? 8 : 0;
        const balanceB = planStyle === 'BALANCED' && lastSubject && b.subjectCode === lastSubject ? 8 : 0;
        return (a.rank + balanceA) - (b.rank + balanceB);
      });

    const next = candidates[0];
    if (!next) break;
    chosen.push(next);
    usedConcepts.add(next.conceptId);
    usedTargets.add(`${next.target.kind}:${next.target.id}`);
    minutesLeft -= next.estimatedMinutes;
    lastSubject = next.subjectCode;
    const index = remaining.findIndex((item) => item.id === next.id);
    if (index >= 0) remaining.splice(index, 1);
  }

  // Never return an empty journey merely because an individual high-value step
  // is slightly longer than the chosen budget. The current action estimates are
  // intentionally short, but this keeps the planner safe if content changes.
  if (chosen.length === 0 && source[0]) chosen.push(source[0]);
  return chosen;
}

async function activePlan(studentId: UUID, planDate: string): Promise<PlanRow | null> {
  const { rows: [row] } = await query<PlanRow>(
    `SELECT id,plan_date,revision,status,daily_minutes,plan_style,headline,explanation,
            estimated_minutes,source_generated_at,completed_at,created_at
     FROM student_daily_learning_plans
     WHERE student_id=$1 AND plan_date=$2::date AND status='ACTIVE'
     ORDER BY revision DESC LIMIT 1`,
    [studentId, planDate],
  );
  return row || null;
}

async function latestPlan(studentId: UUID, planDate: string): Promise<PlanRow | null> {
  const { rows: [row] } = await query<PlanRow>(
    `SELECT id,plan_date,revision,status,daily_minutes,plan_style,headline,explanation,
            estimated_minutes,source_generated_at,completed_at,created_at
     FROM student_daily_learning_plans
     WHERE student_id=$1 AND plan_date=$2::date
     ORDER BY revision DESC LIMIT 1`,
    [studentId, planDate],
  );
  return row || null;
}

async function itemsForPlan(planId: UUID): Promise<ItemRow[]> {
  const { rows } = await query<ItemRow>(
    `SELECT id,position,source_action_id,concept_id,action_type,urgency,target_kind,target_id,
            target_public_slug,target_title,title,reason,estimated_minutes,status,completed_at,skipped_at,created_at
     FROM student_daily_learning_plan_items WHERE plan_id=$1 ORDER BY position`,
    [planId],
  );
  return rows;
}

async function targetCompleted(studentId: UUID, item: ItemRow): Promise<boolean> {
  if (item.target_kind === 'RESOURCE') {
    const { rows: [row] } = await query<CountRow>(
      `SELECT COUNT(*)::int AS count
       FROM student_learning_resource_progress
       WHERE student_id=$1 AND resource_id=$2
         AND is_completed=TRUE
         AND last_accessed >= $3::timestamptz`,
      [studentId, item.target_id, item.created_at],
    );
    return Number(row?.count || 0) > 0;
  }

  const { rows: [row] } = await query<CountRow>(
    `SELECT COUNT(*)::int AS count
     FROM student_learning_attempts
     WHERE student_id=$1 AND assessment_id=$2 AND status='GRADED'
       AND submitted_at >= $3::timestamptz`,
    [studentId, item.target_id, item.created_at],
  );
  return Number(row?.count || 0) > 0;
}

async function reconcilePlan(studentId: UUID, plan: PlanRow): Promise<void> {
  if (plan.status !== 'ACTIVE') return;
  const items = await itemsForPlan(plan.id);
  for (const item of items) {
    if (item.status !== 'PENDING') continue;
    if (await targetCompleted(studentId, item)) {
      await query(
        `UPDATE student_daily_learning_plan_items
         SET status='COMPLETED',completed_at=NOW(),skipped_at=NULL
         WHERE id=$1 AND plan_id=$2 AND status='PENDING'`,
        [item.id, plan.id],
      );
    }
  }

  const { rows: [pending] } = await query<CountRow>(
    `SELECT COUNT(*)::int AS count FROM student_daily_learning_plan_items
     WHERE plan_id=$1 AND status='PENDING'`,
    [plan.id],
  );
  if (Number(pending?.count || 0) === 0) {
    await query(
      `UPDATE student_daily_learning_plans SET status='COMPLETED',completed_at=COALESCE(completed_at,NOW())
       WHERE id=$1 AND status='ACTIVE'`,
      [plan.id],
    );
  }
}

function serializePlan(plan: PlanRow, items: ItemRow[]) {
  const completedMinutes = items
    .filter((item) => item.status === 'COMPLETED')
    .reduce((sum, item) => sum + Number(item.estimated_minutes || 0), 0);
  const closedItems = items.filter((item) => item.status !== 'PENDING').length;
  return {
    id: plan.id,
    date: typeof plan.plan_date === 'string' ? plan.plan_date : plan.plan_date.toISOString().slice(0, 10),
    revision: Number(plan.revision),
    status: plan.status,
    dailyMinutes: Number(plan.daily_minutes),
    planStyle: plan.plan_style,
    headline: plan.headline,
    explanation: plan.explanation,
    estimatedMinutes: Number(plan.estimated_minutes || 0),
    completedMinutes,
    remainingMinutes: Math.max(0, Number(plan.estimated_minutes || 0) - completedMinutes),
    progressPct: items.length ? Math.round((closedItems / items.length) * 100) : 100,
    sourceGeneratedAt: plan.source_generated_at,
    completedAt: plan.completed_at,
    items: items.map((item) => ({
      id: item.id,
      position: Number(item.position),
      conceptId: item.concept_id,
      actionType: item.action_type,
      urgency: item.urgency,
      title: item.title,
      reason: item.reason,
      estimatedMinutes: Number(item.estimated_minutes),
      status: item.status,
      completedAt: item.completed_at,
      skippedAt: item.skipped_at,
      target: {
        kind: item.target_kind,
        id: item.target_id,
        publicSlug: item.target_public_slug,
        title: item.target_title,
      },
    })),
  };
}

async function persistNewPlan(
  studentId: UUID,
  planDate: string,
  preferences: { dailyMinutes: number; planStyle: PersonalizedPlanStyle },
  sourcePlan: JourneyPlanSource,
): Promise<PlanRow> {
  const selected = selectActions(sourcePlan, preferences.dailyMinutes, preferences.planStyle);
  const estimatedMinutes = selected.reduce((sum, item) => sum + item.estimatedMinutes, 0);
  const explanation = selected.length
    ? `Built for about ${preferences.dailyMinutes} minutes from your current mastery, proficiency, confidence, misconception, retention and prerequisite evidence. The plan stays stable today so you can finish it without recommendation churn.`
    : 'No urgent mapped learning action is available today. VidyaSetu will add a new journey when reviewed learning content or new learner evidence creates a useful next step.';

  return transaction(async (client) => {
    const { rows: [revisionRow] } = await client.query<RevisionRow>(
      `SELECT COALESCE(MAX(revision),0)::int + 1 AS revision
       FROM student_daily_learning_plans WHERE student_id=$1 AND plan_date=$2::date`,
      [studentId, planDate],
    );
    const revision = Number(revisionRow?.revision || 1);
    const status = selected.length ? 'ACTIVE' : 'COMPLETED';
    const { rows: [created] } = await client.query<PlanRow>(
      `INSERT INTO student_daily_learning_plans
         (student_id,plan_date,revision,status,daily_minutes,plan_style,headline,explanation,
          estimated_minutes,source_generated_at,completed_at)
       VALUES($1,$2::date,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id,plan_date,revision,status,daily_minutes,plan_style,headline,explanation,
                 estimated_minutes,source_generated_at,completed_at,created_at`,
      [
        studentId, planDate, revision, status, preferences.dailyMinutes, preferences.planStyle,
        sourcePlan.headline, explanation, estimatedMinutes, sourcePlan.generatedAt,
        selected.length ? null : new Date(),
      ],
    );
    if (!created) throw appError('Could not create personalized learning journey', 500);

    for (let index = 0; index < selected.length; index += 1) {
      const action = selected[index];
      await client.query(
        `INSERT INTO student_daily_learning_plan_items
           (plan_id,position,source_action_id,concept_id,action_type,urgency,target_kind,target_id,
            target_public_slug,target_title,title,reason,estimated_minutes)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          created.id, index + 1, action.id, action.conceptId, action.actionType, action.urgency,
          action.target.kind, action.target.id, action.target.publicSlug || null, action.target.title,
          action.title, action.reason, action.estimatedMinutes,
        ],
      );
    }
    return created;
  });
}

export async function getPersonalizedPreferences(userId: UUID) {
  const studentId = await studentIdForUser(userId);
  return preferencesByStudentId(studentId);
}

export async function updatePersonalizedPreferences(
  userId: UUID,
  input: { dailyMinutes: number; planStyle?: PersonalizedPlanStyle },
) {
  const studentId = await studentIdForUser(userId);
  const current = await preferencesByStudentId(studentId);
  const dailyMinutes = Number(input.dailyMinutes);
  if (![15, 25, 40].includes(dailyMinutes)) throw appError('Daily learning time must be 15, 25 or 40 minutes', 400);
  const planStyle = input.planStyle || current.planStyle;
  if (!['BALANCED', 'FOCUS'].includes(planStyle)) throw appError('Unsupported personalized plan style', 400);
  const planDate = indiaDate();

  await transaction(async (client) => {
    await client.query(
      `INSERT INTO student_adaptive_preferences(student_id,daily_minutes,plan_style)
       VALUES($1,$2,$3)
       ON CONFLICT(student_id) DO UPDATE SET daily_minutes=EXCLUDED.daily_minutes,plan_style=EXCLUDED.plan_style`,
      [studentId, dailyMinutes, planStyle],
    );
    await client.query(
      `UPDATE student_daily_learning_plans
       SET status='SUPERSEDED'
       WHERE student_id=$1 AND plan_date=$2::date AND status='ACTIVE'`,
      [studentId, planDate],
    );
  });
  return { dailyMinutes, planStyle, journeyWillRefresh: true };
}

export async function getTodayPersonalizedJourney(userId: UUID) {
  const studentId = await studentIdForUser(userId);
  const planDate = indiaDate();
  const preferences = await preferencesByStudentId(studentId);
  let plan = await activePlan(studentId, planDate);

  if (plan) {
    await reconcilePlan(studentId, plan);
    plan = await activePlan(studentId, planDate);
    if (!plan) {
      const completed = await latestPlan(studentId, planDate);
      if (completed) return { preferences, journey: serializePlan(completed, await itemsForPlan(completed.id)) };
    }
  }

  if (!plan) {
    const latest = await latestPlan(studentId, planDate);
    if (latest?.status === 'COMPLETED') {
      return { preferences, journey: serializePlan(latest, await itemsForPlan(latest.id)) };
    }
    const sourcePlan = await buildSourcePlan(userId);
    plan = await persistNewPlan(studentId, planDate, preferences, sourcePlan);
  }

  const items = await itemsForPlan(plan.id);
  return { preferences, journey: serializePlan(plan, items) };
}

export async function skipPersonalizedJourneyItem(userId: UUID, itemId: UUID) {
  const studentId = await studentIdForUser(userId);
  const planDate = indiaDate();
  const { rows: [item] } = await query<{ id: UUID; plan_id: UUID } & QueryResultRow>(
    `SELECT item.id,item.plan_id
     FROM student_daily_learning_plan_items item
     JOIN student_daily_learning_plans plan ON plan.id=item.plan_id
     WHERE item.id=$1 AND plan.student_id=$2 AND plan.plan_date=$3::date
       AND plan.status='ACTIVE' AND item.status='PENDING'`,
    [itemId, studentId, planDate],
  );
  if (!item) throw appError('Active personalized learning step not found', 404);
  await query(
    `UPDATE student_daily_learning_plan_items SET status='SKIPPED',skipped_at=NOW() WHERE id=$1`,
    [item.id],
  );
  const plan = await activePlan(studentId, planDate);
  if (plan) await reconcilePlan(studentId, plan);
  return getTodayPersonalizedJourney(userId);
}
