// jobs/feeReminder.job.js
// Runs every day at 9:00 AM IST
// Sends WhatsApp reminders to parents of students with pending/overdue fees

const cron = require('node-cron');
const { query } = require('../config/db');
const notificationService = require('../services/notification.service');
const logger = require('../utils/logger');

cron.schedule('0 9 * * *', async () => {
  logger.info('[FeeReminder Job] Starting...');
  try {
    // Get all active schools
    const { rows: schools } = await query(
      `SELECT id FROM schools WHERE status = 'ACTIVE'`
    );

    let totalSent = 0;

    for (const school of schools) {
      try {
        // Get overdue invoices with parent contacts
        const { rows: overdueList } = await query(
          `SELECT fi.id, fi.amount_due, fi.due_date,
                  u.name AS student_name,
                  pu.mobile AS parent_mobile,
                  fi.student_id
           FROM fee_invoices fi
           JOIN students st ON st.id = fi.student_id
           JOIN users u ON u.id = st.user_id
           JOIN parent_student_links psl ON psl.student_id = st.id AND psl.is_primary = TRUE
           JOIN users pu ON pu.id = psl.parent_user_id
           WHERE fi.school_id = $1
             AND fi.status IN ('PENDING', 'OVERDUE')
             AND fi.due_date <= CURRENT_DATE + INTERVAL '3 days'
           LIMIT 200`,
          [school.id]
        );

        for (const invoice of overdueList) {
          try {
            const dueDateStr = new Date(invoice.due_date).toLocaleDateString('hi-IN');
            await notificationService.notifyFeeReminder(
              invoice.parent_mobile,
              invoice.student_name,
              invoice.amount_due,
              dueDateStr
            );

            // Save notification record
            await notificationService.saveNotification({
              userId:   invoice.student_id, // notification for the student record
              type:     'FEE_DUE',
              channel:  'WHATSAPP',
              title:    'Fee Reminder',
              body:     `Fee of ₹${invoice.amount_due} is due on ${dueDateStr}`,
              refId:    invoice.id,
              refType:  'FEE_INVOICE',
            });

            totalSent++;
          } catch (e) {
            logger.error(`[FeeReminder] Failed for mobile ${invoice.parent_mobile}: ${e.message}`);
          }
        }
      } catch (schoolErr) {
        logger.error(`[FeeReminder] Error for school ${school.id}: ${schoolErr.message}`);
      }
    }

    logger.info(`[FeeReminder Job] Done. Sent ${totalSent} reminders.`);
  } catch (err) {
    logger.error('[FeeReminder Job] Fatal error:', err);
  }
}, {
  timezone: 'Asia/Kolkata',
});

logger.info('[FeeReminder Job] Scheduled — runs daily at 09:00 IST');
