import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/parent.controller';
import * as grievanceCtrl from '../controllers/grievance.controller';
import * as grievanceAttachmentCtrl from '../controllers/grievanceAttachment.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);
router.use(authorize('PARENT'));

const messageSchema = z.object({ body: z.string().min(2).max(1000) });
const grievanceCreateSchema = z.object({
  studentId: z.string().uuid(),
  category: z.enum(['ACADEMICS','ATTENDANCE','FEES','TEACHER_CONCERN','BULLYING_SAFETY','TRANSPORT','INFRASTRUCTURE','ADMINISTRATION','OTHER']),
  priority: z.enum(['LOW','NORMAL','HIGH','URGENT']).optional(),
  subject: z.string().trim().min(4).max(180),
  description: z.string().trim().min(10).max(5000),
});
const grievanceReplySchema = z.object({ body: z.string().trim().min(1).max(4000) });
const grievanceActionSchema = z.object({
  action: z.enum(['CLOSE','REOPEN','ESCALATE']),
  note: z.string().trim().max(1200).optional(),
});
const grievanceUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(180),
  contentType: z.enum(['image/jpeg','image/png','image/webp','application/pdf','text/plain']),
  fileSize: z.number().int().positive().max(10 * 1024 * 1024),
});
const grievanceAttachmentSchema = grievanceUploadSchema.extend({
  key: z.string().trim().min(1).max(1000),
});

router.get('/children', ctrl.getChildren);
router.get('/children/:studentId/dashboard', ctrl.getChildDashboard);
router.get('/children/:studentId/performance', ctrl.getChildPerformance);
router.get('/children/:studentId/attendance', ctrl.getChildAttendance);
router.get('/children/:studentId/report-card', ctrl.getChildReportCard);
router.get('/children/:studentId/teacher', ctrl.getChildTeacher);
router.get('/children/:studentId/fees', ctrl.getChildFees);
router.get('/children/:studentId/messages', ctrl.getMessages);
router.post('/children/:studentId/messages', validate(messageSchema), ctrl.sendMessage);
router.get('/notifications', ctrl.getNotifications);
router.patch('/notifications/read-all', ctrl.markAllNotificationsRead);
router.patch('/notifications/:notificationId/read', ctrl.markNotificationRead);

router.get('/grievances', grievanceCtrl.parentList);
router.post('/grievances', validate(grievanceCreateSchema), grievanceCtrl.parentCreate);
router.get('/grievances/:grievanceId', grievanceCtrl.parentGet);
router.post('/grievances/:grievanceId/replies', validate(grievanceReplySchema), grievanceCtrl.parentReply);
router.patch('/grievances/:grievanceId/action', validate(grievanceActionSchema), grievanceCtrl.parentAction);
router.post('/grievances/:grievanceId/attachments/upload-url', validate(grievanceUploadSchema), grievanceAttachmentCtrl.parentUploadUrl);
router.post('/grievances/:grievanceId/attachments', validate(grievanceAttachmentSchema), grievanceAttachmentCtrl.parentConfirm);
router.get('/grievances/:grievanceId/attachments', grievanceAttachmentCtrl.parentList);
router.get('/grievances/:grievanceId/attachments/:attachmentId/url', grievanceAttachmentCtrl.parentDownload);

export = router;
