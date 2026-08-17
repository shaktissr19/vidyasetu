// services/student.service.js
const { query, transaction } = require('../config/db');
const logger = require('../utils/logger');

// ── Dashboard ──────────────────────────────────────────────

async function getDashboard(userId) {
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

  if (!student) {
    throw Object.assign(new Error('Student profile not found'), { statusCode: 404 });
  }

  const [
    todayAttendanceResult,
    attendanceSummaryResult,
    recentXPResult,
    badgeCountResult,
    subjectProgressResult,
    upcomingExamsResult,
    classRankResult,
    schoolRankResult,
    leaderboardResult,
  ] = await Promise.all([
    query(
      `SELECT status
       FROM attendance
       WHERE student_id = $1 AND date = CURRENT_DATE`,
      [student.id]
    ),
    query(
      `SELECT working_days, present_days, absent_days, late_days, half_days, percentage
       FROM attendance_monthly_summary
       WHERE student_id = $1
         AND year = EXTRACT(YEAR FROM CURRENT_DATE)
         AND month = EXTRACT(MONTH FROM CURRENT_DATE)`,
      [student.id]
    ),
    query(
      `SELECT event_type, xp_amount, reference_id, reference_type, description, created_at
       FROM xp_events
       WHERE student_id = $1
       ORDER BY created_at DESC
       LIMIT 5`,
      [student.id]
    ),
    query(
      `SELECT COUNT(*) AS earned
       FROM student_badges
       WHERE student_id = $1`,
      [student.id]
    ),
    query(
      `SELECT sub.id AS subject_id, sub.name, sub.name_hi, sub.code, sub.color_hex,
              COUNT(ci.id) AS total_items,
              COUNT(scp.id) FILTER (WHERE scp.is_completed = TRUE) AS completed_items,
              ROUND(
                COUNT(scp.id) FILTER (WHERE scp.is_completed = TRUE)::DECIMAL
                / NULLIF(COUNT(ci.id), 0) * 100,
                0
              ) AS progress_pct
       FROM subjects sub
       JOIN chapters ch
         ON ch.subject_id = sub.id
        AND ch.class_name = $2
        AND ch.is_active = TRUE
       JOIN content_items ci
         ON ci.chapter_id = ch.id
        AND ci.status = 'PUBLISHED'
       LEFT JOIN student_content_progress scp
         ON scp.content_item_id = ci.id
        AND scp.student_id = $1
       WHERE sub.is_active = TRUE
       GROUP BY sub.id, sub.name, sub.name_hi, sub.code, sub.color_hex
       ORDER BY sub.sort_order, sub.name`,
      [student.id, student.class_name]
    ),
    query(
      `SELECT e.id, e.title, e.title_hi, e.type, e.status, e.start_time, e.end_time,
              e.duration_mins, e.prize_pool, e.subject_codes,
              (er.id IS NOT NULL) AS registered
       FROM exams e
       LEFT JOIN exam_registrations er
         ON er.exam_id = e.id
        AND er.student_id = $1
       WHERE e.status IN ('REGISTRATION_OPEN', 'LIVE')
         AND (
           $2 = ANY(e.class_names)
           OR cardinality(e.class_names) = 0
         )
         AND (e.school_id IS NULL OR e.school_id = $3)
       ORDER BY e.start_time ASC
       LIMIT 3`,
      [student.id, student.class_name, student.school_id]
    ),
    query(
      `SELECT rank
       FROM (
         SELECT s2.id,
                RANK() OVER (ORDER BY s2.xp_total DESC, s2.id) AS rank
         FROM students s2
         WHERE s2.class_id = $1 AND s2.status = 'ACTIVE'
       ) ranked
       WHERE id = $2`,
      [student.class_id, student.id]
    ),
    query(
      `SELECT rank
       FROM (
         SELECT s2.id,
                RANK() OVER (ORDER BY s2.xp_total DESC, s2.id) AS rank
         FROM students s2
         WHERE s2.school_id = $1 AND s2.status = 'ACTIVE'
       ) ranked
       WHERE id = $2`,
      [student.school_id, student.id]
    ),
    query(
      `SELECT s2.id AS student_id, s2.user_id, u.name, u.profile_photo,
              s2.xp_total, s2.xp_level, s2.streak_current,
              RANK() OVER (ORDER BY s2.xp_total DESC, s2.id) AS rank
       FROM students s2
       JOIN users u ON u.id = s2.user_id
       WHERE s2.class_id = $1 AND s2.status = 'ACTIVE'
       ORDER BY s2.xp_total DESC, s2.id
       LIMIT 20`,
      [student.class_id]
    ),
  ]);

  const todayAttendance = todayAttendanceResult.rows[0]?.status || null;
  const monthlyAttendance = attendanceSummaryResult.rows[0] || null;
  const recentXP = recentXPResult.rows;
  const badgesEarned = parseInt(badgeCountResult.rows[0]?.earned || '0', 10);
  const subjectProgress = subjectProgressResult.rows;
  const upcomingExams = upcomingExamsResult.rows;
  const classRank = classRankResult.rows[0]?.rank ? parseInt(classRankResult.rows[0].rank, 10) : null;
  const schoolRank = schoolRankResult.rows[0]?.rank ? parseInt(schoolRankResult.rows[0].rank, 10) : null;

  return {
    student: {
      id: student.id,
      userId: student.user_id,
      name: student.name,
      mobile: student.mobile,
      language: student.language,
      profilePhoto: student.profile_photo,
      className: student.class_name,
      section: student.section,
      classLabel: `${student.class_name}-${student.section}`,
      schoolName: student.school_name,
      rollNumber: student.roll_number,
      academicYear: student.academic_year,
      xpTotal: student.xp_total,
      xpLevel: student.xp_level,
      streakCurrent: student.streak_current,
      streakBest: student.streak_best,
      badgesEarned,
    },
    todayAttendance,
    monthlyAttendance,
    attendance: monthlyAttendance,
    recentXP,
    subjectProgress,
    subjects: subjectProgress,
    upcomingExams,
    ranking: { classRank, schoolRank },
    leaderboard: leaderboardResult.rows,
  };
}

