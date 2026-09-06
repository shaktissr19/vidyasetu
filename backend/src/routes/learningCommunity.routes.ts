import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/learningCommunity.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router=Router();
router.use(authenticate);
router.use(authorize('STUDENT','PARENT','TEACHER','SCHOOL_ADMIN','SUPER_ADMIN'));
const createSchema=z.object({name:z.string().trim().min(3).max(160),description:z.string().trim().max(3000).nullable().optional(),classId:z.string().uuid(),subjectCode:z.string().trim().min(1).max(50),conceptId:z.string().uuid().nullable().optional(),purpose:z.enum(['CONCEPT_SUPPORT','COMPETITION_PREP','TEACHER_LED']),maxMembers:z.number().int().min(2).max(150).optional()});
const learningPostSchema=z.object({body:z.string().trim().min(1).max(5000),conceptId:z.string().uuid().nullable().optional(),resourceId:z.string().uuid().nullable().optional(),assessmentId:z.string().uuid().nullable().optional(),label:z.string().trim().max(180).nullable().optional()});
router.get('/',ctrl.list);
router.post('/',authorize('TEACHER','SCHOOL_ADMIN','SUPER_ADMIN'),validate(createSchema),ctrl.create);
router.post('/:groupId/learning-posts',authorize('TEACHER','SCHOOL_ADMIN','SUPER_ADMIN'),validate(learningPostSchema),ctrl.createPost);
export = router;
