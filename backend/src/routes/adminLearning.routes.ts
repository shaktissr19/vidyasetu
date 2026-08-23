import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/adminLearning.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

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

router.get('/options', ctrl.options);
router.get('/resources', ctrl.resources);
router.post('/resources', validate(resourceSchema), ctrl.createResource);
router.patch('/resources/:resourceId/status', validate(statusSchema), ctrl.updateStatus);

export = router;
