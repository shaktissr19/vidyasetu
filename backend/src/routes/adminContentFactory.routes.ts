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

router.get('/options', ctrl.options);
router.post('/external-web-source', validate(externalWebSourceSchema), ctrl.stageExternalWebSource);

export = router;
