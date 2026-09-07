import type { NextFunction, Request, Response } from 'express';
import type { UUID } from '@vidyasetu/contracts';
import * as support from '../services/learningSupport.service';
import * as R from '../utils/response';

function user(req: Request) {
  if (!req.user) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
  return req.user;
}
function schoolId(req: Request): UUID {
  const value = user(req).schoolId;
  if (!value) throw Object.assign(new Error('School context is required'), { statusCode: 400 });
  return value;
}

export async function teacherWorkspace(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const u = user(req);
    const classId = typeof req.query.classId === 'string' ? req.query.classId : '';
    const subjectCode = typeof req.query.subjectCode === 'string' ? req.query.subjectCode : '';
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(classId)) return R.validationError(res, 'A valid classId is required');
    if (!subjectCode.trim()) return R.validationError(res, 'subjectCode is required');
    return R.ok(res, await support.getTeacherAcademicWorkspace(
      schoolId(req), u.userId, u.role, classId as UUID, subjectCode, u.teacherId || null,
    ));
  } catch (error: unknown) { next(error); }
}

export async function createIntervention(
  req: Request<Record<string, string>, unknown, support.CreateInterventionInput>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const u = user(req);
    return R.created(res, await support.createLearningIntervention(schoolId(req), u.userId, u.role, req.body));
  } catch (error: unknown) { next(error); }
}

export async function interventionDetail(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const u = user(req);
    return R.ok(res, await support.getInterventionForTeacher(
      schoolId(req), u.userId, u.role, req.params.interventionId as UUID, u.teacherId || null,
    ));
  } catch (error: unknown) { next(error); }
}

export async function updateIntervention(
  req: Request<Record<string, string>, unknown, support.UpdateInterventionInput>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const u = user(req);
    return R.ok(res, await support.updateLearningIntervention(
      schoolId(req), u.userId, u.role, req.params.interventionId as UUID, req.body,
    ));
  } catch (error: unknown) { next(error); }
}

export async function updateInterventionStudent(
  req: Request<Record<string, string>, unknown, support.UpdateInterventionStudentInput>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const u = user(req);
    return R.ok(res, await support.updateInterventionStudent(
      schoolId(req), u.userId, u.role,
      req.params.interventionId as UUID, req.params.studentId as UUID, req.body,
    ));
  } catch (error: unknown) { next(error); }
}

export async function interventionCommunity(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const u = user(req);
    const name = typeof req.body?.name === 'string' ? req.body.name : null;
    return R.created(res, await support.createInterventionCommunity(
      schoolId(req), u.userId, u.role, req.params.interventionId as UUID, name,
    ));
  } catch (error: unknown) { next(error); }
}

export async function parentSupport(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    return R.ok(res, await support.getParentLearningSupport(user(req).userId, req.params.studentId as UUID));
  } catch (error: unknown) { next(error); }
}

export async function parentAcknowledge(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const note = typeof req.body?.note === 'string' ? req.body.note : null;
    return R.ok(res, await support.acknowledgeParentIntervention(
      user(req).userId,
      req.params.studentId as UUID,
      req.params.interventionId as UUID,
      note,
    ));
  } catch (error: unknown) { next(error); }
}
