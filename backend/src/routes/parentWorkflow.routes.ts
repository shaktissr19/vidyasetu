import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import * as controller from '../controllers/parentWorkflow.controller';

const router = Router();
router.use(authenticate, authorize('PARENT'));

router.get('/children/:studentId/homework', controller.childHomework);
router.get('/children/:studentId/achievements', controller.childAchievements);

export = router;
