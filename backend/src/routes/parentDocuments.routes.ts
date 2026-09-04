import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/studentDocuments.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();
router.use(authenticate);
router.use(authorize('PARENT'));

const requestSchema = z.object({
  documentType: z.enum(['BONAFIDE_CERTIFICATE','STUDY_CERTIFICATE','CHARACTER_CERTIFICATE','TRANSFER_CERTIFICATE','ENROLLMENT_CERTIFICATE','OTHER']),
  purpose: z.string().trim().min(5).max(500),
});

router.get('/children/:studentId', ctrl.parentDocuments);
router.get('/children/:studentId/requests', ctrl.parentRequests);
router.post('/children/:studentId/requests', validate(requestSchema), ctrl.createParentRequest);

export = router;
