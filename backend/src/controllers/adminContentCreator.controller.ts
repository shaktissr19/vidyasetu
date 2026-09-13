import type { NextFunction, Request, Response } from 'express';
import type { UUID } from '@vidyasetu/contracts';
import * as creatorService from '../services/adminContentCreator.service';
import * as R from '../utils/response';

export async function options(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await creatorService.getCreatorOptions()); }
  catch (error: unknown) { next(error); }
}

export async function jobs(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await creatorService.listCreatorJobs()); }
  catch (error: unknown) { next(error); }
}

export async function job(
  req: Request<{ jobId: UUID }>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try { return R.ok(res, await creatorService.getCreatorJob(req.params.jobId)); }
  catch (error: unknown) { next(error); }
}

export async function createJob(
  req: Request<Record<string, string>, unknown, creatorService.CreateCreatorJobInput>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.created(res, await creatorService.createCreatorJob(req.body, req.user.userId));
  } catch (error: unknown) { next(error); }
}

export async function generateJob(
  req: Request<{ jobId: UUID }>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.ok(res, await creatorService.generateCreatorJob(req.params.jobId));
  } catch (error: unknown) { next(error); }
}

export async function reviewJob(
  req: Request<{ jobId: UUID }, unknown, { decision: 'APPROVE' | 'REJECT'; note?: string | null }>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.ok(res, await creatorService.reviewCreatorJob(
      req.params.jobId,
      req.user.userId,
      req.body.decision,
      req.body.note,
    ));
  } catch (error: unknown) { next(error); }
}

export async function materialiseJob(
  req: Request<{ jobId: UUID }>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.created(res, await creatorService.materialiseCreatorJob(req.params.jobId, req.user.userId));
  } catch (error: unknown) { next(error); }
}
