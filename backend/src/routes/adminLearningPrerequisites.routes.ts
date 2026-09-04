import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/learningPrerequisiteAdmin.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);
router.use(authorize('SUPER_ADMIN'));

const replaceSchema = z.object({
  prerequisites: z.array(z.object({
    conceptId: z.string().uuid(),
    strength: z.enum(['HELPFUL', 'REQUIRED']),
    rationale: z.string().trim().max(2000).nullable().optional(),
  })).max(30),
});

router.get('/concepts/:conceptId/prerequisites', ctrl.getPrerequisites);
router.put('/concepts/:conceptId/prerequisites', validate(replaceSchema), ctrl.replacePrerequisites);

export = router;
