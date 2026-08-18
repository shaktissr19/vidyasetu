// controllers/auth.controller.js
const authService = require('../services/auth.service');
const { query } = require('../config/db');
const R = require('../utils/response');

async function sendOTP(req, res, next) {
  try {
    const result = await authService.sendOTP(req.body.mobile);
    return R.ok(res, { message: 'OTP sent successfully', ...result });
  } catch (err) { next(err); }
}

async function verifyOTP(req, res, next) {
  try {
    const { mobile, otp, deviceInfo, role } = req.body;
    if (role) {
      const { rows: [existing] } = await query('SELECT role FROM users WHERE mobile = $1', [mobile]);
      if (existing && existing.role !== role) {
        return R.forbidden(res, `This mobile number belongs to a ${existing.role.replaceAll('_', ' ').toLowerCase()} account`);
      }
      if (!existing && role !== 'STUDENT') {
        return R.badRequest(res, 'No registered account exists for this role and mobile number');
      }
    }
    const result = await authService.verifyOTPAndLogin(mobile, otp, deviceInfo || null, req.ip);
    return R.ok(res, result);
  } catch (err) { next(err); }
}

async function login(req, res, next) {
  try {
    const { identifier, password, deviceInfo } = req.body;
    const result = await authService.loginWithPassword(identifier, password, deviceInfo || null, req.ip);
    return R.ok(res, result);
  } catch (err) { next(err); }
}

async function registerStudent(req, res, next) {
  try {
    const result = await authService.registerStudent(req.body, req.body.deviceInfo || null, req.ip);
    return R.created(res, result);
  } catch (err) { next(err); }
}

async function getStudentRegistrationOptions(req, res, next) {
  try {
    const { rows: schools } = await query(
      `SELECT s.id, s.name, s.name_hi, s.city, s.district, s.state, s.udise_code, s.academic_year,
              COALESCE(
                JSON_AGG(
                  JSON_BUILD_OBJECT(
                    'id', sc.id,
                    'className', sc.class_name,
                    'section', sc.section,
                    'label', sc.class_name || '-' || sc.section,
                    'academicYear', sc.academic_year
                  ) ORDER BY sc.class_name, sc.section
                ) FILTER (WHERE sc.id IS NOT NULL),
                '[]'::json
              ) AS classes
       FROM schools s
       LEFT JOIN school_classes sc ON sc.school_id = s.id
       WHERE s.status = 'ACTIVE'
       GROUP BY s.id
       ORDER BY s.name`,
      []
    );
    return R.ok(res, { schools, gradeLevels: ['1','2','3','4','5','6','7','8','9','10','11','12'] });
  } catch (err) { next(err); }
}

async function refresh(req, res, next) {
  try {
    const result = await authService.refreshAccessToken(req.body.refreshToken);
    return R.ok(res, result);
  } catch (err) { next(err); }
}

async function logout(req, res, next) {
  try {
    const refreshToken = req.body.refreshToken;
    const accessToken = req.headers.authorization?.split(' ')[1];
    if (refreshToken) await authService.logout(refreshToken, accessToken);
    return R.ok(res, { message: 'Logged out successfully' });
  } catch (err) { next(err); }
}

async function updateProfile(req, res, next) {
  try {
    const updated = await authService.updateProfile(req.user.userId, req.body);
    return R.ok(res, updated);
  } catch (err) { next(err); }
}

async function setPassword(req, res, next) {
  try {
    const result = await authService.setPassword(req.user.userId, req.body.currentPassword || null, req.body.newPassword);
    return R.ok(res, result);
  } catch (err) { next(err); }
}

async function forgotPassword(req, res, next) {
  try {
    const result = await authService.sendPasswordResetOTP(req.body.identifier);
    return R.ok(res, result);
  } catch (err) { next(err); }
}

async function resetPassword(req, res, next) {
  try {
    const result = await authService.resetPasswordWithOTP(req.body.identifier, req.body.otp, req.body.newPassword);
    return R.ok(res, result);
  } catch (err) { next(err); }
}

async function getMe(req, res, next) {
  try {
    const { rows: [user] } = await query(
      `SELECT u.id, u.name, u.username, u.email, u.mobile, u.role, u.status, u.language,
              u.profile_photo, u.last_login_at, u.must_change_password,
              s.student_code, s.grade_level, s.school_link_status,
              s.roll_number, s.academic_year,
              sch.name AS school_name, sc.class_name, sc.section
       FROM users u
       LEFT JOIN students s ON s.user_id = u.id
       LEFT JOIN schools sch ON sch.id = s.school_id
       LEFT JOIN school_classes sc ON sc.id = s.class_id
       WHERE u.id = $1`,
      [req.user.userId]
    );
    if (!user) return R.notFound(res, 'User not found');
    return R.ok(res, user);
  } catch (err) { next(err); }
}

module.exports = {
  sendOTP,
  verifyOTP,
  login,
  registerStudent,
  getStudentRegistrationOptions,
  refresh,
  logout,
  updateProfile,
  setPassword,
  forgotPassword,
  resetPassword,
  getMe,
};
