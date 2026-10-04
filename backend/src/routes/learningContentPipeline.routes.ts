import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/learningContentPipeline.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();
router.use(authenticate);
router.use(authorize('SUPER_ADMIN'));

const licenceSchema = z.enum([
  'VIDYASETU_ORIGINAL','CC_BY','CC_BY_SA','CC_BY_NC','CC_BY_NC_SA','CC_BY_ND','CC_BY_NC_ND',
  'PUBLIC_DOMAIN','EXTERNAL_LINK_ONLY','PERMISSION_GRANTED','OTHER',
]);
const mediaSchema = z.enum(['ARTICLE','VIDEO','AUDIO','IMAGE','INTERACTIVE','PDF','WORKSHEET','QUESTION_PAPER','DOCUMENT','EXTERNAL_LINK']);
const deliverySchema = z.enum(['EXTERNAL_LINK','OFFICIAL_EMBED','LICENSED_REHOST','VIDYASETU_ORIGINAL']);
const visibilitySchema = z.enum(['PUBLIC','REGISTERED','CLASS_ONLY','SCHOOL_ONLY']);
const accessSchema = z.enum(['PUBLIC','REGISTERED','SUBSCRIBER']);
const categorySchema = z.enum([
  'ACADEMIC','MOTIVATION','STUDY_SKILLS','WORK_ETHIC','SOCIAL_RESPONSIBILITY',
  'LIFE_SKILLS','WELLBEING','CAREER_AWARENESS','DIGITAL_CITIZENSHIP',
]);

const stageSchema = z.object({
  intakeId: z.string().uuid().optional(),
  sourceCode: z.string().trim().min(2).max(40),
  title: z.string().trim().min(2).max(500),
  titleHi: z.string().trim().max(500).nullable().optional(),
  difficulty: z.enum(['EASY','MODERATE','ADVANCED']).nullable().optional(),
  conceptIds: z.array(z.string().uuid()).max(50).optional(),
  journeyStage: z.enum(['SEE','UNDERSTAND','DO','PRACTISE','APPLY','REVISE']).optional(),
  transcript: z.string().max(100_000).nullable().optional(),
  altText: z.string().trim().max(2000).nullable().optional(),
  mediaKind: mediaSchema,
  deliveryMode: deliverySchema,
  sourceUrl: z.string().url().max(2000).nullable().optional(),
  sourceItemId: z.string().trim().max(220).nullable().optional(),
  embedUrl: z.string().url().max(2000).nullable().optional(),
  storageKey: z.string().trim().max(1000).nullable().optional(),
  mimeType: z.string().trim().max(120).nullable().optional(),
  byteSize: z.number().int().min(0).max(20_000_000_000).nullable().optional(),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/i).nullable().optional(),
  licenceCandidate: licenceSchema.nullable().optional(),
  licenceUrl: z.string().url().max(2000).nullable().optional(),
  attributionText: z.string().trim().max(4000).nullable().optional(),
  rightsEvidenceUrl: z.string().url().max(2000).nullable().optional(),
  category: categorySchema,
  gradeCodes: z.array(z.string().trim().min(2).max(24)).min(1).max(24),
  boardCodes: z.array(z.string().trim().min(2).max(40)).min(1).max(25),
  subjectId: z.string().uuid().nullable().optional(),
  subjectLabel: z.string().trim().max(160).nullable().optional(),
  chapterLabel: z.string().trim().max(220).nullable().optional(),
  topicLabel: z.string().trim().max(220).nullable().optional(),
  language: z.string().trim().min(2).max(10).nullable().optional(),
  visibility: visibilitySchema,
  accessRequirement: accessSchema,
  bodyMarkdown: z.string().max(100_000).nullable().optional(),
  bodyMarkdownHi: z.string().max(100_000).nullable().optional(),
  summary: z.string().trim().max(2000).nullable().optional(),
  summaryHi: z.string().trim().max(2000).nullable().optional(),
  thumbnailUrl: z.string().url().max(2000).nullable().optional(),
  durationSecs: z.number().int().min(1).max(86_400).nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.visibility === 'PUBLIC' && value.accessRequirement !== 'PUBLIC') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['accessRequirement'], message: 'PUBLIC visibility requires PUBLIC access' });
  }
  if (value.visibility !== 'PUBLIC' && value.accessRequirement === 'PUBLIC') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['accessRequirement'], message: 'PUBLIC access requires PUBLIC visibility' });
  }
});

const verifySchema = z.object({
  licenceCandidate: licenceSchema,
  licenceUrl: z.string().url().max(2000).nullable().optional(),
  attributionText: z.string().trim().min(1).max(4000),
  rightsEvidenceUrl: z.string().url().max(2000).nullable().optional(),
  reviewerNote: z.string().trim().max(3000).nullable().optional(),
});

router.patch('/resources/:resourceId/details', validate(stageSchema), ctrl.updateDraft);
router.post('/acquire', validate(stageSchema.and(z.object({ assetUrl:z.string().url().max(2000),permissionConfirmed:z.literal(true) }))), ctrl.acquire);
router.post('/curriculum-topics', validate(z.object({ gradeCode:z.string().min(2).max(24),subjectId:z.string().uuid(),name:z.string().trim().min(2).max(300),nameHi:z.string().trim().max(300).optional(),chapterTitle:z.string().trim().max(300).optional(),academicYear:z.string().regex(/^\d{4}-\d{2}$/),evidenceUrl:z.string().url().max(220) })), ctrl.createTopic);
router.get('/options', ctrl.options);
router.get('/queue', ctrl.queue);
router.post('/stage', validate(stageSchema), ctrl.stage);
router.patch('/intake/:intakeId/rights', validate(verifySchema), ctrl.verifyRights);
router.post('/intake/:intakeId/approve', ctrl.approve);
router.post('/intake/:intakeId/materialise', ctrl.materialise);

export = router;