// ── Attendance ─────────────────────────────────────────────

async function getAttendance(userId, year, month) {
  const { rows: [student] } = await query(
    `SELECT id FROM students WHERE user_id = $1`,
    [userId]
  );

  if (!student) {
    throw Object.assign(new Error('Student not found'), { statusCode: 404 });
  }

  const { rows: records } = await query(
    `SELECT date, status, remark
     FROM attendance
     WHERE student_id = $1
       AND EXTRACT(YEAR FROM date) = $2
       AND EXTRACT(MONTH FROM date) = $3
     ORDER BY date ASC`,
    [student.id, year, month]
  );

  const { rows: [summary] } = await query(
    `SELECT working_days, present_days, absent_days, late_days, half_days, percentage
     FROM attendance_monthly_summary
     WHERE student_id = $1 AND year = $2 AND month = $3`,
    [student.id, year, month]
  );

  return { records, summary: summary || null };
}

// ── XP & Gamification ─────────────────────────────────────

async function awardXP(studentId, eventType, xpAmount, refId = null, refType = null, description = null) {
  if (!Number.isFinite(Number(xpAmount)) || Number(xpAmount) <= 0) {
    return { xpAwarded: 0 };
  }

  await query(
    `INSERT INTO xp_events
       (student_id, event_type, xp_amount, reference_id, reference_type, description)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [studentId, eventType, Number(xpAmount), refId, refType, description]
  );

  await updateStreak(studentId);
  await checkAndAwardBadges(studentId);

  logger.info(`XP awarded: ${xpAmount} to student ${studentId} for ${eventType}`);
  return { xpAwarded: Number(xpAmount) };
}

async function updateStreak(studentId) {
  return transaction(async (client) => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterdayDate = new Date(`${today}T00:00:00.000Z`);
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
    const yesterday = yesterdayDate.toISOString().slice(0, 10);

    const { rows: [student] } = await client.query(
      `SELECT streak_current, streak_best, last_activity
       FROM students
       WHERE id = $1
       FOR UPDATE`,
      [studentId]
    );

    if (!student) return null;

    const lastActivity = student.last_activity
      ? new Date(student.last_activity).toISOString().slice(0, 10)
      : null;

    if (lastActivity === today) {
      await client.query(
        `INSERT INTO streak_log (student_id, date, activity, streak_count)
         VALUES ($1, $2, 'DAILY_LOGIN', $3)
         ON CONFLICT (student_id, date) DO UPDATE
         SET streak_count = EXCLUDED.streak_count`,
        [studentId, today, student.streak_current || 1]
      );
      return {
        streakCurrent: student.streak_current || 1,
        streakBest: student.streak_best || 1,
      };
    }

    const newStreak = lastActivity === yesterday
      ? (student.streak_current || 0) + 1
      : 1;
    const newBest = Math.max(newStreak, student.streak_best || 0);

    await client.query(
      `INSERT INTO streak_log (student_id, date, activity, streak_count)
       VALUES ($1, $2, 'DAILY_LOGIN', $3)
       ON CONFLICT (student_id, date) DO UPDATE
       SET streak_count = EXCLUDED.streak_count`,
      [studentId, today, newStreak]
    );

    await client.query(
      `UPDATE students
       SET streak_current = $1,
           streak_best = $2,
           last_activity = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [newStreak, newBest, today, studentId]
    );

    if (newStreak >= 7) {
      await awardBadgeIfNotEarned(studentId, 'WEEK_WARRIOR', client);
    }
    if (newStreak >= 30) {
      await awardBadgeIfNotEarned(studentId, 'MONTH_MASTER', client);
    }

    return { streakCurrent: newStreak, streakBest: newBest };
  });
}

