// services/auth.service.js
const { query, transaction } = require('../config/db');
const redis = require('../config/redis');
const { generateOTP, hashOTP, verifyOTP } = require('../utils/otp');
const { hashPassword, verifyPassword } = require('../utils/password');
const { signAccessToken, signRefreshToken, hashToken, REFRESH_EXPIRY } = require('../utils/jwt');
const notificationService = require('./notification.service');
const logger = require('../utils/logger');

const MAX_OTP_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || '3', 10);
const MAX_PASSWORD_ATTEMPTS = 5;
const PASSWORD_LOCK_MINUTES = 15;

function normalizeUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 60);
}

function usernameBaseFromName(name) {
  const parts = String(name || 'student')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'student';
  if (parts.length === 1) return normalizeUsername(parts[0]);
  return normalizeUsername(`${parts[0]}.${parts[parts.length - 1]}`);
}

async function chooseUsername(db, name, requestedUsername) {
  const requested = normalizeUsername(requestedUsername);
  if (requestedUsername && requested.length < 3) {
    throw Object.assign(new Error('Username must be at least 3 characters'), { statusCode: 400 });
  }

  const base = requested || usernameBaseFromName(name) || 'student';
  const exists = async candidate => {
    const { rows } = await db.query('SELECT 1 FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1', [candidate]);
    return rows.length > 0;
  };

  if (!(await exists(base))) return base;
  if (requested) {
    throw Object.assign(new Error('Username is already taken'), { statusCode: 409 });
  }

  for (let suffix = 2; suffix <= 9999; suffix += 1) {
    const candidate = `${base}.${suffix}`.slice(0, 60);
    if (!(await exists(candidate))) return candidate;
  }
  throw Object.assign(new Error('Could not allocate a username. Please choose one.'), { statusCode: 409 });
}

async function getUserByIdentifier(identifier) {
  const value = String(identifier || '').trim();
  const { rows } = await query(
    `SELECT DISTINCT u.*
     FROM users u
     LEFT JOIN students s ON s.user_id = u.id
     WHERE LOWER(u.username) = LOWER($1)
        OR LOWER(COALESCE(u.email, '')) = LOWER($1)
        OR u.mobile = $1
        OR UPPER(COALESCE(s.student_code, '')) = UPPER($1)
     LIMIT 1`,
    [value]
  );
  return rows[0] || null;
}

async function issueSession(user, deviceInfo = null, ipAddress = null) {
  const tokenPayload = { userId: user.id, role: user.role };

  if (user.role === 'SCHOOL_ADMIN') {
    const schoolRes = await query('SELECT id FROM schools WHERE admin_user_id = $1 LIMIT 1', [user.id]);
    if (schoolRes.rows[0]) tokenPayload.schoolId = schoolRes.rows[0].id;
  }

  const accessToken = signAccessToken(tokenPayload);
  const refreshToken = signRefreshToken(tokenPayload);
  const refreshHash = hashToken(refreshToken);

  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, device_info, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + $5::INTERVAL)`,
    [user.id, refreshHash, deviceInfo, ipAddress, REFRESH_EXPIRY]
  );

  const { rows: [student] } = user.role === 'STUDENT'
    ? await query('SELECT student_code, school_link_status FROM students WHERE user_id = $1', [user.id])
    : { rows: [null] };

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      mobile: user.mobile,
      role: user.role,
      language: user.language,
      studentCode: student?.student_code || null,
      schoolLinkStatus: student?.school_link_status || null,
      mustChangePassword: !!user.must_change_password,
    },
  };
}

async function claimPendingParentLinks(user) {
  if (!user || user.role !== 'PARENT') return 0;
  return transaction(async client => {
    const { rows: requests } = await client.query(
      `SELECT * FROM parent_link_requests
       WHERE status = 'PENDING'
         AND (
           (parent_user_id = $1)
           OR (parent_mobile IS NOT NULL AND parent_mobile = $2)
           OR (parent_email IS NOT NULL AND LOWER(parent_email) = LOWER($3))
         )
       FOR UPDATE`,
      [user.id, user.mobile || '', user.email || '']
    );

    for (const request of requests) {
      await client.query(
        `INSERT INTO parent_student_links (parent_user_id, student_id, relation, is_primary)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (parent_user_id, student_id) DO UPDATE
           SET relation = EXCLUDED.relation`,
        [user.id, request.student_id, request.relation || 'PARENT']
      );
      await client.query(
        `UPDATE parent_link_requests
         SET parent_user_id = $1, status = 'APPROVED', claimed_at = NOW(), reviewed_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [user.id, request.id]
      );
    }
    return requests.length;
  });
}

