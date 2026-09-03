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
  conceptCode?: string | null;
}
interface EscalateBody {
  question: string;
  aiResponse: string;
  conceptCode?: string | null;
}

const chatSchema = z.object({
  message: z.string().trim().min(1).max(1600),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(4000),
  })).max(20).optional().default([]),
  conceptCode: z.string().trim().max(180).nullable().optional(),
});

const escalateSchema = z.object({
  question: z.string().trim().min(3).max(2000),
  aiResponse: z.string().trim().min(1).max(5000),
  conceptCode: z.string().trim().max(180).nullable().optional(),
});

async function studentForUser(userId: UUID): Promise<UUID | null> {
  const { rows: [student] } = await query<StudentIdRow>(
    "SELECT id FROM students WHERE user_id=$1 AND status='ACTIVE'",
    [userId],
  );
  return student?.id || null;
}

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
    const studentId = await studentForUser(user.userId);
    if (!studentId) return R.notFound(res, 'Student profile not found');
    return R.ok(res, await aiService.chat(
      user.userId,
      studentId,
      req.body.message,
      req.body.history,
      req.body.conceptCode || null,
    ));
  } catch (err: unknown) {
    next(err);
  }
});

router.get('/history', async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<Response | void> => {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    const studentId = await studentForUser(user.userId);
    if (!studentId) return R.notFound(res, 'Student profile not found');
    return R.ok(res, await aiService.getTutorHistory(studentId, user.userId));
  } catch (err: unknown) {
    next(err);
  }
});

router.post('/escalate', validate(escalateSchema), async (
  req: Request<Record<string, string>, unknown, EscalateBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> => {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    const studentId = await studentForUser(user.userId);
    if (!studentId) return R.notFound(res, 'Student profile not found');
    const doubt = await aiService.escalateTutorToDoubt(
      user.userId,
      studentId,
      req.body.question,
      req.body.aiResponse,
      req.body.conceptCode || null,
    );
    return R.created(res, doubt);
  } catch (err: unknown) {
    next(err);
  }
});

export = router;
