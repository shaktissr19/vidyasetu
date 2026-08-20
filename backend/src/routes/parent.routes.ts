import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/parent.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);
router.use(authorize('PARENT'));

const messageSchema = z.object({
  body: z.string().min(2).max(1000),
});

router.get('/children', ctrl.getChildren);
router.get('/children/:studentId/dashboard', ctrl.getChildDashboard);
router.get('/children/:studentId/attendance', ctrl.getChildAttendance);
router.get('/children/:studentId/fees', ctrl.getChildFees);
router.get('/children/:studentId/messages', ctrl.getMessages);
router.post('/children/:studentId/messages', validate(messageSchema), ctrl.sendMessage);
router.get('/notifications', ctrl.getNotifications);

export = router;
