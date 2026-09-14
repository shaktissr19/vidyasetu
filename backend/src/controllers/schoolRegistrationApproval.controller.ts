import type { NextFunction, Request, Response } from 'express';
import type { UUID } from '@vidyasetu/contracts';
import * as approvalService from '../services/schoolRegistrationApproval.service';
import * as R from '../utils/response';

interface StatusBody { status: 'ACTIVE' | 'SUSPENDED' | 'PENDING'; }

export async function updateSchoolStatus(
  req: Request<Record<string, string>, unknown, StatusBody>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.ok(res, await approvalService.updateSchoolVerificationStatus(
      req.params.schoolId as UUID,
      req.body.status,
      req.user.userId,
    ));
  } catch (err: unknown) { next(err); }
}
