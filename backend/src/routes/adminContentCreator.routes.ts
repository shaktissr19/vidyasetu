import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/adminContentCreator.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);
router.use(authorize('SUPER_ADMIN'));

const visibilitySchema = z.enum(['PUBLIC','REGISTERED','CLASS_ONLY','SCHOOL_ONLY']);
const accessRequirementSchema = z.enum(['PUBLIC','REGISTERED','SUBSCRIBER']);
const licenceSchema = z.enum(['VIDYASETU_ORIGINAL','CC_BY','CC_BY_SA','CC_BY_NC_SA','CC_BY_NC_ND','PUBLIC_DOMAIN','EXTERNAL_LINK_ONLY','OTHER']);

const creatorSourceSchema = z.object({
  sourceRole: z.enum(['GROUNDING','REFERENCE_ONLY']).optional(),
  sourceCode: z.string().trim().min(2).max(40).optional(),
  title: z.string().trim().min(2).max(300).optional(),
  sourceUrl: z.string().url().nullable().optional(),
  resourceId: z.string().uuid().nullable().optional(),
  intakeId: z.string().uuid().nullable().optional(),
  licence: licenceSchema.nullable().optional(),
  licenceUrl: z.string().url().nullable().optional(),
  attributionText: z.string().trim().max(3000).nullable().optional(),
  excerpt: z.string().max(12000).nullable().optional(),
}).superRefine((value, ctx) => {
  const locators = [value.resourceId, value.intakeId, value.sourceUrl].filter(Boolean).length;
  if (locators !== 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Creator source requires exactly one of resourceId, intakeId or sourceUrl' });
  }
  if (value.sourceUrl && !value.sourceCode) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sourceCode'], message: 'Manual URL sources require sourceCode' });
  }
});

const requestedPackSchema = z.object({
  lesson: z.boolean().optional(),
  revision: z.boolean().optional(),
  activities: z.boolean().optional(),
  questions: z.boolean().optional(),
  assessment: z.boolean().optional(),
  questionCount: z.number().int().min(5).max(30).optional(),
}).optional();

const creatorJobSchema = z.object({
  mode: z.enum(['CURRICULUM','SOURCES','IMPROVE_EXISTING']),
  title: z.string().trim().min(3).max(300),
  instructions: z.string().trim().max(8000).nullable().optional(),
  conceptId: z.string().uuid().nullable().optional(),
  existingResourceId: z.string().uuid().nullable().optional(),
  classNumber: z.number().int().min(1).max(12).nullable().optional(),
  subjectId: z.string().uuid().nullable().optional(),
  boardCodes: z.array(z.string().trim().min(2).max(30)).min(1).max(25).optional(),
  languageMode: z.enum(['ENGLISH','HINDI','BILINGUAL']).optional(),
  visibility: visibilitySchema,
  accessRequirement: accessRequirementSchema,
  requestedPack: requestedPackSchema,
  sources: z.array(creatorSourceSchema).max(12).optional(),
}).superRefine((value, ctx) => {
  if (value.visibility === 'PUBLIC' && value.accessRequirement !== 'PUBLIC') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['accessRequirement'], message: 'PUBLIC visibility requires PUBLIC access' });
  }
  if (value.visibility !== 'PUBLIC' && value.accessRequirement === 'PUBLIC') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['accessRequirement'], message: 'PUBLIC access requires PUBLIC visibility' });
  }
  if (value.mode === 'CURRICULUM' && !value.conceptId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['conceptId'], message: 'Curriculum mode requires a canonical concept' });
  }
  if (value.mode === 'IMPROVE_EXISTING' && !value.existingResourceId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['existingResourceId'], message: 'Improve Existing mode requires a Learning resource' });
  }
  if (value.mode === 'SOURCES' && !(value.sources?.length)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sources'], message: 'Create from Sources requires at least one governed source' });
  }
});

const reviewSchema = z.object({
  decision: z.enum(['APPROVE','REJECT']),
  note: z.string().trim().max(3000).nullable().optional(),
});

const discoverySchema = z.object({
  provider: z.enum(['LOCAL','DIKSHA']),
  query: z.string().trim().min(2).max(300),
  classNumber: z.number().int().min(1).max(12).nullable().optional(),
  subject: z.string().trim().max(160).nullable().optional(),
  language: z.string().trim().max(80).nullable().optional(),
  limit: z.number().int().min(1).max(30).optional(),
});

router.get('/options', ctrl.options);
router.get('/jobs', ctrl.jobs);
router.get('/jobs/:jobId', ctrl.job);
router.post('/jobs', validate(creatorJobSchema), ctrl.createJob);
router.post('/jobs/:jobId/generate', ctrl.generateJob);
router.post('/jobs/:jobId/review', validate(reviewSchema), ctrl.reviewJob);
router.post('/jobs/:jobId/materialise', ctrl.materialiseJob);

// Source discovery is metadata-only. External candidates must still pass OER intake licence/attribution review.
router.get('/discovery/runs', ctrl.discoveryRuns);
router.get('/discovery/runs/:runId', ctrl.discoveryRun);
router.post('/discovery/search', validate(discoverySchema), ctrl.discoverSources);
router.post('/discovery/candidates/:candidateId/stage', ctrl.stageDiscoveryCandidate);

export = router;