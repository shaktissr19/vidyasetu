import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/learningSupport.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();
router.use(authenticate, authorize('PARENT'));

const acknowledgeSchema = z.object({ note: z.string().trim().max(1200).nullable().optional() });

router.get('/:studentId', ctrl.parentSupport);
router.patch('/:studentId/interventions/:interventionId/acknowledge', validate(acknowledgeSchema), ctrl.parentAcknowledge);

export = router;
