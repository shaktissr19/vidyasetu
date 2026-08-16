// services/school.service.js
const { query, transaction } = require('../config/db');
const { getPagination, paginationMeta } = require('../utils/paginate');
const notificationService = require('./notification.service');
const logger = require('../utils/logger');

// ── Overview ───────────────────────────────────────────────

async function getOverview(schoolId) {
  const [[school], [stats], [feeStats]] = await Promise.all([
    query(`SELECT s.*, u.name AS admin_name FROM schools s JOIN users u ON u.id = s.admin_user_id WHERE s.id = $1`, [schoolId]).then(r => r.rows),
    query(`
      SELECT
        COUNT(DISTINCT st.id) AS total_students,
        COUNT(DISTINCT t.id)  AS total_teachers,
        ROUND(AVG(ams.percentage), 1) AS avg_attendance
      FROM schools s
      LEFT JOIN students st ON st.school_id = s.id AND st.status = 'ACTIVE'
      LEFT JOIN teachers t  ON t.school_id = s.id AND t.status = 'ACTIVE'
      LEFT JOIN attendance_monthly_summary ams ON ams.school_id = s.id
        AND ams.year = EXTRACT(YEAR FROM NOW()) AND ams.month = EXTRACT(MONTH FROM NOW())
      WHERE s.id = $1
    `, [schoolId]).then(r => r.rows),
    query(`
      SELECT
        SUM(CASE WHEN fi.status = 'PAID' THEN fi.amount_due ELSE 0 END) AS collected,
        SUM(CASE WHEN fi.status IN ('PENDING','OVERDUE') THEN fi.amount_due ELSE 0 END) AS pending,
        COUNT(CASE WHEN fi.status = 'PAID' THEN 1 END) AS paid_count,
        COUNT(CASE WHEN fi.status IN ('PENDING','OVERDUE') THEN 1 END) AS pending_count
      FROM fee_invoices fi WHERE fi.school_id = $1
        AND fi.academic_year = $2
    `, [schoolId, '2025-26']).then(r => r.rows),
  ]);

  // Today attendance summary per class
  const { rows: classSummary } = await query(`
    SELECT sc.class_name, sc.section,
           COUNT(a.id) FILTER (WHERE a.status = 'PRESENT') AS present,
           COUNT(a.id) FILTER (WHERE a.status = 'ABSENT')  AS absent,
           COUNT(st.id) AS total
    FROM school_classes sc
    LEFT JOIN students st ON st.class_id = sc.id AND st.status = 'ACTIVE'
    LEFT JOIN attendance a ON a.student_id = st.id AND a.date = CURRENT_DATE
    WHERE sc.school_id = $1
    GROUP BY sc.class_name, sc.section
    ORDER BY sc.class_name, sc.section
  `, [schoolId]);

  return { school, stats: stats || {}, feeStats: feeStats || {}, classSummary };
}

// ── Students ───────────────────────────────────────────────

async function getStudents(schoolId, paginationQuery, filters = {}) {
  const { limit, offset, page } = getPagination(paginationQuery);
  const conditions = ['st.school_id = $1', 'st.status = $2'];
  const params = [schoolId, filters.status || 'ACTIVE'];
  let i = 3;

  if (filters.classId) { conditions.push(`st.class_id = $${i++}`); params.push(filters.classId); }
  if (filters.search) {
    conditions.push(`u.name ILIKE $${i++}`);
    params.push(`%${filters.search}%`);
  }

  const where = conditions.join(' AND ');

  const [{ rows }, { rows: [countRow] }] = await Promise.all([
    query(`
      SELECT st.id, st.roll_number, u.name, u.mobile, sc.class_name, sc.section,
             ams.percentage AS attendance_pct,
             fi.status AS fee_status
      FROM students st
      JOIN users u ON u.id = st.user_id
      JOIN school_classes sc ON sc.id = st.class_id
      LEFT JOIN attendance_monthly_summary ams ON ams.student_id = st.id
        AND ams.year = EXTRACT(YEAR FROM NOW()) AND ams.month = EXTRACT(MONTH FROM NOW())
      LEFT JOIN fee_invoices fi ON fi.student_id = st.id
        AND fi.academic_year = '2025-26' AND fi.term = 1
      WHERE ${where}
      ORDER BY sc.class_name, sc.section, st.roll_number
      LIMIT $${i} OFFSET $${i + 1}
    `, [...params, limit, offset]),
    query(`SELECT COUNT(*) FROM students st JOIN users u ON u.id = st.user_id WHERE ${where}`, params),
  ]);

  return { students: rows, meta: paginationMeta(parseInt(countRow.count), page, limit) };
}

