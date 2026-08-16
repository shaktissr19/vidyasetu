// routes/auth.routes.js
const router = require('express').Router();
const { z } = require('zod');
const ctrl = require('../controllers/auth.controller');
const { validate } = require('../middleware/validate.middleware');
const { authenticate } = require('../middleware/auth.middleware');
const { otpLimiter } = require('../middleware/rateLimit.middleware');

const sendOtpSchema = z.object({
  mobile: z.string().regex(/^\d{10}$/, 'Mobile must be 10 digits'),
});
const verifyOtpSchema = z.object({
  mobile:     z.string().regex(/^\d{10}$/),
  otp:        z.string().length(6, 'OTP must be 6 digits'),
  deviceInfo: z.string().optional(),
});
const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});
const profileSchema = z.object({
  name:         z.string().min(2).max(120).optional(),
  language:     z.enum(['hi','en','ta','te','mr','bn','gu','kn','or']).optional(),
  profilePhoto: z.string().url().optional(),
});

router.post('/send-otp',  otpLimiter, validate(sendOtpSchema),   ctrl.sendOTP);
router.post('/verify-otp',            validate(verifyOtpSchema),  ctrl.verifyOTP);
router.post('/refresh',               validate(refreshSchema),    ctrl.refresh);
router.post('/logout',   authenticate,                            ctrl.logout);
router.patch('/profile', authenticate, validate(profileSchema),   ctrl.updateProfile);
router.get('/me',        authenticate,                            ctrl.getMe);

module.exports = router;
