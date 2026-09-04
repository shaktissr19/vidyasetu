import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/ptm.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router=Router();
router.use(authenticate);
router.use(authorize('SCHOOL_ADMIN','SUPER_ADMIN','TEACHER'));

const sessionSchema=z.object({
  title:z.string().trim().min(3).max(220),description:z.string().trim().max(3000).optional().nullable(),
  startsAt:z.string().datetime(),endsAt:z.string().datetime(),bookingOpensAt:z.string().datetime(),bookingClosesAt:z.string().datetime(),
});
const statusSchema=z.object({status:z.enum(['OPEN','CLOSED','COMPLETED','CANCELLED'])});
const slotSchema=z.object({teacherId:z.string().uuid(),startsAt:z.string().datetime(),endsAt:z.string().datetime(),location:z.string().trim().max(160).optional().nullable()});
const outcomeSchema=z.object({status:z.enum(['COMPLETED','NO_SHOW']),outcomeNote:z.string().trim().max(1600).optional().nullable()});

router.get('/sessions',ctrl.schoolSessions);
router.post('/sessions',validate(sessionSchema),ctrl.createSession);
router.patch('/sessions/:sessionId/status',validate(statusSchema),ctrl.sessionStatus);
router.get('/slots',ctrl.schoolSlots);
router.post('/sessions/:sessionId/slots',validate(slotSchema),ctrl.createSlot);
router.get('/bookings',ctrl.schoolBookings);
router.patch('/bookings/:bookingId/outcome',validate(outcomeSchema),ctrl.outcome);

export = router;
