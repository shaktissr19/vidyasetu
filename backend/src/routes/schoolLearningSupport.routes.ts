import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/learningSupport.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();
router.use(authenticate);
router.use(authorize('TEACHER', 'SCHOOL_ADMIN', 'SUPER_ADMIN'));

const interventionSchema = z.object({
  classId: z.string().uuid(),
  subjectCode: z.string().trim().min(1).max(50),
  conceptId: z.string().uuid().nullable().optional(),
  studentIds: z.array(z.string().uuid()).min(1).max(100),
  teacherId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(3).max(220),
  reason: z.string().trim().min(5).max(3000),
  priority: z.enum(['HIGH', 'FOCUS', 'ROUTINE']).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  actionPlan: z.object({
    actionType: z.string().trim().max(80).optional(),
    instructions: z.string().trim().max(1600).optional(),
    resourceId: z.string().uuid().nullable().optional(),
    assessmentId: z.string().uuid().nullable().optional(),
    estimatedMinutes: z.number().int().min(1).max(240).nullable().optional(),
  }).nullable().optional(),
});
const statusSchema = z.object({
  status: z.enum(['PARENT_ACKNOWLEDGED', 'IN_PROGRESS', 'PTM_REQUESTED', 'RESOLVED', 'CLOSED']),
  outcomeNote: z.string().trim().max(2000).nullable().optional(),
});
const studentStatusSchema = z.object({
  status: z.enum(['IN_PROGRESS', 'RESOLVED', 'REMOVED']),
  outcomeNote: z.string().trim().max(1600).nullable().optional(),
});
const communitySchema = z.object({ name: z.string().trim().min(3).max(160).nullable().optional() });

router.get('/workspace', ctrl.teacherWorkspace);
router.post('/interventions', validate(interventionSchema), ctrl.createIntervention);
router.get('/interventions/:interventionId', ctrl.interventionDetail);
router.patch('/interventions/:interventionId', validate(statusSchema), ctrl.updateIntervention);
router.patch('/interventions/:interventionId/students/:studentId', validate(studentStatusSchema), ctrl.updateInterventionStudent);
router.post('/interventions/:interventionId/community', validate(communitySchema), ctrl.interventionCommunity);

export = router;
