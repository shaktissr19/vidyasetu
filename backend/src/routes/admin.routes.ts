import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/admin.controller';
import * as groupCtrl from '../controllers/group.controller';
import * as governanceCtrl from '../controllers/groupGovernance.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);
router.use(authorize('SUPER_ADMIN'));

const configSchema = z.object({ value: z.union([z.string(), z.number(), z.boolean()]) });
const statusSchema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING']) });
const groupDecisionSchema = z.object({
  decision: z.enum(['ACTIVE', 'REJECTED']),
  note: z.string().trim().max(1000).nullable().optional(),
});
const groupStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'ARCHIVED']),
  note: z.string().trim().max(1000).nullable().optional(),
});
const groupReportSchema = z.object({
  status: z.enum(['REVIEWING', 'RESOLVED', 'DISMISSED']),
  resolution: z.string().trim().max(1000).nullable().optional(),
});
const groupOwnerSchema = z.object({ userId: z.string().uuid() });

router.get('/analytics', ctrl.getAnalytics);
router.get('/revenue', ctrl.getRevenue);
router.get('/content', ctrl.getContentAnalytics);
router.get('/schools', ctrl.listSchools);
router.get('/schools/:schoolId', ctrl.getSchool);
router.patch('/schools/:schoolId/status', validate(statusSchema), ctrl.updateSchoolStatus);
router.get('/users/export', ctrl.exportUsers);
router.get('/users', ctrl.listUsers);
router.patch('/users/:userId/status', validate(statusSchema), ctrl.updateUserStatus);
router.get('/config', ctrl.getConfig);
router.patch('/config/:key', validate(configSchema), ctrl.updateConfig);

router.get('/support', ctrl.getTickets);
router.patch('/support/:ticketId', ctrl.updateTicket);
router.patch('/config', ctrl.updateConfigBody);
router.get('/competitions', ctrl.listCompetitions);
router.post('/competitions', ctrl.createCompetition);

router.get('/groups', groupCtrl.adminGroups);
router.patch('/groups/:groupId/decision', validate(groupDecisionSchema), groupCtrl.adminDecide);
router.patch('/groups/:groupId/status', validate(groupStatusSchema), groupCtrl.adminStatus);
router.get('/groups/:groupId/members', governanceCtrl.adminMembers);
router.patch('/groups/:groupId/owner', validate(groupOwnerSchema), governanceCtrl.adminTransferOwnership);
router.get('/group-reports', groupCtrl.adminReports);
router.patch('/group-reports/:reportId', validate(groupReportSchema), groupCtrl.adminResolveReport);

export = router;
