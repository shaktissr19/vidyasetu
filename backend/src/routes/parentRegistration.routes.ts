import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/registrationLink.controller';
import * as parentRelationshipCtrl from '../controllers/parentRelationship.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();
const decisionSchema = z.object({ action: z.enum(['APPROVE', 'REJECT']) });
const childRequestSchema = z.object({
  studentCode: z.string().trim().min(3).max(24),
  relation: z.enum(['FATHER', 'MOTHER', 'GUARDIAN', 'PARENT']).optional(),
});

router.use(authenticate);
router.use(authorize('PARENT'));

router.post('/link-requests', validate(childRequestSchema), parentRelationshipCtrl.requestChildLink);
router.get('/link-requests', ctrl.getParentLinkRequests);
router.patch('/link-requests/:requestId', validate(decisionSchema), ctrl.reviewParentLinkRequest);

export = router;
