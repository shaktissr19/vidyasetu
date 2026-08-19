import crypto from 'crypto';

const KEY_LENGTH = 64;
export const MIN_PASSWORD_LENGTH = 8;

function deriveScrypt(value: string, salt: Buffer, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(value, salt, keyLength, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(Buffer.from(derivedKey));
    });
  });
}

export function validatePasswordStrength(password: string): string | null {
  const value = String(password || '');
  if (value.length < MIN_PASSWORD_LENGTH) return 'Password must be at least 8 characters';
  if (!/[A-Za-z]/.test(value)) return 'Password must contain at least one letter';
  if (!/\d/.test(value)) return 'Password must contain at least one number';
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const error = validatePasswordStrength(password);
  if (error) throw Object.assign(new Error(error), { statusCode: 400 });

  const salt = crypto.randomBytes(16);
  const derived = await deriveScrypt(String(password), salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string | null | undefined,
): Promise<boolean> {
  try {
    const [scheme, saltHex, keyHex] = String(storedHash || '').split('$');
    if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;

    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(keyHex, 'hex');
    if (expected.length !== KEY_LENGTH) return false;

    const actual = await deriveScrypt(String(password), salt, KEY_LENGTH);
    return crypto.timingSafeEqual(actual, expected);
  } catch (_err: unknown) {
    return false;
  }
}
