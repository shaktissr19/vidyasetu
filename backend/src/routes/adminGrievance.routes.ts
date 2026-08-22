import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/grievance.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();
router.use(authenticate);
router.use(authorize('SUPER_ADMIN'));

const replySchema = z.object({
  body: z.string().trim().min(1).max(4000),
  internal: z.boolean().optional(),
});
const actionSchema = z.object({
  status: z.enum(['OPEN','ACKNOWLEDGED','IN_PROGRESS','RESOLVED','CLOSED','ESCALATED']),
  note: z.string().trim().max(1200).optional(),
});

router.get('/', ctrl.adminList);
router.get('/:grievanceId', ctrl.adminGet);
router.post('/:grievanceId/replies', validate(replySchema), ctrl.adminReply);
router.patch('/:grievanceId/status', validate(actionSchema), ctrl.adminAction);

export = router;
