import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/staffOperations.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();
router.use(authenticate);
router.use(authorize('SCHOOL_ADMIN', 'SUPER_ADMIN', 'TEACHER'));

const teacherOnly = authorize('TEACHER');
const adminOnly = authorize('SCHOOL_ADMIN', 'SUPER_ADMIN');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const leaveCreate = z.object({
  startDate: date,
  endDate: date,
  reason: z.string().trim().min(5).max(1200),
});
const leaveReview = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  note: z.string().trim().max(1200).optional(),
});
const attendanceRecord = z.object({
  teacherId: z.string().uuid(),
  status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'HOLIDAY']),
  remark: z.string().trim().max(300).optional(),
});
const attendanceBatch = z.object({
  date,
  records: z.array(attendanceRecord).min(1).max(300),
});

router.get('/me/leaves', teacherOnly, ctrl.myLeaves);
router.post('/me/leaves', teacherOnly, validate(leaveCreate), ctrl.createMyLeave);
router.patch('/me/leaves/:leaveId/cancel', teacherOnly, ctrl.cancelMyLeave);
router.get('/me/attendance', teacherOnly, ctrl.myAttendance);

router.get('/leaves', adminOnly, ctrl.schoolLeaves);
router.patch('/leaves/:leaveId/review', adminOnly, validate(leaveReview), ctrl.reviewSchoolLeave);
router.get('/attendance/roster', adminOnly, ctrl.attendanceRoster);
router.post('/attendance', adminOnly, validate(attendanceBatch), ctrl.markAttendance);
router.get('/attendance/summary', adminOnly, ctrl.attendanceSummary);

export = router;