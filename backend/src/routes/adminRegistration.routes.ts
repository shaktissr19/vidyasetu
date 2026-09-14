import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/schoolRegistrationApproval.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();
const statusSchema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING']) });

router.use(authenticate);
router.use(authorize('SUPER_ADMIN'));
router.patch('/schools/:schoolId/status', validate(statusSchema), ctrl.updateSchoolStatus);

export = router;
