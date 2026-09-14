import type { NextFunction, Request, Response } from 'express';
import type { UUID } from '@vidyasetu/contracts';
import * as factoryService from '../services/adminContentFactory.service';
import * as R from '../utils/response';

export async function options(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await factoryService.getFactoryOptions()); }
  catch (error: unknown) { next(error); }
}

export async function queueCounts(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await factoryService.getQueueCounts()); }
  catch (error: unknown) { next(error); }
}

export async function sourceReviewQueue(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await factoryService.getSourceReviewQueue()); }
  catch (error: unknown) { next(error); }
}

export async function stageExternalWebSource(
  req: Request<Record<string,string>, unknown, factoryService.StageExternalWebSourceInput>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.created(res, await factoryService.stageExternalWebSource(req.body,req.user.userId));
  } catch (error: unknown) { next(error); }
}

export async function addApprovedIntakeToLibrary(
  req: Request<{ intakeId: UUID }, unknown, factoryService.AddApprovedIntakeToLibraryInput>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.created(res, await factoryService.addApprovedIntakeToLibrary(req.params.intakeId,req.body,req.user.userId));
  } catch (error: unknown) { next(error); }
}
