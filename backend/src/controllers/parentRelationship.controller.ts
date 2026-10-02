import type { NextFunction, Request, Response } from 'express';
import * as parentRelationshipService from '../services/parentRelationship.service';
import * as R from '../utils/response';

interface RequestChildBody {
  studentCode: string;
  relation?: 'FATHER' | 'MOTHER' | 'GUARDIAN' | 'PARENT';
}

export async function requestChildLink(
  req: Request<Record<string, string>, unknown, RequestChildBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.created(res, await parentRelationshipService.requestChildLink(
      req.user.userId,
      req.body.studentCode,
      req.body.relation || 'PARENT',
    ));
  } catch (err: unknown) {
    next(err);
  }
}
