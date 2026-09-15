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
const schoolAdminOnly = authorize('SCHOOL_ADMIN', 'SUPER_ADMIN');

// Keep auth/role middleware scoped to these registration-review endpoints.
// This router is mounted at /api/v1/school before the general School router;
// router-wide authorization would otherwise reject legitimate Teacher requests
// such as /school/profile before the general School router can handle them.
router.get('/teacher-registration-requests', authenticate, schoolAdminOnly, ctrl.getSchoolTeacherRequests);
router.patch(
  '/teacher-registration-requests/:requestId',
  authenticate,
  schoolAdminOnly,
  validate(decisionSchema),
  ctrl.reviewSchoolTeacherRequest,
);

export = router;
