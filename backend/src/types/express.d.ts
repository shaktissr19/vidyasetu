import type { AuthTokenClaims } from '@vidyasetu/contracts';

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenClaims;
    }
  }
}

export {};
