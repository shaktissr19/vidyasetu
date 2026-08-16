// jobs/xpRecalc.job.js
// Runs every night at 11:30 PM IST
// 1. Resets streaks for students who missed a day
// 2. Marks overdue fee invoices
// 3. Triggers competition leaderboard refresh if any exam ended today

const cron = require('node-cron');
const { query } = require('../config/db');
const logger = require('../utils/logger');

cron.schedule('30 23 * * *', async () => {
  logger.info('[XpRecalc Job] Starting nightly maintenance...');

  await resetMissedStreaks();
  await markOverdueInvoices();
  await refreshEndedExamLeaderboards();

  logger.info('[XpRecalc Job] Done.');
}, {
  timezone: 'Asia/Kolkata',
});

/**
 * Reset streak to 0 for students who had no activity yesterday.
 */
async function resetMissedStreaks() {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yday = yesterday.toISOString().split('T')[0];

    // Students with streak > 0 who did NOT log activity yesterday
    const { rows: affected } = await query(
      `UPDATE students
       SET streak_current = 0, updated_at = NOW()
       WHERE streak_current > 0
         AND (last_activity_date IS NULL OR last_activity_date < $1)
       RETURNING id`,
      [yday]
    );

    logger.info(`[XpRecalc] Reset streaks for ${affected.length} inactive students`);
  } catch (err) {
    logger.error('[XpRecalc] Streak reset error:', err);
  }
}

/**
 * Mark fee invoices as OVERDUE if due_date has passed.
 */
async function markOverdueInvoices() {
  try {
    const { rowCount } = await query(
      `UPDATE fee_invoices
       SET status = 'OVERDUE', updated_at = NOW()
       WHERE status = 'PENDING'
         AND due_date < CURRENT_DATE`
    );
    logger.info(`[XpRecalc] Marked ${rowCount} invoices as OVERDUE`);
  } catch (err) {
    logger.error('[XpRecalc] Overdue invoice mark error:', err);
  }
}

/**
 * Refresh leaderboards for competitions that ended today.
 */
async function refreshEndedExamLeaderboards() {
  try {
    const { rows: endedExams } = await query(
      `SELECT id FROM exams
       WHERE status = 'LIVE'
         AND end_time < NOW()`
    );

    if (!endedExams.length) return;

    const { recomputeLeaderboard } = require('../services/competition.service');

    for (const exam of endedExams) {
      try {
        await recomputeLeaderboard(exam.id);

        // Mark exam as COMPLETED
        await query(
          `UPDATE exams SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1`,
          [exam.id]
        );

        logger.info(`[XpRecalc] Leaderboard refreshed for exam ${exam.id}`);
      } catch (e) {
        logger.error(`[XpRecalc] Leaderboard error for exam ${exam.id}:`, e.message);
      }
    }
  } catch (err) {
    logger.error('[XpRecalc] Exam leaderboard refresh error:', err);
  }
}

logger.info('[XpRecalc Job] Scheduled — runs nightly at 23:30 IST');
