import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/doubt.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);

const doubtSchema = z.object({
  title: z.string().min(5).max(300),
  body: z.string().min(10),
  subjectCode: z.string().max(20).optional(),
  subjectId: z.string().uuid().optional(),
  chapterId: z.string().uuid().optional(),
  contentItemId: z.string().uuid().optional(),
  imageUrl: z.string().url().optional(),
});

const answerSchema = z.object({
  body: z.string().min(5),
  imageUrl: z.string().url().optional(),
});

const resolveSchema = z.object({
  bestAnswerId: z.string().uuid().optional(),
});

router.get('/', ctrl.list);
router.post('/', authorize('STUDENT'), validate(doubtSchema), ctrl.create);
router.get('/:doubtId', ctrl.get);
router.post('/:doubtId/answers', validate(answerSchema), ctrl.answer);
router.post('/:doubtId/answers/:answerId/upvote', ctrl.upvote);
router.patch('/:doubtId/resolve', validate(resolveSchema), ctrl.resolve);
router.post('/:doubtId/ai-answer', authorize('STUDENT'), ctrl.aiAnswer);

export = router;
