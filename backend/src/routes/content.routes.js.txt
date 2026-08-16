// routes/content.routes.js
const router = require('express').Router();
const ctrl = require('../controllers/content.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// Public routes (for landing page previews)
router.get('/subjects',                ctrl.getSubjects);              // ?class=8
router.get('/subjects/:subjectId/chapters', ctrl.getChapters);         // ?class=8

// Authenticated
router.use(authenticate);

router.get('/chapters/:chapterId/items', ctrl.getContentItems);        // ?lang=hi
router.get('/items/:itemId/url',         ctrl.getContentUrl);
router.post('/items/:itemId/complete',   authorize('STUDENT'), ctrl.markComplete);
router.get('/items/:itemId/quiz',        ctrl.getQuizQuestions);
router.post('/items/:itemId/quiz/submit', authorize('STUDENT'), ctrl.submitQuiz);
router.post('/items/:itemId/download',   authorize('STUDENT'), ctrl.downloadOffline);

// Admin: content management
router.get('/upload-url',  authorize('SUPER_ADMIN'), ctrl.getUploadUrl);
router.post('/items',      authorize('SUPER_ADMIN'), ctrl.saveContentItem);

module.exports = router;
