import type { NextFunction, Request, Response } from 'express';
import type { UUID } from '@vidyasetu/contracts';
import * as parentWorkflowService from '../services/parentWorkflow.service';
import * as R from '../utils/response';

function actor(req: Request, res: Response) {
  if (!req.user) { R.unauthorized(res); return null; }
  return req.user;
}

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export async function childHomework(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = actor(req, res); if (!user) return;
    return R.ok(res, await parentWorkflowService.listChildHomework(
      user.userId,
      req.params.studentId as UUID,
      queryString(req.query.status),
    ));
  } catch (err: unknown) { next(err); }
}

export async function childAchievements(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = actor(req, res); if (!user) return;
    return R.ok(res, await parentWorkflowService.listChildAchievements(
      user.userId,
      req.params.studentId as UUID,
    ));
  } catch (err: unknown) { next(err); }
}
