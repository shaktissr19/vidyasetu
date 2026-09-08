import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/contentFactory.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();
router.use(authenticate);
router.use(authorize('SUPER_ADMIN'));

const targetUpdateSchema = z.object({
  targetStatus: z.enum(['PLANNED','REGISTRY_READY','AUTHORING','REVIEW_READY','LEARNER_READY','DEFERRED']).optional(),
  expectedConcepts: z.number().int().min(0).max(1000).nullable().optional(),
  sourceReference: z.string().trim().max(3000).nullable().optional(),
  notes: z.string().trim().max(3000).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one target field is required');

router.get('/factory', ctrl.summary);
router.get('/factory/grades/:gradeCode', ctrl.grade);
router.patch('/factory/targets/:targetId', validate(targetUpdateSchema), ctrl.updateTarget);

export = router;