async function addStudent(schoolId, data) {
  return transaction(async (client) => {
    // Create user
    const { rows: [user] } = await client.query(
      `INSERT INTO users (mobile, name, role, language) VALUES ($1, $2, 'STUDENT', $3) RETURNING id`,
      [data.mobile, data.name, data.language || 'hi']
    );

    // Create student
    const { rows: [student] } = await client.query(
      `INSERT INTO students (user_id, school_id, class_id, roll_number, date_of_birth, gender, academic_year)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [user.id, schoolId, data.classId, data.rollNumber, data.dob || null, data.gender || null, '2025-26']
    );

    // Update school student count
    await client.query(
      `UPDATE schools SET total_students = total_students + 1 WHERE id = $1`, [schoolId]
    );

    return { userId: user.id, studentId: student.id };
  });
}

// ── Attendance ─────────────────────────────────────────────

async function markAttendance(schoolId, classId, date, records, markedBy) {
  // records = [{ studentId, status, remark }]
  return transaction(async (client) => {
    const results = [];

    for (const rec of records) {
      const { rows: [att] } = await client.query(
        `INSERT INTO attendance (student_id, school_id, class_id, date, status, marked_by, remark)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (student_id, date) DO UPDATE
           SET status = EXCLUDED.status, remark = EXCLUDED.remark, marked_by = EXCLUDED.marked_by, updated_at = NOW()
         RETURNING id, status`,
        [rec.studentId, schoolId, classId, date, rec.status, markedBy, rec.remark || null]
      );
      results.push(att);
    }

    // Notify parents of absent students (fire and forget)
    const absentIds = records.filter(r => r.status === 'ABSENT').map(r => r.studentId);
    if (absentIds.length) {
      notifyAbsentParents(absentIds, date).catch(e => logger.error('Absent notify error:', e));
    }

    return results;
  });
}

async function notifyAbsentParents(studentIds, date) {
  const { rows: students } = await query(
    `SELECT u.name, pu.mobile AS parent_mobile
     FROM students s
     JOIN users u ON u.id = s.user_id
     JOIN parent_student_links psl ON psl.student_id = s.id
     JOIN users pu ON pu.id = psl.parent_user_id
     WHERE s.id = ANY($1)`,
    [studentIds]
  );

  for (const s of students) {
    await notificationService.notifyAttendanceAbsent(s.parent_mobile, s.name, date);
    // Mark notification sent
    await query(
      `UPDATE attendance SET notified_parent = TRUE, notified_at = NOW()
       WHERE student_id = (SELECT id FROM students s JOIN users u ON u.id = s.user_id WHERE u.name = $1 LIMIT 1)
         AND date = $2`,
      [s.name, date]
    );
  }
}

// ── Fees ───────────────────────────────────────────────────

async function getFeeOverview(schoolId, academicYear = '2025-26') {
  const { rows } = await query(
    `SELECT st.id AS student_id, u.name, sc.class_name, sc.section,
            fi.invoice_number, fi.amount_due, fi.amount_paid, fi.status, fi.due_date
     FROM fee_invoices fi
     JOIN students st ON st.id = fi.student_id
     JOIN users u ON u.id = st.user_id
     JOIN school_classes sc ON sc.id = st.class_id
     WHERE fi.school_id = $1 AND fi.academic_year = $2
     ORDER BY fi.status DESC, fi.due_date ASC`,
    [schoolId, academicYear]
  );
  return rows;
}

async function recordFeePayment(schoolId, data) {
  return transaction(async (client) => {
    const { rows: [invoice] } = await client.query(
      `SELECT * FROM fee_invoices WHERE id = $1 AND school_id = $2`, [data.invoiceId, schoolId]
    );
    if (!invoice) throw Object.assign(new Error('Invoice not found'), { statusCode: 404 });
    if (invoice.status === 'PAID') throw Object.assign(new Error('Invoice already paid'), { statusCode: 409 });

    const receiptNum = `VS-REC-${new Date().getFullYear()}-${String(await getNextReceiptSeq(client)).padStart(6, '0')}`;

    const { rows: [payment] } = await client.query(
      `INSERT INTO fee_payments (invoice_id, student_id, school_id, amount, payment_mode,
                                  razorpay_order_id, razorpay_payment_id, transaction_ref,
                                  collected_by, receipt_number, payment_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [data.invoiceId, invoice.student_id, schoolId, data.amount, data.paymentMode,
       data.razorpayOrderId || null, data.razorpayPaymentId || null, data.transactionRef || null,
       data.collectedBy, receiptNum, data.paymentDate || new Date()]
    );

    // Trigger in DB auto-updates invoice status
    return { payment, receiptNumber: receiptNum };
  });
}

async function getNextReceiptSeq(client) {
  const { rows: [r] } = await client.query(`SELECT nextval('receipt_number_seq') AS seq`);
  return r.seq;
}

async function sendFeeReminders(schoolId) {
  const { rows: overdue } = await query(
    `SELECT u.name, pu.mobile AS parent_mobile, fi.amount_due, fi.due_date
     FROM fee_invoices fi
     JOIN students st ON st.id = fi.student_id
     JOIN users u ON u.id = st.user_id
     JOIN parent_student_links psl ON psl.student_id = st.id AND psl.is_primary = TRUE
     JOIN users pu ON pu.id = psl.parent_user_id
     WHERE fi.school_id = $1 AND fi.status IN ('PENDING','OVERDUE')`,
    [schoolId]
  );

  let sent = 0;
  for (const row of overdue) {
    try {
      await notificationService.notifyFeeReminder(
        row.parent_mobile, row.name, row.amount_due,
        new Date(row.due_date).toLocaleDateString('hi-IN')
      );
      sent++;
    } catch (e) {
      logger.error(`Fee reminder failed for ${row.parent_mobile}:`, e.message);
    }
  }
  return { sent, total: overdue.length };
}

// ── Timetable ─────────────────────────────────────────────

async function getTimetable(classId) {
  const { rows } = await query(
    `SELECT tp.*, u.name AS teacher_name
     FROM timetable_periods tp
     LEFT JOIN teachers t ON t.id = tp.teacher_id
     LEFT JOIN users u ON u.id = t.user_id
     WHERE tp.class_id = $1
     ORDER BY tp.day, tp.period_number`,
    [classId]
  );
  return rows;
}

async function saveTimetable(classId, schoolId, periods) {
  return transaction(async (client) => {
    // Clear existing
    await client.query(`DELETE FROM timetable_periods WHERE class_id = $1`, [classId]);

    for (const p of periods) {
      await client.query(
        `INSERT INTO timetable_periods (school_id, class_id, day, period_number, start_time, end_time, subject, teacher_id, is_break)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [schoolId, classId, p.day, p.periodNumber, p.startTime, p.endTime,
         p.subject || null, p.teacherId || null, p.isBreak || false]
      );
    }
    return { saved: periods.length };
  });
}

// ── Announcements ─────────────────────────────────────────

async function publishAnnouncement(schoolId, createdBy, data) {
  const { rows: [ann] } = await query(
    `INSERT INTO announcements (school_id, created_by, title, body, audience, target_class, send_whatsapp, send_sms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [schoolId, createdBy, data.title, data.body, data.audience || 'ALL',
     data.targetClass || null, data.sendWhatsapp !== false, data.sendSms || false]
  );

  // Fetch recipients and notify
  if (ann.send_whatsapp) {
    notifyAnnouncementRecipients(ann).catch(e => logger.error('Announcement notify error:', e));
  }

  return ann;
}

async function notifyAnnouncementRecipients(announcement) {
  const { rows: school } = await query(`SELECT name FROM schools WHERE id = $1`, [announcement.school_id]);
  const schoolName = school[0]?.name || 'Your School';

  // Get parent mobiles
  const { rows: parents } = await query(
    `SELECT DISTINCT pu.mobile
     FROM parent_student_links psl
     JOIN students st ON st.id = psl.student_id
     JOIN users pu ON pu.id = psl.parent_user_id
     WHERE st.school_id = $1
       AND ($2 = 'ALL' OR $2 = 'PARENTS')`,
    [announcement.school_id, announcement.audience]
  );

  let sent = 0;
  for (const p of parents) {
    try {
      await notificationService.notifyAnnouncement(p.mobile, schoolName, announcement.body.substring(0, 200));
      sent++;
    } catch (e) {
      logger.error(`Announcement notify failed for ${p.mobile}:`, e.message);
    }
  }

  await query(`UPDATE announcements SET sent_count = $1, sent_at = NOW() WHERE id = $2`, [sent, announcement.id]);
}

module.exports = {
  getOverview, getStudents, addStudent,
  markAttendance, notifyAbsentParents,
  getFeeOverview, recordFeePayment, sendFeeReminders,
  getTimetable, saveTimetable,
  publishAnnouncement,
};
