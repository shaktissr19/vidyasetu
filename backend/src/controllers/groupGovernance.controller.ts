import type { NextFunction, Request, Response } from 'express';
import * as governanceService from '../services/groupGovernance.service';
import * as R from '../utils/response';

interface TransferBody { userId: string; }

function auth(req: Request, res: Response) {
  if (!req.user) { R.unauthorized(res); return null; }
  return req.user;
}

export async function transferOwnership(
  req: Request<Record<string, string>, unknown, TransferBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const user = auth(req, res); if (!user) return;
    return R.ok(res, await governanceService.transferOwnershipByOwner(
      req.params.groupId,
      req.body.userId,
      user.userId,
      user.role,
    ));
  } catch (error: unknown) { next(error); }
}

export async function adminTransferOwnership(
  req: Request<Record<string, string>, unknown, TransferBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const user = auth(req, res); if (!user) return;
    return R.ok(res, await governanceService.transferOwnershipByAdmin(req.params.groupId, req.body.userId, user.userId));
  } catch (error: unknown) { next(error); }
}

export async function adminMembers(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = auth(req, res); if (!user) return;
    return R.ok(res, await governanceService.listMembersForAdmin(req.params.groupId));
  } catch (error: unknown) { next(error); }
}

export async function removeComment(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = auth(req, res); if (!user) return;
    return R.ok(res, await governanceService.removeComment(req.params.groupId, req.params.commentId, user.userId));
  } catch (error: unknown) { next(error); }
}
