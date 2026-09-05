import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import * as controller from '../controllers/learningVisibility.controller';

const router = Router();
router.use(authenticate, authorize('PARENT'));
router.get('/:studentId/diagnostics', controller.parentDiagnostics);
router.get('/:studentId', controller.parentInsight);

export = router;