import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/admin.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);
router.use(authorize('SUPER_ADMIN'));

const configSchema = z.object({ value: z.string().min(1) });
const statusSchema = z.object({ status: z.string().min(1) });

router.get('/analytics', ctrl.getAnalytics);
router.get('/revenue', ctrl.getRevenue);
router.get('/schools', ctrl.listSchools);
router.patch('/schools/:schoolId/status', validate(statusSchema), ctrl.updateSchoolStatus);
router.get('/users', ctrl.listUsers);
router.patch('/users/:userId/status', validate(statusSchema), ctrl.updateUserStatus);
router.get('/config', ctrl.getConfig);
router.patch('/config/:key', validate(configSchema), ctrl.updateConfig);

router.get('/support', ctrl.getTickets);
router.patch('/support/:ticketId', ctrl.updateTicket);
router.patch('/config', ctrl.updateConfigBody);
router.get('/competitions', ctrl.listCompetitions);
router.post('/competitions', ctrl.createCompetition);

export = router;
