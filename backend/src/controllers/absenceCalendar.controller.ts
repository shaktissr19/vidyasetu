import type { NextFunction, Request, Response } from 'express';
import type { UUID } from '@vidyasetu/contracts';
import * as absence from '../services/absenceCalendar.service';
import * as R from '../utils/response';

function q(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
function user(req: Request) {
  if (!req.user) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
  return req.user;
}
function schoolId(req: Request): UUID {
  const value = user(req).schoolId;
  if (!value) throw Object.assign(new Error('School context is required'), { statusCode: 400 });
  return value;
}

export async function studentListLeave(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await absence.listStudentLeaves(user(req).userId)); } catch (error: unknown) { next(error); }
}
export async function studentCreateLeave(
  req: Request<Record<string, string>, unknown, absence.LeaveCreateInput>, res: Response, next: NextFunction,
): Promise<Response | void> {
  try { return R.created(res, await absence.createStudentLeave(user(req).userId, req.body)); } catch (error: unknown) { next(error); }
}
export async function studentCancelLeave(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await absence.cancelStudentLeave(user(req).userId, req.params.leaveId)); } catch (error: unknown) { next(error); }
}
export async function studentCalendar(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await absence.listStudentCalendar(user(req).userId, q(req.query.from), q(req.query.to))); } catch (error: unknown) { next(error); }
}

export async function parentListLeave(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await absence.listParentLeaves(user(req).userId, req.params.studentId)); } catch (error: unknown) { next(error); }
}
export async function parentCreateLeave(
  req: Request<Record<string, string>, unknown, absence.LeaveCreateInput>, res: Response, next: NextFunction,
): Promise<Response | void> {
  try { return R.created(res, await absence.createParentLeave(user(req).userId, req.params.studentId, req.body)); } catch (error: unknown) { next(error); }
}
export async function parentCancelLeave(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await absence.cancelParentLeave(user(req).userId, req.params.studentId, req.params.leaveId)); } catch (error: unknown) { next(error); }
}
export async function parentCalendar(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await absence.listParentCalendar(user(req).userId, req.params.studentId, q(req.query.from), q(req.query.to))); } catch (error: unknown) { next(error); }
}

export async function schoolListLeave(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const actor = user(req);
    const status = q(req.query.status) as absence.LeaveStatus | undefined;
    return R.ok(res, await absence.listSchoolLeaves(schoolId(req), actor.role, actor.teacherId, status));
  } catch (error: unknown) { next(error); }
}
export async function schoolReviewLeave(
  req: Request<Record<string, string>, unknown, absence.LeaveReviewInput>, res: Response, next: NextFunction,
): Promise<Response | void> {
  try {
    const actor = user(req);
    return R.ok(res, await absence.reviewLeave(schoolId(req), actor.userId, actor.role, actor.teacherId, req.params.leaveId, req.body));
  } catch (error: unknown) { next(error); }
}
export async function schoolCalendar(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await absence.listSchoolCalendar(schoolId(req), q(req.query.from), q(req.query.to))); } catch (error: unknown) { next(error); }
}
export async function schoolCreateCalendar(
  req: Request<Record<string, string>, unknown, absence.CalendarEventInput>, res: Response, next: NextFunction,
): Promise<Response | void> {
  try { return R.created(res, await absence.createCalendarEvent(schoolId(req), user(req).userId, req.body)); } catch (error: unknown) { next(error); }
}
export async function schoolUpdateCalendar(
  req: Request<Record<string, string>, unknown, Partial<absence.CalendarEventInput>>, res: Response, next: NextFunction,
): Promise<Response | void> {
  try { return R.ok(res, await absence.updateCalendarEvent(schoolId(req), req.params.eventId, req.body)); } catch (error: unknown) { next(error); }
}
export async function schoolArchiveCalendar(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await absence.archiveCalendarEvent(schoolId(req), req.params.eventId)); } catch (error: unknown) { next(error); }
}
