import type { NextFunction, Request, Response } from 'express';
import type { UUID } from '@vidyasetu/contracts';
import * as service from '../services/contentFactory.service';
import * as R from '../utils/response';

export async function summary(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await service.getContentFactorySummary()); } catch (error: unknown) { next(error); }
}

export async function grade(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await service.getContentFactoryGrade(req.params.gradeCode)); } catch (error: unknown) { next(error); }
}

export async function updateTarget(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await service.updateContentTarget(req.params.targetId as UUID, req.body)); } catch (error: unknown) { next(error); }
}
