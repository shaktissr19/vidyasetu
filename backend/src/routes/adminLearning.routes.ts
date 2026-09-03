import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import * as ctrl from '../controllers/adminLearning.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

router.use(authenticate);
router.use(authorize('SUPER_ADMIN'));

const resourceSchema = z.object({
  title: z.string().trim().min(3).max(300),
  titleHi: z.string().trim().max(300).nullable().optional(),
  summary: z.string().trim().max(1200).nullable().optional(),
  summaryHi: z.string().trim().max(1200).nullable().optional(),
  bodyMarkdown: z.string().max(30000).nullable().optional(),
  bodyMarkdownHi: z.string().max(30000).nullable().optional(),
  resourceType: z.enum(['ARTICLE','VIDEO','AUDIO','PDF','WORKSHEET','QUIZ','QUESTION_PAPER','INTERACTIVE','EXTERNAL_LINK']),
  category: z.enum(['ACADEMIC','MOTIVATION','STUDY_SKILLS','WORK_ETHIC','SOCIAL_RESPONSIBILITY','LIFE_SKILLS','WELLBEING','CAREER_AWARENESS','DIGITAL_CITIZENSHIP']),
  visibility: z.enum(['PUBLIC','REGISTERED','CLASS_ONLY','SCHOOL_ONLY']),
  reviewStatus: z.enum(['DRAFT','SUBMITTED','ACADEMIC_REVIEW','APPROVED','PUBLISHED','ARCHIVED']).optional(),
  language: z.string().trim().min(2).max(5).optional(),
  classMin: z.number().int().min(1).max(12).nullable().optional(),
  classMax: z.number().int().min(1).max(12).nullable().optional(),
  sourceCode: z.string().trim().min(2).max(40),
  sourceUrl: z.string().url().nullable().optional(),
  sourceItemId: z.string().trim().max(180).nullable().optional(),
  licence: z.enum(['VIDYASETU_ORIGINAL','CC_BY','CC_BY_SA','CC_BY_NC_SA','CC_BY_NC_ND','PUBLIC_DOMAIN','EXTERNAL_LINK_ONLY','OTHER']),
  licenceUrl: z.string().url().nullable().optional(),
  attributionText: z.string().trim().max(2000).nullable().optional(),
  externalUrl: z.string().url().nullable().optional(),
  fileKey: z.string().trim().max(1000).nullable().optional(),
  thumbnailUrl: z.string().trim().max(1000).nullable().optional(),
  durationSecs: z.number().int().min(1).max(86400).nullable().optional(),
  isOfflineReady: z.boolean().optional(),
  isFeaturedPublic: z.boolean().optional(),
  boardCodes: z.array(z.string().trim().min(2).max(30)).max(25).optional(),
  publicSlug: z.string().trim().min(3).max(180).regex(/^[a-z0-9-]+$/).nullable().optional(),
});

const statusSchema = z.object({
  status: z.enum(['DRAFT','SUBMITTED','ACADEMIC_REVIEW','APPROVED','PUBLISHED','ARCHIVED']),
  note: z.string().trim().max(2000).nullable().optional(),
});

const questionSchema = z.object({
  publicCode: z.string().trim().min(3).max(50).optional(),
  prompt: z.string().trim().min(3).max(5000),
  promptHi: z.string().trim().max(5000).nullable().optional(),
  questionType: z.enum(['MCQ_SINGLE','MCQ_MULTIPLE','TRUE_FALSE','SHORT_ANSWER','NUMERIC']),
  difficulty: z.enum(['FOUNDATION','EASY','MEDIUM','HARD','CHALLENGE']),
  explanation: z.string().trim().max(5000).nullable().optional(),
  explanationHi: z.string().trim().max(5000).nullable().optional(),
  correctAnswer: z.unknown(),
  marks: z.number().positive().max(100).optional(),
  negativeMarks: z.number().min(0).max(100).optional(),
  classMin: z.number().int().min(1).max(12).nullable().optional(),
  classMax: z.number().int().min(1).max(12).nullable().optional(),
  subjectId: z.string().uuid().nullable().optional(),
  sourceCode: z.string().trim().min(2).max(40).optional(),
  sourceUrl: z.string().url().nullable().optional(),
  licence: z.enum(['VIDYASETU_ORIGINAL','CC_BY','CC_BY_SA','CC_BY_NC_SA','CC_BY_NC_ND','PUBLIC_DOMAIN','EXTERNAL_LINK_ONLY','OTHER']).optional(),
  attributionText: z.string().trim().max(2000).nullable().optional(),
  visibility: z.enum(['PUBLIC','REGISTERED','CLASS_ONLY','SCHOOL_ONLY']).optional(),
  reviewStatus: z.enum(['DRAFT','SUBMITTED','ACADEMIC_REVIEW','APPROVED','PUBLISHED','ARCHIVED']).optional(),
  boardCodes: z.array(z.string().trim().min(2).max(30)).max(25).optional(),
  options: z.array(z.object({ key: z.string().trim().min(1).max(10), text: z.string().trim().min(1).max(2000), textHi: z.string().trim().max(2000).nullable().optional() })).max(12).optional(),
});

