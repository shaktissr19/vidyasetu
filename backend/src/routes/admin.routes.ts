import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/admin.controller';
import * as groupCtrl from '../controllers/group.controller';
import * as groupAdminCtrl from '../controllers/groupAdminLifecycle.controller';
import * as governanceCtrl from '../controllers/groupGovernance.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);
router.use(authorize('SUPER_ADMIN'));

const configValue = z.union([z.string().max(500), z.number().finite(), z.boolean()]);
const configSchema = z.object({ value: configValue });
const configBodySchema = z.object({ key: z.string().trim().min(1).max(100), value: configValue });
const statusSchema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING']) });
const supportUpdateSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']),
  resolution: z.string().trim().max(4000).nullable().optional(),
});
const competitionCreateSchema = z.object({
  title: z.string().trim().min(3).max(200),
  title_hi: z.string().trim().max(200).nullable().optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  class_names: z.array(z.string().trim().min(1).max(20)).max(20).optional(),
  subject_codes: z.array(z.string().trim().min(1).max(30)).max(30).optional(),
  total_questions: z.number().int().min(1).max(200).optional(),
  duration_mins: z.number().int().min(1).max(480).optional(),
  marks_per_question: z.number().min(0).max(100).optional(),
  negative_marks: z.number().min(0).max(100).optional(),
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  prize_pool: z.number().min(0).max(100000000).optional(),
}).refine((body) => new Date(body.end_time).getTime() > new Date(body.start_time).getTime(), {
  path: ['end_time'],
  message: 'end_time must be after start_time',
});
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
router.get('/audit', ctrl.getAuditLog);
router.get('/schools', ctrl.listSchools);
router.get('/schools/:schoolId', ctrl.getSchool);
router.patch('/schools/:schoolId/status', validate(statusSchema), ctrl.updateSchoolStatus);
router.get('/users/export', ctrl.exportUsers);
router.get('/users', ctrl.listUsers);
router.patch('/users/:userId/status', validate(statusSchema), ctrl.updateUserStatus);
router.get('/config', ctrl.getConfig);
router.patch('/config/:key', validate(configSchema), ctrl.updateConfig);
router.patch('/config', validate(configBodySchema), ctrl.updateConfigBody);

router.get('/support', ctrl.getTickets);
router.patch('/support/:ticketId', validate(supportUpdateSchema), ctrl.updateTicket);
router.get('/competitions', ctrl.listCompetitions);
router.post('/competitions', validate(competitionCreateSchema), ctrl.createCompetition);

router.get('/groups', groupCtrl.adminGroups);
router.patch('/groups/:groupId/decision', validate(groupDecisionSchema), groupAdminCtrl.decideGroup);
router.patch('/groups/:groupId/status', validate(groupStatusSchema), groupAdminCtrl.updateGroupStatus);
router.get('/groups/:groupId/members', governanceCtrl.adminMembers);
router.patch('/groups/:groupId/owner', validate(groupOwnerSchema), governanceCtrl.adminTransferOwnership);
router.get('/group-reports', groupCtrl.adminReports);
router.patch('/group-reports/:reportId', validate(groupReportSchema), groupAdminCtrl.resolveGroupReport);

export = router;
