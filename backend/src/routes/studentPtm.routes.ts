import { Router } from 'express';
import * as ctrl from '../controllers/ptm.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router=Router();
router.use(authenticate);
router.use(authorize('STUDENT'));
router.get('/bookings',ctrl.studentBookings);
export = router;
