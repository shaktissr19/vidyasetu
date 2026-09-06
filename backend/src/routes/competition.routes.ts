import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/competition.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

const submitSchema = z.object({
  responses: z.array(z.object({
    questionId: z.string().uuid(),
    selectedOption: z.enum(['A', 'B', 'C', 'D']).nullable().optional(),
  })).max(150),
});

const createExamSchema = z.object({
  title: z.string().trim().min(3).max(300),
  titleHi: z.string().trim().max(300).nullable().optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  type: z.enum(['SCHOOL_TEST', 'OLYMPIAD', 'MOCK', 'PRACTICE']).optional(),
  schoolId: z.string().uuid().nullable().optional(),
  classNames: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  subjectCodes: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  status: z.enum(['DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'LIVE', 'SCORING', 'COMPLETED', 'CANCELLED']).optional(),
  startTime: z.string().min(10),
  endTime: z.string().min(10),
  resultsAt: z.string().nullable().optional(),
  durationMins: z.number().int().positive().max(360).optional(),
  totalQuestions: z.number().int().positive().max(150).optional(),
  marksPerQuestion: z.number().positive().max(100).optional(),
  negativeMarks: z.number().min(0).max(100).optional(),
  prizePool: z.number().min(0).optional(),
  registrationStart: z.string().nullable().optional(),
  registrationEnd: z.string().nullable().optional(),
  instructions: z.string().max(10000).nullable().optional(),
  instructionsHi: z.string().max(10000).nullable().optional(),
  bannerUrl: z.string().url().nullable().optional(),
  maxRegistrations: z.number().int().positive().max(5_000_000).nullable().optional(),
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

const learningQuestionImportSchema = z.object({
  questionIds: z.array(z.string().uuid()).min(1).max(100),
});

router.get('/', ctrl.list);
router.get('/mine/list', authenticate, authorize('STUDENT'), ctrl.listMine);
router.get('/attempts/:attemptId/result', authenticate, authorize('STUDENT'), ctrl.getAttemptResult);
router.get('/:examId/leaderboard', ctrl.getLeaderboard);

router.post('/:examId/register', authenticate, authorize('STUDENT'), ctrl.register);
router.post('/:examId/start', authenticate, authorize('STUDENT'), ctrl.startAttempt);
router.post('/attempts/:attemptId/submit', authenticate, authorize('STUDENT'), validate(submitSchema), ctrl.submit);

router.post('/', authenticate, authorize('SUPER_ADMIN', 'SCHOOL_ADMIN'), validate(createExamSchema), ctrl.createExam);
router.get('/:examId/readiness', authenticate, authorize('SUPER_ADMIN'), ctrl.readiness);
router.post('/:examId/questions/from-learning', authenticate, authorize('SUPER_ADMIN'), validate(learningQuestionImportSchema), ctrl.importLearningQuestions);
router.post('/:examId/questions', authenticate, authorize('SUPER_ADMIN', 'SCHOOL_ADMIN'), validate(z.object({ questions: z.array(questionSchema).min(1) })), ctrl.addQuestions);
router.patch('/:examId/status', authenticate, authorize('SUPER_ADMIN', 'SCHOOL_ADMIN'), validate(statusSchema), ctrl.updateStatus);

export = router;
