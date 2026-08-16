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
    const { mobile, otp, deviceInfo } = req.body;
    const result = await authService.verifyOTPAndLogin(
      mobile, otp, deviceInfo || null, req.ip
    );
    return R.ok(res, result);
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
    const accessToken  = req.headers.authorization?.split(' ')[1];
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

async function getMe(req, res, next) {
  try {
    const { rows: [user] } = await query(
      `SELECT id, name, mobile, role, language, profile_photo, last_login_at FROM users WHERE id = $1`,
      [req.user.userId]
    );
    if (!user) return R.notFound(res, 'User not found');
    return R.ok(res, user);
  } catch (err) { next(err); }
}

module.exports = { sendOTP, verifyOTP, refresh, logout, updateProfile, getMe };
