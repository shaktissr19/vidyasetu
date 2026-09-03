import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/auth.controller';
import { validate } from '../middleware/validate.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { otpLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

const passwordSchema = z.string().min(8).max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain at least one number');

const roleSchema = z.enum(['STUDENT', 'PARENT', 'SCHOOL_ADMIN', 'TEACHER', 'SUPER_ADMIN']);
const studentGradeSchema = z.string().regex(/^(?:PN|NURSERY|LKG|UKG|[1-9]|1[0-2])$/, 'Grade must be Pre-Nursery, Nursery, LKG, UKG or Class 1-12');

const sendOtpSchema = z.object({
  mobile: z.string().regex(/^\d{10}$/, 'Mobile must be 10 digits'),
  role: roleSchema.optional(),
});

const verifyOtpSchema = z.object({
  mobile: z.string().regex(/^\d{10}$/),
  otp: z.string().length(6, 'OTP must be 6 digits'),
  deviceInfo: z.string().max(500).optional(),
  role: roleSchema.optional(),
});

const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(180),
  password: passwordSchema,
  deviceInfo: z.string().max(500).optional(),
});

const registerStudentSchema = z.object({
  name: z.string().trim().min(2).max(120),
  username: z.string().trim().min(3).max(60).regex(/^[A-Za-z0-9._-]+$/).optional().or(z.literal('')),
  email: z.string().email().max(180).optional().or(z.literal('')),
  mobile: z.string().regex(/^\d{10}$/),
  password: passwordSchema,
  language: z.enum(['hi', 'en', 'ta', 'te', 'mr', 'bn', 'gu', 'kn', 'or']).default('hi'),
  gradeLevel: studentGradeSchema,
  schoolId: z.string().uuid().nullable().optional(),
  classId: z.string().uuid().nullable().optional(),
  schoolNote: z.string().max(500).optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).nullable().optional(),
  parentName: z.string().trim().min(2).max(120).optional().or(z.literal('')),
  parentMobile: z.string().regex(/^\d{10}$/).optional().or(z.literal('')),
  parentEmail: z.string().email().max(180).optional().or(z.literal('')),
  parentRelation: z.enum(['FATHER', 'MOTHER', 'GUARDIAN', 'PARENT']).optional(),
  deviceInfo: z.string().max(500).optional(),
}).superRefine((value, ctx) => {
  if (value.schoolId && !value.classId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['classId'], message: 'Class/section is required when a school is selected' });
  }
});

const refreshSchema = z.object({ refreshToken: z.string().min(10) });
const revokeOtherSessionsSchema = z.object({ refreshToken: z.string().min(10) });
const profileSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  username: z.string().trim().min(3).max(60).regex(/^[A-Za-z0-9._-]+$/).optional(),
  email: z.string().email().max(180).nullable().optional(),
  language: z.enum(['hi', 'en', 'ta', 'te', 'mr', 'bn', 'gu', 'kn', 'or']).optional(),
  profilePhoto: z.string().url().optional(),
});
const setPasswordSchema = z.object({ currentPassword: z.string().max(128).nullable().optional(), newPassword: passwordSchema });
const forgotPasswordSchema = z.object({ identifier: z.string().trim().min(3).max(180) });
const resetPasswordSchema = z.object({ identifier: z.string().trim().min(3).max(180), otp: z.string().length(6), newPassword: passwordSchema });

router.get('/student-registration-options', ctrl.getStudentRegistrationOptions);
router.post('/register/student', validate(registerStudentSchema), ctrl.registerStudent);
router.post('/login', validate(loginSchema), ctrl.login);
router.post('/send-otp', otpLimiter, validate(sendOtpSchema), ctrl.sendOTP);
router.post('/verify-otp', validate(verifyOtpSchema), ctrl.verifyOTP);
router.post('/forgot-password', otpLimiter, validate(forgotPasswordSchema), ctrl.forgotPassword);
router.post('/reset-password', validate(resetPasswordSchema), ctrl.resetPassword);
router.post('/refresh', validate(refreshSchema), ctrl.refresh);
router.post('/logout', authenticate, ctrl.logout);
router.get('/sessions', authenticate, ctrl.getSessions);
router.post('/sessions/revoke-others', authenticate, validate(revokeOtherSessionsSchema), ctrl.revokeOtherSessions);
router.patch('/profile', authenticate, validate(profileSchema), ctrl.updateProfile);
router.post('/set-password', authenticate, validate(setPasswordSchema), ctrl.setPassword);
router.get('/me', authenticate, ctrl.getMe);

export = router;