const assessmentSchema = z.object({
  publicSlug: z.string().trim().min(3).max(180).regex(/^[a-z0-9-]+$/).nullable().optional(),
  title: z.string().trim().min(3).max(300),
  titleHi: z.string().trim().max(300).nullable().optional(),
  summary: z.string().trim().max(2000).nullable().optional(),
  assessmentType: z.enum(['PRACTICE','CHAPTER_TEST','UNIT_TEST','MOCK','DAILY']),
  visibility: z.enum(['PUBLIC','REGISTERED','CLASS_ONLY','SCHOOL_ONLY']),
  reviewStatus: z.enum(['DRAFT','SUBMITTED','ACADEMIC_REVIEW','APPROVED','PUBLISHED','ARCHIVED']).optional(),
  classMin: z.number().int().min(1).max(12).nullable().optional(),
  classMax: z.number().int().min(1).max(12).nullable().optional(),
  subjectId: z.string().uuid().nullable().optional(),
  timeLimitMins: z.number().int().min(1).max(300).nullable().optional(),
  passingPct: z.number().min(0).max(100).optional(),
  maxAttempts: z.number().int().min(1).max(100).nullable().optional(),
  shuffleQuestions: z.boolean().optional(),
  isFeaturedPublic: z.boolean().optional(),
  boardCodes: z.array(z.string().trim().min(2).max(30)).max(25).optional(),
  questionIds: z.array(z.string().uuid()).min(1).max(200),
});

const intakeSchema = z.object({
  sourceCode: z.string().trim().min(2).max(40),
  sourceItemId: z.string().trim().max(220).nullable().optional(),
  title: z.string().trim().min(3).max(300),
  sourceUrl: z.string().url(),
  licenceCandidate: z.enum(['VIDYASETU_ORIGINAL','CC_BY','CC_BY_SA','CC_BY_NC_SA','CC_BY_NC_ND','PUBLIC_DOMAIN','EXTERNAL_LINK_ONLY','OTHER']).nullable().optional(),
  attributionText: z.string().trim().max(3000).nullable().optional(),
  classHint: z.string().trim().max(50).nullable().optional(),
  boardHint: z.string().trim().max(50).nullable().optional(),
  subjectHint: z.string().trim().max(120).nullable().optional(),
});

const intakeStatusSchema = z.object({
  status: z.enum(['DISCOVERED','LICENCE_REVIEW','CONTENT_REVIEW','APPROVED','REJECTED','IMPORTED']),
  note: z.string().trim().max(3000).nullable().optional(),
});

router.get('/options', ctrl.options);
router.get('/resources', ctrl.resources);
router.get('/review/pressure-v1', ctrl.pressureReview);
router.post('/resources', validate(resourceSchema), ctrl.createResource);
router.patch('/resources/:resourceId/status', validate(statusSchema), ctrl.updateStatus);

router.get('/questions', ctrl.questions);
router.post('/questions', validate(questionSchema), ctrl.createQuestion);
router.patch('/questions/:questionId/status', validate(statusSchema), ctrl.updateQuestionStatus);
router.get('/assessments', ctrl.assessments);
router.post('/assessments', validate(assessmentSchema), ctrl.createAssessment);
router.patch('/assessments/:assessmentId/status', validate(statusSchema), ctrl.updateAssessmentStatus);
router.get('/intake', ctrl.intake);
router.post('/intake', validate(intakeSchema), ctrl.createIntake);
router.patch('/intake/:intakeId/status', validate(intakeStatusSchema), ctrl.updateIntakeStatus);

// Global Learning Bulk Importer — Platform Admin only.
// Uploads are staged and validated first; no Learning content is created until commit.
router.get('/imports/options', ctrl.importOptions);
router.get('/imports/template', ctrl.importTemplate);
router.get('/imports', ctrl.importBatches);
router.get('/imports/:batchId', ctrl.importBatch);
router.post('/imports/stage', importUpload.single('file'), ctrl.stageImport);
router.post('/imports/:batchId/commit', ctrl.commitImport);

export = router;