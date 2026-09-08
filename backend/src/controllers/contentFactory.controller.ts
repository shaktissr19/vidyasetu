import type { NextFunction, Request, Response } from 'express';
import type { UUID } from '@vidyasetu/contracts';
import * as service from '../services/contentFactory.service';
import * as authoring from '../services/contentAuthoringV3.service';
import * as resourceService from '../services/adminLearning.service';
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

export async function options(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await resourceService.getLearningStudioOptions()); } catch (error: unknown) { next(error); }
}

export async function createResource(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.created(res, await authoring.createResource(req.body, req.user.userId));
  } catch (error: unknown) { next(error); }
}

export async function questions(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const gradeCode = typeof req.query.grade === 'string' ? req.query.grade : null;
    return R.ok(res, await authoring.listQuestionsForGrade(gradeCode));
  } catch (error: unknown) { next(error); }
}

export async function createQuestion(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.created(res, await authoring.createQuestion(req.body, req.user.userId));
  } catch (error: unknown) { next(error); }
}

export async function assessments(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const gradeCode = typeof req.query.grade === 'string' ? req.query.grade : null;
    return R.ok(res, await authoring.listAssessmentsForGrade(gradeCode));
  } catch (error: unknown) { next(error); }
}

export async function createAssessment(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.created(res, await authoring.createAssessment(req.body, req.user.userId));
  } catch (error: unknown) { next(error); }
}
