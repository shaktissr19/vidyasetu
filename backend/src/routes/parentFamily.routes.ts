import { Router } from 'express';
import * as ctrl from '../controllers/parentFamily.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);
router.use(authorize('PARENT'));

router.get('/children/:studentId/homework', ctrl.getChildHomework);
router.get('/children/:studentId/achievements', ctrl.getChildAchievements);

export = router;
