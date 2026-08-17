// utils/otp.js
const crypto = require('crypto');
const { promisify } = require('util');

const scryptAsync = promisify(crypto.scrypt);
const KEY_LENGTH = 32;

/**
 * Generate a 6-digit numeric OTP.
 */
function generateOTP() {
  // randomInt upper bound is exclusive, so 1,000,000 keeps 999999 reachable.
  return String(crypto.randomInt(100000, 1000000));
}

/**
 * Hash an OTP for short-lived Redis storage using Node's built-in scrypt.
 * Stored format: scrypt$<salt-hex>$<derived-key-hex>
 */
async function hashOTP(otp) {
  const salt = crypto.randomBytes(16);
  const derived = await scryptAsync(String(otp), salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${Buffer.from(derived).toString('hex')}`;
}

/**
 * Verify an OTP against its stored scrypt hash using constant-time comparison.
 */
async function verifyOTP(otp, storedHash) {
  try {
    const [scheme, saltHex, keyHex] = String(storedHash || '').split('$');
    if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;

    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(keyHex, 'hex');
    if (expected.length !== KEY_LENGTH) return false;

    const actual = Buffer.from(await scryptAsync(String(otp), salt, KEY_LENGTH));
    return crypto.timingSafeEqual(actual, expected);
  } catch (_) {
    return false;
  }
}

module.exports = { generateOTP, hashOTP, verifyOTP };
