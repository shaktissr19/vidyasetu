import rateLimit from 'express-rate-limit';

export const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyGenerator: (req) => {
    const mobile = typeof req.body?.mobile === 'string' ? req.body.mobile : undefined;
    return mobile || req.ip;
  },
  message: {
    success: false,
    error: { code: 'RATE_LIMIT', message: 'Too many OTP requests. Try again in 1 hour.' },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT', message: 'Too many requests. Slow down.' },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.user?.userId || req.ip,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT', message: 'AI request limit reached. Try again in a minute.' },
  },
});
