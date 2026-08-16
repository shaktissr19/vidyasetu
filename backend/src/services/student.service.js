// services/student.service.js
const { query, transaction } = require('../config/db');
const { getPagination, paginationMeta } = require('../utils/paginate');
const notificationService = require('./notification.service');
const logger = require('../utils/logger');

// ── Dashboard ──────────────────────────────────────────────

async function getDashboard(userId) {
  // Student record + class info
  const { rows: [student] } = await query(
    `SELECT s.*, u.name, u.mobile, u.language, u.profile_photo,
            sc.class_name, sc.section, sch.name AS school_name
     FROM students s
     JOIN users u ON u.id = s.user_id
     JOIN school_classes sc ON sc.id = s.class_id
     JOIN schools sch ON sch.id = s.school_id
     WHERE s.user_id = $1`,
    [userId]
  );
  if (!student) throw Object.assign(new Error('Student profile not found'), { statusCode: 404 });

  // Today's attendance
  const { rows: [todayAtt] } = await query(
    `SELECT status FROM attendance WHERE student_id = $1 AND date = CURRENT_DATE`,
    [student.id]
  );

  // This month's attendance summary
  const { rows: [attSummary] } = await query(
    `SELECT present_days, absent_days, percentage
     FROM attendance_monthly_summary
     WHERE student_id = $1 AND year = EXTRACT(YEAR FROM NOW()) AND month = EXTRACT(MONTH FROM NOW())`,
    [student.id]
  );

  // Recent XP events
  const { rows: recentXP } = await query(
    `SELECT event_type, xp_amount, created_at FROM xp_events
     WHERE student_id = $1 ORDER BY created_at DESC LIMIT 5`,
    [student.id]
  );

  // Badges count
  const { rows: [badges] } = await query(
    `SELECT COUNT(*) AS earned FROM student_badges WHERE student_id = $1`,
    [student.id]
  );

  // Subject progress
  const { rows: subjectProgress } = await query(
    `SELECT sub.name, sub.code, sub.color_hex,
            COUNT(ci.id) AS total_items,
            COUNT(scp.id) FILTER (WHERE scp.is_completed = TRUE) AS completed_items,
            ROUND(COUNT(scp.id) FILTER (WHERE scp.is_completed = TRUE)::DECIMAL /
                  NULLIF(COUNT(ci.id), 0) * 100) AS progress_pct
     FROM subjects sub
     JOIN chapters ch ON ch.subject_id = sub.id AND ch.class_name = $2
     JOIN content_items ci ON ci.chapter_id = ch.id AND ci.status = 'PUBLISHED'
     LEFT JOIN student_content_progress scp ON scp.content_item_id = ci.id AND scp.student_id = $1
     GROUP BY sub.id, sub.name, sub.code, sub.color_hex
     ORDER BY sub.name`,
    [student.id, student.class_name]
  );

  // Upcoming exams
  const { rows: upcomingExams } = await query(
    `SELECT e.id, e.title, e.type, e.start_time, e.duration_mins, e.prize_pool,
            er.id AS registered
     FROM exams e
     LEFT JOIN exam_registrations er ON er.exam_id = e.id AND er.student_id = $1
     WHERE e.status IN ('REGISTRATION_OPEN', 'LIVE')
       AND ($2 = ANY(e.class_names) OR e.school_id = $3)
     ORDER BY e.start_time ASC LIMIT 3`,
    [student.id, student.class_name, student.school_id]
  );

  return {
    student: {
      id:           student.id,
      name:         student.name,
      mobile:       student.mobile,
      language:     student.language,
      profilePhoto: student.profile_photo,
      className:    `${student.class_name}-${student.section}`,
      schoolName:   student.school_name,
      rollNumber:   student.roll_number,
      xpTotal:      student.xp_total,
      xpLevel:      student.xp_level,
      streakCurrent: student.streak_current,
      streakBest:   student.streak_best,
      badgesEarned: parseInt(badges.earned),
    },
    todayAttendance: todayAtt?.status || null,
    monthlyAttendance: attSummary || null,
    recentXP,
    subjectProgress,
    upcomingExams,
  };
}

// ── Attendance ─────────────────────────────────────────────

