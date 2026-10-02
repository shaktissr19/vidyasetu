import type { NextFunction, Request, Response } from 'express';
import { createPlatformAdmin } from '../services/adminAccount.service';
import * as R from '../utils/response';

export async function createAdmin(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.created(res, await createPlatformAdmin(req.body, req.user.userId));
  } catch (error: unknown) { next(error); }
}
