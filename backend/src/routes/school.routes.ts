import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/school.controller';
import * as enrollmentCtrl from '../controllers/enrollment.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);
router.use(authorize('SCHOOL_ADMIN', 'SUPER_ADMIN', 'TEACHER'));

const adminOnly = authorize('SCHOOL_ADMIN', 'SUPER_ADMIN');
const passwordSchema = z.string().min(8).max(128).regex(/[A-Za-z]/).regex(/\d/);
const emailOptional = z.string().email().max(180).optional().or(z.literal(''));
const mobileOptional = z.string().regex(/^\d{10}$/).optional().or(z.literal(''));

const schoolProfileSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  nameHi: z.string().max(200).optional(),
  udiseCode: z.string().max(20).optional(),
  address: z.string().max(1000).optional(),
  city: z.string().max(100).optional(),
  district: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  pincode: z.string().regex(/^\d{6}$/).optional(),
  mobile: z.string().regex(/^\d{10}$/).optional(),
  email: z.string().email().max(150).optional(),
  website: z.string().url().max(255).optional(),
  academicYear: z.string().regex(/^20\d{2}-\d{2}$/).optional(),
  board: z.enum(['CBSE', 'ICSE', 'UP_BOARD', 'STATE_BOARD', 'NIOS', 'IB', 'CAMBRIDGE', 'OTHER']).optional(),
  affiliationNumber: z.string().max(80).optional(),
  principalName: z.string().max(120).optional(),
  adminName: z.string().min(2).max(120).optional(),
  adminEmail: z.string().email().max(180).optional(),
});

const studentBaseSchema = z.object({
  name: z.string().min(2).max(120),
  username: z.string().min(3).max(60).regex(/^[A-Za-z0-9._-]+$/).optional(),
  email: emailOptional,
  mobile: z.string().regex(/^\d{10}$/),
  password: passwordSchema.optional(),
  classId: z.string().uuid(),
  rollNumber: z.string().max(20).optional(),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  language: z.enum(['hi', 'en', 'ta', 'te', 'mr', 'bn', 'gu', 'kn', 'or']).optional(),
  parentName: z.string().max(120).optional(),
  parentMobile: mobileOptional,
  parentEmail: emailOptional,
  parentRelation: z.enum(['FATHER', 'MOTHER', 'GUARDIAN', 'PARENT']).optional(),
});

const studentUpdateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  email: emailOptional,
  mobile: z.string().regex(/^\d{10}$/).optional(),
  classId: z.string().uuid().optional(),
  rollNumber: z.string().max(20).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'TRANSFERRED', 'GRADUATED']).optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one field is required');

const parentLinkSchema = z.object({
  name: z.string().max(120).optional(),
  mobile: mobileOptional,
  email: emailOptional,
  relation: z.enum(['FATHER', 'MOTHER', 'GUARDIAN', 'PARENT']).optional(),
  isPrimary: z.boolean().optional(),
}).refine((value) => Boolean(value.mobile) || Boolean(value.email), { message: 'Parent mobile or email is required' });

const enrollmentReviewSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  classId: z.string().uuid().optional(),
  rollNumber: z.string().max(20).optional(),
  note: z.string().max(1000).optional(),
});

const classSchema = z.object({
  className: z.string().regex(/^(?:[1-9]|1[0-2])$/),
  section: z.string().trim().min(1).max(5).optional(),
  academicYear: z.string().regex(/^20\d{2}-\d{2}$/).optional(),
  roomNumber: z.string().max(20).optional(),
});

