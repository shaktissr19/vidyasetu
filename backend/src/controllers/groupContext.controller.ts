import type { NextFunction, Request, Response } from 'express';
import * as groupContextService from '../services/groupContext.service';
import * as R from '../utils/response';

export async function getCreationContext(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.ok(res, await groupContextService.getCreationContext(req.user.userId, req.user.role));
  } catch (error: unknown) {
    next(error);
  }
}
