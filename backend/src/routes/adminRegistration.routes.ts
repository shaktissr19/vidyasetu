import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/schoolRegistrationApproval.controller';
import { createAdmin, listPlatformAdminAccess, updatePlatformAdminAccess } from '../controllers/adminAccount.controller';
import { adminAccountSchema } from '../services/adminAccount.service';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { PLATFORM_ADMIN_CAPABILITIES } from '../services/platformAdminAccess.service';

const router = Router();
const statusSchema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING']) });
const permissionsSchema = z.object({ permissions: z.array(z.enum(PLATFORM_ADMIN_CAPABILITIES)).max(PLATFORM_ADMIN_CAPABILITIES.length)
  .refine((values) => new Set(values).size === values.length, 'Choose each access area once') });

router.use(authenticate);
router.use(authorize('SUPER_ADMIN'));
router.post('/platform-admins', validate(adminAccountSchema), createAdmin);
router.get('/platform-admins', listPlatformAdminAccess);
router.put('/platform-admins/:userId/permissions', validate(permissionsSchema), updatePlatformAdminAccess);
router.patch('/schools/:schoolId/status', validate(statusSchema), ctrl.updateSchoolStatus);

export = router;