const classUpdateSchema = classSchema.partial().extend({ isActive: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

const assignmentSchema = z.object({
  classId: z.string().uuid(),
  subjectCode: z.string().min(1).max(20),
  isClassTeacher: z.boolean().optional(),
});

const teacherSchema = z.object({
  name: z.string().min(2).max(120),
  username: z.string().min(3).max(60).regex(/^[A-Za-z0-9._-]+$/).optional(),
  email: emailOptional,
  mobile: z.string().regex(/^\d{10}$/),
  password: passwordSchema.optional(),
  employeeId: z.string().max(30).optional(),
  designation: z.string().max(120).optional(),
  qualification: z.string().max(200).optional(),
  experienceYears: z.number().int().min(0).max(60).optional(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'VISITING']).optional(),
  joinedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  language: z.enum(['hi', 'en', 'ta', 'te', 'mr', 'bn', 'gu', 'kn', 'or']).optional(),
  assignments: z.array(assignmentSchema).max(30).optional(),
});

const teacherUpdateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  email: emailOptional,
  mobile: z.string().regex(/^\d{10}$/).optional(),
  employeeId: z.string().max(30).optional(),
  designation: z.string().max(120).optional(),
  qualification: z.string().max(200).optional(),
  experienceYears: z.number().int().min(0).max(60).optional(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'VISITING']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ON_LEAVE']).optional(),
  assignments: z.array(assignmentSchema).max(30).optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one field is required');

const attendanceSchema = z.object({
  classId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  records: z.array(z.object({
    studentId: z.string().uuid(),
    status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'HOLIDAY', 'HALF_DAY']),
    remark: z.string().max(200).optional(),
  })).min(1).max(200),
});

