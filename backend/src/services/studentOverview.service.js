const { query } = require('../config/db');
const enrollmentService = require('./enrollment.service');

async function getStudent(userId) {
  const { rows: [student] } = await query(
    `SELECT s.id, s.user_id, s.student_code, s.grade_level, s.school_link_status,
            s.school_id, s.class_id, s.roll_number, s.academic_year, s.date_of_birth, s.gender,
            u.name, u.username, u.email, u.mobile, u.language, u.profile_photo,
            sch.name AS school_name, sch.udise_code,
            sc.class_name, sc.section
     FROM students s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN schools sch ON sch.id = s.school_id
     LEFT JOIN school_classes sc ON sc.id = s.class_id
     WHERE s.user_id = $1 AND s.status = 'ACTIVE'`,
    [userId]
  );
  if (!student) throw Object.assign(new Error('Student profile not found'), { statusCode: 404 });
  return student;
}

async function getAcademicRank(student, scope) {
  if (student.school_link_status !== 'APPROVED' || !student.class_id || !student.school_id) return null;
  const scopePredicate = scope === 'school' ? 's2.school_id = $1' : 's2.class_id = $1';
  const scopeValue = scope === 'school' ? student.school_id : student.class_id;

  const { rows: [row] } = await query(
    `WITH student_scores AS (
       SELECT s2.id AS student_id,
              AVG(
                CASE WHEN e.total_questions > 0 AND e.marks_per_question > 0
                  THEN (ea.total_marks / (e.total_questions * e.marks_per_question)) * 100
                  ELSE NULL END
              ) AS avg_pct
       FROM students s2
       JOIN exam_attempts ea ON ea.student_id = s2.id AND ea.status = 'SCORED'
       JOIN exams e ON e.id = ea.exam_id AND e.type = 'SCHOOL_TEST'
       WHERE ${scopePredicate}
         AND s2.status = 'ACTIVE'
         AND s2.school_link_status = 'APPROVED'
       GROUP BY s2.id
     ), ranked AS (
       SELECT student_id, avg_pct,
              RANK() OVER (ORDER BY avg_pct DESC NULLS LAST, student_id) AS rank
       FROM student_scores
     )
     SELECT rank, ROUND(avg_pct::numeric, 1) AS average
     FROM ranked WHERE student_id = $2`,
    [scopeValue, student.id]
  );
  return row ? { rank: Number(row.rank), average: Number(row.average || 0) } : null;
}

