// services/parent.service.js
const { query } = require('../config/db');

/**
 * Get all children linked to this parent.
 */
async function getChildren(parentUserId) {
  const { rows } = await query(
    `SELECT s.id, s.xp_total, s.xp_level, s.streak_current, s.roll_number,
            u.name, u.profile_photo,
            sc.class_name, sc.section,
            sch.name AS school_name,
            psl.relation
     FROM parent_student_links psl
     JOIN students s ON s.id = psl.student_id
     JOIN users u ON u.id = s.user_id
     JOIN school_classes sc ON sc.id = s.class_id
     JOIN schools sch ON sch.id = s.school_id
     WHERE psl.parent_user_id = $1
     ORDER BY sc.class_name`,
    [parentUserId]
  );
  return rows;
}

/**
 * Full dashboard for one child.
 */
async function getChildDashboard(parentUserId, studentId) {
  // Verify this parent has access to this student
  const { rows: [link] } = await query(
    `SELECT id FROM parent_student_links WHERE parent_user_id = $1 AND student_id = $2`,
    [parentUserId, studentId]
  );
  if (!link) throw Object.assign(new Error('Access denied to this student'), { statusCode: 403 });

  // Student details
  const { rows: [student] } = await query(
    `SELECT s.*, u.name, u.mobile, sc.class_name, sc.section, sch.name AS school_name
     FROM students s
     JOIN users u ON u.id = s.user_id
     JOIN school_classes sc ON sc.id = s.class_id
     JOIN schools sch ON sch.id = s.school_id
     WHERE s.id = $1`,
    [studentId]
  );

  // This month's attendance
  const { rows: [attendance] } = await query(
    `SELECT present_days, absent_days, percentage
     FROM attendance_monthly_summary
     WHERE student_id = $1
       AND year  = EXTRACT(YEAR  FROM NOW())
       AND month = EXTRACT(MONTH FROM NOW())`,
    [studentId]
  );

  // Today's attendance
  const { rows: [todayAtt] } = await query(
    `SELECT status, DATE_PART('hour', created_at) AS hour
     FROM attendance WHERE student_id = $1 AND date = CURRENT_DATE`,
    [studentId]
  );

  // Subject-wise progress
  const { rows: subjectProgress } = await query(
    `SELECT sub.name, sub.code, sub.color_hex,
            ROUND(COUNT(scp.id) FILTER (WHERE scp.is_completed) ::DECIMAL /
                  NULLIF(COUNT(ci.id), 0) * 100) AS progress_pct
     FROM subjects sub
     JOIN chapters ch ON ch.subject_id = sub.id AND ch.class_name = $2
     JOIN content_items ci ON ci.chapter_id = ch.id AND ci.status = 'PUBLISHED'
     LEFT JOIN student_content_progress scp ON scp.content_item_id = ci.id AND scp.student_id = $1
     GROUP BY sub.id, sub.name, sub.code, sub.color_hex`,
    [studentId, student.class_name]
  );

  // Recent exam scores
  const { rows: recentExams } = await query(
    `SELECT e.title, ea.score, e.total_marks, ea.submitted_at
     FROM exam_attempts ea
     JOIN exams e ON e.id = ea.exam_id
     WHERE ea.student_id = $1 AND ea.status = 'EVALUATED'
     ORDER BY ea.submitted_at DESC LIMIT 5`,
    [studentId]
  );

  // Fee status
  const { rows: fees } = await query(
    `SELECT fi.invoice_number, fi.amount_due, fi.amount_paid, fi.status, fi.due_date, fi.term
     FROM fee_invoices fi
     WHERE fi.student_id = $1 AND fi.academic_year = '2025-26'
     ORDER BY fi.term`,
    [studentId]
  );

  // Recent notifications for this parent about this child
  const { rows: notifications } = await query(
    `SELECT type, title, body, created_at, read_at
     FROM notifications
     WHERE user_id = $1 AND ref_id = $2
     ORDER BY created_at DESC LIMIT 10`,
    [parentUserId, studentId]
  );

  return {
    student,
    attendance: attendance || { present_days: 0, absent_days: 0, percentage: 0 },
    todayAttendance: todayAtt || null,
    subjectProgress,
    recentExams,
    fees,
    notifications,
  };
}