async function consumeOTP(mobile, otp) {
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
    if (attempts >= MAX_OTP_ATTEMPTS) {
      await redis.setLockout(mobile, 3600);
      await redis.deleteOTP(mobile);
      throw Object.assign(new Error('Too many wrong attempts. Account locked for 1 hour.'), { statusCode: 429 });
    }
    throw Object.assign(new Error(`Invalid OTP. ${MAX_OTP_ATTEMPTS - attempts} attempt(s) remaining.`), { statusCode: 401 });
  }

  await redis.deleteOTP(mobile);
  await redis.resetAttempts(mobile);
}

/** Step 1 — send mobile OTP. */
async function sendOTP(mobile) {
  if (await redis.isLockedOut(mobile)) {
    throw Object.assign(new Error('Too many failed attempts. Try again in 1 hour.'), { statusCode: 429 });
  }

  const otp = generateOTP();
  const hash = await hashOTP(otp);
  await redis.setOTP(mobile, hash);
  await redis.resetAttempts(mobile);
  await notificationService.sendSMS(mobile, `Your VidyaSetu OTP is ${otp}. Valid for 10 minutes. Do not share.`);
  logger.info(`OTP sent to ${mobile}`);
  return process.env.NODE_ENV !== 'production' ? { otp } : {};
}

/** OTP login remains an alternate/recovery login method. */
async function verifyOTPAndLogin(mobile, otp, deviceInfo = null, ipAddress = null) {
  await consumeOTP(mobile, otp);

  let { rows } = await query('SELECT * FROM users WHERE mobile = $1', [mobile]);
  let user = rows[0];
  let isNewUser = false;

  if (!user) {
    const username = await transaction(async client => chooseUsername(client, `Student ${mobile.slice(-4)}`, null));
    const insert = await query(
      `INSERT INTO users (mobile, name, username, role)
       VALUES ($1, $2, $3, 'STUDENT') RETURNING *`,
      [mobile, `Student ${mobile.slice(-4)}`, username]
    );
    user = insert.rows[0];
    isNewUser = true;
  }

  if (user.status === 'SUSPENDED') {
    throw Object.assign(new Error('Account suspended. Contact support.'), { statusCode: 403 });
  }

  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
  await claimPendingParentLinks(user);
  const session = await issueSession(user, deviceInfo, ipAddress);
  logger.info(`OTP login successful: ${user.id} (${user.role})`);
  return { ...session, isNewUser };
}

