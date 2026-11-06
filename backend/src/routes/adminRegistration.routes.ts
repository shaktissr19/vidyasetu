import { Router } from 'express';
import { z } from 'zod';
import { createAdmin, listPlatformAdminAccess, updatePlatformAdminAccess } from '../controllers/adminAccount.controller';
import { adminAccountSchema } from '../services/adminAccount.service';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { PLATFORM_ADMIN_CAPABILITIES } from '../services/platformAdminAccess.service';

const router = Router();
const permissionsSchema = z.object({ permissions: z.array(z.enum(PLATFORM_ADMIN_CAPABILITIES)).max(PLATFORM_ADMIN_CAPABILITIES.length)
  .refine((values) => new Set(values).size === values.length, 'Choose each access area once') });

router.post('/platform-admins', authenticate, authorize('SUPER_ADMIN'), validate(adminAccountSchema), createAdmin);
router.get('/platform-admins', authenticate, authorize('SUPER_ADMIN'), listPlatformAdminAccess);
router.put('/platform-admins/:userId/permissions', authenticate, authorize('SUPER_ADMIN'), validate(permissionsSchema), updatePlatformAdminAccess);

export = router;
