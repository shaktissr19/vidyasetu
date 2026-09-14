import type { NextFunction, Request, Response } from 'express';
import * as factoryService from '../services/adminContentFactory.service';
import * as R from '../utils/response';

export async function options(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await factoryService.getFactoryOptions()); }
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