/** Password login using username, email, mobile or Student ID. */
async function loginWithPassword(identifier, password, deviceInfo = null, ipAddress = null) {
  const user = await getUserByIdentifier(identifier);
  if (!user) {
    throw Object.assign(new Error('Invalid username/email/Student ID or password'), { statusCode: 401 });
  }
  if (user.status === 'SUSPENDED') {
    throw Object.assign(new Error('Account suspended. Contact support.'), { statusCode: 403 });
  }
  if (user.password_locked_until && new Date(user.password_locked_until).getTime() > Date.now()) {
    throw Object.assign(new Error('Too many failed password attempts. Try again later or use OTP.'), { statusCode: 429 });
  }
  if (!user.password_hash) {
    throw Object.assign(new Error('Password is not set for this account. Use OTP once and set a password from your profile.'), { statusCode: 409 });
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    const nextAttempts = Number(user.password_failed_attempts || 0) + 1;
    const shouldLock = nextAttempts >= MAX_PASSWORD_ATTEMPTS;
    await query(
      `UPDATE users
       SET password_failed_attempts = $2,
           password_locked_until = CASE WHEN $3 THEN NOW() + ($4 || ' minutes')::INTERVAL ELSE password_locked_until END
       WHERE id = $1`,
      [user.id, shouldLock ? 0 : nextAttempts, shouldLock, String(PASSWORD_LOCK_MINUTES)]
    );
    throw Object.assign(new Error(shouldLock
      ? `Too many failed password attempts. Account locked for ${PASSWORD_LOCK_MINUTES} minutes.`
      : 'Invalid username/email/Student ID or password'), { statusCode: 401 });
  }

  await query(
    `UPDATE users
     SET password_failed_attempts = 0, password_locked_until = NULL, last_login_at = NOW()
     WHERE id = $1`,
    [user.id]
  );
  await claimPendingParentLinks(user);
  const session = await issueSession(user, deviceInfo, ipAddress);
  logger.info(`Password login successful: ${user.id} (${user.role})`);
  return session;
}

