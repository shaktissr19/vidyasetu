// routes/school.routes.js
const router = require('express').Router();
const { z } = require('zod');
const ctrl = require('../controllers/school.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');

router.use(authenticate);
router.use(authorize('SCHOOL_ADMIN', 'SUPER_ADMIN'));

const addStudentSchema = z.object({
  name:       z.string().min(2).max(120),
  mobile:     z.string().regex(/^\d{10}$/),
  classId:    z.string().uuid(),
  rollNumber: z.string().optional(),
  dob:        z.string().optional(),
  gender:     z.enum(['MALE','FEMALE','OTHER','PREFER_NOT_TO_SAY']).optional(),
  language:   z.enum(['hi','en','ta','te','mr','bn','gu','kn','or']).optional(),
});

const attendanceSchema = z.object({
  classId: z.string().uuid(),
  date:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  records: z.array(z.object({
    studentId: z.string().uuid(),
    status:    z.enum(['PRESENT','ABSENT','LATE','HALF_DAY']),
    remark:    z.string().optional(),
  })).min(1),
});

const paymentSchema = z.object({
  invoiceId:         z.string().uuid(),
  amount:            z.number().positive(),
  paymentMode:       z.enum(['CASH','UPI','RAZORPAY','NEFT','CHEQUE','SCHOLARSHIP']),
  razorpayOrderId:   z.string().optional(),
  razorpayPaymentId: z.string().optional(),
  transactionRef:    z.string().optional(),
  paymentDate:       z.string().optional(),
});

const announcementSchema = z.object({
  title:        z.string().min(3).max(200),
  body:         z.string().min(10),
  audience:     z.enum(['ALL','STUDENTS','PARENTS','TEACHERS','CLASS']).optional(),
  targetClass:  z.string().optional(),
  sendWhatsapp: z.boolean().optional(),
  sendSms:      z.boolean().optional(),
});

// Overview
router.get('/overview',                                            ctrl.getOverview);

// Students
router.get('/students',                                            ctrl.getStudents);
router.post('/students',       validate(addStudentSchema),         ctrl.addStudent);

// Attendance
router.post('/attendance',     validate(attendanceSchema),         ctrl.markAttendance);
router.get('/attendance',                                          ctrl.getAttendanceSummary);

// Fees
router.get('/fees',                                                ctrl.getFeeOverview);
router.post('/fees/payment',   validate(paymentSchema),            ctrl.recordPayment);
router.post('/fees/reminders',                                     ctrl.sendFeeReminders);

// Timetable
router.get('/timetable/:classId',                                  ctrl.getTimetable);
router.put('/timetable/:classId',                                  ctrl.saveTimetable);

// Results
router.get('/results',                                             ctrl.getResults);

// Announcements
router.get('/announcements',                                       ctrl.getAnnouncements);
router.post('/announcements',  validate(announcementSchema),       ctrl.publishAnnouncement);

// Teachers
router.get('/teachers',                                            ctrl.getTeachers);

// Classes
router.get('/classes',                                             ctrl.getClasses);

module.exports = router;
