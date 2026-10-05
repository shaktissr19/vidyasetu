import { Router } from 'express';
import * as ctrl from '../controllers/content.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { enforceStudentContentScope } from '../middleware/contentScope.middleware';

const router = Router();

router.get('/subjects', ctrl.getSubjects);
router.get('/subjects/:subjectId/chapters', ctrl.getChapters);

router.use(authenticate);

router.get('/chapters/:chapterId/items', ctrl.getContentItems);
router.get('/items/:itemId/url', enforceStudentContentScope, ctrl.getContentUrl);
router.post('/items/:itemId/complete', authorize('STUDENT'), enforceStudentContentScope, ctrl.markComplete);
router.get('/items/:itemId/quiz', enforceStudentContentScope, ctrl.getQuizQuestions);
router.post('/items/:itemId/quiz/submit', authorize('STUDENT'), enforceStudentContentScope, ctrl.submitQuiz);
router.post('/items/:itemId/download', authorize('STUDENT'), enforceStudentContentScope, ctrl.downloadOffline);

// Learning & Content Platform 2.0: legacy content_items remain a read/runtime
// compatibility surface only. New academic content MUST be authored and
// published through /admin/learning so DRAFT -> review -> approval -> publish
// quality gates cannot be bypassed.

export = router;