async function checkAndAwardBadges(studentId) {
  const [studentResult, lessonResult, perfectQuizResult] = await Promise.all([
    query(
      `SELECT xp_total, streak_current
       FROM students
       WHERE id = $1`,
      [studentId]
    ),
    query(
      `SELECT COUNT(*) AS count
       FROM xp_events
       WHERE student_id = $1 AND event_type = 'LESSON_COMPLETE'`,
      [studentId]
    ),
    query(
      `SELECT COUNT(*) AS count
       FROM xp_events
       WHERE student_id = $1 AND event_type = 'QUIZ_PERFECT'`,
      [studentId]
    ),
  ]);

  const student = studentResult.rows[0];
  if (!student) return;

  const xpTotal = Number(student.xp_total || 0);
  const streak = Number(student.streak_current || 0);
  const lessonCount = parseInt(lessonResult.rows[0]?.count || '0', 10);
  const perfectQuizCount = parseInt(perfectQuizResult.rows[0]?.count || '0', 10);

  const badgeCodes = [];

  if (lessonCount >= 1) badgeCodes.push('FIRST_STEP');
  if (lessonCount >= 10) badgeCodes.push('CURIOUS_MIND');
  if (streak >= 7) badgeCodes.push('WEEK_WARRIOR');
  if (streak >= 30) badgeCodes.push('MONTH_MASTER');
  if (xpTotal >= 500) badgeCodes.push('XP_500');
  if (xpTotal >= 2000) badgeCodes.push('XP_2000');
  if (xpTotal >= 5000) badgeCodes.push('XP_5000');
  if (xpTotal >= 10000) badgeCodes.push('XP_10000');
  if (perfectQuizCount >= 5) badgeCodes.push('QUIZ_MASTER');

  for (const code of badgeCodes) {
    await awardBadgeIfNotEarned(studentId, code);
  }
}

