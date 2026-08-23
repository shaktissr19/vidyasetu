import rateLimit from 'express-rate-limit';

function requestIpKey(req: { ip?: string; socket: { remoteAddress?: string } }): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => {
    const mobile = typeof req.body?.mobile === 'string' ? req.body.mobile : undefined;
    return mobile || requestIpKey(req);
  },
  // Do not burn a user's OTP quota when validation or the SMS provider fails.
  // Successful sends remain limited to five per ten-minute window, while the
  // frontend also enforces the normal 30-second resend cooldown.
  skipFailedRequests: true,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT', message: 'Too many OTP requests. Try again in 10 minutes.' },
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
  keyGenerator: (req) => req.user?.userId || requestIpKey(req),
  message: {
    success: false,
    error: { code: 'RATE_LIMIT', message: 'AI request limit reached. Try again in a minute.' },
  },
});