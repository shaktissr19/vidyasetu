import type { NextFunction, Request, Response } from 'express';
import type { UUID } from '@vidyasetu/contracts';
import * as creatorService from '../services/adminContentCreator.service';
import * as discoveryService from '../services/adminContentSourceDiscovery.service';
import * as governanceService from '../services/adminContentSourceGovernance.service';
import * as submissionService from '../services/adminContentCreatorSubmission.service';
import * as R from '../utils/response';

export async function options(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const data = await creatorService.getCreatorOptions();
    return R.ok(res, { ...data, discovery: discoveryService.sourceDiscoveryCapabilities() });
  } catch (error: unknown) { next(error); }
}

export async function jobs(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await creatorService.listCreatorJobs()); }
  catch (error: unknown) { next(error); }
}

export async function job(
  req: Request<{ jobId: UUID }>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try { return R.ok(res, await creatorService.getCreatorJob(req.params.jobId)); }
  catch (error: unknown) { next(error); }
}

export async function createJob(
  req: Request<Record<string, string>, unknown, creatorService.CreateCreatorJobInput>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.created(res, await creatorService.createCreatorJob(req.body, req.user.userId));
  } catch (error: unknown) { next(error); }
}

export async function generateJob(
  req: Request<{ jobId: UUID }>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.ok(res, await creatorService.generateCreatorJob(req.params.jobId));
  } catch (error: unknown) { next(error); }
}

export async function reviewJob(
  req: Request<{ jobId: UUID }, unknown, { decision: 'APPROVE' | 'REJECT'; note?: string | null }>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.ok(res, await creatorService.reviewCreatorJob(
      req.params.jobId,
      req.user.userId,
      req.body.decision,
      req.body.note,
    ));
  } catch (error: unknown) { next(error); }
}

export async function materialiseJob(
  req: Request<{ jobId: UUID }>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.created(res, await creatorService.materialiseCreatorJob(req.params.jobId, req.user.userId));
  } catch (error: unknown) { next(error); }
}

export async function submitJobToLearning(
  req: Request<{ jobId: UUID }>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.ok(res, await submissionService.submitCreatorJobToLearning(req.params.jobId, req.user.userId));
  } catch (error: unknown) { next(error); }
}

export async function discoverSources(
  req: Request<Record<string, string>, unknown, discoveryService.DiscoverSourcesInput>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.ok(res, await discoveryService.discoverSources(req.body, req.user.userId));
  } catch (error: unknown) { next(error); }
}

export async function discoveryRuns(_req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try { return R.ok(res, await discoveryService.listDiscoveryRuns()); }
  catch (error: unknown) { next(error); }
}

export async function discoveryRun(
  req: Request<{ runId: UUID }>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try { return R.ok(res, await discoveryService.getDiscoveryRun(req.params.runId)); }
  catch (error: unknown) { next(error); }
}

export async function stageDiscoveryCandidate(
  req: Request<{ candidateId: UUID }>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.created(res, await discoveryService.stageDiscoveryCandidate(req.params.candidateId, req.user.userId));
  } catch (error: unknown) { next(error); }
}

export async function updateIntakeEvidence(
  req: Request<{ intakeId: UUID }, unknown, governanceService.UpdateIntakeEvidenceInput>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    if (!req.user) return R.unauthorized(res);
    return R.ok(res, await governanceService.updateIntakeEvidence(req.params.intakeId, req.body, req.user.userId));
  } catch (error: unknown) { next(error); }
}