async function awardBadgeIfNotEarned(studentId, badgeCode, client = null) {
  const db = client || { query: (...args) => query(...args) };

  const { rows: [badge] } = await db.query(
    `SELECT id, code, name, tier, xp_bonus
     FROM badges
     WHERE code = $1 AND is_active = TRUE`,
    [badgeCode]
  );

  if (!badge) return { awarded: false, reason: 'BADGE_NOT_FOUND' };

  const insert = await db.query(
    `INSERT INTO student_badges (student_id, badge_id)
     VALUES ($1, $2)
     ON CONFLICT (student_id, badge_id) DO NOTHING
     RETURNING id, awarded_at`,
    [studentId, badge.id]
  );

  if (!insert.rows.length) {
    return { awarded: false, reason: 'ALREADY_EARNED' };
  }

  // xp_bonus remains catalogue metadata for now. The current xp_event_type
  // enum has no BADGE_EARNED event, so Phase 1 does not create an invalid XP row.
  logger.info(`Badge ${badgeCode} awarded to student ${studentId}`);
  return {
    awarded: true,
    badge: {
      code: badge.code,
      name: badge.name,
      tier: badge.tier,
      xpBonus: badge.xp_bonus,
    },
  };
}

async function getBadges(userId) {
  const { rows: [student] } = await query(
    `SELECT id FROM students WHERE user_id = $1`,
    [userId]
  );

  if (!student) {
    throw Object.assign(new Error('Student not found'), { statusCode: 404 });
  }

  const { rows } = await query(
    `SELECT b.id, b.code, b.name, b.name_hi, b.description, b.description_hi,
            b.tier, b.icon_url, b.xp_bonus, b.criteria_type, b.criteria_value,
            sb.awarded_at,
            (sb.id IS NOT NULL) AS earned
     FROM badges b
     LEFT JOIN student_badges sb
       ON sb.badge_id = b.id
      AND sb.student_id = $1
     WHERE b.is_active = TRUE
     ORDER BY (sb.id IS NOT NULL) DESC, b.tier DESC, b.xp_bonus DESC, b.name`,
    [student.id]
  );

  return rows;
}

async function getLeaderboard(userId, scope = 'class') {
  const { rows: [student] } = await query(
    `SELECT id, class_id, school_id
     FROM students
     WHERE user_id = $1`,
    [userId]
  );

  if (!student) {
    throw Object.assign(new Error('Student not found'), { statusCode: 404 });
  }

  const isSchoolScope = scope === 'school';
  const scopeColumn = isSchoolScope ? 's.school_id' : 's.class_id';
  const scopeValue = isSchoolScope ? student.school_id : student.class_id;

  const { rows } = await query(
    `SELECT s.id AS student_id, s.user_id, u.name, u.profile_photo,
            s.xp_total, s.xp_level, s.streak_current,
            sc.class_name, sc.section,
            RANK() OVER (ORDER BY s.xp_total DESC, s.id) AS rank,
            (s.user_id = $2) AS is_me
     FROM students s
     JOIN users u ON u.id = s.user_id
     JOIN school_classes sc ON sc.id = s.class_id
     WHERE ${scopeColumn} = $1 AND s.status = 'ACTIVE'
     ORDER BY s.xp_total DESC, s.id
     LIMIT 50`,
    [scopeValue, userId]
  );

  return rows;
}

// ── Content Progress ───────────────────────────────────────

async function markContentComplete(userId, contentItemId) {
  const { rows: [student] } = await query(
    `SELECT id FROM students WHERE user_id = $1`,
    [userId]
  );

  if (!student) {
    throw Object.assign(new Error('Student not found'), { statusCode: 404 });
  }

  const { rows: [item] } = await query(
    `SELECT id, type, xp_reward, status
     FROM content_items
     WHERE id = $1`,
    [contentItemId]
  );

  if (!item || item.status !== 'PUBLISHED') {
    throw Object.assign(new Error('Content item not found'), { statusCode: 404 });
  }

  if (item.type === 'QUIZ') {
    throw Object.assign(
      new Error('Quiz completion must be recorded through quiz submission'),
      { statusCode: 400 }
    );
  }

  const { rows: [existing] } = await query(
    `SELECT id, is_completed
     FROM student_content_progress
     WHERE student_id = $1 AND content_item_id = $2`,
    [student.id, contentItemId]
  );

  if (existing?.is_completed) {
    return { alreadyCompleted: true, xpAwarded: 0 };
  }

  await query(
    `INSERT INTO student_content_progress
       (student_id, content_item_id, is_completed, progress_pct, last_accessed, completed_at)
     VALUES ($1, $2, TRUE, 100, NOW(), NOW())
     ON CONFLICT (student_id, content_item_id) DO UPDATE
     SET is_completed = TRUE,
         progress_pct = 100,
         last_accessed = NOW(),
         completed_at = COALESCE(student_content_progress.completed_at, NOW())`,
    [student.id, contentItemId]
  );

  const xp = Number(item.xp_reward || 10);
  await awardXP(
    student.id,
    'LESSON_COMPLETE',
    xp,
    contentItemId,
    'CONTENT_ITEM',
    `Completed ${item.type.toLowerCase()} content`
  );

  return { alreadyCompleted: false, xpAwarded: xp };
}

