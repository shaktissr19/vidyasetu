import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import * as ctrl from '../controllers/adminLearning.controller';
import * as v3Ctrl from '../controllers/contentFactory.controller';
import * as qualityCtrl from '../controllers/learningQualityAdmin.controller';
import * as mediaCtrl from '../controllers/adminLearningMedia.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

router.use(authenticate);
router.use(authorize('SUPER_ADMIN'));

const canonicalGradeCodes = z.array(z.string().trim().min(2).max(24)).min(1).max(16);

const conceptMappingSchema = z.object({
  conceptId: z.string().uuid(),
  journeyStage: z.enum(['SEE','UNDERSTAND','DO','PRACTISE','APPLY','REVISE']),
  isPrimary: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(500).optional(),
});

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
  gradeCodes: canonicalGradeCodes,
  reviewStatus: z.enum(['DRAFT','SUBMITTED','ACADEMIC_REVIEW','APPROVED','PUBLISHED','ARCHIVED']).optional(),
  language: z.string().trim().min(2).max(5).optional(),
  classMin: z.number().int().min(1).max(12).nullable().optional(),
  classMax: z.number().int().min(1).max(12).nullable().optional(),
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
  boardCodes: z.array(z.string().trim().min(2).max(30)).max(25).optional(),
  publicSlug: z.string().trim().min(3).max(180).regex(/^[a-z0-9-]+$/).nullable().optional(),
  conceptMappings: z.array(conceptMappingSchema).max(20).optional(),
  mediaReadiness: z.enum(['NOT_STARTED','SCRIPT_READY','MEDIA_READY','QA_APPROVED']).optional(),
  transcript: z.string().max(50000).nullable().optional(),
  transcriptHi: z.string().max(50000).nullable().optional(),
  thumbnailAlt: z.string().max(1000).nullable().optional(),
  thumbnailAltHi: z.string().max(1000).nullable().optional(),
});

const statusSchema = z.object({
  status: z.enum(['DRAFT','SUBMITTED','ACADEMIC_REVIEW','APPROVED','PUBLISHED','ARCHIVED']),
  note: z.string().trim().max(2000).nullable().optional(),
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
  gradeCodes: canonicalGradeCodes,
  classMin: z.number().int().min(1).max(12).nullable().optional(),
  classMax: z.number().int().min(1).max(12).nullable().optional(),
  subjectId: z.string().uuid().nullable().optional(),
  sourceCode: z.string().trim().min(2).max(40).optional(),
  sourceUrl: z.string().url().nullable().optional(),
  licence: z.enum(['VIDYASETU_ORIGINAL','CC_BY','CC_BY_SA','CC_BY_NC_SA','CC_BY_NC_ND','PUBLIC_DOMAIN','EXTERNAL_LINK_ONLY','OTHER']).optional(),
  attributionText: z.string().trim().max(3000).nullable().optional(),
  visibility: z.enum(['PUBLIC','REGISTERED','CLASS_ONLY','SCHOOL_ONLY']).optional(),
  reviewStatus: z.enum(['DRAFT','SUBMITTED','ACADEMIC_REVIEW','APPROVED','PUBLISHED','ARCHIVED']).optional(),
  boardCodes: z.array(z.string().trim().min(2).max(30)).max(25).optional(),
  options: z.array(z.object({ key: z.string().trim().min(1).max(10), text: z.string().trim().min(1).max(2000), textHi: z.string().trim().min(1).max(2000) })).max(12).optional(),
  conceptIds: z.array(z.string().uuid()).max(12).optional(),
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
  reviewStatus: z.enum(['DRAFT','SUBMITTED','ACADEMIC_REVIEW','APPROVED','PUBLISHED','ARCHIVED']).optional(),
  gradeCodes: canonicalGradeCodes,
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
  conceptIds: z.array(z.string().uuid()).max(30).optional(),
});

const conceptMetadataSchema = z.object({
  nameHi: z.string().trim().max(300).nullable().optional(),
  description: z.string().trim().max(8000).nullable().optional(),
  descriptionHi: z.string().trim().max(8000).nullable().optional(),
  learningOutcome: z.string().trim().max(4000).nullable().optional(),
  learningOutcomeHi: z.string().trim().max(4000).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'At least one concept metadata field is required' });

const qualityGateSchema = z.object({
  status: z.enum(['PENDING','PASS','FAIL','NOT_APPLICABLE']),
  note: z.string().trim().max(3000).nullable().optional(),
});

const mediaUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(240),
  contentType: z.enum(['video/mp4','audio/mpeg','audio/mp4','audio/wav','application/pdf','image/png','image/jpeg','image/webp']),
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
router.get('/concepts', qualityCtrl.concepts);
router.patch('/concepts/:conceptId', validate(conceptMetadataSchema), qualityCtrl.updateConcept);
router.get('/coverage', qualityCtrl.coverage);
router.get('/readiness/:entityType/:entityId', qualityCtrl.readiness);
router.put('/quality/:entityType/:entityId/:gateCode', validate(qualityGateSchema), qualityCtrl.setQualityGate);
router.post('/media/upload-url', validate(mediaUploadSchema), mediaCtrl.uploadUrl);

router.get('/resources', ctrl.resources);
router.get('/review-packs', ctrl.reviewPacks);
router.get('/review/pressure-v1', ctrl.pressureReview);
router.get('/review/:packKey', ctrl.contentPackReview);
router.post('/resources', validate(resourceSchema), v3Ctrl.createResource);
router.patch('/resources/:resourceId/status', validate(statusSchema), ctrl.updateStatus);

// Legacy Question Bank endpoints now use the same Content Platform 3.0 authoring
// service as Content Factory so canonical grades and bilingual DRAFT-first rules
// cannot be bypassed by older Admin clients.
router.get('/questions', v3Ctrl.questions);
router.post('/questions', validate(questionSchema), v3Ctrl.createQuestion);
router.patch('/questions/:questionId/status', validate(statusSchema), ctrl.updateQuestionStatus);
router.get('/assessments', v3Ctrl.assessments);
router.post('/assessments', validate(assessmentSchema), v3Ctrl.createAssessment);
router.patch('/assessments/:assessmentId/status', validate(statusSchema), ctrl.updateAssessmentStatus);
router.get('/intake', ctrl.intake);
router.post('/intake', validate(intakeSchema), ctrl.createIntake);
router.patch('/intake/:intakeId/status', validate(intakeStatusSchema), ctrl.updateIntakeStatus);

// Global Learning Bulk Importer — Platform Admin only.
// ContentFactory.routes is mounted first and shadows these paths with V3 importer
// governance. These routes remain for backward compatibility if the mount order
// ever changes, but they still stage/validate before commit.
router.get('/imports/options', ctrl.importOptions);
router.get('/imports/template', ctrl.importTemplate);
router.get('/imports', ctrl.importBatches);
router.get('/imports/:batchId', ctrl.importBatch);
router.post('/imports/stage', importUpload.single('file'), ctrl.stageImport);
router.post('/imports/:batchId/commit', ctrl.commitImport);

export = router;