// controllers/student.controller.js
const studentService = require('../services/student.service');
const studentProfileService = require('../services/studentProfile.service');
const studentPortalService = require('../services/studentPortal.service');
const studentOverviewService = require('../services/studentOverview.service');
const studentLearningService = require('../services/studentLearning.service');
const enrollmentService = require('../services/enrollment.service');
const notificationService = require('../services/notification.service');
const { query } = require('../config/db');
const R = require('../utils/response');

async function getProfileStatus(req, res, next) {
  try { return R.ok(res, await studentProfileService.getProfileStatus(req.user.userId)); }
  catch (err) { next(err); }
}

async function getProfileSetupOptions(req, res, next) {
  try { return R.ok(res, await studentProfileService.getSetupOptions()); }
  catch (err) { next(err); }
}

async function completeProfile(req, res, next) {
  try {
    const data = await studentProfileService.completeProfile(req.user.userId, req.body);
    return R.ok(res, { message: 'Student profile completed', student: data });
  } catch (err) { next(err); }
}

async function getDashboard(req, res, next) {
  try { return R.ok(res, await studentOverviewService.getDashboard(req.user.userId)); }
  catch (err) { next(err); }
}

async function getSchoolLink(req, res, next) {
  try {
    const data = await enrollmentService.getStudentLinkSummary(req.user.userId);
    if (!data) return R.notFound(res, 'Student profile not found');
    return R.ok(res, data);
  } catch (err) { next(err); }
}

async function getAttendance(req, res, next) {
  try {
    const year = parseInt(req.params.year || new Date().getFullYear(), 10);
    const month = parseInt(req.params.month || new Date().getMonth() + 1, 10);
    return R.ok(res, await studentService.getAttendance(req.user.userId, year, month));
  } catch (err) { next(err); }
}

async function getReportCard(req, res, next) {
  try {
    const { term, year } = req.query;
    const data = await studentService.getReportCard(req.user.userId, term, year);
    const { rows: [identity] } = await query(
      `SELECT student_code FROM students WHERE user_id = $1`,
      [req.user.userId]
    );
    if (data?.student) data.student.student_code = identity?.student_code || null;
    return R.ok(res, data);
  } catch (err) { next(err); }
}

async function markContentComplete(req, res, next) {
  try {
    return R.ok(res, await studentLearningService.markContentComplete(req.user.userId, req.params.contentItemId));
  } catch (err) { next(err); }
}

async function getNotifications(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT id, type, channel, title, body, reference_type, reference_id,
              is_read, read_at, delivery_status, sent_at AS created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY sent_at DESC
       LIMIT 50`,
      [req.user.userId]
    );
    return R.ok(res, rows);
  } catch (err) { next(err); }
}

async function markNotifRead(req, res, next) {
  try {
    await notificationService.markNotificationRead(req.params.id, req.user.userId);
    return R.ok(res, { message: 'Marked as read' });
  } catch (err) { next(err); }
}

async function getOfflineDownloads(req, res, next) {
  try { return R.ok(res, await studentPortalService.getOfflineDownloads(req.user.userId)); }
  catch (err) { next(err); }
}

async function removeOfflineDownload(req, res, next) {
  try { return R.ok(res, await studentPortalService.removeOfflineDownload(req.user.userId, req.params.contentItemId)); }
  catch (err) { next(err); }
}

module.exports = {
  getProfileStatus,
  getProfileSetupOptions,
  completeProfile,
  getDashboard,
  getSchoolLink,
  getAttendance,
  getReportCard,
  markContentComplete,
  getNotifications,
  markNotifRead,
  getOfflineDownloads,
  removeOfflineDownload,
};
