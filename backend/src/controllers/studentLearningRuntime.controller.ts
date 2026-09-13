import type { NextFunction, Request, Response } from 'express';
import * as studentLearningHubService from '../services/studentLearningHub.service';
import * as studentCanonicalLearningService from '../services/studentCanonicalLearning.service';
import * as studentConceptMasteryService from '../services/studentConceptMastery.service';
import * as studentAdaptiveLearningService from '../services/studentAdaptiveLearning.service';
import * as studentAdaptiveIntelligenceService from '../services/studentAdaptiveIntelligence.service';
import * as studentDiagnosticIntelligenceService from '../services/studentDiagnosticIntelligence.service';
import * as studentDiagnosticRuntimeService from '../services/studentDiagnosticRuntime.service';
import * as studentPersonalizedJourneyService from '../services/studentPersonalizedJourney.service';
import {
  accessibleLearningAssessmentIds,
  accessibleLearningResourceIds,
  getLearningAccessContext,
} from '../services/learningEntitlement.service';
import logger = require('../utils/logger');
import * as R from '../utils/response';

export async function getLearningHome(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    const [home, conceptMastery, access] = await Promise.all([
      studentLearningHubService.getLearningHome(user.userId),
      studentConceptMasteryService.getStudentConceptMastery(user.userId),
      getLearningAccessContext(user.userId),
    ]);

    const [homeResourceIds, homeAssessmentIds] = await Promise.all([
      accessibleLearningResourceIds(
        [...home.recommendedResources.map((item) => item.id), ...home.bookmarks.map((item) => item.id)],
        access,
      ),
      accessibleLearningAssessmentIds(home.assessments.map((item) => item.id), access),
    ]);

    const entitlementSafeHome = {
      ...home,
      recommendedResources: home.recommendedResources.filter((item) => homeResourceIds.has(String(item.id))),
      assessments: home.assessments.filter((item) => homeAssessmentIds.has(String(item.id))),
      bookmarks: home.bookmarks.filter((item) => homeResourceIds.has(String(item.id))),
    };

    const basePlan = await studentAdaptiveLearningService.getAdaptiveLearningPlan(user.userId, conceptMastery);
    const adaptivePlan = await studentDiagnosticRuntimeService.diagnosticIntelligenceAvailable()
      ? await studentAdaptiveIntelligenceService.enrichAdaptivePlanWithDiagnostics(user.userId, basePlan)
      : basePlan;

    const planResourceIds = adaptivePlan.actions
      .filter((action) => action.target.kind === 'RESOURCE')
      .map((action) => action.target.id);
    const planAssessmentIds = adaptivePlan.actions
      .filter((action) => action.target.kind === 'ASSESSMENT')
      .map((action) => action.target.id);
    const [allowedPlanResources, allowedPlanAssessments] = await Promise.all([
      accessibleLearningResourceIds(planResourceIds, access),
      accessibleLearningAssessmentIds(planAssessmentIds, access),
    ]);
    const entitlementSafeActions = adaptivePlan.actions.filter((action) => (
      action.target.kind === 'RESOURCE'
        ? allowedPlanResources.has(String(action.target.id))
        : allowedPlanAssessments.has(String(action.target.id))
    ));
    const entitlementSafePlan = {
      ...adaptivePlan,
      actions: entitlementSafeActions,
      summary: {
        ...adaptivePlan.summary,
        nextActions: entitlementSafeActions.length,
        estimatedMinutes: entitlementSafeActions.reduce((total, action) => total + Number(action.estimatedMinutes || 0), 0),
      },
    };

    return R.ok(res, {
      ...entitlementSafeHome,
      access: {
        tier: access.tier,
        individualSubscriber: access.individualSubscriber,
        schoolLicensed: access.schoolLicensed,
        subscriberAccess: access.subscriberAccess,
      },
      conceptMastery,
      adaptivePlan: entitlementSafePlan,
    });
  } catch (err: unknown) { next(err); }
}

