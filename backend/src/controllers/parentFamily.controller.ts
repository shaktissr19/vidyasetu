import type { NextFunction, Request, Response } from 'express';
import * as parentFamilyService from '../services/parentFamily.service';
import * as R from '../utils/response';

function authenticated(req: Request, res: Response) {
  if (!req.user) {
    R.unauthorized(res);
    return null;
  }
  return req.user;
}

export async function getChildHomework(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    return R.ok(res, await parentFamilyService.getChildHomework(user.userId, req.params.studentId));
  } catch (err: unknown) { next(err); }
}

export async function getChildAchievements(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = authenticated(req, res); if (!user) return;
    return R.ok(res, await parentFamilyService.getChildCompetitionsAndAchievements(user.userId, req.params.studentId));
  } catch (err: unknown) { next(err); }
}
