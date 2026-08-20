import cron from 'node-cron';
import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';
import logger = require('../utils/logger');

interface IdRow extends QueryResultRow {
  id: UUID;
}

interface CompetitionService {
  recomputeLeaderboard(examId: UUID): Promise<unknown>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

cron.schedule('30 23 * * *', async () => {
  logger.info('[XpRecalc Job] Starting nightly maintenance...');

  await resetMissedStreaks();
  await markOverdueInvoices();
  await refreshEndedExamLeaderboards();

  logger.info('[XpRecalc Job] Done.');
}, {
  timezone: 'Asia/Kolkata',
});

async function resetMissedStreaks(): Promise<void> {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yday = yesterday.toISOString().split('T')[0];

    const { rows: affected } = await query<IdRow>(
      `UPDATE students
       SET streak_current = 0,
           updated_at = NOW()
       WHERE streak_current > 0
         AND (last_activity IS NULL OR last_activity < $1::date)
       RETURNING id`,
      [yday],
    );

    logger.info(`[XpRecalc] Reset streaks for ${affected.length} inactive students`);
  } catch (err: unknown) {
    logger.error('[XpRecalc] Streak reset error:', err);
  }
}

async function markOverdueInvoices(): Promise<void> {
  try {
    const { rowCount } = await query(
      `UPDATE fee_invoices
       SET status = 'OVERDUE', updated_at = NOW()
       WHERE status = 'PENDING'
         AND due_date < CURRENT_DATE`,
    );
    logger.info(`[XpRecalc] Marked ${rowCount} invoices as OVERDUE`);
  } catch (err: unknown) {
    logger.error('[XpRecalc] Overdue invoice mark error:', err);
  }
}

async function refreshEndedExamLeaderboards(): Promise<void> {
  try {
    const { rows: endedExams } = await query<IdRow>(
      `SELECT id FROM exams
       WHERE status = 'LIVE'
         AND end_time < NOW()`,
    );

    if (!endedExams.length) return;

    const competitionService = require('../services/competition.service') as CompetitionService;

    for (const exam of endedExams) {
      try {
        await competitionService.recomputeLeaderboard(exam.id);

        await query(
          `UPDATE exams
           SET status = 'COMPLETED', updated_at = NOW()
           WHERE id = $1`,
          [exam.id],
        );

        logger.info(`[XpRecalc] Leaderboard refreshed for exam ${exam.id}`);
      } catch (error: unknown) {
        logger.error(
          `[XpRecalc] Leaderboard error for exam ${exam.id}:`,
          errorMessage(error),
        );
      }
    }
  } catch (err: unknown) {
    logger.error('[XpRecalc] Exam leaderboard refresh error:', err);
  }
}

logger.info('[XpRecalc Job] Scheduled — runs nightly at 23:30 IST');