async function getDashboard(userId) {
  const student = await getStudent(userId);
  const grade = student.class_name || student.grade_level;
  const approvedSchool = student.school_link_status === 'APPROVED' && student.school_id && student.class_id;

  const [
    attendanceResult,
    subjectProgressResult,
    examsResult,
    recentResultsResult,
    notificationResult,
    timetableResult,
    announcementResult,
    classAcademicRank,
    schoolAcademicRank,
    linkSummary,
  ] = await Promise.all([
    approvedSchool
      ? query(
          `SELECT working_days, present_days, absent_days, late_days, half_days, percentage
           FROM attendance_monthly_summary
           WHERE student_id = $1
             AND year = EXTRACT(YEAR FROM CURRENT_DATE)
             AND month = EXTRACT(MONTH FROM CURRENT_DATE)`,
          [student.id]
        )
      : Promise.resolve({ rows: [] }),
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
       JOIN chapters ch ON ch.subject_id = sub.id AND ch.class_name = $2 AND ch.is_active = TRUE
       JOIN content_items ci ON ci.chapter_id = ch.id AND ci.status = 'PUBLISHED'
       LEFT JOIN student_content_progress scp ON scp.content_item_id = ci.id AND scp.student_id = $1
       WHERE sub.is_active = TRUE
       GROUP BY sub.id, sub.name, sub.name_hi, sub.code, sub.color_hex
       ORDER BY sub.sort_order, sub.name`,
      [student.id, grade]
    ),
    query(
      `SELECT e.id, e.title, e.title_hi, e.type, e.status, e.start_time, e.end_time,
              e.duration_mins, e.prize_pool, e.subject_codes,
              (er.id IS NOT NULL) AS registered
       FROM exams e
       LEFT JOIN exam_registrations er ON er.exam_id = e.id AND er.student_id = $1
       WHERE e.status IN ('REGISTRATION_OPEN', 'LIVE')
         AND ($2 = ANY(e.class_names) OR cardinality(e.class_names) = 0)
         AND (e.school_id IS NULL OR ($3::uuid IS NOT NULL AND e.school_id = $3::uuid))
       ORDER BY e.start_time ASC
       LIMIT 5`,
      [student.id, grade, approvedSchool ? student.school_id : null]
    ),
    query(
      `SELECT e.id, e.title, e.type, e.start_time, e.subject_codes,
              ea.total_marks,
              (e.total_questions * e.marks_per_question) AS max_marks,
              ea.correct_count, ea.wrong_count, ea.skipped_count,
              ea.rank_school, ea.rank_overall,
              ROUND(
                CASE WHEN e.total_questions > 0 AND e.marks_per_question > 0
                  THEN (ea.total_marks / (e.total_questions * e.marks_per_question)) * 100
                  ELSE 0 END,
                1
              ) AS percentage
       FROM exam_attempts ea
       JOIN exams e ON e.id = ea.exam_id
       WHERE ea.student_id = $1 AND ea.status = 'SCORED'
       ORDER BY ea.submitted_at DESC
       LIMIT 8`,
      [student.id]
    ),
    query(
      `SELECT id, type, title, body, reference_type, reference_id, is_read, read_at, sent_at AS created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY sent_at DESC
       LIMIT 8`,
      [userId]
    ),
    approvedSchool
      ? query(
          `SELECT tp.id, tp.day, tp.period_number, tp.start_time, tp.end_time,
                  tp.subject_code, tp.is_break, tp.break_label, tp.room_number,
                  u.name AS teacher_name
           FROM timetable_periods tp
           LEFT JOIN teachers t ON t.id = tp.teacher_id
           LEFT JOIN users u ON u.id = t.user_id
           WHERE tp.class_id = $1
           ORDER BY ARRAY_POSITION(ARRAY['MON','TUE','WED','THU','FRI','SAT']::text[], tp.day::text), tp.period_number`,
          [student.class_id]
        )
      : Promise.resolve({ rows: [] }),
    approvedSchool
      ? query(
          `SELECT a.id, a.title, a.body, a.is_pinned, a.published_at, a.expires_at
           FROM announcements a
           WHERE a.school_id = $1
             AND (a.expires_at IS NULL OR a.expires_at > NOW())
             AND ('STUDENT' = ANY(a.target_roles))
             AND (cardinality(a.target_classes) = 0 OR $2 = ANY(a.target_classes))
           ORDER BY a.is_pinned DESC, a.published_at DESC
           LIMIT 8`,
          [student.school_id, grade]
        )
      : Promise.resolve({ rows: [] }),
    getAcademicRank(student, 'class'),
    getAcademicRank(student, 'school'),
    enrollmentService.getStudentLinkSummary(userId),
  ]);

  const recentResults = recentResultsResult.rows;
  const schoolTests = recentResults.filter(row => row.type === 'SCHOOL_TEST');
  const academicAverage = schoolTests.length
    ? Number((schoolTests.reduce((sum, row) => sum + Number(row.percentage || 0), 0) / schoolTests.length).toFixed(1))
    : null;

  return {
    student: {
      id: student.id,
      userId: student.user_id,
      studentCode: student.student_code,
      name: student.name,
      username: student.username,
      email: student.email,
      mobile: student.mobile,
      language: student.language,
      profilePhoto: student.profile_photo,
      gradeLevel: grade,
      className: student.class_name || grade,
      section: student.section || null,
      classLabel: student.class_name ? `${student.class_name}-${student.section}` : `Class ${grade}`,
      schoolName: student.school_name,
      schoolLinkStatus: student.school_link_status,
      rollNumber: student.roll_number,
      academicYear: student.academic_year,
    },
    schoolLink: linkSummary,
    monthlyAttendance: attendanceResult.rows[0] || null,
    attendance: attendanceResult.rows[0] || null,
    subjectProgress: subjectProgressResult.rows,
    subjects: subjectProgressResult.rows,
    upcomingExams: examsResult.rows,
    recentResults,
    academic: {
      average: academicAverage,
      classRank: classAcademicRank?.rank || null,
      schoolRank: schoolAcademicRank?.rank || null,
      scoredSchoolTests: schoolTests.length,
    },
    timetable: timetableResult.rows,
    announcements: announcementResult.rows,
    notifications: notificationResult.rows,
    unreadNotifications: notificationResult.rows.filter(row => !row.is_read).length,
  };
}

module.exports = { getDashboard, getStudent };
