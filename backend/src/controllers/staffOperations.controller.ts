import type { NextFunction, Request, Response } from 'express';
import type { UUID } from '@vidyasetu/contracts';
import * as staff from '../services/staffOperations.service';
import * as R from '../utils/response';

function currentUser(req: Request) {
  if (!req.user) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
  return req.user;
}
function schoolId(req: Request): UUID {
  const value = currentUser(req).schoolId;
  if (!value) throw Object.assign(new Error('School context is required'), { statusCode: 400 });
  return value;
}
function intQuery(value: unknown, fallback: number): number {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function myLeaves(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await staff.listMyLeaves(currentUser(req).userId)); }
  catch (error: unknown) { next(error); }
}
export async function createMyLeave(
  req: Request<Record<string, string>, unknown, staff.StaffLeaveCreateInput>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try { return R.created(res, await staff.createMyLeave(currentUser(req).userId, req.body)); }
  catch (error: unknown) { next(error); }
}
export async function cancelMyLeave(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await staff.cancelMyLeave(currentUser(req).userId, req.params.leaveId)); }
  catch (error: unknown) { next(error); }
}
export async function myAttendance(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const now = new Date();
    const year = intQuery(req.query.year, now.getFullYear());
    const month = intQuery(req.query.month, now.getMonth() + 1);
    return R.ok(res, await staff.getMyAttendance(currentUser(req).userId, year, month));
  } catch (error: unknown) { next(error); }
}

export async function schoolLeaves(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const raw = typeof req.query.status === 'string' ? req.query.status : undefined;
    return R.ok(res, await staff.listSchoolLeaves(schoolId(req), raw as staff.StaffLeaveStatus | undefined));
  } catch (error: unknown) { next(error); }
}
export async function reviewSchoolLeave(
  req: Request<Record<string, string>, unknown, staff.StaffLeaveReviewInput>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const actor = currentUser(req);
    return R.ok(res, await staff.reviewSchoolLeave(schoolId(req), actor.userId, req.params.leaveId, req.body));
  } catch (error: unknown) { next(error); }
}
export async function attendanceRoster(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const date = typeof req.query.date === 'string' ? req.query.date : new Date().toISOString().slice(0, 10);
    return R.ok(res, await staff.getStaffRoster(schoolId(req), date));
  } catch (error: unknown) { next(error); }
}
export async function markAttendance(
  req: Request<Record<string, string>, unknown, { date: string; records: staff.StaffAttendanceInput[] }>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const actor = currentUser(req);
    const records = await staff.markStaffAttendance(schoolId(req), req.body.date, req.body.records, actor.userId);
    return R.ok(res, { marked: records.length, records });
  } catch (error: unknown) { next(error); }
}
export async function attendanceSummary(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const now = new Date();
    const year = intQuery(req.query.year, now.getFullYear());
    const month = intQuery(req.query.month, now.getMonth() + 1);
    return R.ok(res, await staff.getSchoolAttendanceSummary(schoolId(req), year, month));
  } catch (error: unknown) { next(error); }
}