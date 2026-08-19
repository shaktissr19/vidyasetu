import crypto from 'crypto';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import type { AuthTokenClaims } from '@vidyasetu/contracts';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'dev_access_secret_change_me';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_change_me';
const ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
export const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '30d';

type SignableClaims = Omit<AuthTokenClaims, 'iat' | 'exp'>;

export function expiryToSeconds(expiry: string): number {
  const unit = expiry.slice(-1);
  const value = Number.parseInt(expiry.slice(0, -1), 10);
  if (unit === 'd') return value * 86400;
  if (unit === 'h') return value * 3600;
  if (unit === 'm') return value * 60;
  return value;
}

export function signAccessToken(payload: SignableClaims): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: expiryToSeconds(ACCESS_EXPIRY) });
}

export function signRefreshToken(payload: SignableClaims): string {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: expiryToSeconds(REFRESH_EXPIRY) });
}

function asClaims(decoded: string | JwtPayload): AuthTokenClaims {
  if (typeof decoded === 'string') {
    throw new jwt.JsonWebTokenError('Invalid token payload');
  }
  return decoded as AuthTokenClaims;
}

export function verifyAccessToken(token: string): AuthTokenClaims {
  return asClaims(jwt.verify(token, ACCESS_SECRET));
}

export function verifyRefreshToken(token: string): AuthTokenClaims {
  return asClaims(jwt.verify(token, REFRESH_SECRET));
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
