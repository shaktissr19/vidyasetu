import type { NextFunction, Request, Response } from 'express';
import type { UUID } from '@vidyasetu/contracts';
import * as attendance from '../services/attendanceGovernance.service';
import * as R from '../utils/response';

function schoolId(req: Request): UUID | null {
  const value = req.user?.schoolId || (req.user?.role === 'SUPER_ADMIN' && typeof req.query.schoolId === 'string' ? req.query.schoolId : undefined);
  return value || null;
}
function actor(req: Request): UUID | null { return req.user?.userId || null; }

export async function roster(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const sid = schoolId(req);
    const classId = typeof req.query.classId === 'string' ? req.query.classId : '';
    const date = typeof req.query.date === 'string' ? req.query.date : '';
    if (!sid) return R.badRequest(res, 'School ID required');
    if (!classId || !date) return R.badRequest(res, 'classId and date are required');
    return R.ok(res, await attendance.getRoster(sid, classId, date));
  } catch (error: unknown) { next(error); }
}

export async function summary(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const sid = schoolId(req);
    if (!sid) return R.badRequest(res, 'School ID required');
    const date = typeof req.query.date === 'string' ? req.query.date : new Date().toISOString().slice(0, 10);
    return R.ok(res, await attendance.getSummary(sid, date));
  } catch (error: unknown) { next(error); }
}

export async function mark(
  req: Request<Record<string, string>, unknown, { classId: UUID; date: string; records: Array<{ studentId: UUID; status: 'PRESENT'|'ABSENT'|'LATE'|'HOLIDAY'|'HALF_DAY'; remark?: string }> }>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const sid = schoolId(req);
    const uid = actor(req);
    if (!sid) return R.badRequest(res, 'School ID required');
    if (!uid) return R.unauthorized(res);
    const rows = await attendance.mark(sid, req.body.classId, req.body.date, req.body.records, uid);
    return R.ok(res, { marked: rows.length, records: rows });
  } catch (error: unknown) { next(error); }
}
