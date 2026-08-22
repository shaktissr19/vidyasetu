import type { NextFunction, Request, Response } from 'express';
import * as R from '../utils/response';
import * as adminGroupService from '../services/groupAdminLifecycle.service';

interface AdminDecisionBody {
  decision: 'ACTIVE' | 'REJECTED';
  note?: string | null;
}

interface AdminStatusBody {
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  note?: string | null;
}

interface AdminReportBody {
  status: 'REVIEWING' | 'RESOLVED' | 'DISMISSED';
  resolution?: string | null;
}

function userId(req: Request, res: Response): string | null {
  if (!req.user) {
    R.unauthorized(res);
    return null;
  }
  return req.user.userId;
}

export async function decideGroup(
  req: Request<Record<string, string>, unknown, AdminDecisionBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const adminId = userId(req, res); if (!adminId) return;
    return R.ok(res, await adminGroupService.decideGroup(req.params.groupId, adminId, req.body.decision, req.body.note));
  } catch (error: unknown) { next(error); }
}

export async function updateGroupStatus(
  req: Request<Record<string, string>, unknown, AdminStatusBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const adminId = userId(req, res); if (!adminId) return;
    return R.ok(res, await adminGroupService.updateGroupStatus(req.params.groupId, adminId, req.body.status, req.body.note));
  } catch (error: unknown) { next(error); }
}

export async function resolveGroupReport(
  req: Request<Record<string, string>, unknown, AdminReportBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const adminId = userId(req, res); if (!adminId) return;
    return R.ok(res, await adminGroupService.resolveGroupReport(req.params.reportId, adminId, req.body.status, req.body.resolution));
  } catch (error: unknown) { next(error); }
}
