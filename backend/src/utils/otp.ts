import crypto from 'crypto';

const KEY_LENGTH = 32;

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

export function generateOTP(): string {
  // randomInt upper bound is exclusive, so 1,000,000 keeps 999999 reachable.
  return String(crypto.randomInt(100000, 1000000));
}

export async function hashOTP(otp: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derived = await deriveScrypt(String(otp), salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyOTP(
  otp: string,
  storedHash: string | null | undefined,
): Promise<boolean> {
  try {
    const [scheme, saltHex, keyHex] = String(storedHash || '').split('$');
    if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;

    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(keyHex, 'hex');
    if (expected.length !== KEY_LENGTH) return false;

    const actual = await deriveScrypt(String(otp), salt, KEY_LENGTH);
    return crypto.timingSafeEqual(actual, expected);
  } catch (_err: unknown) {
    return false;
  }
}
