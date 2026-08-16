// controllers/parent.controller.js
const parentService = require('../services/parent.service');
const R = require('../utils/response');

async function getChildren(req, res, next) {
  try {
    const children = await parentService.getChildren(req.user.userId);
    return R.ok(res, children);
  } catch (err) { next(err); }
}

async function getChildDashboard(req, res, next) {
  try {
    const data = await parentService.getChildDashboard(req.user.userId, req.params.studentId);
    return R.ok(res, data);
  } catch (err) { next(err); }
}

async function getChildAttendance(req, res, next) {
  try {
    const year  = parseInt(req.query.year  || new Date().getFullYear());
    const month = parseInt(req.query.month || new Date().getMonth() + 1);
    const data  = await parentService.getChildAttendance(req.user.userId, req.params.studentId, year, month);
    return R.ok(res, data);
  } catch (err) { next(err); }
}

async function getChildFees(req, res, next) {
  try {
    const data = await parentService.getChildFees(req.user.userId, req.params.studentId);
    return R.ok(res, data);
  } catch (err) { next(err); }
}

async function getMessages(req, res, next) {
  try {
    const msgs = await parentService.getMessages(req.user.userId, req.params.studentId);
    return R.ok(res, msgs);
  } catch (err) { next(err); }
}

async function sendMessage(req, res, next) {
  try {
    const msg = await parentService.sendMessage(req.user.userId, req.params.studentId, req.body.body);
    return R.created(res, msg);
  } catch (err) { next(err); }
}

async function getNotifications(req, res, next) {
  try {
    const notifs = await parentService.getNotifications(req.user.userId);
    return R.ok(res, notifs);
  } catch (err) { next(err); }
}

module.exports = { getChildren, getChildDashboard, getChildAttendance, getChildFees, getMessages, sendMessage, getNotifications };