export async function getAdaptiveLearningPlan(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    const access = await getLearningAccessContext(user.userId);
    const conceptMastery = await studentConceptMasteryService.getStudentConceptMastery(user.userId);
    const basePlan = await studentAdaptiveLearningService.getAdaptiveLearningPlan(user.userId, conceptMastery);
    const adaptivePlan = await studentDiagnosticRuntimeService.diagnosticIntelligenceAvailable()
      ? await studentAdaptiveIntelligenceService.enrichAdaptivePlanWithDiagnostics(user.userId, basePlan)
      : basePlan;
    const resourceIds = adaptivePlan.actions.filter((action) => action.target.kind === 'RESOURCE').map((action) => action.target.id);
    const assessmentIds = adaptivePlan.actions.filter((action) => action.target.kind === 'ASSESSMENT').map((action) => action.target.id);
    const [allowedResources, allowedAssessments] = await Promise.all([
      accessibleLearningResourceIds(resourceIds, access),
      accessibleLearningAssessmentIds(assessmentIds, access),
    ]);
    const actions = adaptivePlan.actions.filter((action) => (
      action.target.kind === 'RESOURCE'
        ? allowedResources.has(String(action.target.id))
        : allowedAssessments.has(String(action.target.id))
    ));
    return R.ok(res, {
      ...adaptivePlan,
      actions,
      summary: {
        ...adaptivePlan.summary,
        nextActions: actions.length,
        estimatedMinutes: actions.reduce((total, action) => total + Number(action.estimatedMinutes || 0), 0),
      },
    });
  } catch (err: unknown) { next(err); }
}

export async function getPersonalizedJourney(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    return R.ok(res, await studentPersonalizedJourneyService.getTodayPersonalizedJourney(user.userId));
  } catch (err: unknown) { next(err); }
}

export async function getPersonalizedPreferences(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    return R.ok(res, await studentPersonalizedJourneyService.getPersonalizedPreferences(user.userId));
  } catch (err: unknown) { next(err); }
}

export async function updatePersonalizedPreferences(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    return R.ok(res, await studentPersonalizedJourneyService.updatePersonalizedPreferences(user.userId, {
      dailyMinutes: Number(req.body.dailyMinutes),
      planStyle: req.body.planStyle,
    }));
  } catch (err: unknown) { next(err); }
}

export async function skipPersonalizedJourneyItem(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    return R.ok(res, await studentPersonalizedJourneyService.skipPersonalizedJourneyItem(user.userId, req.params.itemId));
  } catch (err: unknown) { next(err); }
}

export async function getDiagnosticProfile(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    if (!(await studentDiagnosticRuntimeService.diagnosticIntelligenceAvailable())) {
      return R.ok(res, {
        generatedAt: new Date().toISOString(),
        summary: { conceptsAssessed: 0, reviewDue: 0, activeMisconceptions: 0, lowConfidence: 0 },
        concepts: [],
        schemaReady: false,
      });
    }
    await studentDiagnosticRuntimeService.reconcileMissingEvidenceForUser(user.userId);
    const profile = await studentDiagnosticIntelligenceService.getStudentDiagnosticProfile(user.userId);
    return R.ok(res, { ...profile, schemaReady: true });
  } catch (err: unknown) { next(err); }
}

export async function updateLearningResourceProgress(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const user = req.user;
    if (!user) return R.unauthorized(res);
    const progress = await studentCanonicalLearningService.updateCanonicalResourceProgress(
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

    // Grading is the primary learner transaction. Diagnostic evidence is
    // idempotently repairable, so a transient intelligence-write failure must
    // never hide an already-graded result from the learner.
    try {
      await studentDiagnosticRuntimeService.captureAttemptEvidenceForUser(
        user.userId,
        req.params.attemptId,
        result.assessment_id,
      );
    } catch (diagnosticError: unknown) {
      logger.error('Diagnostic evidence capture deferred; it will be reconciled from the graded attempt', {
        attemptId: req.params.attemptId,
        assessmentId: result.assessment_id,
        error: diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError),
      });
    }

    await studentConceptMasteryService.reconcileStudentConceptProgress(user.userId);
    return R.ok(res, result);
  } catch (err: unknown) { next(err); }
}
