import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/registrationLink.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();
const decisionSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  note: z.string().trim().max(1000).optional(),
});

router.use(authenticate);
router.use(authorize('SCHOOL_ADMIN', 'SUPER_ADMIN'));

router.get('/teacher-registration-requests', ctrl.getSchoolTeacherRequests);
router.patch('/teacher-registration-requests/:requestId', validate(decisionSchema), ctrl.reviewSchoolTeacherRequest);

export = router;
