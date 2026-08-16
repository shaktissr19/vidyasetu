// routes/student.routes.js
const router = require('express').Router();
const { z } = require('zod');
const ctrl = require('../controllers/student.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');

// All student routes require authentication
router.use(authenticate);
router.use(authorize('STUDENT'));

router.get('/dashboard',                                     ctrl.getDashboard);
router.get('/attendance',                                    ctrl.getAttendance);
router.get('/attendance/:year/:month',                       ctrl.getAttendance);
router.get('/badges',                                        ctrl.getBadges);
router.get('/leaderboard',                                   ctrl.getLeaderboard);  // ?scope=class|school
router.get('/report-card',                                   ctrl.getReportCard);   // ?term=1&year=2025-26
router.post('/content/:contentItemId/complete',              ctrl.markContentComplete);
router.get('/notifications',                                 ctrl.getNotifications);
router.patch('/notifications/:id/read',                      ctrl.markNotifRead);

module.exports = router;
