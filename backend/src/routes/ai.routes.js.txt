// routes/ai.routes.js  (mounted at /api/v1/ai)
const router = require('express').Router();
const { z } = require('zod');
const aiService = require('../services/ai.service');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const { aiLimiter } = require('../middleware/rateLimit.middleware');
const { query } = require('../config/db');
const R = require('../utils/response');

router.use(authenticate);
router.use(authorize('STUDENT'));
router.use(aiLimiter);

const chatSchema = z.object({
  message: z.string().min(1).max(1000),
  history: z.array(z.object({
    role:    z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional().default([]),
});

router.post('/chat', validate(chatSchema), async (req, res, next) => {
  try {
    const { rows: [student] } = await query(
      `SELECT id FROM students WHERE user_id = $1`, [req.user.userId]
    );
    if (!student) return R.notFound(res, 'Student profile not found');

    const result = await aiService.chat(req.user.userId, student.id, req.body.message, req.body.history);
    return R.ok(res, result);
  } catch (err) { next(err); }
});

module.exports = router;
