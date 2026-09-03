import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import * as controller from '../controllers/learningVisibility.controller';

const router = Router();
router.use(authenticate, authorize('SCHOOL_ADMIN', 'TEACHER'));

router.get('/targets', controller.schoolTargets);
router.get('/overview', controller.schoolOverview);

export = router;
