import type { NextFunction, Request, Response } from 'express';
import * as learningService from '../services/publicLearning.service';
import * as practiceService from '../services/publicLearningPractice.service';
import * as R from '../utils/response';

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalClass(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) {
    throw Object.assign(new Error('class must be between 1 and 12'), { statusCode: 400 });
  }
  return parsed;
}

function optionalLimit(value: unknown): number | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw Object.assign(new Error('limit must be a positive number'), { statusCode: 400 });
  }
  return parsed;
}

function freshLearningResponse(res: Response): void {
  // Learning content changes through Admin publishing/imports. Until explicit
  // cache invalidation/versioning is introduced, never let a browser/proxy keep
  // an old zero-count catalogue after new public content has been published.
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

export async function overview(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    freshLearningResponse(res);
    return R.ok(res, await learningService.getPublicLearningOverview());
  } catch (error: unknown) { next(error); }
}

export async function resources(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    freshLearningResponse(res);
    return R.ok(res, await learningService.listPublicLearningResources({
      className: optionalClass(req.query.class),
      gradeCode: optionalText(req.query.grade),
      category: optionalText(req.query.category),
      board: optionalText(req.query.board),
      limit: optionalLimit(req.query.limit),
      featuredOnly: req.query.featured === 'true',
    }));
  } catch (error: unknown) { next(error); }
}

export async function resource(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    freshLearningResponse(res);
    return R.ok(res, await learningService.getPublicLearningResource(req.params.slug));
  } catch (error: unknown) { next(error); }
}

export async function sources(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    freshLearningResponse(res);
    return R.ok(res, await learningService.listLearningSources());
  } catch (error: unknown) { next(error); }
}

export async function assessments(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    freshLearningResponse(res);
    return R.ok(res, await practiceService.listPublicAssessments({
      className: optionalClass(req.query.class),
      board: optionalText(req.query.board),
      type: optionalText(req.query.type),
      limit: optionalLimit(req.query.limit),
    }));
  } catch (error: unknown) { next(error); }
}

export async function assessment(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    freshLearningResponse(res);
    return R.ok(res, await practiceService.getPublicAssessment(req.params.slug));
  } catch (error: unknown) { next(error); }
}
