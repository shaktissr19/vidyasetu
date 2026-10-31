import { createClient } from 'redis';
import logger = require('../utils/logger');

export const client = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

client.on('error', (err: Error) => logger.error('Redis error:', err));

export async function connectRedis(): Promise<void> {
  await client.connect();
  logger.info('Redis connected');
}

const OTP_TTL_SECONDS = Number.parseInt(process.env.OTP_EXPIRY_MINUTES || '10', 10) * 60;
const OTP_KEY = (mobile: string): string => `otp:${mobile}`;
const LOCKOUT_KEY = (mobile: string): string => `otp_lock:${mobile}`;
const ATTEMPT_KEY = (mobile: string): string => `otp_attempts:${mobile}`;

export async function setOTP(mobile: string, hashedOtp: string): Promise<void> {
  await client.setEx(OTP_KEY(mobile), OTP_TTL_SECONDS, hashedOtp);
}

export async function getOTP(mobile: string): Promise<string | null> {
  return client.get(OTP_KEY(mobile));
}

export async function deleteOTP(mobile: string): Promise<void> {
  await client.del(OTP_KEY(mobile));
}

export async function setLockout(mobile: string, durationSeconds = 3600): Promise<void> {
  await client.setEx(LOCKOUT_KEY(mobile), durationSeconds, '1');
}

export async function isLockedOut(mobile: string): Promise<boolean> {
  const value = await client.get(LOCKOUT_KEY(mobile));
  return value !== null;
}

export async function incrementAttempts(mobile: string): Promise<number> {
  const key = ATTEMPT_KEY(mobile);
  const count = await client.incr(key);
  if (count === 1) await client.expire(key, OTP_TTL_SECONDS);
  return count;
}

export async function resetAttempts(mobile: string): Promise<void> {
  await client.del(ATTEMPT_KEY(mobile));
}

export async function blacklistToken(tokenHash: string, ttlSeconds: number): Promise<void> {
  await client.setEx(`blacklist:${tokenHash}`, ttlSeconds, '1');
}

export async function isTokenBlacklisted(tokenHash: string): Promise<boolean> {
  const value = await client.get(`blacklist:${tokenHash}`);
  return value !== null;
}
