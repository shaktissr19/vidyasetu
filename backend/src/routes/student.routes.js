// routes/student.routes.js
const router = require('express').Router();
const { z } = require('zod');
const ctrl = require('../controllers/student.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');

const completeProfileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  language: z.enum(['hi','en','ta','te','mr','bn','gu','kn','or']),
  schoolId: z.string().uuid(),
  classId: z.string().uuid(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).nullable().optional(),
});

router.use(authenticate);
router.use(authorize('STUDENT'));

// Profile/onboarding endpoints intentionally work before a students row exists.
router.get('/profile/status', ctrl.getProfileStatus);
router.get('/profile/setup-options', ctrl.getProfileSetupOptions);
router.post('/profile/complete', validate(completeProfileSchema), ctrl.completeProfile);

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