async function getAttendance(userId, year, month) {
  const { rows: [student] } = await query(
    `SELECT id FROM students WHERE user_id = $1`, [userId]
  );
  if (!student) throw Object.assign(new Error('Student not found'), { statusCode: 404 });

  const { rows } = await query(
    `SELECT date, status FROM attendance
     WHERE student_id = $1
       AND EXTRACT(YEAR FROM date) = $2
       AND EXTRACT(MONTH FROM date) = $3
     ORDER BY date ASC`,
    [student.id, year, month]
  );

  const { rows: [summary] } = await query(
    `SELECT * FROM attendance_monthly_summary
     WHERE student_id = $1 AND year = $2 AND month = $3`,
    [student.id, year, month]
  );

  return { records: rows, summary: summary || null };
}

// ── XP & Gamification ─────────────────────────────────────

async function awardXP(studentId, eventType, xpAmount, refId = null, refType = null, note = null) {
  await query(
    `INSERT INTO xp_events (student_id, event_type, xp_amount, reference_id, reference_type, description)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [studentId, eventType, xpAmount, refId, refType, note]
  );

  // Check and award badges
  await checkAndAwardBadges(studentId, eventType);

  // Update daily streak
  await updateStreak(studentId);

  logger.info(`XP awarded: ${xpAmount} to student ${studentId} for ${eventType}`);
}

async function updateStreak(studentId) {
  return transaction(async (client) => {
    const today = new Date().toISOString().split('T')[0];

    // Log today's activity (ignore duplicate)
    await client.query(
      `INSERT INTO streak_log (student_id, activity_date) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [studentId, today]
    );

    // Get last two distinct activity dates
    const { rows } = await client.query(
      `SELECT activity_date FROM streak_log WHERE student_id = $1 ORDER BY activity_date DESC LIMIT 2`,
      [studentId]
    );

    if (!rows.length) return;

    const { rows: [student] } = await client.query(
      `SELECT streak_current, streak_best, last_activity_date FROM students WHERE id = $1`,
      [studentId]
    );

    const lastDate = rows[0]?.activity_date;
    const prevDate = rows[1]?.activity_date;

    let newStreak = 1;
    if (prevDate) {
      const diff = (new Date(today) - new Date(prevDate)) / 86400000;
      newStreak = diff === 1 ? (student.streak_current || 0) + 1 : 1;
    }

    const newBest = Math.max(newStreak, student.streak_best || 0);

    await client.query(
      `UPDATE students SET streak_current = $1, streak_best = $2, last_activity_date = $3 WHERE id = $4`,
      [newStreak, newBest, today, studentId]
    );

    // Award streak badges
    const milestones = { 3: 'STREAK_3', 7: 'STREAK_7', 10: 'STREAK_10', 30: 'STREAK_30' };
    if (milestones[newStreak]) {
      await awardBadgeIfNotEarned(studentId, milestones[newStreak], client);
    }
  });
}

async function checkAndAwardBadges(studentId, eventType) {
  if (eventType === 'FIRST_LOGIN') {
    await awardBadgeIfNotEarned(studentId, 'FIRST_LOGIN');
  }
  if (eventType === 'LESSON_COMPLETE') {
    const { rows: [cnt] } = await query(
      `SELECT COUNT(*) AS c FROM xp_events WHERE student_id = $1 AND event_type = 'LESSON_COMPLETE'`,
      [studentId]
    );
    if (parseInt(cnt.c) === 10) await awardBadgeIfNotEarned(studentId, 'LESSON_10');
    if (parseInt(cnt.c) === 50) await awardBadgeIfNotEarned(studentId, 'LESSON_50');
  }
  if (eventType === 'QUIZ_PASS') {
    // Perfect score badge awarded by exam service when score = 100
  }
}

async function awardBadgeIfNotEarned(studentId, badgeCode, client = null) {
  const db = client || { query: (...args) => query(...args) };

  const { rows: [badge] } = await db.query(
    `SELECT id, xp_reward FROM badges WHERE code = $1 AND is_active = TRUE`, [badgeCode]
  );
  if (!badge) return;

  const insert = await db.query(
    `INSERT INTO student_badges (student_id, badge_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id`,
    [studentId, badge.id]
  );

  if (insert.rows.length) {
    // Award XP for the badge
    await query(
      `INSERT INTO xp_events (student_id, event_type, xp_amount, note)
       VALUES ($1, 'BADGE_EARNED', $2, $3)`,
      [studentId, badge.xp_reward, `Badge earned: ${badgeCode}`]
    );
    logger.info(`Badge ${badgeCode} awarded to student ${studentId}`);
  }
}