/** Public Student registration with optional school and parent integration. */
async function registerStudent(data, deviceInfo = null, ipAddress = null) {
  const result = await transaction(async client => {
    const mobile = String(data.mobile || '').trim();
    const email = data.email ? String(data.email).trim().toLowerCase() : null;

    const { rows: duplicateMobile } = await client.query('SELECT id FROM users WHERE mobile = $1 LIMIT 1', [mobile]);
    if (duplicateMobile.length) throw Object.assign(new Error('This mobile number is already registered'), { statusCode: 409 });
    if (email) {
      const { rows: duplicateEmail } = await client.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
      if (duplicateEmail.length) throw Object.assign(new Error('This email is already registered'), { statusCode: 409 });
    }

    const username = await chooseUsername(client, data.name, data.username);
    const passwordHash = await hashPassword(data.password);

    let school = null;
    let schoolClass = null;
    if (data.schoolId) {
      const { rows: schoolRows } = await client.query(
        `SELECT id, name, academic_year FROM schools WHERE id = $1 AND status = 'ACTIVE'`,
        [data.schoolId]
      );
      school = schoolRows[0];
      if (!school) throw Object.assign(new Error('Selected school is not active'), { statusCode: 400 });

      if (!data.classId) throw Object.assign(new Error('Select a class/section for the school request'), { statusCode: 400 });
      const { rows: classRows } = await client.query(
        `SELECT id, school_id, class_name, section, academic_year
         FROM school_classes WHERE id = $1 AND school_id = $2`,
        [data.classId, data.schoolId]
      );
      schoolClass = classRows[0];
      if (!schoolClass) throw Object.assign(new Error('Selected class does not belong to the selected school'), { statusCode: 400 });
    }

    const gradeLevel = String(data.gradeLevel || schoolClass?.class_name || '').trim();
    if (!gradeLevel) throw Object.assign(new Error('Class/grade is required'), { statusCode: 400 });

    const { rows: [user] } = await client.query(
      `INSERT INTO users
         (mobile, name, username, email, password_hash, password_changed_at, role, status, language)
       VALUES ($1, $2, $3, $4, $5, NOW(), 'STUDENT', 'ACTIVE', $6)
       RETURNING *`,
      [mobile, data.name.trim(), username, email, passwordHash, data.language || 'hi']
    );

    const parentMobile = data.parentMobile ? String(data.parentMobile).trim() : null;
    const parentEmail = data.parentEmail ? String(data.parentEmail).trim().toLowerCase() : null;

    const { rows: [student] } = await client.query(
      `INSERT INTO students
         (user_id, school_id, class_id, grade_level, school_link_status, academic_year,
          date_of_birth, gender, primary_parent_mobile)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        user.id,
        school?.id || null,
        schoolClass?.id || null,
        gradeLevel,
        school ? 'PENDING' : 'NOT_REQUESTED',
        schoolClass?.academic_year || school?.academic_year || data.academicYear || '2026-27',
        data.dateOfBirth || null,
        data.gender || null,
        parentMobile,
      ]
    );

    let schoolRequest = null;
    if (school) {
      const { rows: [request] } = await client.query(
        `INSERT INTO student_school_requests
           (student_id, requested_school_id, requested_class_id, requested_grade, student_note)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, status, requested_at`,
        [student.id, school.id, schoolClass.id, gradeLevel, data.schoolNote || null]
      );
      schoolRequest = request;
    }

    let parentLinkStatus = 'NOT_PROVIDED';
    if (parentMobile || parentEmail) {
      const { rows: parentRows } = await client.query(
        `SELECT * FROM users
         WHERE role = 'PARENT'
           AND ((NULLIF($1, '') IS NOT NULL AND mobile = $1)
             OR (NULLIF($2, '') IS NOT NULL AND LOWER(COALESCE(email, '')) = LOWER($2)))
         LIMIT 1`,
        [parentMobile || '', parentEmail || '']
      );
      const parent = parentRows[0];
      if (parent) {
        await client.query(
          `INSERT INTO parent_student_links (parent_user_id, student_id, relation, is_primary)
           VALUES ($1, $2, $3, TRUE)
           ON CONFLICT (parent_user_id, student_id) DO NOTHING`,
          [parent.id, student.id, data.parentRelation || 'PARENT']
        );
        parentLinkStatus = 'APPROVED';
      } else {
        await client.query(
          `INSERT INTO parent_link_requests
             (student_id, parent_name, parent_mobile, parent_email, relation, status)
           VALUES ($1, $2, $3, $4, $5, 'PENDING')`,
          [student.id, data.parentName || null, parentMobile, parentEmail, data.parentRelation || 'PARENT']
        );
        parentLinkStatus = 'PENDING';
      }
    }

    return {
      user,
      student,
      schoolRequest,
      parentLinkStatus,
      schoolName: school?.name || null,
      classLabel: schoolClass ? `${schoolClass.class_name}-${schoolClass.section}` : gradeLevel,
    };
  });

  const session = await issueSession(result.user, deviceInfo, ipAddress);
  return {
    ...session,
    student: {
      id: result.student.id,
      studentCode: result.student.student_code,
      gradeLevel: result.student.grade_level,
      schoolLinkStatus: result.student.school_link_status,
      schoolName: result.schoolName,
      classLabel: result.classLabel,
    },
    schoolRequest: result.schoolRequest,
    parentLinkStatus: result.parentLinkStatus,
  };
}

async function updateProfile(userId, { name, language, profilePhoto, email, username }) {
  const fields = [];
  const values = [];
  let i = 1;

  if (name) { fields.push(`name = $${i++}`); values.push(name); }
  if (language) { fields.push(`language = $${i++}`); values.push(language); }
  if (profilePhoto) { fields.push(`profile_photo = $${i++}`); values.push(profilePhoto); }
  if (email !== undefined) {
    const normalized = email ? String(email).trim().toLowerCase() : null;
    if (normalized) {
      const { rows } = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2 LIMIT 1', [normalized, userId]);
      if (rows.length) throw Object.assign(new Error('Email is already in use'), { statusCode: 409 });
    }
    fields.push(`email = $${i++}`); values.push(normalized);
  }
  if (username) {
    const normalized = normalizeUsername(username);
    if (normalized.length < 3) throw Object.assign(new Error('Username must be at least 3 characters'), { statusCode: 400 });
    const { rows } = await query('SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id <> $2 LIMIT 1', [normalized, userId]);
    if (rows.length) throw Object.assign(new Error('Username is already taken'), { statusCode: 409 });
    fields.push(`username = $${i++}`); values.push(normalized);
  }

  if (!fields.length) return null;
  values.push(userId);
  const { rows } = await query(
    `UPDATE users SET ${fields.join(', ')}, updated_at = NOW()
     WHERE id = $${i}
     RETURNING id, name, username, email, mobile, role, language, profile_photo`,
    values
  );
  return rows[0];
}

async function setPassword(userId, currentPassword, newPassword) {
  const { rows: [user] } = await query('SELECT id, password_hash FROM users WHERE id = $1', [userId]);
  if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });

  if (user.password_hash) {
    const valid = await verifyPassword(currentPassword, user.password_hash);
    if (!valid) throw Object.assign(new Error('Current password is incorrect'), { statusCode: 401 });
  }

  const passwordHash = await hashPassword(newPassword);
  await query(
    `UPDATE users
     SET password_hash = $2, password_changed_at = NOW(), must_change_password = FALSE,
         password_failed_attempts = 0, password_locked_until = NULL, updated_at = NOW()
     WHERE id = $1`,
    [userId, passwordHash]
  );
  return { changed: true };
}

async function sendPasswordResetOTP(identifier) {
  const user = await getUserByIdentifier(identifier);
  if (!user || !user.mobile) {
    throw Object.assign(new Error('No recoverable account was found for that identifier'), { statusCode: 404 });
  }
  const result = await sendOTP(user.mobile);
  const maskedMobile = `${'*'.repeat(Math.max(0, user.mobile.length - 4))}${user.mobile.slice(-4)}`;
  return { maskedMobile, ...result };
}

async function resetPasswordWithOTP(identifier, otp, newPassword) {
  const user = await getUserByIdentifier(identifier);
  if (!user || !user.mobile) throw Object.assign(new Error('Account not found'), { statusCode: 404 });
  await consumeOTP(user.mobile, otp);
  const passwordHash = await hashPassword(newPassword);
  await query(
    `UPDATE users
     SET password_hash = $2, password_changed_at = NOW(), must_change_password = FALSE,
         password_failed_attempts = 0, password_locked_until = NULL, updated_at = NOW()
     WHERE id = $1`,
    [user.id, passwordHash]
  );
  return { reset: true };
}

async function refreshAccessToken(refreshToken) {
  const { verifyRefreshToken } = require('../utils/jwt');
  const { isTokenBlacklisted } = require('../config/redis');
  let decoded;
  try { decoded = verifyRefreshToken(refreshToken); }
  catch (_) { throw Object.assign(new Error('Invalid or expired refresh token'), { statusCode: 401 }); }

  const hash = hashToken(refreshToken);
  if (await isTokenBlacklisted(hash)) {
    throw Object.assign(new Error('Refresh token has been revoked'), { statusCode: 401 });
  }
  const { rows } = await query(
    `SELECT id FROM refresh_tokens WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
    [hash]
  );
  if (!rows.length) throw Object.assign(new Error('Refresh token not found or expired'), { statusCode: 401 });

  const newAccessToken = signAccessToken({
    userId: decoded.userId,
    role: decoded.role,
    ...(decoded.schoolId ? { schoolId: decoded.schoolId } : {}),
  });
  return { accessToken: newAccessToken };
}

async function logout(refreshToken, accessToken) {
  const hash = hashToken(refreshToken);
  await query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1`, [hash]);
  const { verifyAccessToken } = require('../utils/jwt');
  try {
    const decoded = verifyAccessToken(accessToken);
    const remainingTTL = decoded.exp - Math.floor(Date.now() / 1000);
    if (remainingTTL > 0) {
      const accessHash = hashToken(accessToken);
      await redis.blacklistToken(accessHash, remainingTTL);
    }
  } catch (_) {}
}

module.exports = {
  normalizeUsername,
  sendOTP,
  verifyOTPAndLogin,
  loginWithPassword,
  registerStudent,
  updateProfile,
  setPassword,
  sendPasswordResetOTP,
  resetPasswordWithOTP,
  refreshAccessToken,
  logout,
  claimPendingParentLinks,
};
