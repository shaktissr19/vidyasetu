import type { NextFunction, Request, Response } from 'express';
import type { UUID } from '@vidyasetu/contracts';
import * as learningService from '../services/adminLearning.service';
import * as conceptAdminService from '../services/learningConceptAdmin.service';
import * as qualityService from '../services/learningQuality.service';
import * as R from '../utils/response';

function optionalClass(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) {
    throw Object.assign(new Error('class must be between 1 and 12'), { statusCode: 400 });
  }
  return parsed;
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function concepts(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    return R.ok(res, await learningService.listLearningConcepts(optionalClass(req.query.class), optionalText(req.query.subject)));
  } catch (error: unknown) { next(error); }
}

export async function updateConcept(
  req: Request<{ conceptId: UUID }, unknown, conceptAdminService.UpdateLearningConceptInput>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    return R.ok(res, await conceptAdminService.updateLearningConceptMetadata(req.params.conceptId, req.body));
  } catch (error: unknown) { next(error); }
}

export async function coverage(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    return R.ok(res, await qualityService.getCoverageSummary({
      classNumber: optionalClass(req.query.class),
      subjectCode: optionalText(req.query.subject),
    }));
  } catch (error: unknown) { next(error); }
}

export async function readiness(
  req: Request<{ entityType: string; entityId: UUID }>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try { return R.ok(res, await qualityService.getEntityReadiness(req.params.entityType, req.params.entityId)); }
  catch (error: unknown) { next(error); }
}

export async function setQualityGate(
  req: Request<{ entityType: string; entityId: UUID; gateCode: string }, unknown, { status: string; note?: string | null }>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.ok(res, await qualityService.setQualityGate(
      req.params.entityType,
      req.params.entityId,
      req.params.gateCode,
      req.body.status,
      req.user.userId,
      req.body.note,
    ));
  } catch (error: unknown) { next(error); }
}
