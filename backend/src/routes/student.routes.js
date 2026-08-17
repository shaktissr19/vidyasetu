// routes/student.routes.js
const router = require('express').Router();
const ctrl = require('../controllers/student.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.use(authenticate);
router.use(authorize('STUDENT'));

router.get('/dashboard', ctrl.getDashboard);
router.get('/attendance', ctrl.getAttendance);
router.get('/attendance/:year/:month', ctrl.getAttendance);
router.get('/badges', ctrl.getBadges);
router.get('/leaderboard', ctrl.getLeaderboard);
router.get('/report-card', ctrl.getReportCard);
router.post('/content/:contentItemId/complete', ctrl.markContentComplete);
router.get('/notifications', ctrl.getNotifications);
router.patch('/notifications/:id/read', ctrl.markNotifRead);
router.get('/offline-downloads', ctrl.getOfflineDownloads);
router.delete('/offline-downloads/:contentItemId', ctrl.removeOfflineDownload);

module.exports = router;
