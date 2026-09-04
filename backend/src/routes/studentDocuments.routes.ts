import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/studentDocuments.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();
router.use(authenticate);
router.use(authorize('STUDENT'));

const requestSchema = z.object({
  documentType: z.enum(['BONAFIDE_CERTIFICATE','STUDY_CERTIFICATE','CHARACTER_CERTIFICATE','TRANSFER_CERTIFICATE','ENROLLMENT_CERTIFICATE','OTHER']),
  purpose: z.string().trim().min(5).max(500),
});

router.get('/', ctrl.studentDocuments);
router.get('/requests', ctrl.studentRequests);
router.post('/requests', validate(requestSchema), ctrl.createStudentRequest);

export = router;
