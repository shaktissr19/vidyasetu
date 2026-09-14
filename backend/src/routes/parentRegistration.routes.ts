import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/registrationLink.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();
const decisionSchema = z.object({ action: z.enum(['APPROVE', 'REJECT']) });

router.use(authenticate);
router.use(authorize('PARENT'));

router.get('/link-requests', ctrl.getParentLinkRequests);
router.patch('/link-requests/:requestId', validate(decisionSchema), ctrl.reviewParentLinkRequest);

export = router;
