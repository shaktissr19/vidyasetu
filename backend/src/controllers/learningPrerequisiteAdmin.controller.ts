import type { NextFunction, Request, Response } from 'express';
import type { UUID } from '@vidyasetu/contracts';
import * as prerequisiteService from '../services/learningPrerequisiteAdmin.service';
import * as R from '../utils/response';

export async function getPrerequisites(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    return R.ok(res, await prerequisiteService.listConceptPrerequisites(req.params.conceptId as UUID));
  } catch (err: unknown) { next(err); }
}

export async function replacePrerequisites(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    return R.ok(res, await prerequisiteService.replaceConceptPrerequisites(
      req.params.conceptId as UUID,
      req.body.prerequisites,
    ));
  } catch (err: unknown) { next(err); }
}
