import type { NextFunction, Request, Response } from 'express';
import * as studentLearningHubService from '../services/studentLearningHub.service';
import * as studentConceptMasteryService from '../services/studentConceptMastery.service';
import * as studentAdaptiveLearningService from '../services/studentAdaptiveLearning.service';
import * as R from '../utils/response';

export async function getLearningHome(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    const [home, conceptMastery] = await Promise.all([
      studentLearningHubService.getLearningHome(user.userId),
      studentConceptMasteryService.getStudentConceptMastery(user.userId),
    ]);
    const adaptivePlan = await studentAdaptiveLearningService.getAdaptiveLearningPlan(user.userId, conceptMastery);
    return R.ok(res, { ...home, conceptMastery, adaptivePlan });
  } catch (err: unknown) { next(err); }
}

export async function getAdaptiveLearningPlan(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    const conceptMastery = await studentConceptMasteryService.getStudentConceptMastery(user.userId);
    const adaptivePlan = await studentAdaptiveLearningService.getAdaptiveLearningPlan(user.userId, conceptMastery);
    return R.ok(res, adaptivePlan);
  } catch (err: unknown) { next(err); }
}

export async function updateLearningResourceProgress(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    const progress = await studentLearningHubService.updateResourceProgress(
      user.userId,
      req.params.resourceId,
      Number(req.body.progressPct),
    );
    await studentConceptMasteryService.reconcileStudentConceptProgress(user.userId);
    return R.ok(res, progress);
  } catch (err: unknown) { next(err); }
}

export async function submitLearningAssessment(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    const result = await studentLearningHubService.submitAssessment(
      user.userId,
      req.params.attemptId,
      req.body.answers || [],
      req.body.timeSpentSecs,
    );
    await studentConceptMasteryService.reconcileStudentConceptProgress(user.userId);
    return R.ok(res, result);
  } catch (err: unknown) { next(err); }
}
