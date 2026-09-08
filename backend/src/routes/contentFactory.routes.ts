import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/contentFactory.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();
router.use(authenticate);
router.use(authorize('SUPER_ADMIN'));

const gradeCodes = z.array(z.string().trim().min(2).max(24)).min(1).max(16);
const boardCodes = z.array(z.string().trim().min(2).max(30)).min(1).max(25).optional();
const conceptIds = z.array(z.string().uuid()).max(30).optional();

const targetUpdateSchema = z.object({
  targetStatus: z.enum(['PLANNED','REGISTRY_READY','AUTHORING','REVIEW_READY','LEARNER_READY','DEFERRED']).optional(),
  expectedConcepts: z.number().int().min(0).max(1000).nullable().optional(),
  sourceReference: z.string().trim().max(3000).nullable().optional(),
  notes: z.string().trim().max(3000).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one target field is required');

const resourceSchema = z.object({
  title: z.string().trim().min(3).max(300),
  titleHi: z.string().trim().min(2).max(300),
  summary: z.string().trim().min(3).max(3000),
  summaryHi: z.string().trim().min(3).max(3000),
  bodyMarkdown: z.string().max(50000).nullable().optional(),
  bodyMarkdownHi: z.string().max(50000).nullable().optional(),
  resourceType: z.enum(['ARTICLE','VIDEO','AUDIO','PDF','WORKSHEET','QUIZ','QUESTION_PAPER','INTERACTIVE','EXTERNAL_LINK','STORY','ACTIVITY','FLASHCARD','GAME','SIMULATION','PRACTICAL']),
  category: z.enum(['ACADEMIC','MOTIVATION','STUDY_SKILLS','WORK_ETHIC','SOCIAL_RESPONSIBILITY','LIFE_SKILLS','WELLBEING','CAREER_AWARENESS','DIGITAL_CITIZENSHIP']),
  visibility: z.enum(['PUBLIC','REGISTERED','CLASS_ONLY','SCHOOL_ONLY']),
  gradeCodes,
  sourceCode: z.string().trim().min(2).max(40),
  sourceUrl: z.string().url().nullable().optional(),
  sourceItemId: z.string().trim().max(180).nullable().optional(),
  licence: z.enum(['VIDYASETU_ORIGINAL','CC_BY','CC_BY_SA','CC_BY_NC_SA','CC_BY_NC_ND','PUBLIC_DOMAIN','EXTERNAL_LINK_ONLY','OTHER']),
  licenceUrl: z.string().url().nullable().optional(),
  attributionText: z.string().trim().max(3000).nullable().optional(),
  externalUrl: z.string().url().nullable().optional(),
  fileKey: z.string().trim().max(1000).nullable().optional(),
  thumbnailUrl: z.string().trim().max(1000).nullable().optional(),
  durationSecs: z.number().int().min(1).max(86400).nullable().optional(),
  isOfflineReady: z.boolean().optional(),
  isFeaturedPublic: z.boolean().optional(),
  boardCodes,
  publicSlug: z.string().trim().min(3).max(180).regex(/^[a-z0-9-]+$/).nullable().optional(),
  conceptMappings: z.array(z.object({
    conceptId: z.string().uuid(),
    journeyStage: z.enum(['SEE','UNDERSTAND','DO','PRACTISE','APPLY','REVISE']),
    isPrimary: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(500).optional(),
  })).max(20).optional(),
  mediaReadiness: z.enum(['NOT_STARTED','SCRIPT_READY','MEDIA_READY','QA_APPROVED']).optional(),
  transcript: z.string().max(50000).nullable().optional(),
  transcriptHi: z.string().max(50000).nullable().optional(),
  thumbnailAlt: z.string().max(1000).nullable().optional(),
  thumbnailAltHi: z.string().max(1000).nullable().optional(),
});

const questionSchema = z.object({
  publicCode: z.string().trim().min(3).max(50).optional(),
  prompt: z.string().trim().min(3).max(5000),
  promptHi: z.string().trim().min(3).max(5000),
  questionType: z.enum(['MCQ_SINGLE','MCQ_MULTIPLE','TRUE_FALSE','SHORT_ANSWER','NUMERIC']),
  difficulty: z.enum(['FOUNDATION','EASY','MEDIUM','HARD','CHALLENGE']),
  explanation: z.string().trim().min(3).max(5000),
  explanationHi: z.string().trim().min(3).max(5000),
  correctAnswer: z.unknown(),
  marks: z.number().positive().max(100).optional(),
  negativeMarks: z.number().min(0).max(100).optional(),
  gradeCodes,
  subjectId: z.string().uuid().nullable().optional(),
  sourceCode: z.string().trim().min(2).max(40).optional(),
  sourceUrl: z.string().url().nullable().optional(),
  licence: z.enum(['VIDYASETU_ORIGINAL','CC_BY','CC_BY_SA','CC_BY_NC_SA','CC_BY_NC_ND','PUBLIC_DOMAIN','EXTERNAL_LINK_ONLY','OTHER']).optional(),
  attributionText: z.string().trim().max(3000).nullable().optional(),
  visibility: z.enum(['PUBLIC','REGISTERED','CLASS_ONLY','SCHOOL_ONLY']).optional(),
  boardCodes,
  options: z.array(z.object({
    key: z.string().trim().min(1).max(10),
    text: z.string().trim().min(1).max(2000),
    textHi: z.string().trim().min(1).max(2000),
  })).max(12).optional(),
  conceptIds,
  cognitiveSkill: z.enum(['REMEMBER','UNDERSTAND','APPLY','ANALYSE','EVALUATE','CREATE']).optional(),
  skillCode: z.string().trim().max(120).nullable().optional(),
  learningOutcomeCode: z.string().trim().max(160).nullable().optional(),
  misconceptionCode: z.string().trim().max(160).nullable().optional(),
  misconceptionText: z.string().trim().max(3000).nullable().optional(),
  misconceptionTextHi: z.string().trim().max(3000).nullable().optional(),
});

const assessmentSchema = z.object({
  publicSlug: z.string().trim().min(3).max(180).regex(/^[a-z0-9-]+$/).nullable().optional(),
  title: z.string().trim().min(3).max(300),
  titleHi: z.string().trim().min(2).max(300),
  summary: z.string().trim().min(3).max(3000),
  summaryHi: z.string().trim().min(3).max(3000),
  assessmentType: z.enum(['DIAGNOSTIC','PRACTICE','CHAPTER_TEST','UNIT_TEST','MOCK','DAILY']),
  visibility: z.enum(['PUBLIC','REGISTERED','CLASS_ONLY','SCHOOL_ONLY']),
  gradeCodes,
  subjectId: z.string().uuid().nullable().optional(),
  timeLimitMins: z.number().int().min(1).max(300).nullable().optional(),
  passingPct: z.number().min(0).max(100).optional(),
  maxAttempts: z.number().int().min(1).max(100).nullable().optional(),
  shuffleQuestions: z.boolean().optional(),
  isFeaturedPublic: z.boolean().optional(),
  boardCodes,
  questionIds: z.array(z.string().uuid()).min(1).max(200),
  conceptIds,
});

router.get('/factory', ctrl.summary);
router.get('/factory/options', ctrl.options);
router.get('/factory/grades/:gradeCode', ctrl.grade);
router.patch('/factory/targets/:targetId', validate(targetUpdateSchema), ctrl.updateTarget);
router.post('/factory/resources', validate(resourceSchema), ctrl.createResource);
router.get('/factory/questions', ctrl.questions);
router.post('/factory/questions', validate(questionSchema), ctrl.createQuestion);
router.get('/factory/assessments', ctrl.assessments);
router.post('/factory/assessments', validate(assessmentSchema), ctrl.createAssessment);

export = router;
