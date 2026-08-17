// routes/competition.routes.js
const router = require('express').Router();
const { z } = require('zod');
const ctrl = require('../controllers/competition.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');

const submitSchema = z.object({
  responses: z.array(z.object({
    questionId: z.string().uuid(),
    selectedOption: z.enum(['A', 'B', 'C', 'D']).nullable().optional(),
  })),
});

const createExamSchema = z.object({
  title: z.string().min(3),
  titleHi: z.string().optional(),
  description: z.string().optional(),
  type: z.enum(['SCHOOL_TEST', 'OLYMPIAD', 'MOCK', 'PRACTICE']).optional(),
  schoolId: z.string().uuid().optional(),
  classNames: z.array(z.string()).default([]),
  subjectCodes: z.array(z.string()).default([]),
  status: z.enum(['DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'LIVE', 'SCORING', 'COMPLETED', 'CANCELLED']).optional(),
  startTime: z.string(),
  endTime: z.string(),
  resultsAt: z.string().optional(),
  durationMins: z.number().int().positive().optional(),
  totalQuestions: z.number().int().positive().optional(),
  marksPerQuestion: z.number().positive().optional(),
  negativeMarks: z.number().min(0).optional(),
  prizePool: z.number().min(0).optional(),
  registrationStart: z.string().optional(),
  registrationEnd: z.string().optional(),
  instructions: z.string().optional(),
  instructionsHi: z.string().optional(),
  bannerUrl: z.string().url().optional(),
  maxRegistrations: z.number().int().positive().optional(),
});

const questionSchema = z.object({
  questionText: z.string().min(3),
  questionHi: z.string().optional(),
  optionA: z.string(),
  optionB: z.string(),
  optionC: z.string(),
  optionD: z.string(),
  optionAHi: z.string().optional(),
  optionBHi: z.string().optional(),
  optionCHi: z.string().optional(),
  optionDHi: z.string().optional(),
  correctOption: z.enum(['A', 'B', 'C', 'D']),
  explanation: z.string().optional(),
  subjectCode: z.string().optional(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
});

const statusSchema = z.object({
  status: z.enum(['DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'LIVE', 'SCORING', 'COMPLETED', 'CANCELLED']),
});

// Public competition discovery
router.get('/', ctrl.list);
router.get('/:examId/leaderboard', ctrl.getLeaderboard);

// Student exam center
router.get('/mine/list', authenticate, authorize('STUDENT'), ctrl.listMine);
router.post('/:examId/register', authenticate, authorize('STUDENT'), ctrl.register);
router.post('/:examId/start', authenticate, authorize('STUDENT'), ctrl.startAttempt);
router.post('/attempts/:attemptId/submit', authenticate, authorize('STUDENT'), validate(submitSchema), ctrl.submit);

// Admin / school exam management
router.post('/', authenticate, authorize('SUPER_ADMIN', 'SCHOOL_ADMIN'), validate(createExamSchema), ctrl.createExam);
router.post('/:examId/questions', authenticate, authorize('SUPER_ADMIN', 'SCHOOL_ADMIN'), validate(z.object({ questions: z.array(questionSchema).min(1) })), ctrl.addQuestions);
router.patch('/:examId/status', authenticate, authorize('SUPER_ADMIN', 'SCHOOL_ADMIN'), validate(statusSchema), ctrl.updateStatus);

module.exports = router;
