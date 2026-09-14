import type { NextFunction, Request, Response } from 'express';
import type { UUID } from '@vidyasetu/contracts';
import * as linkService from '../services/registrationLink.service';
import * as R from '../utils/response';

interface DecisionBody {
  action: 'APPROVE' | 'REJECT';
  note?: string;
}

interface ParentInvitationBody {
  parentName?: string;
  parentMobile?: string;
  parentEmail?: string;
  parentRelation?: string;
}

export async function createStudentParentRequest(
  req: Request<Record<string, string>, unknown, ParentInvitationBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.created(res, await linkService.createStudentParentInvitationForUser(req.user.userId, req.body));
  } catch (err: unknown) { next(err); }
}

export async function getStudentParentRequests(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.ok(res, await linkService.getStudentParentLinkRequests(req.user.userId));
  } catch (err: unknown) { next(err); }
}

export async function reviewStudentParentRequest(
  req: Request<Record<string, string>, unknown, DecisionBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.ok(res, await linkService.reviewStudentParentLinkRequest(
      req.user.userId,
      req.params.requestId as UUID,
      req.body.action,
    ));
  } catch (err: unknown) { next(err); }
}

export async function getParentLinkRequests(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.ok(res, await linkService.getParentLinkRequests(req.user.userId));
  } catch (err: unknown) { next(err); }
}

export async function reviewParentLinkRequest(
  req: Request<Record<string, string>, unknown, DecisionBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.ok(res, await linkService.reviewParentLinkRequest(
      req.user.userId,
      req.params.requestId as UUID,
      req.body.action,
    ));
  } catch (err: unknown) { next(err); }
}

export async function getSchoolTeacherRequests(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    if (!req.user.schoolId) return R.badRequest(res, 'School ID required');
    return R.ok(res, await linkService.getSchoolTeacherRequests(req.user.schoolId));
  } catch (err: unknown) { next(err); }
}

export async function reviewSchoolTeacherRequest(
  req: Request<Record<string, string>, unknown, DecisionBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    if (!req.user.schoolId) return R.badRequest(res, 'School ID required');
    return R.ok(res, await linkService.reviewSchoolTeacherRequest(
      req.user.schoolId,
      req.user.userId,
      req.params.requestId as UUID,
      req.body.action,
      req.body.note || null,
    ));
  } catch (err: unknown) { next(err); }
}
