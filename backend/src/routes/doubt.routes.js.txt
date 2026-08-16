// routes/doubt.routes.js
const router = require('express').Router();
const { z } = require('zod');
const ctrl = require('../controllers/doubt.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');

router.use(authenticate);

const doubtSchema = z.object({
  title:     z.string().min(5).max(300),
  body:      z.string().min(10),
  subjectId: z.string().uuid().optional(),
  chapterId: z.string().uuid().optional(),
  imageUrl:  z.string().url().optional(),
});

const answerSchema = z.object({
  body:     z.string().min(5),
  imageUrl: z.string().url().optional(),
});

router.get('/',                                                  ctrl.list);
router.post('/',         authorize('STUDENT'), validate(doubtSchema), ctrl.create);
router.get('/:doubtId',                                         ctrl.get);
router.post('/:doubtId/answers', validate(answerSchema),        ctrl.answer);
router.post('/:doubtId/answers/:answerId/upvote',               ctrl.upvote);
router.patch('/:doubtId/resolve',                               ctrl.resolve);
router.post('/:doubtId/ai-answer', authorize('STUDENT'),        ctrl.aiAnswer);

module.exports = router;
