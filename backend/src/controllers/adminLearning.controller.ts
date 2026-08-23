import type { NextFunction, Request, Response } from 'express';
import type { UUID } from '@vidyasetu/contracts';
import * as learningService from '../services/adminLearning.service';
import * as R from '../utils/response';

export async function options(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    return R.ok(res, await learningService.getLearningStudioOptions());
  } catch (error: unknown) {
    next(error);
  }
}

export async function resources(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    return R.ok(res, await learningService.listLearningResources());
  } catch (error: unknown) {
    next(error);
  }
}

export async function createResource(
  req: Request<Record<string, string>, unknown, learningService.SaveLearningResourceInput>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.created(res, await learningService.createLearningResource(req.body, req.user.userId));
  } catch (error: unknown) {
    next(error);
  }
}

export async function updateStatus(
  req: Request<{ resourceId: UUID }, unknown, { status: string; note?: string | null }>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.ok(res, await learningService.updateLearningResourceStatus(
      req.params.resourceId,
      req.body.status,
      req.user.userId,
      req.body.note,
    ));
  } catch (error: unknown) {
    next(error);
  }
}
