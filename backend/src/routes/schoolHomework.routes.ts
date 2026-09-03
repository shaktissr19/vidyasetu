import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import * as controller from '../controllers/homework.controller';

const router = Router();
router.use(authenticate, authorize('SCHOOL_ADMIN', 'TEACHER'));

router.get('/', controller.listSchool);
router.post('/', controller.createSchool);
router.patch('/:homeworkId', controller.updateSchool);
router.post('/:homeworkId/publish', controller.publishSchool);
router.post('/:homeworkId/close', controller.closeSchool);
router.get('/:homeworkId/submissions', controller.submissions);
router.patch('/:homeworkId/submissions/:submissionId/review', controller.reviewSubmission);

export = router;
