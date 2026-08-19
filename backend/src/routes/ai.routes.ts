import { Router, type NextFunction, type Request, type Response } from 'express';
import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { z } from 'zod';
import * as aiService from '../services/ai.service';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { aiLimiter } from '../middleware/rateLimit.middleware';
import { query } from '../config/db';
import * as R from '../utils/response';

const router = Router();

interface StudentIdRow extends QueryResultRow { id: UUID; }
interface ChatBody {
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}

const chatSchema = z.object({
  message: z.string().min(1).max(1000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional().default([]),
});

router.use(authenticate);
router.use(authorize('STUDENT'));
router.use(aiLimiter);

router.post('/chat', validate(chatSchema), async (
  req: Request<Record<string, string>, unknown, ChatBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> => {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    const { rows: [student] } = await query<StudentIdRow>(
      'SELECT id FROM students WHERE user_id = $1',
      [user.userId],
    );
    if (!student) return R.notFound(res, 'Student profile not found');
    return R.ok(res, await aiService.chat(user.userId, student.id, req.body.message, req.body.history));
  } catch (err: unknown) {
    next(err);
  }
});

export = router;
