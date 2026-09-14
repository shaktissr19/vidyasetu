import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/adminContentFactory.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);
router.use(authorize('SUPER_ADMIN'));

const licenceSchema = z.enum([
  'VIDYASETU_ORIGINAL','CC_BY','CC_BY_SA','CC_BY_NC','CC_BY_NC_SA','CC_BY_NC_ND',
  'PUBLIC_DOMAIN','EXTERNAL_LINK_ONLY','OTHER',
]);

const externalWebSourceSchema = z.object({
  title: z.string().trim().min(2).max(500),
  sourceUrl: z.string().url().max(2000),
  licenceCandidate: licenceSchema.nullable().optional(),
  attributionText: z.string().trim().max(4000).nullable().optional(),
  classNumber: z.number().int().min(1).max(12).nullable().optional(),
  subject: z.string().trim().max(160).nullable().optional(),
  boardCode: z.string().trim().max(40).nullable().optional(),
});

const addToLibrarySchema = z.object({
  classNumber: z.number().int().min(1).max(12),
  boardCode: z.string().trim().min(2).max(40),
  subjectId: z.string().uuid().nullable().optional(),
  subjectName: z.string().trim().min(2).max(160).nullable().optional(),
  chapter: z.string().trim().max(220).nullable().optional(),
  topic: z.string().trim().max(220).nullable().optional(),
  language: z.enum(['en','hi','en-hi']).optional(),
  visibility: z.enum(['PUBLIC','REGISTERED','CLASS_ONLY']),
  accessRequirement: z.enum(['PUBLIC','REGISTERED','SUBSCRIBER']),
}).superRefine((value,ctx) => {
  if (!value.subjectId && !value.subjectName) {
    ctx.addIssue({ code: z.ZodIssueCode.custom,path: ['subjectId'],message: 'Choose a VidyaSetu subject' });
  }
  if (value.visibility === 'PUBLIC' && value.accessRequirement !== 'PUBLIC') {
    ctx.addIssue({ code: z.ZodIssueCode.custom,path: ['accessRequirement'],message: 'Public Learning requires PUBLIC access' });
  }
  if (value.visibility !== 'PUBLIC' && value.accessRequirement === 'PUBLIC') {
    ctx.addIssue({ code: z.ZodIssueCode.custom,path: ['accessRequirement'],message: 'PUBLIC access requires Public Learning visibility' });
  }
});

router.get('/options', ctrl.options);
router.get('/queue-counts', ctrl.queueCounts);
router.get('/source-review', ctrl.sourceReviewQueue);
router.post('/external-web-source', validate(externalWebSourceSchema), ctrl.stageExternalWebSource);
router.post('/intake/:intakeId/add-to-library', validate(addToLibrarySchema), ctrl.addApprovedIntakeToLibrary);

export = router;
