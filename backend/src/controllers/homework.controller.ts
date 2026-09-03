import type { NextFunction, Request, Response } from 'express';
import type { UUID } from '@vidyasetu/contracts';
import * as homeworkService from '../services/homework.service';
import * as R from '../utils/response';

function auth(req: Request, res: Response) {
  if (!req.user) { R.unauthorized(res); return null; }
  return req.user;
}

function schoolActor(req: Request, res: Response) {
  const user = auth(req, res);
  if (!user) return null;
  if (!user.schoolId) { R.forbidden(res, 'School context is required'); return null; }
  return { user, schoolId: user.schoolId };
}

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export async function listStudent(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = auth(req, res); if (!user) return;
    const data = await homeworkService.listStudentHomework(user.userId, queryString(req.query.status));
    return R.ok(res, data);
  } catch (err: unknown) { next(err); }
}

export async function getStudent(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = auth(req, res); if (!user) return;
    return R.ok(res, await homeworkService.getStudentHomework(user.userId, req.params.homeworkId as UUID));
  } catch (err: unknown) { next(err); }
}

export async function submitStudent(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = auth(req, res); if (!user) return;
    const submission = await homeworkService.submitStudentHomework(
      user.userId,
      req.params.homeworkId as UUID,
      req.body || {},
    );
    return R.ok(res, submission);
  } catch (err: unknown) { next(err); }
}

export async function listSchool(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const actor = schoolActor(req, res); if (!actor) return;
    return R.ok(res, await homeworkService.listSchoolHomework(
      actor.schoolId,
      actor.user.userId,
      actor.user.role,
      queryString(req.query.status),
    ));
  } catch (err: unknown) { next(err); }
}

export async function createSchool(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const actor = schoolActor(req, res); if (!actor) return;
    const created = await homeworkService.createHomework(
      actor.schoolId,
      actor.user.userId,
      actor.user.role,
      req.body,
    );
    return R.created(res, created);
  } catch (err: unknown) { next(err); }
}

export async function updateSchool(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const actor = schoolActor(req, res); if (!actor) return;
    return R.ok(res, await homeworkService.updateHomework(
      actor.schoolId,
      actor.user.userId,
      actor.user.role,
      req.params.homeworkId as UUID,
      req.body || {},
    ));
  } catch (err: unknown) { next(err); }
}

export async function publishSchool(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const actor = schoolActor(req, res); if (!actor) return;
    return R.ok(res, await homeworkService.publishHomework(
      actor.schoolId,
      actor.user.userId,
      actor.user.role,
      req.params.homeworkId as UUID,
    ));
  } catch (err: unknown) { next(err); }
}

export async function closeSchool(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const actor = schoolActor(req, res); if (!actor) return;
    return R.ok(res, await homeworkService.closeHomework(
      actor.schoolId,
      actor.user.userId,
      actor.user.role,
      req.params.homeworkId as UUID,
    ));
  } catch (err: unknown) { next(err); }
}

export async function submissions(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const actor = schoolActor(req, res); if (!actor) return;
    return R.ok(res, await homeworkService.listHomeworkSubmissions(
      actor.schoolId,
      actor.user.userId,
      actor.user.role,
      req.params.homeworkId as UUID,
    ));
  } catch (err: unknown) { next(err); }
}

export async function reviewSubmission(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const actor = schoolActor(req, res); if (!actor) return;
    return R.ok(res, await homeworkService.reviewHomeworkSubmission(
      actor.schoolId,
      actor.user.userId,
      actor.user.role,
      req.params.homeworkId as UUID,
      req.params.submissionId as UUID,
      req.body || {},
    ));
  } catch (err: unknown) { next(err); }
}
