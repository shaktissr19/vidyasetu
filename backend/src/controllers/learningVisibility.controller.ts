import type { NextFunction, Request, Response } from 'express';
import type { UUID } from '@vidyasetu/contracts';
import * as learningVisibility from '../services/learningVisibility.service';
import * as diagnosticVisibility from '../services/diagnosticVisibility.service';
import * as R from '../utils/response';

function authenticated(req: Request, res: Response) {
  if (!req.user) {
    R.unauthorized(res);
    return null;
  }
  return req.user;
}

export async function schoolTargets(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    if (!user.schoolId) return R.forbidden(res, 'School context is required');
    return R.ok(res, await learningVisibility.getSchoolLearningTargets(
      user.schoolId,
      user.userId,
      user.role,
      user.teacherId || null,
    ));
  } catch (err: unknown) { next(err); }
}

export async function schoolOverview(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    if (!user.schoolId) return R.forbidden(res, 'School context is required');
    const classId = typeof req.query.classId === 'string' ? req.query.classId : '';
    const subjectCode = typeof req.query.subjectCode === 'string' ? req.query.subjectCode : '';
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(classId)) return R.validationError(res, 'A valid classId is required');
    if (!subjectCode.trim()) return R.validationError(res, 'subjectCode is required');
    return R.ok(res, await learningVisibility.getSchoolLearningOverview(
      user.schoolId,
      user.userId,
      user.role,
      classId as UUID,
      subjectCode,
      user.teacherId || null,
    ));
  } catch (err: unknown) { next(err); }
}

export async function schoolDiagnostics(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    if (!user.schoolId) return R.forbidden(res, 'School context is required');
    const classId = typeof req.query.classId === 'string' ? req.query.classId : '';
    const subjectCode = typeof req.query.subjectCode === 'string' ? req.query.subjectCode : '';
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(classId)) return R.validationError(res, 'A valid classId is required');
    if (!subjectCode.trim()) return R.validationError(res, 'subjectCode is required');
    return R.ok(res, await diagnosticVisibility.getSchoolDiagnosticOverview(
      user.schoolId,
      user.userId,
      user.role,
      classId as UUID,
      subjectCode,
      user.teacherId || null,
    ));
  } catch (err: unknown) { next(err); }
}

export async function parentInsight(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    return R.ok(res, await learningVisibility.getParentLearningInsight(user.userId, req.params.studentId as UUID));
  } catch (err: unknown) { next(err); }
}

export async function parentDiagnostics(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    return R.ok(res, await diagnosticVisibility.getParentDiagnosticInsight(user.userId, req.params.studentId as UUID));
  } catch (err: unknown) { next(err); }
}