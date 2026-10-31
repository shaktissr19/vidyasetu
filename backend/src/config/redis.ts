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
const PLATFORM_ADMIN_LOGIN_TTL_SECONDS = 10 * 60;
const OTP_KEY = (mobile: string): string => `otp:${mobile}`;
const LOCKOUT_KEY = (mobile: string): string => `otp_lock:${mobile}`;
const ATTEMPT_KEY = (mobile: string): string => `otp_attempts:${mobile}`;
const PLATFORM_ADMIN_CHALLENGE_KEY = (challengeId: string): string => `platform_admin_login:${challengeId}`;
const PLATFORM_ADMIN_USER_CHALLENGE_KEY = (userId: string): string => `platform_admin_login_user:${userId}`;

export interface PlatformAdminLoginChallenge {
  userId: string;
  mobile: string;
  otpHash: string;
}

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

export async function setPlatformAdminLoginChallenge(challengeId: string, challenge: PlatformAdminLoginChallenge): Promise<void> {
  const userChallengeKey = PLATFORM_ADMIN_USER_CHALLENGE_KEY(challenge.userId);
  const previousChallengeId = await client.get(userChallengeKey);
  if (previousChallengeId) {
    await client.del(PLATFORM_ADMIN_CHALLENGE_KEY(previousChallengeId));
    await client.del(`platform_admin_login_attempts:${previousChallengeId}`);
  }
  await client.setEx(PLATFORM_ADMIN_CHALLENGE_KEY(challengeId), PLATFORM_ADMIN_LOGIN_TTL_SECONDS, JSON.stringify(challenge));
  await client.setEx(userChallengeKey, PLATFORM_ADMIN_LOGIN_TTL_SECONDS, challengeId);
}

export async function getPlatformAdminLoginChallenge(challengeId: string): Promise<PlatformAdminLoginChallenge | null> {
  const value = await client.get(PLATFORM_ADMIN_CHALLENGE_KEY(challengeId));
  if (!value) return null;
  try {
    const challenge = JSON.parse(value) as PlatformAdminLoginChallenge;
    return typeof challenge.userId === 'string' && typeof challenge.mobile === 'string'
      && typeof challenge.otpHash === 'string' ? challenge : null;
  } catch {
    return null;
  }
}

export async function incrementPlatformAdminLoginAttempts(challengeId: string): Promise<number> {
  const key = `platform_admin_login_attempts:${challengeId}`;
  const count = await client.incr(key);
  if (count === 1) await client.expire(key, PLATFORM_ADMIN_LOGIN_TTL_SECONDS);
  return count;
}

export async function isCurrentPlatformAdminLoginChallenge(challengeId: string, userId: string): Promise<boolean> {
  return (await client.get(PLATFORM_ADMIN_USER_CHALLENGE_KEY(userId))) === challengeId;
}

export async function deletePlatformAdminLoginChallenge(challengeId: string, userId: string): Promise<void> {
  await client.del(PLATFORM_ADMIN_CHALLENGE_KEY(challengeId));
  await client.del(`platform_admin_login_attempts:${challengeId}`);
  const currentChallengeId = await client.get(PLATFORM_ADMIN_USER_CHALLENGE_KEY(userId));
  if (currentChallengeId === challengeId) await client.del(PLATFORM_ADMIN_USER_CHALLENGE_KEY(userId));
}

export async function blacklistToken(tokenHash: string, ttlSeconds: number): Promise<void> {
  await client.setEx(`blacklist:${tokenHash}`, ttlSeconds, '1');
}

export async function isTokenBlacklisted(tokenHash: string): Promise<boolean> {
  const value = await client.get(`blacklist:${tokenHash}`);
  return value !== null;
}
