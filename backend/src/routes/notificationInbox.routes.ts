import { Router } from 'express';
import * as ctrl from '../controllers/notificationInbox.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);
router.get('/', ctrl.listNotifications);
router.get('/unread-count', ctrl.getUnreadCount);
router.patch('/read-all', ctrl.markAllRead);
router.patch('/:notificationId/read', ctrl.markRead);

export = router;
