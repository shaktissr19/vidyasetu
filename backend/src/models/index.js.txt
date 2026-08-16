/**
 * models/index.js
 * Query-builder helpers for every domain.
 * Services import from here: const { UserModel } = require('../models');
 * All methods return plain objects (rows from pg).
 */
const { query, transaction } = require('../config/db');

// ─── USER MODEL ──────────────────────────────────────────────
const UserModel = {
  findByMobile: (mobile) =>
    query('SELECT * FROM users WHERE mobile = $1', [mobile]).then(r => r.rows[0]),

  findById: (id) =>
    query('SELECT id,name,mobile,role,status,language,profile_photo,last_login_at,created_at FROM users WHERE id=$1', [id]).then(r => r.rows[0]),

  create: ({ mobile, name = null, role = 'STUDENT', language = 'hi' }) =>
    query(
      `INSERT INTO users (mobile,name,role,language) VALUES ($1,$2,$3,$4) RETURNING *`,
      [mobile, name || `User ${mobile.slice(-4)}`, role, language]
    ).then(r => r.rows[0]),

  updateLastLogin: (id) =>
    query('UPDATE users SET last_login_at=NOW() WHERE id=$1', [id]),

  updateProfile: (id, fields) => {
    const keys = Object.keys(fields).filter(k => fields[k] !== undefined);
    if (!keys.length) return Promise.resolve(null);
    const sets = keys.map((k, i) => `${k}=$${i + 1}`).join(',');
    const vals = keys.map(k => fields[k]);
    return query(
      `UPDATE users SET ${sets},updated_at=NOW() WHERE id=$${keys.length + 1} RETURNING id,name,language,profile_photo`,
      [...vals, id]
    ).then(r => r.rows[0]);
  },

  updateStatus: (id, status) =>
    query('UPDATE users SET status=$1,updated_at=NOW() WHERE id=$2', [status, id]),

  list: ({ role, status, limit = 50, offset = 0 }) => {
    const conds = ['1=1'];
    const vals = [];
    if (role)   { conds.push(`role=$${vals.length+1}`);   vals.push(role); }
    if (status) { conds.push(`status=$${vals.length+1}`); vals.push(status); }
    vals.push(limit, offset);
    return query(
      `SELECT id,name,mobile,role,status,language,last_login_at,created_at FROM users WHERE ${conds.join(' AND ')} ORDER BY created_at DESC LIMIT $${vals.length-1} OFFSET $${vals.length}`,
      vals
    ).then(r => r.rows);
  },
};

