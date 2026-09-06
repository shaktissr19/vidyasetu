import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';

interface AvailabilityRow extends QueryResultRow { ready: boolean; }
interface PlanRow extends QueryResultRow {
  id: UUID;
  daily_minutes: number;
  headline: string;
  status: 'ACTIVE' | 'COMPLETED';
  revision: number;
}
interface ItemRow extends QueryResultRow {
  position: number;
  action_type: string;
  status: string;
  title: string;
  reason: string;
  target_title: string;
  concept_code: string;
}

export interface AIPersonalizedJourneyContext {
  planId: UUID;
  status: 'ACTIVE' | 'COMPLETED';
  revision: number;
  dailyMinutes: number;
  headline: string;
  items: Array<{
    position: number;
    actionType: string;
    status: string;
    title: string;
    reason: string;
    targetTitle: string;
    conceptCode: string;
  }>;
}

export async function personalizedJourneyContextAvailable(): Promise<boolean> {
  const { rows: [row] } = await query<AvailabilityRow>(
    `SELECT (
       to_regclass('public.student_daily_learning_plans') IS NOT NULL
       AND to_regclass('public.student_daily_learning_plan_items') IS NOT NULL
     ) AS ready`,
  );
  return Boolean(row?.ready);
}

export async function getAIPersonalizedJourneyContext(
  studentId: UUID,
  conceptCode?: string | null,
): Promise<AIPersonalizedJourneyContext | null> {
  if (!(await personalizedJourneyContextAvailable())) return null;
  const { rows: [plan] } = await query<PlanRow>(
    `SELECT id,daily_minutes,headline,status,revision
     FROM student_daily_learning_plans
     WHERE student_id=$1
       AND plan_date=(NOW() AT TIME ZONE 'Asia/Kolkata')::date
       AND status IN ('ACTIVE','COMPLETED')
     ORDER BY revision DESC LIMIT 1`,
    [studentId],
  );
  if (!plan) return null;

  const normalizedConcept = String(conceptCode || '').trim().toUpperCase();
  const { rows } = await query<ItemRow>(
    `SELECT item.position,item.action_type,item.status,item.title,item.reason,item.target_title,lc.code AS concept_code
     FROM student_daily_learning_plan_items item
     JOIN learning_concepts lc ON lc.id=item.concept_id
     WHERE item.plan_id=$1
     ORDER BY
       CASE WHEN $2::text<>'' AND UPPER(lc.code)=$2 THEN 0 ELSE 1 END,
       CASE item.status WHEN 'PENDING' THEN 0 WHEN 'COMPLETED' THEN 1 ELSE 2 END,
       item.position
     LIMIT 4`,
    [plan.id, normalizedConcept],
  );

  return {
    planId: plan.id,
    status: plan.status,
    revision: Number(plan.revision),
    dailyMinutes: Number(plan.daily_minutes),
    headline: plan.headline,
    items: rows.map((row) => ({
      position: Number(row.position),
      actionType: row.action_type,
      status: row.status,
      title: row.title,
      reason: row.reason,
      targetTitle: row.target_title,
      conceptCode: row.concept_code,
    })),
  };
}

export function personalizedJourneyContextAsTutorHistory(
  context: AIPersonalizedJourneyContext | null,
): string | null {
  if (!context) return null;
  const steps = context.items.length
    ? context.items.map((item) => `${item.position}. [${item.status}] ${item.actionType}: ${item.title} (${item.conceptCode}) — ${item.reason}`).join('\n')
    : 'No mapped journey step is currently pending.';
  return [
    'VIDYASETU VERIFIED DAILY JOURNEY',
    `Daily budget: ${context.dailyMinutes} minutes; plan status: ${context.status}; revision: ${context.revision}.`,
    `Headline: ${context.headline}`,
    steps,
    'Use this only to keep guidance consistent with the learner’s current VidyaSetu plan. It is a recommendation snapshot, not academic evidence. Never override verified concept evidence or claim a step was completed unless its status says COMPLETED.',
  ].join('\n');
}