/**
 * Get detailed attendance history for a child.
 */
async function getChildAttendance(parentUserId, studentId, year, month) {
  const { rows: [link] } = await query(
    `SELECT id FROM parent_student_links WHERE parent_user_id = $1 AND student_id = $2`,
    [parentUserId, studentId]
  );
  if (!link) throw Object.assign(new Error('Access denied'), { statusCode: 403 });

  const { rows } = await query(
    `SELECT date, status, remark FROM attendance
     WHERE student_id = $1
       AND EXTRACT(YEAR  FROM date) = $2
       AND EXTRACT(MONTH FROM date) = $3
     ORDER BY date`,
    [studentId, year, month]
  );

  const { rows: [summary] } = await query(
    `SELECT * FROM attendance_monthly_summary
     WHERE student_id = $1 AND year = $2 AND month = $3`,
    [studentId, year, month]
  );

  return { records: rows, summary };
}

/**
 * Get fee invoices for a child.
 */
async function getChildFees(parentUserId, studentId) {
  const { rows: [link] } = await query(
    `SELECT id FROM parent_student_links WHERE parent_user_id = $1 AND student_id = $2`,
    [parentUserId, studentId]
  );
  if (!link) throw Object.assign(new Error('Access denied'), { statusCode: 403 });

  const { rows } = await query(
    `SELECT fi.*, fp.payment_mode, fp.payment_date, fp.receipt_number
     FROM fee_invoices fi
     LEFT JOIN fee_payments fp ON fp.invoice_id = fi.id
     WHERE fi.student_id = $1
     ORDER BY fi.academic_year DESC, fi.term`,
    [studentId]
  );
  return rows;
}

/**
 * Get messages between this parent and the class teacher.
 */
async function getMessages(parentUserId, studentId) {
  const { rows: [link] } = await query(
    `SELECT id FROM parent_student_links WHERE parent_user_id = $1 AND student_id = $2`,
    [parentUserId, studentId]
  );
  if (!link) throw Object.assign(new Error('Access denied'), { statusCode: 403 });

  const { rows } = await query(
    `SELECT m.*, u.name AS sender_name
     FROM teacher_parent_messages m
     JOIN users u ON u.id = m.sent_by
     WHERE m.receiver_id = $1 AND m.student_id = $2
     ORDER BY m.created_at ASC`,
    [parentUserId, studentId]
  );
  return rows;
}

/**
 * Send a message to the class teacher.
 */
async function sendMessage(parentUserId, studentId, body) {
  // Find class teacher for this student's class
  const { rows: [teacher] } = await query(
    `SELECT ta.teacher_id
     FROM students s
     JOIN teacher_assignments ta ON ta.class_id = s.class_id AND ta.is_class_teacher = TRUE
     WHERE s.id = $1
     LIMIT 1`,
    [studentId]
  );

  if (!teacher) throw Object.assign(new Error('No class teacher assigned yet'), { statusCode: 404 });

  const { rows: [msg] } = await query(
    `INSERT INTO teacher_parent_messages (school_id, student_id, sender_id, receiver_id, body)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [teacher.teacher_id, parentUserId, studentId, parentUserId, body]
  );
  return msg;
}

/**
 * Get all notifications for a parent.
 */
async function getNotifications(parentUserId) {
  const { rows } = await query(
    `SELECT * FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC LIMIT 50`,
    [parentUserId]
  );
  return rows;
}

module.exports = {
  getChildren,
  getChildDashboard,
  getChildAttendance,
  getChildFees,
  getMessages,
  sendMessage,
  getNotifications,
};
