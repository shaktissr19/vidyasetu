import type { NextFunction, Request, Response } from 'express';
import type { UUID } from '@vidyasetu/contracts';
import * as pipeline from '../services/learningContentPipeline.service';
import { acquireContent } from '../services/learningSourceAcquisition.service';
import * as R from '../utils/response';

export async function options(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await pipeline.getPipelineOptions()); }
  catch (error: unknown) { next(error); }
}

export async function queue(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await pipeline.listPipelineQueue()); }
  catch (error: unknown) { next(error); }
}

export async function stage(
  req: Request<Record<string, string>, unknown, pipeline.StagePipelineInput>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.created(res, await pipeline.stageContent(req.body, req.user.userId));
  } catch (error: unknown) { next(error); }
}

export async function verifyRights(
  req: Request<{ intakeId: UUID }, unknown, pipeline.VerifyPipelineRightsInput>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.ok(res, await pipeline.verifyRights(req.params.intakeId, req.body, req.user.userId));
  } catch (error: unknown) { next(error); }
}

export async function approve(
  req: Request<{ intakeId: UUID }, unknown, { note?: string | null }>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.ok(res, await pipeline.approveIntake(req.params.intakeId, req.user.userId, req.body.note));
  } catch (error: unknown) { next(error); }
}

export async function materialise(
  req: Request<{ intakeId: UUID }>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.created(res, await pipeline.materialiseIntake(req.params.intakeId, req.user.userId));
  } catch (error: unknown) { next(error); }
}

export async function updateDraft(req: Request<{ resourceId: UUID },unknown,pipeline.StagePipelineInput>,res: Response,next: NextFunction): Promise<Response | void> {
  try { if (!req.user) return R.unauthorized(res); return R.ok(res,await pipeline.updateDraftDetails(req.params.resourceId,req.body,req.user.userId)); }
  catch (error: unknown) { next(error); }
}

export async function acquire(req:Request,res:Response,next:NextFunction):Promise<Response|void> {
  try { if (!req.user) return R.unauthorized(res); return R.created(res,await acquireContent(req.body,req.user.userId)); } catch(error) { next(error); }
}
export async function createTopic(req:Request,res:Response,next:NextFunction):Promise<Response|void> {
  try { if (!req.user) return R.unauthorized(res); return R.created(res,await pipeline.createCurriculumTopic(req.body,req.user.userId)); } catch(error) { next(error); }
}
