const crypto = require('crypto');
const { promisify } = require('util');

const scryptAsync = promisify(crypto.scrypt);
const KEY_LENGTH = 64;
const MIN_PASSWORD_LENGTH = 8;

function validatePasswordStrength(password) {
  const value = String(password || '');
  if (value.length < MIN_PASSWORD_LENGTH) return 'Password must be at least 8 characters';
  if (!/[A-Za-z]/.test(value)) return 'Password must contain at least one letter';
  if (!/\d/.test(value)) return 'Password must contain at least one number';
  return null;
}

async function hashPassword(password) {
  const error = validatePasswordStrength(password);
  if (error) throw Object.assign(new Error(error), { statusCode: 400 });

  const salt = crypto.randomBytes(16);
  const derived = await scryptAsync(String(password), salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${Buffer.from(derived).toString('hex')}`;
}

async function verifyPassword(password, storedHash) {
  try {
    const [scheme, saltHex, keyHex] = String(storedHash || '').split('$');
    if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(keyHex, 'hex');
    if (expected.length !== KEY_LENGTH) return false;
    const actual = Buffer.from(await scryptAsync(String(password), salt, KEY_LENGTH));
    return crypto.timingSafeEqual(actual, expected);
  } catch (_) {
    return false;
  }
}

module.exports = {
  MIN_PASSWORD_LENGTH,
  validatePasswordStrength,
  hashPassword,
  verifyPassword,
};
