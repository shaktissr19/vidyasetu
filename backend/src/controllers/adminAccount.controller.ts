import type { NextFunction, Request, Response } from 'express';
import { createPlatformAdmin } from '../services/adminAccount.service';
import { listPlatformAdmins, PLATFORM_ADMIN_CAPABILITIES, setPlatformAdminCapabilities } from '../services/platformAdminAccess.service';
import * as R from '../utils/response';

export async function createAdmin(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.created(res, await createPlatformAdmin(req.body, req.user.userId));
  } catch (error: unknown) { next(error); }
}

export async function listPlatformAdminAccess(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await listPlatformAdmins()); }
  catch (error: unknown) { next(error); }
}

export async function updatePlatformAdminAccess(req: Request<{ userId: string }, unknown, { permissions: Array<typeof PLATFORM_ADMIN_CAPABILITIES[number]> }>, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.ok(res, await setPlatformAdminCapabilities(req.params.userId, req.user.userId, req.body.permissions));
  } catch (error: unknown) { next(error); }
}
