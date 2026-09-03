import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import * as controller from '../controllers/homework.controller';

const router = Router();
router.use(authenticate, authorize('STUDENT'));

router.get('/', controller.listStudent);
router.get('/:homeworkId', controller.getStudent);
router.post('/:homeworkId/submit', controller.submitStudent);

export = router;
