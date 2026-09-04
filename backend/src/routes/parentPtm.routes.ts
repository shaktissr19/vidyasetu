import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/ptm.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router=Router();
router.use(authenticate);
router.use(authorize('PARENT'));

const bookingSchema=z.object({parentNote:z.string().trim().max(1000).optional().nullable()});

router.get('/children/:studentId/options',ctrl.parentOptions);
router.get('/children/:studentId/bookings',ctrl.parentBookings);
router.post('/children/:studentId/slots/:slotId/book',validate(bookingSchema),ctrl.book);
router.patch('/bookings/:bookingId/cancel',ctrl.cancel);

export = router;
