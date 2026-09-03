import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/student.controller';
import * as learningRuntimeCtrl from '../controllers/studentLearningRuntime.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();
const studentGradeSchema = z.string().regex(/^(?:PN|NURSERY|LKG|UKG|[1-9]|1[0-2])$/, 'Grade must be Pre-Nursery, Nursery, LKG, UKG or Class 1-12');

const completeProfileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  language: z.enum(['hi', 'en', 'ta', 'te', 'mr', 'bn', 'gu', 'kn', 'or']),
  gradeLevel: studentGradeSchema,
  schoolId: z.string().uuid().nullable().optional(),
  classId: z.string().uuid().nullable().optional(),
  schoolNote: z.string().max(500).optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).nullable().optional(),
  parentName: z.string().trim().min(2).max(120).optional().or(z.literal('')),
  parentMobile: z.string().regex(/^\d{10}$/).optional().or(z.literal('')),
  parentEmail: z.string().email().max(180).optional().or(z.literal('')),
  parentRelation: z.enum(['FATHER', 'MOTHER', 'GUARDIAN', 'PARENT']).optional(),
}).superRefine((value, ctx) => {
  if (value.schoolId && !value.classId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['classId'], message: 'Class/section is required when a school is selected' });
  }
});

const learningProgressSchema = z.object({ progressPct: z.number().min(0).max(100) });
const learningSubmitSchema = z.object({
  answers: z.array(z.object({ questionId: z.string().uuid(), answer: z.unknown() })).max(200),
  timeSpentSecs: z.number().int().min(0).max(86400).nullable().optional(),
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

router.get('/learning/home', learningRuntimeCtrl.getLearningHome);
router.get('/learning/adaptive-plan', learningRuntimeCtrl.getAdaptiveLearningPlan);
router.patch('/learning/resources/:resourceId/progress', validate(learningProgressSchema), learningRuntimeCtrl.updateLearningResourceProgress);
router.post('/learning/resources/:resourceId/bookmark', ctrl.addLearningBookmark);
router.delete('/learning/resources/:resourceId/bookmark', ctrl.removeLearningBookmark);
router.get('/learning/assessments', ctrl.getLearningAssessments);
router.get('/learning/assessments/:assessmentId', ctrl.getLearningAssessment);
router.post('/learning/assessments/:assessmentId/start', ctrl.startLearningAssessment);
router.post('/learning/attempts/:attemptId/submit', validate(learningSubmitSchema), learningRuntimeCtrl.submitLearningAssessment);

router.get('/notifications', ctrl.getNotifications);
router.patch('/notifications/:id/read', ctrl.markNotifRead);
router.get('/offline-downloads', ctrl.getOfflineDownloads);
router.delete('/offline-downloads/:contentItemId', ctrl.removeOfflineDownload);

export = router;