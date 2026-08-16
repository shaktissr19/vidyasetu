// middleware/rateLimit.middleware.js
const rateLimit = require('express-rate-limit');

// OTP send: max 3 per mobile per hour
const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyGenerator: (req) => req.body?.mobile || req.ip,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many OTP requests. Try again in 1 hour.' } },
  standardHeaders: true,
  legacyHeaders: false,
});

// General API: 100 req/min per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many requests. Slow down.' } },
  standardHeaders: true,
  legacyHeaders: false,
});

// AI tutor: 20 req/min per user
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.user?.userId || req.ip,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'AI request limit reached. Try again in a minute.' } },
});

module.exports = { otpLimiter, apiLimiter, aiLimiter };
