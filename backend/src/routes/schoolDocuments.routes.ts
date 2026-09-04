import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/studentDocuments.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();
router.use(authenticate);
router.use(authorize('SCHOOL_ADMIN','SUPER_ADMIN'));

const documentType = z.enum(['BONAFIDE_CERTIFICATE','STUDY_CERTIFICATE','CHARACTER_CERTIFICATE','TRANSFER_CERTIFICATE','ENROLLMENT_CERTIFICATE','OTHER']);
const issueSchema = z.object({
  studentId: z.string().uuid(),
  documentType,
  title: z.string().trim().min(3).max(180),
  academicYear: z.string().trim().max(20).optional().nullable(),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  payload: z.record(z.unknown()).optional(),
  requestId: z.string().uuid().optional().nullable(),
});
const reviewSchema = z.object({ action: z.enum(['APPROVE','REJECT']), note: z.string().trim().max(500).optional().nullable() });
const revokeSchema = z.object({ reason: z.string().trim().min(5).max(500) });

router.get('/', ctrl.schoolDocuments);
router.get('/requests', ctrl.schoolRequests);
router.patch('/requests/:requestId', validate(reviewSchema), ctrl.reviewRequest);
router.post('/issue', validate(issueSchema), ctrl.issueDocument);
router.patch('/:documentId/revoke', validate(revokeSchema), ctrl.revokeDocument);

export = router;
