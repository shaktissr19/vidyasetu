import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/group.controller';
import * as contextCtrl from '../controllers/groupContext.controller';
import * as governanceCtrl from '../controllers/groupGovernance.controller';
import * as attachmentCtrl from '../controllers/groupAttachment.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);
router.use(authorize('STUDENT', 'PARENT', 'TEACHER', 'SCHOOL_ADMIN'));

const createGroupSchema = z.object({
  name: z.string().trim().min(3).max(160),
  description: z.string().trim().max(3000).nullable().optional(),
  kind: z.enum(['STUDENT', 'PARENT', 'TEACHER', 'MIXED']),
  scope: z.enum(['PRIVATE', 'SCHOOL', 'CLASS']),
  schoolId: z.string().uuid().nullable().optional(),
  classId: z.string().uuid().nullable().optional(),
  maxMembers: z.number().int().min(2).max(500).optional(),
});

const joinSchema = z.object({ message: z.string().trim().max(500).nullable().optional() });
const decisionSchema = z.object({ decision: z.enum(['APPROVED', 'REJECTED']) });
const invitationSchema = z.object({
  userId: z.string().uuid(),
  message: z.string().trim().max(500).nullable().optional(),
});
const invitationResponseSchema = z.object({ decision: z.enum(['ACCEPTED', 'DECLINED']) });
const memberRoleSchema = z.object({ role: z.enum(['MODERATOR', 'MEMBER']) });
const transferSchema = z.object({ userId: z.string().uuid() });
const uploadSchema = z.object({
  fileName: z.string().trim().min(1).max(160),
  contentType: z.string().trim().min(3).max(160),
});
const postSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  attachmentUrl: z.string().trim().max(2000).nullable().optional(),
  isAnnouncement: z.boolean().optional(),
});
const commentSchema = z.object({ body: z.string().trim().min(1).max(2000) });
const pinSchema = z.object({ pinned: z.boolean() });
const reportSchema = z.object({
  targetType: z.enum(['GROUP', 'POST', 'COMMENT', 'MEMBER']),
  targetId: z.string().uuid(),
  reason: z.string().trim().min(2).max(100),
  details: z.string().trim().max(1000).nullable().optional(),
});

router.get('/context', contextCtrl.getCreationContext);
router.post('/', validate(createGroupSchema), ctrl.createGroup);
router.get('/mine', ctrl.myGroups);
router.get('/discover', ctrl.discover);
router.get('/invitations', ctrl.myInvitations);
router.patch('/invitations/:invitationId/respond', validate(invitationResponseSchema), ctrl.respondInvitation);

router.get('/:groupId', ctrl.detail);
router.patch('/:groupId/owner', validate(transferSchema), governanceCtrl.transferOwnership);
router.post('/:groupId/upload-url', validate(uploadSchema), attachmentCtrl.uploadUrl);
router.get('/:groupId/attachment-url', attachmentCtrl.downloadUrl);
router.post('/:groupId/join-requests', validate(joinSchema), ctrl.requestJoin);
router.get('/:groupId/join-requests', ctrl.joinRequests);
router.patch('/:groupId/join-requests/:requestId', validate(decisionSchema), ctrl.decideJoin);

router.get('/:groupId/eligible-users', ctrl.eligibleUsers);
router.post('/:groupId/invitations', validate(invitationSchema), ctrl.invite);
router.get('/:groupId/nominations', ctrl.nominations);
router.patch('/:groupId/nominations/:invitationId', validate(decisionSchema), ctrl.decideNomination);

router.get('/:groupId/members', ctrl.members);
router.patch('/:groupId/members/:userId/role', validate(memberRoleSchema), ctrl.changeMemberRole);
router.delete('/:groupId/members/:userId', ctrl.removeMember);
router.post('/:groupId/leave', ctrl.leave);

router.get('/:groupId/posts', ctrl.posts);
router.post('/:groupId/posts', validate(postSchema), ctrl.createPost);
router.post('/:groupId/posts/:postId/comments', validate(commentSchema), ctrl.addComment);
router.delete('/:groupId/comments/:commentId', governanceCtrl.removeComment);
router.patch('/:groupId/posts/:postId/pin', validate(pinSchema), ctrl.pinPost);
router.delete('/:groupId/posts/:postId', ctrl.deletePost);
router.post('/:groupId/reports', validate(reportSchema), ctrl.report);

export = router;
