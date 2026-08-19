import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { QueryResultRow } from 'pg';
import type { UserRole, UUID } from '@vidyasetu/contracts';
import { verifyAccessToken, hashToken } from '../utils/jwt';
import { isTokenBlacklisted } from '../config/redis';
import { query } from '../config/db';
import * as R from '../utils/response';

interface SchoolContextRow extends QueryResultRow {
  id: UUID;
}

interface TeacherContextRow extends QueryResultRow {
  school_id: UUID;
  teacher_id: UUID;
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void | Response> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return R.unauthorized(res, 'No token provided');
    }

    const token = header.split(' ')[1];
    if (!token) return R.unauthorized(res, 'No token provided');

    if (await isTokenBlacklisted(hashToken(token))) {
      return R.unauthorized(res, 'Token has been revoked');
    }

    const decoded = verifyAccessToken(token);

    if (!decoded.schoolId && decoded.role === 'SCHOOL_ADMIN') {
      const { rows: [school] } = await query<SchoolContextRow>(
        'SELECT id FROM schools WHERE admin_user_id = $1 LIMIT 1',
        [decoded.userId],
      );
      if (school) decoded.schoolId = school.id;
    }

    if (decoded.role === 'TEACHER') {
      const { rows: [teacher] } = await query<TeacherContextRow>(
        `SELECT t.school_id, t.id AS teacher_id
         FROM teachers t
         WHERE t.user_id = $1 AND t.status IN ('ACTIVE','ON_LEAVE')
         LIMIT 1`,
        [decoded.userId],
      );
      if (!teacher) return R.forbidden(res, 'Teacher profile is inactive or unavailable');
      decoded.schoolId = teacher.school_id;
      decoded.teacherId = teacher.teacher_id;
    }

    req.user = decoded;
    next();
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'TokenExpiredError') {
      return R.unauthorized(res, 'Token expired');
    }
    return R.unauthorized(res, 'Invalid token');
  }
}

export function authorize(...roles: UserRole[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void | Response => {
    if (!req.user) return R.unauthorized(res);
    if (!roles.includes(req.user.role)) {
      return R.forbidden(res, `Role ${req.user.role} is not allowed here`);
    }
    next();
  };
}
