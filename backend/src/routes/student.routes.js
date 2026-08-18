// routes/student.routes.js
const router = require('express').Router();
const { z } = require('zod');
const ctrl = require('../controllers/student.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');

const completeProfileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  language: z.enum(['hi','en','ta','te','mr','bn','gu','kn','or']),
  gradeLevel: z.string().regex(/^(?:[1-9]|1[0-2])$/),
  schoolId: z.string().uuid().nullable().optional(),
  classId: z.string().uuid().nullable().optional(),
  schoolNote: z.string().max(500).optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).nullable().optional(),
  parentName: z.string().trim().min(2).max(120).optional().or(z.literal('')),
  parentMobile: z.string().regex(/^\d{10}$/).optional().or(z.literal('')),
  parentEmail: z.string().email().max(180).optional().or(z.literal('')),
  parentRelation: z.enum(['FATHER','MOTHER','GUARDIAN','PARENT']).optional(),
}).superRefine((value, ctx) => {
  if (value.schoolId && !value.classId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['classId'], message: 'Class/section is required when a school is selected' });
  }
});

router.use(authenticate);
router.use(authorize('STUDENT'));

router.get('/profile/status', ctrl.getProfileStatus);
router.get('/profile/setup-options', ctrl.getProfileSetupOptions);
router.post('/profile/complete', validate(completeProfileSchema), ctrl.completeProfile);
router.get('/school-link', ctrl.getSchoolLink);

router.get('/dashboard', ctrl.getDashboard);
router.get('/attendance', ctrl.getAttendance);
router.get('/attendance/:year/:month', ctrl.getAttendance);
router.get('/report-card', ctrl.getReportCard);
router.post('/content/:contentItemId/complete', ctrl.markContentComplete);
router.get('/notifications', ctrl.getNotifications);
router.patch('/notifications/:id/read', ctrl.markNotifRead);
router.get('/offline-downloads', ctrl.getOfflineDownloads);
router.delete('/offline-downloads/:contentItemId', ctrl.removeOfflineDownload);

module.exports = router;
