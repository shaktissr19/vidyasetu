import type { NextFunction, Request, Response } from 'express';
import type { UUID } from '@vidyasetu/contracts';
import * as service from '../services/contentFactory.service';
import * as targetGovernance from '../services/contentTargetGovernance.service';
import * as authoring from '../services/contentAuthoringV3.service';
import * as importService from '../services/contentImportV3.service';
import * as resourceService from '../services/adminLearning.service';
import * as R from '../utils/response';

export async function summary(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await service.getContentFactorySummary()); } catch (error: unknown) { next(error); }
}

export async function grade(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await service.getContentFactoryGrade(req.params.gradeCode)); } catch (error: unknown) { next(error); }
}

export async function updateTarget(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await targetGovernance.updateGovernedContentTarget(req.params.targetId as UUID, req.body)); } catch (error: unknown) { next(error); }
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

export async function importOptions(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await importService.getImportOptions()); } catch (error: unknown) { next(error); }
}

export async function importTemplate(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const format = String(req.query.format || 'csv').toUpperCase() === 'JSON' ? 'JSON' : 'CSV';
    const requestedSample = String(req.query.sample || 'BLANK').toUpperCase();
    const sample = (['CLASS_5','CLASS_8','EARLY_YEARS','BLANK'].includes(requestedSample) ? requestedSample : 'BLANK') as 'CLASS_5' | 'CLASS_8' | 'EARLY_YEARS' | 'BLANK';
    const fileName = `vidyasetu-content-v3-${sample.toLowerCase()}.${format.toLowerCase()}`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.type(format === 'JSON' ? 'application/json' : 'text/csv');
    return res.send(format === 'JSON' ? importService.getJsonTemplate(sample) : importService.getCsvTemplate(sample));
  } catch (error: unknown) { next(error); }
}

export async function importBatches(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await importService.listImportBatches()); } catch (error: unknown) { next(error); }
}

export async function importBatch(req: Request<{ batchId: UUID }>, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await importService.getImportBatch(req.params.batchId)); } catch (error: unknown) { next(error); }
}

export async function stageImport(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    if (!req.file) return R.validationError(res, 'CSV or JSON file is required');
    const lower = req.file.originalname.toLowerCase();
    const format = lower.endsWith('.json') ? 'JSON' : lower.endsWith('.csv') ? 'CSV' : null;
    if (!format) return R.validationError(res, 'Only .csv and .json files are supported');
    return R.created(res, await importService.stageImport({
      fileName: req.file.originalname,
      format,
      content: req.file.buffer.toString('utf8'),
    }, req.user.userId));
  } catch (error: unknown) { next(error); }
}

export async function commitImport(req: Request<{ batchId: UUID }>, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.ok(res, await importService.commitImportBatch(req.params.batchId, req.user.userId));
  } catch (error: unknown) { next(error); }
}
