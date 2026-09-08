import type { NextFunction, Request, Response } from 'express';
import * as studentLearningHubService from '../services/studentLearningHub.service';
import * as studentAssessmentCatalogueV3 from '../services/studentAssessmentCatalogueV3.service';
import * as studentConceptMasteryService from '../services/studentConceptMastery.service';
import * as studentAdaptiveLearningService from '../services/studentAdaptiveLearning.service';
import * as studentAdaptiveIntelligenceService from '../services/studentAdaptiveIntelligence.service';
import * as studentDiagnosticRuntimeService from '../services/studentDiagnosticRuntime.service';
import * as R from '../utils/response';

export async function getLearningHome(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    const [rawHome, conceptMastery] = await Promise.all([
      studentLearningHubService.getLearningHome(user.userId),
      studentConceptMasteryService.getStudentConceptMastery(user.userId),
    ]);
    const home = await studentAssessmentCatalogueV3.replaceHomeAssessments(user.userId, rawHome);
    const basePlan = await studentAdaptiveLearningService.getAdaptiveLearningPlan(user.userId, conceptMastery);
    const adaptivePlan = await studentDiagnosticRuntimeService.diagnosticIntelligenceAvailable()
      ? await studentAdaptiveIntelligenceService.enrichAdaptivePlanWithDiagnostics(user.userId, basePlan)
      : basePlan;
    return R.ok(res, { ...home, conceptMastery, adaptivePlan });
  } catch (error: unknown) { next(error); }
}

export async function listAssessments(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    return R.ok(res, await studentAssessmentCatalogueV3.listAssessments(user.userId));
  } catch (error: unknown) { next(error); }
}

export async function getAssessment(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    return R.ok(res, await studentAssessmentCatalogueV3.getAssessment(user.userId, req.params.assessmentId));
  } catch (error: unknown) { next(error); }
}

export async function startAssessment(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    return R.ok(res, await studentAssessmentCatalogueV3.startAssessment(user.userId, req.params.assessmentId));
  } catch (error: unknown) { next(error); }
}
