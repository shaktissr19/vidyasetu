// services/parent.service.js
const { query } = require('../config/db');

async function assertParentLink(parentUserId, studentId) {
  const { rows: [link] } = await query(
    `SELECT id FROM parent_student_links WHERE parent_user_id = $1 AND student_id = $2`,
    [parentUserId, studentId]
  );
  if (!link) throw Object.assign(new Error('Access denied to this student'), { statusCode: 403 });
  return link;
}

async function getChildren(parentUserId) {
  const { rows } = await query(
    `SELECT s.id, s.student_code, s.grade_level, s.school_link_status, s.roll_number,
            u.name, u.username, u.profile_photo,
            COALESCE(sc.class_name, s.grade_level) AS class_name, sc.section,
            sch.name AS school_name,
            psl.relation
     FROM parent_student_links psl
     JOIN students s ON s.id = psl.student_id
     JOIN users u ON u.id = s.user_id
     LEFT JOIN school_classes sc ON sc.id = s.class_id
     LEFT JOIN schools sch ON sch.id = s.school_id
     WHERE psl.parent_user_id = $1
     ORDER BY u.name`,
    [parentUserId]
  );
  return rows;
}

async function getChildDashboard(parentUserId, studentId) {
  await assertParentLink(parentUserId, studentId);

  const { rows: [student] } = await query(
    `SELECT s.*, u.name, u.username, u.email, u.mobile,
            COALESCE(sc.class_name, s.grade_level) AS class_name, sc.section,
            sch.name AS school_name
     FROM students s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN school_classes sc ON sc.id = s.class_id
     LEFT JOIN schools sch ON sch.id = s.school_id
     WHERE s.id = $1`,
    [studentId]
  );
  if (!student) throw Object.assign(new Error('Student not found'), { statusCode: 404 });

  const approvedSchool = student.school_link_status === 'APPROVED' && student.school_id;

  const [attendanceResult, todayResult, subjectResult, examResult, feeResult, notificationResult] = await Promise.all([
    approvedSchool ? query(
      `SELECT present_days, absent_days, late_days, half_days, working_days, percentage
       FROM attendance_monthly_summary
       WHERE student_id = $1
         AND year = EXTRACT(YEAR FROM NOW())
         AND month = EXTRACT(MONTH FROM NOW())`, [studentId]
    ) : Promise.resolve({ rows: [] }),
    approvedSchool ? query(
      `SELECT status, created_at FROM attendance WHERE student_id = $1 AND date = CURRENT_DATE`, [studentId]
    ) : Promise.resolve({ rows: [] }),
    query(
      `SELECT sub.name, sub.code, sub.color_hex,
              ROUND(COUNT(scp.id) FILTER (WHERE scp.is_completed)::DECIMAL /
                    NULLIF(COUNT(ci.id), 0) * 100) AS progress_pct
       FROM subjects sub
       JOIN chapters ch ON ch.subject_id = sub.id AND ch.class_name = $2
       JOIN content_items ci ON ci.chapter_id = ch.id AND ci.status = 'PUBLISHED'
       LEFT JOIN student_content_progress scp ON scp.content_item_id = ci.id AND scp.student_id = $1
       GROUP BY sub.id, sub.name, sub.code, sub.color_hex`,
      [studentId, student.class_name]
    ),
    query(
      `SELECT e.title, e.type, ea.total_marks,
              (e.total_questions * e.marks_per_question) AS max_marks,
              ROUND(CASE WHEN e.total_questions > 0 AND e.marks_per_question > 0
                THEN (ea.total_marks / (e.total_questions * e.marks_per_question)) * 100 ELSE 0 END, 1) AS percentage,
              ea.rank_school, ea.rank_overall, ea.submitted_at
       FROM exam_attempts ea
       JOIN exams e ON e.id = ea.exam_id
       WHERE ea.student_id = $1 AND ea.status = 'SCORED'
       ORDER BY ea.submitted_at DESC LIMIT 5`, [studentId]
    ),
    approvedSchool ? query(
      `SELECT fi.invoice_number, fi.amount_due, fi.amount_paid, fi.status, fi.due_date, fi.term
       FROM fee_invoices fi
       WHERE fi.student_id = $1 AND fi.academic_year = $2
       ORDER BY fi.term`, [studentId, student.academic_year]
    ) : Promise.resolve({ rows: [] }),
    query(
      `SELECT type, title, body, sent_at AS created_at, read_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY sent_at DESC LIMIT 10`, [parentUserId]
    ),
  ]);

  return {
    student: {
      ...student,
      class_label: student.section ? `${student.class_name}-${student.section}` : `Class ${student.class_name}`,
    },
    attendance: attendanceResult.rows[0] || null,
    todayAttendance: todayResult.rows[0] || null,
    subjectProgress: subjectResult.rows,
    recentExams: examResult.rows,
    fees: feeResult.rows,
    notifications: notificationResult.rows,
  };
}

async function getChildAttendance(parentUserId, studentId, year, month) {
  await assertParentLink(parentUserId, studentId);
  const { rows } = await query(
    `SELECT date, status, remark FROM attendance
     WHERE student_id = $1
       AND EXTRACT(YEAR FROM date) = $2
       AND EXTRACT(MONTH FROM date) = $3
     ORDER BY date`,
    [studentId, year, month]
  );
  const { rows: [summary] } = await query(
    `SELECT * FROM attendance_monthly_summary
     WHERE student_id = $1 AND year = $2 AND month = $3`,
    [studentId, year, month]
  );
  return { records: rows, summary: summary || null };
}

async function getChildFees(parentUserId, studentId) {
  await assertParentLink(parentUserId, studentId);
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

async function getMessages(parentUserId, studentId) {
  await assertParentLink(parentUserId, studentId);
  const { rows } = await query(
    `SELECT m.*, u.name AS sender_name
     FROM teacher_parent_messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.student_id = $2 AND (m.sender_id = $1 OR m.receiver_id = $1)
     ORDER BY m.created_at ASC`,
    [parentUserId, studentId]
  );
  return rows;
}

async function sendMessage(parentUserId, studentId, body) {
  await assertParentLink(parentUserId, studentId);
  const { rows: [teacher] } = await query(
    `SELECT t.user_id AS teacher_user_id, s.school_id
     FROM students s
     JOIN teacher_assignments ta ON ta.class_id = s.class_id AND ta.is_class_teacher = TRUE
     JOIN teachers t ON t.id = ta.teacher_id
     WHERE s.id = $1
     LIMIT 1`,
    [studentId]
  );
  if (!teacher) throw Object.assign(new Error('No class teacher assigned yet'), { statusCode: 404 });

  const { rows: [msg] } = await query(
    `INSERT INTO teacher_parent_messages (school_id, student_id, sender_id, receiver_id, body)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [teacher.school_id, studentId, parentUserId, teacher.teacher_user_id, body]
  );
  return msg;
}

async function getNotifications(parentUserId) {
  const { rows } = await query(
    `SELECT * FROM notifications WHERE user_id = $1 ORDER BY sent_at DESC LIMIT 50`,
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
