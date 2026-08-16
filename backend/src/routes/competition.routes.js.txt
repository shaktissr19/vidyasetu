// routes/competition.routes.js
const router = require('express').Router();
const { z } = require('zod');
const ctrl = require('../controllers/competition.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');

const submitSchema = z.object({
  responses: z.array(z.object({
    questionId:     z.string().uuid(),
    selectedOption: z.enum(['A','B','C','D']).nullable().optional(),
  })),
});

const createExamSchema = z.object({
  title:                z.string().min(3),
  titleHi:              z.string().optional(),
  type:                 z.enum(['SCHOOL_EXAM','COMPETITION']).optional(),
  subjectId:            z.string().uuid().optional(),
  schoolId:             z.string().uuid().optional(),
  classNames:           z.array(z.string()),
  startTime:            z.string(),
  endTime:              z.string(),
  durationMins:         z.number().int().positive().optional(),
  totalQuestions:       z.number().int().positive().optional(),
  totalMarks:           z.number().int().positive().optional(),
  prizePool:            z.number().positive().optional(),
  registrationDeadline: z.string().optional(),
  instructions:         z.string().optional(),
});

// Public: list competitions (auth optional — for landing page)
router.get('/',           ctrl.list);
router.get('/:examId/leaderboard', ctrl.getLeaderboard);

// Authenticated student routes
router.post('/:examId/register', authenticate, authorize('STUDENT'), ctrl.register);
router.post('/:examId/start',    authenticate, authorize('STUDENT'), ctrl.startAttempt);
router.post('/attempts/:attemptId/submit', authenticate, authorize('STUDENT'), validate(submitSchema), ctrl.submit);

// Admin routes
router.post('/',    authenticate, authorize('SUPER_ADMIN','SCHOOL_ADMIN'), validate(createExamSchema), ctrl.createExam);
router.post('/:examId/questions', authenticate, authorize('SUPER_ADMIN','SCHOOL_ADMIN'), ctrl.addQuestions);
router.patch('/:examId/status',   authenticate, authorize('SUPER_ADMIN','SCHOOL_ADMIN'), ctrl.updateStatus);

module.exports = router;
