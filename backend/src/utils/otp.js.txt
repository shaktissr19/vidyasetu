// utils/otp.js
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

/**
 * Generate a 6-digit numeric OTP.
 */
function generateOTP() {
  // Cryptographically random, always 6 digits
  const num = crypto.randomInt(100000, 999999);
  return String(num);
}

/**
 * Hash an OTP for storage in Redis.
 */
async function hashOTP(otp) {
  return bcrypt.hash(otp, 8);
}

/**
 * Verify an OTP against its stored hash.
 */
async function verifyOTP(otp, hash) {
  return bcrypt.compare(otp, hash);
}

module.exports = { generateOTP, hashOTP, verifyOTP };
