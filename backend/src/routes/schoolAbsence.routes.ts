import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/absenceCalendar.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();
router.use(authenticate);
router.use(authorize('SCHOOL_ADMIN','SUPER_ADMIN','TEACHER'));

const adminOnly = authorize('SCHOOL_ADMIN','SUPER_ADMIN');
const reviewSchema = z.object({
  action: z.enum(['APPROVE','REJECT']),
  note: z.string().trim().max(1200).optional(),
});
const calendarSchema = z.object({
  title: z.string().trim().min(3).max(220),
  description: z.string().trim().max(3000).optional(),
  eventType: z.enum(['HOLIDAY','SCHOOL_EVENT','PTM','EXAM','ACTIVITY','OTHER']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isSchoolClosed: z.boolean().optional(),
  classIds: z.array(z.string().uuid()).max(100).optional(),
});

router.get('/leave', ctrl.schoolListLeave);
router.patch('/leave/:leaveId/review', validate(reviewSchema), ctrl.schoolReviewLeave);
router.get('/calendar', ctrl.schoolCalendar);
router.post('/calendar', adminOnly, validate(calendarSchema), ctrl.schoolCreateCalendar);
router.patch('/calendar/:eventId', adminOnly, validate(calendarSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required')), ctrl.schoolUpdateCalendar);
router.delete('/calendar/:eventId', adminOnly, ctrl.schoolArchiveCalendar);

export = router;
