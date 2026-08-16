// services/auth.service.js
const { query, transaction } = require('../config/db');
const redis = require('../config/redis');
const { generateOTP, hashOTP, verifyOTP } = require('../utils/otp');
const { signAccessToken, signRefreshToken, hashToken, expiryToSeconds, REFRESH_EXPIRY } = require('../utils/jwt');
const notificationService = require('./notification.service');
const logger = require('../utils/logger');

const MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || '3');

/**
 * Step 1 — Send OTP to mobile number.
 * Creates or finds user record, sends SMS.
 */
async function sendOTP(mobile) {
  // Check lockout
  if (await redis.isLockedOut(mobile)) {
    throw Object.assign(new Error('Too many failed attempts. Try again in 1 hour.'), { statusCode: 429 });
  }

  const otp = generateOTP();
  const hash = await hashOTP(otp);

  // Store hashed OTP in Redis
  await redis.setOTP(mobile, hash);
  await redis.resetAttempts(mobile);

  // Send SMS
  await notificationService.sendSMS(mobile, `Your VidyaSetu OTP is ${otp}. Valid for 10 minutes. Do not share.`);

  logger.info(`OTP sent to ${mobile}`);

  // In dev mode, return OTP in response (never in production)
  return process.env.NODE_ENV !== 'production' ? { otp } : {};
}

/**
 * Step 2 — Verify OTP and issue tokens.
 * Auto-creates user if first login.
 */
async function verifyOTPAndLogin(mobile, otp, deviceInfo = null, ipAddress = null) {
  if (await redis.isLockedOut(mobile)) {
    throw Object.assign(new Error('Account locked due to too many failed attempts.'), { statusCode: 429 });
  }

  const storedHash = await redis.getOTP(mobile);
  if (!storedHash) {
    throw Object.assign(new Error('OTP expired or not requested. Please request a new OTP.'), { statusCode: 400 });
  }

  const isValid = await verifyOTP(otp, storedHash);
  if (!isValid) {
    const attempts = await redis.incrementAttempts(mobile);
    if (attempts >= MAX_ATTEMPTS) {
      await redis.setLockout(mobile, 3600);
      await redis.deleteOTP(mobile);
      throw Object.assign(new Error('Too many wrong attempts. Account locked for 1 hour.'), { statusCode: 429 });
    }
    throw Object.assign(
      new Error(`Invalid OTP. ${MAX_ATTEMPTS - attempts} attempt(s) remaining.`),
      { statusCode: 401 }
    );
  }

  // OTP valid — clean up
  await redis.deleteOTP(mobile);
  await redis.resetAttempts(mobile);

  // Find or create user
  let { rows } = await query('SELECT * FROM users WHERE mobile = $1', [mobile]);
  let user = rows[0];
  let isNewUser = false;

  if (!user) {
    const insert = await query(
      `INSERT INTO users (mobile, name, role) VALUES ($1, $2, 'STUDENT') RETURNING *`,
      [mobile, `User ${mobile.slice(-4)}`]
    );
    user = insert.rows[0];
    isNewUser = true;
  }

  if (user.status === 'SUSPENDED') {
    throw Object.assign(new Error('Account suspended. Contact support.'), { statusCode: 403 });
  }

  // Update last login
  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  // Issue tokens
  const tokenPayload = { userId: user.id, role: user.role };

  // Add schoolId for school admins
  if (user.role === 'SCHOOL_ADMIN') {
    const schoolRes = await query('SELECT id FROM schools WHERE admin_user_id = $1 LIMIT 1', [user.id]);
    if (schoolRes.rows[0]) tokenPayload.schoolId = schoolRes.rows[0].id;
  }

  const accessToken  = signAccessToken(tokenPayload);
  const refreshToken = signRefreshToken(tokenPayload);
  const refreshHash  = hashToken(refreshToken);

  // Store refresh token
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, device_info, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + $5::INTERVAL)`,
    [user.id, refreshHash, deviceInfo, ipAddress, REFRESH_EXPIRY]
  );

  logger.info(`Login successful: ${user.id} (${user.role})`);

  return {
    accessToken,
    refreshToken,
    user: {
      id:       user.id,
      name:     user.name,
      mobile:   user.mobile,
      role:     user.role,
      language: user.language,
    },
    isNewUser,
  };
}

/**
 * Update user profile (name, language) — called after first login.
 */
async function updateProfile(userId, { name, language, profilePhoto }) {
  const fields = [];
  const values = [];
  let i = 1;

  if (name)          { fields.push(`name = $${i++}`);           values.push(name); }
  if (language)      { fields.push(`language = $${i++}`);       values.push(language); }
  if (profilePhoto)  { fields.push(`profile_photo = $${i++}`);  values.push(profilePhoto); }

  if (!fields.length) return;

  values.push(userId);
  const { rows } = await query(
    `UPDATE users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING id, name, language, profile_photo`,
    values
  );
  return rows[0];
}

/**
 * Refresh access token using a valid refresh token.
 */
async function refreshAccessToken(refreshToken) {
  const { verifyRefreshToken } = require('../utils/jwt');
  const { isTokenBlacklisted } = require('../config/redis');

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw Object.assign(new Error('Invalid or expired refresh token'), { statusCode: 401 });
  }

  const hash = hashToken(refreshToken);

  if (await isTokenBlacklisted(hash)) {
    throw Object.assign(new Error('Refresh token has been revoked'), { statusCode: 401 });
  }

  const { rows } = await query(
    `SELECT id FROM refresh_tokens WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
    [hash]
  );
  if (!rows.length) {
    throw Object.assign(new Error('Refresh token not found or expired'), { statusCode: 401 });
  }

  const newAccessToken = signAccessToken({
    userId: decoded.userId,
    role:   decoded.role,
    ...(decoded.schoolId ? { schoolId: decoded.schoolId } : {}),
  });

  return { accessToken: newAccessToken };
}

/**
 * Logout — revoke refresh token.
 */
async function logout(refreshToken, accessToken) {
  const hash = hashToken(refreshToken);
  await query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1`, [hash]);

  // Blacklist the access token for its remaining lifetime
  const { verifyAccessToken } = require('../utils/jwt');
  try {
    const decoded = verifyAccessToken(accessToken);
    const remainingTTL = decoded.exp - Math.floor(Date.now() / 1000);
    if (remainingTTL > 0) {
      const accessHash = hashToken(accessToken);
      await redis.blacklistToken(accessHash, remainingTTL);
    }
  } catch { /* token may already be expired — that's fine */ }
}

module.exports = { sendOTP, verifyOTPAndLogin, updateProfile, refreshAccessToken, logout };
