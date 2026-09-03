import type { NextFunction, Request, Response } from 'express';
import type { UUID } from '@vidyasetu/contracts';
import * as learningService from '../services/adminLearning.service';
import * as practiceService from '../services/adminLearningPractice.service';
import * as importService from '../services/adminLearningImport.service';
import * as reviewService from '../services/adminLearningReview.service';
import * as R from '../utils/response';

export async function options(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await learningService.getLearningStudioOptions()); }
  catch (error: unknown) { next(error); }
}

export async function resources(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await learningService.listLearningResources()); }
  catch (error: unknown) { next(error); }
}

export async function reviewPacks(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, reviewService.listSupportedContentPacks()); }
  catch (error: unknown) { next(error); }
}

export async function contentPackReview(
  req: Request<{ packKey: string }>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try { return R.ok(res, await reviewService.getContentPackReview(req.params.packKey)); }
  catch (error: unknown) { next(error); }
}

export async function pressureReview(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await reviewService.getPressurePackReview()); }
  catch (error: unknown) { next(error); }
}

export async function createResource(
  req: Request<Record<string, string>, unknown, learningService.SaveLearningResourceInput>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.created(res, await learningService.createLearningResource(req.body, req.user.userId));
  } catch (error: unknown) { next(error); }
}

export async function updateStatus(
  req: Request<{ resourceId: UUID }, unknown, { status: string; note?: string | null }>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.ok(res, await learningService.updateLearningResourceStatus(req.params.resourceId, req.body.status, req.user.userId, req.body.note));
  } catch (error: unknown) { next(error); }
}

export async function questions(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await practiceService.listQuestions()); }
  catch (error: unknown) { next(error); }
}

export async function createQuestion(
  req: Request<Record<string, string>, unknown, practiceService.SaveQuestionInput>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.created(res, await practiceService.createQuestion(req.body, req.user.userId));
  } catch (error: unknown) { next(error); }
}

export async function assessments(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await practiceService.listAssessments()); }
  catch (error: unknown) { next(error); }
}

export async function createAssessment(
  req: Request<Record<string, string>, unknown, practiceService.SaveAssessmentInput>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.created(res, await practiceService.createAssessment(req.body, req.user.userId));
  } catch (error: unknown) { next(error); }
}

export async function intake(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await practiceService.listIntake()); }
  catch (error: unknown) { next(error); }
}

export async function createIntake(
  req: Request<Record<string, string>, unknown, practiceService.SaveIntakeInput>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.created(res, await practiceService.createIntake(req.body, req.user.userId));
  } catch (error: unknown) { next(error); }
}

export async function updateIntakeStatus(
  req: Request<{ intakeId: UUID }, unknown, { status: string; note?: string | null }>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.ok(res, await practiceService.updateIntakeStatus(req.params.intakeId, req.body.status, req.user.userId, req.body.note));
  } catch (error: unknown) { next(error); }
}

export async function importOptions(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await importService.getImportOptions()); }
  catch (error: unknown) { next(error); }
}

export async function importTemplate(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const format = String(req.query.format || 'csv').toUpperCase() === 'JSON' ? 'JSON' : 'CSV';
    const requestedSample = String(req.query.sample || 'BLANK').toUpperCase();
    const sample = (['CLASS_5','CLASS_8','EARLY_YEARS','BLANK'].includes(requestedSample) ? requestedSample : 'BLANK') as 'CLASS_5' | 'CLASS_8' | 'EARLY_YEARS' | 'BLANK';
    const fileName = `vidyasetu-learning-import-${sample.toLowerCase()}.${format.toLowerCase()}`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.type(format === 'JSON' ? 'application/json' : 'text/csv');
    return res.send(format === 'JSON' ? importService.getJsonTemplate(sample) : importService.getCsvTemplate(sample));
  } catch (error: unknown) { next(error); }
}

export async function importBatches(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await importService.listImportBatches()); }
  catch (error: unknown) { next(error); }
}

export async function importBatch(req: Request<{ batchId: UUID }>, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await importService.getImportBatch(req.params.batchId)); }
  catch (error: unknown) { next(error); }
}

export async function stageImport(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    if (!req.file) return R.validationError(res, 'CSV or JSON file is required');
    const extension = req.file.originalname.toLowerCase().endsWith('.json') ? 'JSON' : req.file.originalname.toLowerCase().endsWith('.csv') ? 'CSV' : null;
    if (!extension) return R.validationError(res, 'Only .csv and .json files are supported');
    return R.created(res, await importService.stageImport({
      fileName: req.file.originalname,
      format: extension,
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