const feeStructureSchema = z.object({
  className: z.string().regex(/^(?:[1-9]|1[0-2])$/),
  academicYear: z.string().regex(/^20\d{2}-\d{2}$/).optional(),
  term: z.number().int().min(1).max(4),
  feeHead: z.string().min(2).max(100),
  amount: z.number().positive(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  isOptional: z.boolean().optional(),
});

const invoiceGenerateSchema = z.object({
  classId: z.string().uuid(),
  academicYear: z.string().regex(/^20\d{2}-\d{2}$/).optional(),
  term: z.number().int().min(1).max(4),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const paymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().positive(),
  paymentMode: z.enum(['CASH', 'UPI', 'BANK_TRANSFER', 'RAZORPAY', 'CHEQUE', 'DD']),
  razorpayPaymentId: z.string().max(100).optional(),
  transactionRef: z.string().max(100).optional(),
  paymentDate: z.string().optional(),
  notes: z.string().max(500).optional(),
});

const timetablePeriodSchema = z.object({
  day: z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']),
  periodNumber: z.number().int().min(1).max(12),
  startTime: z.string().regex(/^\d{2}:\d{2}(?::\d{2})?$/),
  endTime: z.string().regex(/^\d{2}:\d{2}(?::\d{2})?$/),
  subjectCode: z.string().max(20).nullable().optional(),
  teacherId: z.string().uuid().nullable().optional(),
  roomNumber: z.string().max(20).optional(),
  isBreak: z.boolean().optional(),
  breakLabel: z.string().max(50).optional(),
});

const questionSchema = z.object({
  questionText: z.string().min(3),
  questionHi: z.string().optional(),
  optionA: z.string().min(1),
  optionB: z.string().min(1),
  optionC: z.string().min(1),
  optionD: z.string().min(1),
  correctOption: z.enum(['A', 'B', 'C', 'D']),
  explanation: z.string().optional(),
  subjectCode: z.string().max(20).optional(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
});

const examSchema = z.object({
  title: z.string().min(3).max(300),
  titleHi: z.string().max(300).optional(),
  description: z.string().max(2000).optional(),
  classNames: z.array(z.string().regex(/^(?:[1-9]|1[0-2])$/)).min(1),
  subjectCodes: z.array(z.string().max(20)).min(1),
  status: z.enum(['DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'LIVE', 'SCORING', 'COMPLETED', 'CANCELLED']).optional(),
  startTime: z.string(),
  endTime: z.string(),
  resultsAt: z.string().optional(),
  durationMins: z.number().int().positive().max(300).optional(),
  totalQuestions: z.number().int().positive().max(200).optional(),
  marksPerQuestion: z.number().positive().optional(),
  negativeMarks: z.number().min(0).optional(),
  registrationStart: z.string().optional(),
  registrationEnd: z.string().optional(),
  instructions: z.string().optional(),
  questions: z.array(questionSchema).max(200).optional(),
});

const statusSchema = z.object({
  status: z.enum(['DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'LIVE', 'SCORING', 'COMPLETED', 'CANCELLED']),
});

const announcementSchema = z.object({
  title: z.string().min(3).max(300),
  body: z.string().min(10),
  audience: z.enum(['ALL', 'STUDENTS', 'PARENTS', 'TEACHERS']).optional(),
  targetClass: z.string().regex(/^(?:[1-9]|1[0-2])$/).optional(),
  sendWhatsapp: z.boolean().optional(),
  isPinned: z.boolean().optional(),
  expiresAt: z.string().optional(),
});

router.get('/profile', ctrl.getProfile);
router.get('/overview', ctrl.getOverview);
router.get('/students', ctrl.getStudents);
router.get('/students/:studentId', ctrl.getStudentDetail);
router.get('/classes', ctrl.getClasses);
router.get('/subjects', ctrl.getSubjects);
router.get('/teachers', ctrl.getTeachers);
router.get('/attendance/roster', ctrl.getAttendanceRoster);
router.get('/attendance', ctrl.getAttendanceSummary);
router.post('/attendance', validate(attendanceSchema), ctrl.markAttendance);
router.get('/timetable/:classId', ctrl.getTimetable);
router.get('/results', ctrl.getResults);
router.get('/results/:examId', ctrl.getResultDetail);
router.get('/announcements', ctrl.getAnnouncements);

router.patch('/profile', adminOnly, validate(schoolProfileSchema), ctrl.updateProfile);
router.post('/students', adminOnly, validate(studentBaseSchema), ctrl.addStudent);
router.post('/students/bulk', adminOnly, validate(z.object({ students: z.array(studentBaseSchema).min(1).max(200) })), ctrl.bulkAddStudents);
router.patch('/students/:studentId', adminOnly, validate(studentUpdateSchema), ctrl.updateStudent);
router.post('/students/:studentId/parent-link', adminOnly, validate(parentLinkSchema), ctrl.linkParent);
router.get('/enrollment-requests', adminOnly, enrollmentCtrl.getSchoolRequests);
router.patch('/enrollment-requests/:requestId', adminOnly, validate(enrollmentReviewSchema), enrollmentCtrl.reviewSchoolRequest);

router.post('/classes', adminOnly, validate(classSchema), ctrl.createClass);
router.patch('/classes/:classId', adminOnly, validate(classUpdateSchema), ctrl.updateClass);
router.delete('/classes/:classId', adminOnly, ctrl.archiveClass);

router.post('/teachers', adminOnly, validate(teacherSchema), ctrl.addTeacher);
router.patch('/teachers/:teacherId', adminOnly, validate(teacherUpdateSchema), ctrl.updateTeacher);
router.delete('/teachers/:teacherId', adminOnly, ctrl.deactivateTeacher);

router.get('/fees', adminOnly, ctrl.getFeeOverview);
router.get('/fees/structures', adminOnly, ctrl.getFeeStructures);
router.put('/fees/structures', adminOnly, validate(feeStructureSchema), ctrl.upsertFeeStructure);
router.post('/fees/generate', adminOnly, validate(invoiceGenerateSchema), ctrl.generateFeeInvoices);
router.post('/fees/payment', adminOnly, validate(paymentSchema), ctrl.recordPayment);
router.get('/fees/payments', adminOnly, ctrl.getFeePayments);
router.post('/fees/reminders', adminOnly, ctrl.sendFeeReminders);

router.put('/timetable/:classId', adminOnly, validate(z.object({ periods: z.array(timetablePeriodSchema).max(72) })), ctrl.saveTimetable);

router.get('/exams', adminOnly, ctrl.getExams);
router.get('/exams/:examId', adminOnly, ctrl.getExamDetail);
router.post('/exams', adminOnly, validate(examSchema), ctrl.createExam);
router.post('/exams/:examId/questions', adminOnly, validate(z.object({ questions: z.array(questionSchema).min(1).max(200) })), ctrl.addExamQuestions);
router.patch('/exams/:examId/status', adminOnly, validate(statusSchema), ctrl.updateExamStatus);

router.post('/announcements', adminOnly, validate(announcementSchema), ctrl.publishAnnouncement);

export = router;
