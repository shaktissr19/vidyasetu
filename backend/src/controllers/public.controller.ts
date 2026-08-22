import type { NextFunction, Request, Response } from 'express';
import * as publicOverviewService from '../services/publicOverview.service';
import * as R from '../utils/response';

export async function overview(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    return R.ok(res, await publicOverviewService.getPublicOverview());
  } catch (error: unknown) {
    next(error);
  }
}

export async function schools(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    return R.ok(res, await publicOverviewService.listPublicSchools());
  } catch (error: unknown) {
    next(error);
  }
}
