import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/absenceCalendar.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();
router.use(authenticate);
router.use(authorize('PARENT'));

const leaveSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().min(5).max(1200),
});

router.get('/children/:studentId/leave', ctrl.parentListLeave);
router.post('/children/:studentId/leave', validate(leaveSchema), ctrl.parentCreateLeave);
router.patch('/children/:studentId/leave/:leaveId/cancel', ctrl.parentCancelLeave);
router.get('/children/:studentId/calendar', ctrl.parentCalendar);

export = router;