// ─── STUDENT MODEL ───────────────────────────────────────────
const StudentModel = {
  findByUserId: (userId) =>
    query(
      `SELECT s.*,u.name,u.mobile,u.language,u.profile_photo,
              sc.class_name,sc.section,sch.name AS school_name
       FROM students s
       JOIN users u ON u.id=s.user_id
       JOIN school_classes sc ON sc.id=s.class_id
       JOIN schools sch ON sch.id=s.school_id
       WHERE s.user_id=$1`,
      [userId]
    ).then(r => r.rows[0]),

  findById: (id) =>
    query(
      `SELECT s.*,u.name,u.mobile,u.language,sc.class_name,sc.section,sch.name AS school_name
       FROM students s
       JOIN users u ON u.id=s.user_id
       JOIN school_classes sc ON sc.id=s.class_id
       JOIN schools sch ON sch.id=s.school_id
       WHERE s.id=$1`,
      [id]
    ).then(r => r.rows[0]),

  listBySchool: ({ schoolId, classId, search, status = 'ACTIVE', limit = 50, offset = 0 }) => {
    const conds = [`st.school_id=$1`, `st.status=$2`];
    const vals  = [schoolId, status];
    if (classId) { conds.push(`st.class_id=$${vals.length+1}`); vals.push(classId); }
    if (search)  { conds.push(`u.name ILIKE $${vals.length+1}`); vals.push(`%${search}%`); }
    const where = conds.join(' AND ');
    return Promise.all([
      query(
        `SELECT st.id,st.roll_number,st.xp_total,st.xp_level,st.streak_current,
                u.name,u.mobile,sc.class_name,sc.section,
                ams.percentage AS attendance_pct, fi.status AS fee_status
         FROM students st
         JOIN users u ON u.id=st.user_id
         JOIN school_classes sc ON sc.id=st.class_id
         LEFT JOIN attendance_monthly_summary ams ON ams.student_id=st.id
           AND ams.year=EXTRACT(YEAR FROM NOW()) AND ams.month=EXTRACT(MONTH FROM NOW())
         LEFT JOIN fee_invoices fi ON fi.student_id=st.id AND fi.academic_year='2025-26' AND fi.term=1
         WHERE ${where}
         ORDER BY sc.class_name,sc.section,st.roll_number
         LIMIT $${vals.length+1} OFFSET $${vals.length+2}`,
        [...vals, limit, offset]
      ),
      query(
        `SELECT COUNT(*) FROM students st JOIN users u ON u.id=st.user_id WHERE ${where}`,
        vals
      ),
    ]).then(([rows, count]) => ({ rows: rows.rows, total: parseInt(count.rows[0].count) }));
  },

  create: (client, { userId, schoolId, classId, rollNumber, dob, gender, language, academicYear = '2025-26' }) =>
    client.query(
      `INSERT INTO students (user_id,school_id,class_id,roll_number,date_of_birth,gender,academic_year)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [userId, schoolId, classId, rollNumber || null, dob || null, gender || null, academicYear]
    ).then(r => r.rows[0]),

  updateXP: (id, xpAmount) =>
    query(
      `UPDATE students SET
         xp_total=xp_total+$1,
         xp_level=LEAST(GREATEST(FLOOR((xp_total+$1)/500.0)+1,1),100),
         updated_at=NOW()
       WHERE id=$2 RETURNING xp_total,xp_level`,
      [xpAmount, id]
    ).then(r => r.rows[0]),

  updateStreak: (id, streakCount) =>
    query(
      `UPDATE students SET streak_current=$1, streak_best=GREATEST(streak_best,$1), updated_at=NOW() WHERE id=$2`,
      [streakCount, id]
    ),

  getLeaderboard: ({ schoolId, classId, limit = 20 }) => {
    const conds = [`st.school_id=$1`, `st.status='ACTIVE'`];
    const vals  = [schoolId];
    if (classId) { conds.push(`st.class_id=$${vals.length+1}`); vals.push(classId); }
    return query(
      `SELECT st.id,u.name,u.profile_photo,st.xp_total,st.xp_level,st.streak_current,
              sc.class_name,sc.section,
              RANK() OVER (ORDER BY st.xp_total DESC) AS rank
       FROM students st
       JOIN users u ON u.id=st.user_id
       JOIN school_classes sc ON sc.id=st.class_id
       WHERE ${conds.join(' AND ')}
       ORDER BY st.xp_total DESC LIMIT $${vals.length+1}`,
      [...vals, limit]
    ).then(r => r.rows);
  },
};

// ─── SCHOOL MODEL ────────────────────────────────────────────
const SchoolModel = {
  findByAdminUserId: (userId) =>
    query('SELECT * FROM schools WHERE admin_user_id=$1 LIMIT 1', [userId]).then(r => r.rows[0]),

  findById: (id) =>
    query(
      `SELECT s.*,u.name AS admin_name FROM schools s JOIN users u ON u.id=s.admin_user_id WHERE s.id=$1`,
      [id]
    ).then(r => r.rows[0]),

  list: ({ status, plan, state, limit = 50, offset = 0 }) => {
    const conds = ['1=1'];
    const vals  = [];
    if (status) { conds.push(`status=$${vals.length+1}`); vals.push(status); }
    if (plan)   { conds.push(`plan=$${vals.length+1}`);   vals.push(plan); }
    if (state)  { conds.push(`state=$${vals.length+1}`);  vals.push(state); }
    vals.push(limit, offset);
    return query(
      `SELECT s.id,s.name,s.status,s.plan,s.state,s.district,s.city,s.total_students,s.total_teachers,
              s.plan_expires_at,s.created_at,u.name AS admin_name,u.mobile AS admin_mobile
       FROM schools s JOIN users u ON u.id=s.admin_user_id
       WHERE ${conds.join(' AND ')} ORDER BY s.created_at DESC
       LIMIT $${vals.length-1} OFFSET $${vals.length}`,
      vals
    ).then(r => r.rows);
  },

  create: ({ name, adminUserId, city, district, state, pincode, mobile, email, udiseCode }) =>
    query(
      `INSERT INTO schools (name,admin_user_id,city,district,state,pincode,mobile,email,udise_code,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PENDING') RETURNING *`,
      [name, adminUserId, city, district, state, pincode, mobile, email, udiseCode || null]
    ).then(r => r.rows[0]),

  updateStatus: (id, status) =>
    query('UPDATE schools SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING id,status', [status, id]).then(r => r.rows[0]),

  updateStudentCount: (client, schoolId, delta) =>
    client.query(
      'UPDATE schools SET total_students=total_students+$1 WHERE id=$2', [delta, schoolId]
    ),

  getClasses: (schoolId) =>
    query(
      `SELECT id,class_name,section,academic_year FROM school_classes
       WHERE school_id=$1 ORDER BY class_name,section`,
      [schoolId]
    ).then(r => r.rows),
};

// ─── TEACHER MODEL ───────────────────────────────────────────
const TeacherModel = {
  findByUserId: (userId) =>
    query(
      `SELECT t.*,u.name,u.mobile FROM teachers t JOIN users u ON u.id=t.user_id WHERE t.user_id=$1`,
      [userId]
    ).then(r => r.rows[0]),

  listBySchool: (schoolId) =>
    query(
      `SELECT t.id,t.employee_id,t.qualification,t.experience_yrs,t.status,t.joined_date,
              u.name,u.mobile,u.language
       FROM teachers t JOIN users u ON u.id=t.user_id
       WHERE t.school_id=$1 AND t.status='ACTIVE'
       ORDER BY u.name`,
      [schoolId]
    ).then(r => r.rows),

  create: (client, { userId, schoolId, employeeId, qualification, experienceYrs }) =>
    client.query(
      `INSERT INTO teachers (user_id,school_id,employee_id,qualification,experience_yrs)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [userId, schoolId, employeeId || null, qualification || null, experienceYrs || 0]
    ).then(r => r.rows[0]),
};

// ─── ATTENDANCE MODEL ────────────────────────────────────────
const AttendanceModel = {
  getByStudentAndDate: (studentId, date) =>
    query('SELECT * FROM attendance WHERE student_id=$1 AND date=$2', [studentId, date]).then(r => r.rows[0]),

  getMonthlySummary: (studentId, year, month) =>
    query(
      `SELECT * FROM attendance_monthly_summary WHERE student_id=$1 AND year=$2 AND month=$3`,
      [studentId, year, month]
    ).then(r => r.rows[0]),

  getMonthlyForStudent: (studentId, year, month) =>
    query(
      `SELECT date,status FROM attendance WHERE student_id=$1
       AND EXTRACT(YEAR FROM date)=$2 AND EXTRACT(MONTH FROM date)=$3
       ORDER BY date`,
      [studentId, year, month]
    ).then(r => r.rows),

  markBulk: async (client, { classId, schoolId, date, records, markedBy }) => {
    const results = [];
    for (const rec of records) {
      const { rows } = await client.query(
        `INSERT INTO attendance (student_id,class_id,school_id,date,status,remark,marked_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (student_id,date) DO UPDATE SET status=EXCLUDED.status,remark=EXCLUDED.remark
         RETURNING *`,
        [rec.studentId, classId, schoolId, date, rec.status, rec.remark || null, markedBy]
      );
      results.push(rows[0]);
    }
    return results;
  },

  getClassSummaryForDate: (schoolId, date) =>
    query(
      `SELECT sc.id,sc.class_name,sc.section,
              COUNT(a.id) FILTER (WHERE a.status='PRESENT') AS present,
              COUNT(a.id) FILTER (WHERE a.status='ABSENT')  AS absent,
              COUNT(a.id) FILTER (WHERE a.status='LATE')    AS late,
              COUNT(st.id) AS total
       FROM school_classes sc
       LEFT JOIN students st ON st.class_id=sc.id AND st.status='ACTIVE'
       LEFT JOIN attendance a ON a.student_id=st.id AND a.date=$2
       WHERE sc.school_id=$1
       GROUP BY sc.id,sc.class_name,sc.section
       ORDER BY sc.class_name,sc.section`,
      [schoolId, date]
    ).then(r => r.rows),
};

// ─── FEE MODEL ───────────────────────────────────────────────
const FeeModel = {
  getInvoicesBySchool: ({ schoolId, academicYear = '2025-26', term, status, limit = 100, offset = 0 }) => {
    const conds = [`fi.school_id=$1`, `fi.academic_year=$2`];
    const vals  = [schoolId, academicYear];
    if (term)   { conds.push(`fi.term=$${vals.length+1}`);   vals.push(term); }
    if (status) { conds.push(`fi.status=$${vals.length+1}`); vals.push(status); }
    return query(
      `SELECT fi.*,u.name AS student_name,u.mobile AS student_mobile,sc.class_name,sc.section
       FROM fee_invoices fi
       JOIN students st ON st.id=fi.student_id
       JOIN users u ON u.id=st.user_id
       JOIN school_classes sc ON sc.id=st.class_id
       WHERE ${conds.join(' AND ')}
       ORDER BY fi.due_date ASC
       LIMIT $${vals.length+1} OFFSET $${vals.length+2}`,
      [...vals, limit, offset]
    ).then(r => r.rows);
  },

  getInvoicesByStudent: (studentId, academicYear = '2025-26') =>
    query(
      `SELECT * FROM fee_invoices WHERE student_id=$1 AND academic_year=$2 ORDER BY term`,
      [studentId, academicYear]
    ).then(r => r.rows),

  getInvoiceById: (id) =>
    query('SELECT * FROM fee_invoices WHERE id=$1', [id]).then(r => r.rows[0]),

  recordPayment: ({ invoiceId, schoolId, studentId, amount, mode, razorpayPaymentId, transactionRef, collectedBy, notes }) =>
    query(
      `INSERT INTO fee_payments (invoice_id,school_id,student_id,amount,mode,razorpay_payment_id,transaction_ref,collected_by,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [invoiceId, schoolId, studentId, amount, mode, razorpayPaymentId || null, transactionRef || null, collectedBy, notes || null]
    ).then(r => r.rows[0]),

  getStats: (schoolId, academicYear = '2025-26') =>
    query(
      `SELECT
         SUM(CASE WHEN status='PAID' THEN amount_due ELSE 0 END) AS collected,
         SUM(CASE WHEN status IN ('PENDING','OVERDUE') THEN amount_due-amount_paid ELSE 0 END) AS pending,
         COUNT(*) FILTER (WHERE status='PAID') AS paid_count,
         COUNT(*) FILTER (WHERE status IN ('PENDING','OVERDUE')) AS pending_count,
         COUNT(*) FILTER (WHERE status='OVERDUE') AS overdue_count
       FROM fee_invoices WHERE school_id=$1 AND academic_year=$2`,
      [schoolId, academicYear]
    ).then(r => r.rows[0]),
};

// ─── CONTENT MODEL ───────────────────────────────────────────
const ContentModel = {
  getSubjects: (className) =>
    query(
      `SELECT sub.id,sub.name,sub.name_hi,sub.code,sub.color_hex,sub.icon_url,
              COUNT(ch.id) AS chapter_count
       FROM subjects sub
       LEFT JOIN chapters ch ON ch.subject_id=sub.id AND ch.class_name=$1
       WHERE sub.is_active=TRUE
       GROUP BY sub.id ORDER BY sub.sort_order`,
      [className]
    ).then(r => r.rows),

  getChapters: (subjectId, className) =>
    query(
      `SELECT ch.*,
              COUNT(ci.id) AS total_items,
              COUNT(ci.id) FILTER (WHERE ci.type='VIDEO') AS video_count,
              COUNT(ci.id) FILTER (WHERE ci.type='PDF')   AS pdf_count,
              COUNT(ci.id) FILTER (WHERE ci.type='QUIZ')  AS quiz_count
       FROM chapters ch
       LEFT JOIN content_items ci ON ci.chapter_id=ch.id AND ci.status='PUBLISHED'
       WHERE ch.subject_id=$1 AND ch.class_name=$2 AND ch.is_active=TRUE
       GROUP BY ch.id ORDER BY ch.chapter_number`,
      [subjectId, className]
    ).then(r => r.rows),

  getItems: (chapterId, studentId, language = 'hi') =>
    query(
      `SELECT ci.id,ci.type,ci.title,ci.title_hi,ci.language,ci.duration_secs,
              ci.file_size_kb,ci.thumbnail_url,ci.sort_order,ci.is_offline_ready,
              ci.difficulty,ci.view_count,ci.xp_reward,
              scp.is_completed,scp.progress_pct,scp.quiz_score,scp.last_accessed
       FROM content_items ci
       LEFT JOIN student_content_progress scp ON scp.content_item_id=ci.id AND scp.student_id=$2
       WHERE ci.chapter_id=$1 AND ci.status='PUBLISHED'
       ORDER BY ci.sort_order`,
      [chapterId, studentId]
    ).then(r => r.rows),

  getItemById: (id) =>
    query('SELECT * FROM content_items WHERE id=$1', [id]).then(r => r.rows[0]),

  upsertProgress: (studentId, contentItemId, { progressPct, isCompleted, quizScore }) =>
    query(
      `INSERT INTO student_content_progress (student_id,content_item_id,progress_pct,is_completed,quiz_score,last_accessed,completed_at)
       VALUES ($1,$2,$3,$4,$5,NOW(),CASE WHEN $4 THEN NOW() ELSE NULL END)
       ON CONFLICT (student_id,content_item_id) DO UPDATE SET
         progress_pct=GREATEST(student_content_progress.progress_pct,EXCLUDED.progress_pct),
         is_completed=student_content_progress.is_completed OR EXCLUDED.is_completed,
         quiz_score=COALESCE(EXCLUDED.quiz_score,student_content_progress.quiz_score),
         last_accessed=NOW(),
         completed_at=CASE WHEN EXCLUDED.is_completed AND student_content_progress.completed_at IS NULL
                           THEN NOW() ELSE student_content_progress.completed_at END
       RETURNING *`,
      [studentId, contentItemId, progressPct, isCompleted, quizScore || null]
    ).then(r => r.rows[0]),

  getQuizQuestions: (contentItemId) =>
    query(
      `SELECT id,question_text,question_hi,option_a,option_b,option_c,option_d,
              option_a_hi,option_b_hi,option_c_hi,option_d_hi,difficulty,sort_order
       FROM quiz_questions WHERE content_item_id=$1 ORDER BY sort_order`,
      [contentItemId]
    ).then(r => r.rows),

  checkAnswer: (questionId) =>
    query('SELECT correct_option,explanation,explanation_hi FROM quiz_questions WHERE id=$1', [questionId]).then(r => r.rows[0]),
};

// ─── EXAM MODEL ──────────────────────────────────────────────
const ExamModel = {
  list: ({ schoolId, classNames, status, limit = 20 }) => {
    const conds = [`(e.school_id=$1 OR e.school_id IS NULL)`];
    const vals  = [schoolId];
    if (status) { conds.push(`e.status=$${vals.length+1}`); vals.push(status); }
    return query(
      `SELECT e.*,u.name AS created_by_name FROM exams e JOIN users u ON u.id=e.created_by
       WHERE ${conds.join(' AND ')}
       ORDER BY e.start_time ASC LIMIT $${vals.length+1}`,
      [...vals, limit || 20]
    ).then(r => r.rows);
  },

  findById: (id) =>
    query('SELECT * FROM exams WHERE id=$1', [id]).then(r => r.rows[0]),

  getQuestions: (examId) =>
    query(
      `SELECT id,question_text,question_hi,option_a,option_b,option_c,option_d,
              option_a_hi,option_b_hi,option_c_hi,option_d_hi,subject_code,difficulty,sort_order
       FROM exam_questions WHERE exam_id=$1 ORDER BY sort_order`,
      [examId]
    ).then(r => r.rows),

  findAttempt: (examId, studentId) =>
    query('SELECT * FROM exam_attempts WHERE exam_id=$1 AND student_id=$2', [examId, studentId]).then(r => r.rows[0]),

  createAttempt: (examId, studentId, schoolId) =>
    query(
      `INSERT INTO exam_attempts (exam_id,student_id,school_id) VALUES ($1,$2,$3) RETURNING *`,
      [examId, studentId, schoolId]
    ).then(r => r.rows[0]),

  getLeaderboard: (examId, limit = 50) =>
    query(
      `SELECT el.*,u.name,u.profile_photo,sc.class_name,sc.section
       FROM exam_leaderboard el
       JOIN students st ON st.id=el.student_id
       JOIN users u ON u.id=st.user_id
       JOIN school_classes sc ON sc.id=st.class_id
       WHERE el.exam_id=$1
       ORDER BY el.rank_overall ASC LIMIT $2`,
      [examId, limit]
    ).then(r => r.rows),
};

// ─── GAMIFICATION MODEL ──────────────────────────────────────
const GamificationModel = {
  addXPEvent: ({ studentId, eventType, xpAmount, referenceId, referenceType, description }) =>
    query(
      `INSERT INTO xp_events (student_id,event_type,xp_amount,reference_id,reference_type,description)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [studentId, eventType, xpAmount, referenceId || null, referenceType || null, description || null]
    ).then(r => r.rows[0]),

  getRecentXP: (studentId, limit = 10) =>
    query(
      `SELECT event_type,xp_amount,description,created_at FROM xp_events
       WHERE student_id=$1 ORDER BY created_at DESC LIMIT $2`,
      [studentId, limit]
    ).then(r => r.rows),

  getBadges: (studentId) =>
    query(
      `SELECT b.code,b.name,b.name_hi,b.description,b.tier,b.icon_url,b.xp_bonus,
              sb.awarded_at,sb.is_displayed
       FROM student_badges sb JOIN badges b ON b.id=sb.badge_id
       WHERE sb.student_id=$1 ORDER BY sb.awarded_at DESC`,
      [studentId]
    ).then(r => r.rows),

  awardBadge: (studentId, badgeCode) =>
    query(
      `INSERT INTO student_badges (student_id,badge_id)
       SELECT $1,id FROM badges WHERE code=$2
       ON CONFLICT (student_id,badge_id) DO NOTHING RETURNING *`,
      [studentId, badgeCode]
    ).then(r => r.rows[0]),

  checkAndAwardBadges: async (studentId, { xpTotal, streakCurrent, lessonsCount }) => {
    const { rows: allBadges } = await query(
      `SELECT b.code,b.criteria_type,b.criteria_value
       FROM badges b
       WHERE b.is_active=TRUE
         AND NOT EXISTS (SELECT 1 FROM student_badges sb WHERE sb.student_id=$1 AND sb.badge_id=b.id)`,
      [studentId]
    );
    const awarded = [];
    for (const badge of allBadges) {
      let eligible = false;
      if (badge.criteria_type === 'XP_THRESHOLD'  && xpTotal        >= badge.criteria_value) eligible = true;
      if (badge.criteria_type === 'STREAK'         && streakCurrent  >= badge.criteria_value) eligible = true;
      if (badge.criteria_type === 'LESSONS_COUNT'  && lessonsCount   >= badge.criteria_value) eligible = true;
      if (eligible) {
        await query(
          `INSERT INTO student_badges (student_id,badge_id) SELECT $1,id FROM badges WHERE code=$2 ON CONFLICT DO NOTHING`,
          [studentId, badge.code]
        );
        awarded.push(badge.code);
      }
    }
    return awarded;
  },

  logStreak: async (studentId) => {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    const { rows: [existing] } = await query(
      'SELECT id FROM streak_log WHERE student_id=$1 AND date=$2', [studentId, today]
    );
    if (existing) return null;

    const { rows: [prev] } = await query(
      `SELECT streak_count FROM streak_log WHERE student_id=$1 AND date=$2`, [studentId, yesterday]
    );
    const newStreak = prev ? prev.streak_count + 1 : 1;

    await query(
      `INSERT INTO streak_log (student_id,date,streak_count) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [studentId, today, newStreak]
    );

    await query(
      `UPDATE students SET streak_current=$1, streak_best=GREATEST(streak_best,$1), updated_at=NOW() WHERE id=(SELECT id FROM students WHERE user_id=$2)`,
      [newStreak, studentId]
    );

    return newStreak;
  },
};

// ─── NOTIFICATION MODEL ──────────────────────────────────────
const NotificationModel = {
  save: ({ userId, schoolId, type, channel = 'IN_APP', title, body, referenceId, referenceType }) =>
    query(
      `INSERT INTO notifications (user_id,school_id,type,channel,title,body,reference_id,reference_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [userId, schoolId || null, type, channel, title, body, referenceId || null, referenceType || null]
    ).then(r => r.rows[0]),

  listForUser: (userId, limit = 50) =>
    query(
      `SELECT * FROM notifications WHERE user_id=$1 ORDER BY sent_at DESC LIMIT $2`,
      [userId, limit]
    ).then(r => r.rows),

  markRead: (id, userId) =>
    query(
      `UPDATE notifications SET is_read=TRUE,read_at=NOW() WHERE id=$1 AND user_id=$2`,
      [id, userId]
    ),

  getUnreadCount: (userId) =>
    query('SELECT COUNT(*) FROM notifications WHERE user_id=$1 AND is_read=FALSE', [userId])
      .then(r => parseInt(r.rows[0].count)),
};

// ─── TIMETABLE MODEL ─────────────────────────────────────────
const TimetableModel = {
  getByClass: (classId, academicYear = '2025-26') =>
    query(
      `SELECT tp.*,u.name AS teacher_name,sub.name AS subject_name
       FROM timetable_periods tp
       LEFT JOIN teachers t ON t.id=tp.teacher_id
       LEFT JOIN users u ON u.id=t.user_id
       LEFT JOIN subjects sub ON sub.code=tp.subject_code
       WHERE tp.class_id=$1 AND tp.academic_year=$2
       ORDER BY tp.day,tp.period_number`,
      [classId, academicYear]
    ).then(r => r.rows),

  replaceForClass: async (classId, periods, academicYear = '2025-26') => {
    return transaction(async (client) => {
      await client.query(
        'DELETE FROM timetable_periods WHERE class_id=$1 AND academic_year=$2',
        [classId, academicYear]
      );
      for (const p of periods) {
        await client.query(
          `INSERT INTO timetable_periods (school_id,class_id,teacher_id,subject_code,day,period_number,start_time,end_time,is_break,break_label,academic_year)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [p.schoolId, classId, p.teacherId || null, p.subjectCode || null,
           p.day, p.periodNumber, p.startTime, p.endTime,
           p.isBreak || false, p.breakLabel || null, academicYear]
        );
      }
    });
  },
};

module.exports = {
  UserModel,
  StudentModel,
  SchoolModel,
  TeacherModel,
  AttendanceModel,
  FeeModel,
  ContentModel,
  ExamModel,
  GamificationModel,
  NotificationModel,
  TimetableModel,
};
