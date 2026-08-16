const { createClient } = require('redis');
const logger = require('../utils/logger');

const client = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });

client.on('error', (err) => logger.error('Redis error:', err));

async function connectRedis() {
  await client.connect();
  logger.info('Redis connected');
}

// ── OTP helpers ────────────────────────────────────────────

const OTP_TTL_SECONDS = parseInt(process.env.OTP_EXPIRY_MINUTES || '10') * 60;
const OTP_KEY = (mobile) => `otp:${mobile}`;
const LOCKOUT_KEY = (mobile) => `otp_lock:${mobile}`;

async function setOTP(mobile, hashedOtp) {
  await client.setEx(OTP_KEY(mobile), OTP_TTL_SECONDS, hashedOtp);
}

async function getOTP(mobile) {
  return client.get(OTP_KEY(mobile));
}

async function deleteOTP(mobile) {
  await client.del(OTP_KEY(mobile));
}

async function setLockout(mobile, durationSeconds = 3600) {
  await client.setEx(LOCKOUT_KEY(mobile), durationSeconds, '1');
}

async function isLockedOut(mobile) {
  const val = await client.get(LOCKOUT_KEY(mobile));
  return val !== null;
}

// ── Attempt counter ────────────────────────────────────────

const ATTEMPT_KEY = (mobile) => `otp_attempts:${mobile}`;

async function incrementAttempts(mobile) {
  const key = ATTEMPT_KEY(mobile);
  const count = await client.incr(key);
  if (count === 1) await client.expire(key, OTP_TTL_SECONDS);
  return count;
}

async function resetAttempts(mobile) {
  await client.del(ATTEMPT_KEY(mobile));
}

// ── Refresh token blacklist ────────────────────────────────

async function blacklistToken(tokenHash, ttlSeconds) {
  await client.setEx(`blacklist:${tokenHash}`, ttlSeconds, '1');
}

async function isTokenBlacklisted(tokenHash) {
  const val = await client.get(`blacklist:${tokenHash}`);
  return val !== null;
}

module.exports = {
  client,
  connectRedis,
  setOTP,
  getOTP,
  deleteOTP,
  setLockout,
  isLockedOut,
  incrementAttempts,
  resetAttempts,
  blacklistToken,
  isTokenBlacklisted,
};
