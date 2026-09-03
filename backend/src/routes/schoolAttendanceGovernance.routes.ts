import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/attendanceGovernance.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();
router.use(authenticate);
router.use(authorize('SCHOOL_ADMIN','SUPER_ADMIN','TEACHER'));

const attendanceSchema = z.object({
  classId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  records: z.array(z.object({
    studentId: z.string().uuid(),
    status: z.enum(['PRESENT','ABSENT','LATE','HOLIDAY','HALF_DAY']),
    remark: z.string().max(200).optional(),
  })).min(1).max(200),
});

router.get('/attendance/roster', ctrl.roster);
router.get('/attendance', ctrl.summary);
router.post('/attendance', validate(attendanceSchema), ctrl.mark);

export = router;
