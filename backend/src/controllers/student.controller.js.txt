// controllers/student.controller.js
const studentService = require('../services/student.service');
const notificationService = require('../services/notification.service');
const { query } = require('../config/db');
const R = require('../utils/response');

async function getDashboard(req, res, next) {
  try {
    const data = await studentService.getDashboard(req.user.userId);
    return R.ok(res, data);
  } catch (err) { next(err); }
}

async function getAttendance(req, res, next) {
  try {
    const year  = parseInt(req.params.year  || new Date().getFullYear());
    const month = parseInt(req.params.month || new Date().getMonth() + 1);
    const data  = await studentService.getAttendance(req.user.userId, year, month);
    return R.ok(res, data);
  } catch (err) { next(err); }
}

async function getBadges(req, res, next) {
  try {
    const badges = await studentService.getBadges(req.user.userId);
    return R.ok(res, badges);
  } catch (err) { next(err); }
}

async function getLeaderboard(req, res, next) {
  try {
    const scope = req.query.scope || 'class'; // 'class' | 'school'
    const rows  = await studentService.getLeaderboard(req.user.userId, scope);
    return R.ok(res, rows);
  } catch (err) { next(err); }
}

async function getReportCard(req, res, next) {
  try {
    const { term, year } = req.query;
    const data = await studentService.getReportCard(req.user.userId, term, year);
    return R.ok(res, data);
  } catch (err) { next(err); }
}

async function markContentComplete(req, res, next) {
  try {
    const result = await studentService.markContentComplete(
      req.user.userId, req.params.contentItemId
    );
    return R.ok(res, result);
  } catch (err) { next(err); }
}

async function getNotifications(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
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

module.exports = {
  getDashboard, getAttendance, getBadges, getLeaderboard,
  getReportCard, markContentComplete, getNotifications, markNotifRead,
};
