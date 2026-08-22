import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/grievance.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();
router.use(authenticate);
router.use(authorize('SCHOOL_ADMIN'));

const replySchema = z.object({
  body: z.string().trim().min(1).max(4000),
  internal: z.boolean().optional(),
});
const actionSchema = z.object({
  action: z.enum(['ACKNOWLEDGE','START','RESOLVE']),
  note: z.string().trim().max(1200).optional(),
}).superRefine((value, ctx) => {
  if (value.action === 'RESOLVE' && !value.note?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['note'], message: 'Resolution is required' });
  }
});

router.get('/', ctrl.schoolList);
router.get('/:grievanceId', ctrl.schoolGet);
router.post('/:grievanceId/replies', validate(replySchema), ctrl.schoolReply);
router.patch('/:grievanceId/action', validate(actionSchema), ctrl.schoolAction);

export = router;
