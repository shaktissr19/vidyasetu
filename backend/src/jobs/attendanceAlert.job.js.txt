// jobs/attendanceAlert.job.js
// Runs every school day at 10:30 AM IST
// Sends WhatsApp alerts to parents of absent students

const cron = require('node-cron');
const { query } = require('../config/db');
const notificationService = require('../services/notification.service');
const logger = require('../utils/logger');

cron.schedule('30 10 * * 1-6', async () => {
  // Mon–Sat, 10:30 AM IST
  logger.info('[AttendanceAlert Job] Starting...');

  const today = new Date().toISOString().split('T')[0];

  try {
    // Find all students marked ABSENT today who haven't been notified yet
    const { rows: absentStudents } = await query(
      `SELECT a.id AS attendance_id,
              u.name AS student_name,
              pu.mobile AS parent_mobile,
              a.student_id
       FROM attendance a
       JOIN students st ON st.id = a.student_id
       JOIN users u ON u.id = st.user_id
       JOIN parent_student_links psl ON psl.student_id = st.id AND psl.is_primary = TRUE
       JOIN users pu ON pu.id = psl.parent_user_id
       WHERE a.date = $1
         AND a.status = 'ABSENT'
         AND a.notified_parent = FALSE
       LIMIT 500`,
      [today]
    );

    let sent = 0;

    for (const student of absentStudents) {
      try {
        await notificationService.notifyAttendanceAbsent(
          student.parent_mobile,
          student.student_name,
          today
        );

        // Mark as notified
        await query(
          `UPDATE attendance SET notified_parent = TRUE, notified_at = NOW() WHERE id = $1`,
          [student.attendance_id]
        );

        // Save in-app notification
        await notificationService.saveNotification({
          userId:  student.student_id,
          type:    'ATTENDANCE_ABSENT',
          channel: 'WHATSAPP',
          title:   'Attendance Alert',
          body:    `${student.student_name} was marked absent on ${today}`,
          refId:   student.attendance_id,
          refType: 'ATTENDANCE',
        });

        sent++;
      } catch (e) {
        logger.error(`[AttendanceAlert] Failed for ${student.parent_mobile}: ${e.message}`);
      }
    }

    logger.info(`[AttendanceAlert Job] Done. Alerted ${sent} parents for date ${today}`);
  } catch (err) {
    logger.error('[AttendanceAlert Job] Fatal error:', err);
  }
}, {
  timezone: 'Asia/Kolkata',
});

logger.info('[AttendanceAlert Job] Scheduled — runs Mon–Sat at 10:30 IST');
