import cron from 'node-cron';
import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';
import * as notificationService from '../services/notification.service';
import logger = require('../utils/logger');

interface SchoolRow extends QueryResultRow {
  id: UUID;
}

interface OverdueInvoiceRow extends QueryResultRow {
  id: UUID;
  amount_due: string | number;
  due_date: string | Date;
  student_name: string;
  parent_mobile: string;
  student_id: UUID;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

cron.schedule('0 9 * * *', async () => {
  logger.info('[FeeReminder Job] Starting...');
  try {
    const { rows: schools } = await query<SchoolRow>(
      `SELECT id FROM schools WHERE status = 'ACTIVE'`,
    );

    let totalSent = 0;

    for (const school of schools) {
      try {
        const { rows: overdueList } = await query<OverdueInvoiceRow>(
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
          [school.id],
        );

        for (const invoice of overdueList) {
          try {
            const dueDateStr = new Date(invoice.due_date).toLocaleDateString('hi-IN');
            await notificationService.notifyFeeReminder(
              invoice.parent_mobile,
              invoice.student_name,
              invoice.amount_due,
              dueDateStr,
            );

            await notificationService.saveNotification({
              userId: invoice.student_id,
              type: 'FEE_DUE',
              channel: 'WHATSAPP',
              title: 'Fee Reminder',
              body: `Fee of ₹${invoice.amount_due} is due on ${dueDateStr}`,
              refId: invoice.id,
              refType: 'FEE_INVOICE',
            });

            totalSent += 1;
          } catch (error: unknown) {
            logger.error(
              `[FeeReminder] Failed for mobile ${invoice.parent_mobile}: ${errorMessage(error)}`,
            );
          }
        }
      } catch (error: unknown) {
        logger.error(`[FeeReminder] Error for school ${school.id}: ${errorMessage(error)}`);
      }
    }

    logger.info(`[FeeReminder Job] Done. Sent ${totalSent} reminders.`);
  } catch (err: unknown) {
    logger.error('[FeeReminder Job] Fatal error:', err);
  }
}, {
  timezone: 'Asia/Kolkata',
});

logger.info('[FeeReminder Job] Scheduled — runs daily at 09:00 IST');
