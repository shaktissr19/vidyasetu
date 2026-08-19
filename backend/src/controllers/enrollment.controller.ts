import type { NextFunction, Request, Response } from 'express';
import * as enrollmentService from '../services/enrollment.service';
import type { EnrollmentReviewInput } from '../services/enrollment.service';
import * as R from '../utils/response';

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function getSchoolId(req: Request): string | undefined {
  return req.user?.schoolId || queryString(req.query.schoolId);
}

export async function getSchoolRequests(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const schoolId = getSchoolId(req);
    if (!schoolId) return R.badRequest(res, 'School ID required');
    const rows = await enrollmentService.getSchoolEnrollmentRequests(
      schoolId,
      queryString(req.query.status) || 'PENDING',
    );
    return R.ok(res, rows);
  } catch (err: unknown) { next(err); }
}

export async function reviewSchoolRequest(
  req: Request<Record<string, string>, unknown, EnrollmentReviewInput>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    const schoolId = getSchoolId(req);
    if (!schoolId) return R.badRequest(res, 'School ID required');
    return R.ok(res, await enrollmentService.reviewSchoolEnrollmentRequest(
      schoolId,
      req.params.requestId,
      user.userId,
      req.body,
    ));
  } catch (err: unknown) { next(err); }
}

export async function getStudentLinkSummary(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    const result = await enrollmentService.getStudentLinkSummary(user.userId);
    if (!result) return R.notFound(res, 'Student profile not found');
    return R.ok(res, result);
  } catch (err: unknown) { next(err); }
}