// ── Report Card ────────────────────────────────────────────

function parseAcademicYear(value) {
  const match = /^(\d{4})-(\d{2}|\d{4})$/.exec(value || '');
  if (!match) return null;

  const startYear = parseInt(match[1], 10);
  const rawEnd = match[2];
  const endYear = rawEnd.length === 2
    ? Math.floor(startYear / 100) * 100 + parseInt(rawEnd, 10)
    : parseInt(rawEnd, 10);

  return { startYear, endYear };
}

async function getReportCard(userId, term, academicYear) {
  const { rows: [student] } = await query(
    `SELECT s.id, s.roll_number, s.academic_year,
            u.name,
            sc.class_name, sc.section,
            sch.name AS school_name, sch.udise_code
     FROM students s
     JOIN users u ON u.id = s.user_id
     JOIN school_classes sc ON sc.id = s.class_id
     JOIN schools sch ON sch.id = s.school_id
     WHERE s.user_id = $1`,
    [userId]
  );

  if (!student) {
    throw Object.assign(new Error('Student not found'), { statusCode: 404 });
  }

  const requestedAcademicYear = academicYear || student.academic_year;
  const parsedYear = parseAcademicYear(requestedAcademicYear);

  const examParams = [student.id];
  let examDateFilter = '';

  if (parsedYear) {
    examParams.push(`${parsedYear.startYear}-04-01`, `${parsedYear.endYear}-04-01`);
    examDateFilter = `AND e.start_time >= $2::date AND e.start_time < $3::date`;
  }

  const { rows: results } = await query(
    `SELECT e.id AS exam_id,
            e.title AS exam_name,
            e.title_hi,
            e.subject_codes,
            e.start_time,
            ea.total_marks AS marks_obtained,
            (e.total_questions * e.marks_per_question) AS max_marks,
            ea.correct_count,
            ea.wrong_count,
            ea.skipped_count,
            ea.percentile,
            ea.rank_school,
            ea.rank_overall
     FROM exam_attempts ea
     JOIN exams e ON e.id = ea.exam_id
     WHERE ea.student_id = $1
       AND ea.status = 'SCORED'
       AND e.type = 'SCHOOL_TEST'
       ${examDateFilter}
     ORDER BY e.start_time ASC`,
    examParams
  );

  let attendance = null;
  if (parsedYear) {
    const { rows: [summary] } = await query(
      `SELECT COALESCE(SUM(working_days), 0) AS working_days,
              COALESCE(SUM(present_days), 0) AS present_days,
              COALESCE(SUM(absent_days), 0) AS absent_days,
              COALESCE(SUM(late_days), 0) AS late_days,
              COALESCE(SUM(half_days), 0) AS half_days,
              ROUND(
                (
                  COALESCE(SUM(present_days), 0)
                  + COALESCE(SUM(late_days), 0)
                  + COALESCE(SUM(half_days), 0)
                )::DECIMAL
                / NULLIF(COALESCE(SUM(working_days), 0), 0) * 100,
                1
              ) AS percentage
       FROM attendance_monthly_summary
       WHERE student_id = $1
         AND (
           (year = $2 AND month BETWEEN 4 AND 12)
           OR
           (year = $3 AND month BETWEEN 1 AND 3)
         )`,
      [student.id, parsedYear.startYear, parsedYear.endYear]
    );
    attendance = summary;
  }

  return {
    student,
    academicYear: requestedAcademicYear,
    requestedTerm: term || null,
    results,
    attendance,
  };
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
