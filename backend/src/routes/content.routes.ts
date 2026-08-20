import { Router } from 'express';
import * as ctrl from '../controllers/content.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

router.get('/subjects', ctrl.getSubjects);
router.get('/subjects/:subjectId/chapters', ctrl.getChapters);

router.use(authenticate);

router.get('/chapters/:chapterId/items', ctrl.getContentItems);
router.get('/items/:itemId/url', ctrl.getContentUrl);
router.post('/items/:itemId/complete', authorize('STUDENT'), ctrl.markComplete);
router.get('/items/:itemId/quiz', ctrl.getQuizQuestions);
router.post('/items/:itemId/quiz/submit', authorize('STUDENT'), ctrl.submitQuiz);
router.post('/items/:itemId/download', authorize('STUDENT'), ctrl.downloadOffline);

router.get('/upload-url', authorize('SUPER_ADMIN'), ctrl.getUploadUrl);
router.post('/items', authorize('SUPER_ADMIN'), ctrl.saveContentItem);

export = router;