async function getBadges(userId) {
  const { rows: [student] } = await query(`SELECT id FROM students WHERE user_id = $1`, [userId]);
  if (!student) throw Object.assign(new Error('Student not found'), { statusCode: 404 });

  const { rows } = await query(
    `SELECT b.*, sb.awarded_at, (sb.id IS NOT NULL) AS earned
     FROM badges b
     LEFT JOIN student_badges sb ON sb.badge_id = b.id AND sb.student_id = $1
     WHERE b.is_active = TRUE
     ORDER BY b.category, b.xp_reward DESC`,
    [student.id]
  );
  return rows;
}

async function getLeaderboard(userId, scope = 'class') {
  const { rows: [student] } = await query(
    `SELECT s.id, s.class_id, s.school_id FROM students s WHERE s.user_id = $1`, [userId]
  );
  if (!student) throw Object.assign(new Error('Student not found'), { statusCode: 404 });

  let whereClause = scope === 'school'
    ? `WHERE s.school_id = $1`
    : `WHERE s.class_id = $2`;

  const param = scope === 'school' ? student.school_id : student.class_id;

  const { rows } = await query(
    `SELECT u.name, s.xp_total, s.xp_level, s.streak_current,
            RANK() OVER (ORDER BY s.xp_total DESC) AS rank,
            s.user_id = $3 AS is_me
     FROM students s
     JOIN users u ON u.id = s.user_id
     ${whereClause}
     ORDER BY s.xp_total DESC LIMIT 50`,
    scope === 'school'
      ? [student.school_id, null, userId]
      : [null, student.class_id, userId]
  );
  return rows;
}

// ── Content Progress ───────────────────────────────────────

async function markContentComplete(userId, contentItemId) {
  const { rows: [student] } = await query(`SELECT id FROM students WHERE user_id = $1`, [userId]);
  if (!student) throw Object.assign(new Error('Student not found'), { statusCode: 404 });

  const { rows: [existing] } = await query(
    `SELECT id, is_completed FROM student_content_progress
     WHERE student_id = $1 AND content_item_id = $2`,
    [student.id, contentItemId]
  );

  if (existing?.is_completed) return { alreadyCompleted: true };

  const { rows: [item] } = await query(
    `SELECT type FROM content_items WHERE id = $1`, [contentItemId]
  );

  await query(
    `INSERT INTO student_content_progress (student_id, content_item_id, is_completed, progress_pct, completed_at)
     VALUES ($1, $2, TRUE, 100, NOW())
     ON CONFLICT (student_id, content_item_id) DO UPDATE
     SET is_completed = TRUE, progress_pct = 100, completed_at = NOW()`,
    [student.id, contentItemId]
  );

  // Award XP based on content type
  const XP_MAP = { VIDEO: 20, PDF: 10, NOTES: 10, QUIZ: 30, EXERCISE: 20 };
  const xp = XP_MAP[item?.type] || 15;
  await awardXP(student.id, 'LESSON_COMPLETE', xp, contentItemId, 'CONTENT_ITEM');

  return { xpAwarded: xp };
}

// ── Report Card ────────────────────────────────────────────

async function getReportCard(userId, term, academicYear) {
  const { rows: [student] } = await query(
    `SELECT s.id, s.roll_number, u.name, sc.class_name, sc.section, sch.name AS school_name
     FROM students s
     JOIN users u ON u.id = s.user_id
     JOIN school_classes sc ON sc.id = s.class_id
     JOIN schools sch ON sch.id = s.school_id
     WHERE s.user_id = $1`,
    [userId]
  );
  if (!student) throw Object.assign(new Error('Student not found'), { statusCode: 404 });

  const { rows: results } = await query(
    `SELECT ea.score, e.title AS exam_name,
            s.name AS subject_name
     FROM exam_attempts ea
     JOIN exams e ON e.id = ea.exam_id
     LEFT JOIN subjects s ON s.id = e.subject_id
     WHERE ea.student_id = $1
       AND ea.status = 'EVALUATED'
       AND e.type = 'SCHOOL_EXAM'
     ORDER BY e.start_time ASC`,
    [student.id]
  );

  const { rows: [attSummary] } = await query(
    `SELECT SUM(present_days) AS present, SUM(total_days) AS total,
            ROUND(SUM(present_days)::DECIMAL / NULLIF(SUM(total_days),0) * 100, 1) AS pct
     FROM attendance_monthly_summary
     WHERE student_id = $1 AND year = LEFT($2, 4)::INT`,
    [student.id, academicYear || '2025-26']
  );

  return { student, results, attendance: attSummary };
}

module.exports = {
  getDashboard,
  getAttendance,
  awardXP,
  updateStreak,
  checkAndAwardBadges,
  awardBadgeIfNotEarned,
  getBadges,
  getLeaderboard,
  markContentComplete,
  getReportCard,
};
