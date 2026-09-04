import { Router } from 'express';
import * as ctrl from '../controllers/library.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
const router=Router();
router.use(authenticate);
router.use(authorize('PARENT'));
router.get('/children/:studentId/loans',ctrl.parentChildLoans);
export = router;
