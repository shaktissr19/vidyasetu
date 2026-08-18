// controllers/school.controller.js
const schoolService = require('../services/school.service');
const schoolRosterService = require('../services/schoolRoster.service');
const { query } = require('../config/db');
const R = require('../utils/response');

function getSchoolId(req) {
  return req.user.schoolId || req.query.schoolId;
}

async function getOverview(req, res, next) {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return R.badRequest(res, 'School ID required');
    const [data, roster] = await Promise.all([
      schoolService.getOverview(schoolId),
      schoolRosterService.getRosterCounts(schoolId),
    ]);
    data.stats = {
      ...(data.stats || {}),
      total_students: roster.approvedStudents,
      pending_enrollment_requests: roster.pendingRequests,
    };
    return R.ok(res, data);
  } catch (err) { next(err); }
}

async function getStudents(req, res, next) {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return R.badRequest(res, 'School ID required');
    const { classId, search, status } = req.query;
    const data = await schoolRosterService.getApprovedStudents(schoolId, req.query, { classId, search, status });
    return R.ok(res, data.students, data.meta);
  } catch (err) { next(err); }
}

async function addStudent(req, res, next) {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return R.badRequest(res, 'School ID required');
    const result = await schoolService.addStudent(schoolId, req.body);
    return R.created(res, result);
  } catch (err) { next(err); }
}

async function markAttendance(req, res, next) {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return R.badRequest(res, 'School ID required');
    const { classId, date, records } = req.body;
    const result = await schoolService.markAttendance(schoolId, classId, date, records, req.user.userId);
    return R.ok(res, { marked: result.length });
  } catch (err) { next(err); }
}

async function getAttendanceSummary(req, res, next) {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return R.badRequest(res, 'School ID required');
    const { rows } = await query(
      `SELECT sc.class_name, sc.section,
              COUNT(a.id) FILTER (WHERE a.status = 'PRESENT') AS present,
              COUNT(a.id) FILTER (WHERE a.status = 'ABSENT') AS absent,
              COUNT(DISTINCT st.id) AS total_students
       FROM school_classes sc
       LEFT JOIN students st ON st.class_id = sc.id
         AND st.status = 'ACTIVE'
         AND st.school_link_status = 'APPROVED'
       LEFT JOIN attendance a ON a.student_id = st.id AND a.date = $2
       WHERE sc.school_id = $1
       GROUP BY sc.class_name, sc.section
       ORDER BY sc.class_name`,
      [schoolId, req.query.date || new Date().toISOString().split('T')[0]]
    );
    return R.ok(res, rows);
  } catch (err) { next(err); }
}

async function getFeeOverview(req, res, next) {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return R.badRequest(res, 'School ID required');
    const data = await schoolService.getFeeOverview(schoolId, req.query.year);
    return R.ok(res, data);
  } catch (err) { next(err); }
}

async function recordPayment(req, res, next) {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return R.badRequest(res, 'School ID required');
    const result = await schoolService.recordFeePayment(schoolId, { ...req.body, collectedBy: req.user.userId });
    return R.created(res, result);
  } catch (err) { next(err); }
}

async function sendFeeReminders(req, res, next) {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return R.badRequest(res, 'School ID required');
    const result = await schoolService.sendFeeReminders(schoolId);
    return R.ok(res, result);
  } catch (err) { next(err); }
}

async function getTimetable(req, res, next) {
  try {
    const rows = await schoolService.getTimetable(req.params.classId);
    return R.ok(res, rows);
  } catch (err) { next(err); }
}

async function saveTimetable(req, res, next) {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return R.badRequest(res, 'School ID required');
    const result = await schoolService.saveTimetable(req.params.classId, schoolId, req.body.periods);
    return R.ok(res, result);
  } catch (err) { next(err); }
}

async function getResults(req, res, next) {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return R.badRequest(res, 'School ID required');
    const { rows } = await query(
      `SELECT sc.class_name, sc.section, e.title AS exam_name,
              ROUND(AVG(ea.total_marks), 1) AS avg_score,
              COUNT(ea.id) FILTER (WHERE ea.total_marks >= (e.total_questions * e.marks_per_question * 0.33)) AS pass_count,
              COUNT(ea.id) AS total_attempts
       FROM exams e
       JOIN exam_attempts ea ON ea.exam_id = e.id AND ea.status = 'SCORED'
       JOIN students st ON st.id = ea.student_id AND st.school_link_status = 'APPROVED'
       JOIN school_classes sc ON sc.id = st.class_id
       WHERE e.school_id = $1
       GROUP BY sc.class_name, sc.section, e.id, e.title
       ORDER BY e.start_time DESC`,
      [schoolId]
    );
    return R.ok(res, rows);
  } catch (err) { next(err); }
}

async function getAnnouncements(req, res, next) {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return R.badRequest(res, 'School ID required');
    const { rows } = await query(
      `SELECT a.*, u.name AS created_by_name
       FROM announcements a
       JOIN users u ON u.id = a.created_by
       WHERE a.school_id = $1 ORDER BY a.created_at DESC LIMIT 30`,
      [schoolId]
    );
    return R.ok(res, rows);
  } catch (err) { next(err); }
}

async function publishAnnouncement(req, res, next) {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return R.badRequest(res, 'School ID required');
    const ann = await schoolService.publishAnnouncement(schoolId, req.user.userId, req.body);
    return R.created(res, ann);
  } catch (err) { next(err); }
}

async function getTeachers(req, res, next) {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return R.badRequest(res, 'School ID required');
    const { rows } = await query(
      `SELECT t.id, t.employee_id, t.status, u.name, u.mobile,
              array_agg(DISTINCT ta.subject_code) FILTER (WHERE ta.subject_code IS NOT NULL) AS subjects,
              array_agg(DISTINCT sc.class_name || '-' || sc.section) FILTER (WHERE sc.id IS NOT NULL) AS classes
       FROM teachers t
       JOIN users u ON u.id = t.user_id
       LEFT JOIN teacher_assignments ta ON ta.teacher_id = t.id
       LEFT JOIN school_classes sc ON sc.id = ta.class_id
       WHERE t.school_id = $1
       GROUP BY t.id, u.name, u.mobile`,
      [schoolId]
    );
    return R.ok(res, rows);
  } catch (err) { next(err); }
}

async function getClasses(req, res, next) {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return R.badRequest(res, 'School ID required');
    const { rows } = await query(
      `SELECT sc.*, COUNT(st.id) AS student_count
       FROM school_classes sc
       LEFT JOIN students st ON st.class_id = sc.id
         AND st.status = 'ACTIVE'
         AND st.school_link_status = 'APPROVED'
       WHERE sc.school_id = $1
       GROUP BY sc.id ORDER BY sc.class_name, sc.section`,
      [schoolId]
    );
    return R.ok(res, rows);
  } catch (err) { next(err); }
}

module.exports = {
  getOverview, getStudents, addStudent,
  markAttendance, getAttendanceSummary,
  getFeeOverview, recordPayment, sendFeeReminders,
  getTimetable, saveTimetable, getResults,
  getAnnouncements, publishAnnouncement,
  getTeachers, getClasses,
};
