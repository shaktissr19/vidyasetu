import { Router, type NextFunction, type Request, type Response } from 'express';
import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { z } from 'zod';
import { query } from '../config/db';
import * as practiceService from '../services/adminLearningPractice.service';
import { assertDiagnosticGovernanceReady, getDiagnosticGovernanceReadiness } from '../services/diagnosticGovernance.service';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import * as R from '../utils/response';

const router = Router();

router.use(authenticate);
router.use(authorize('SUPER_ADMIN'));

const statusSchema = z.object({
  status: z.enum(['DRAFT','SUBMITTED','ACADEMIC_REVIEW','APPROVED','PUBLISHED','ARCHIVED']),
});

interface AssessmentTypeRow extends QueryResultRow { assessment_type: string; }

async function isDiagnostic(assessmentId: UUID): Promise<boolean> {
  const { rows: [row] } = await query<AssessmentTypeRow>(
    `SELECT assessment_type::text FROM learning_assessments WHERE id=$1::uuid`,
    [assessmentId],
  );
  return row?.assessment_type === 'DIAGNOSTIC';
}

router.get('/diagnostics/:assessmentId/readiness', async (
  req: Request<{ assessmentId: UUID }>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> => {
  try {
    return R.ok(res, await getDiagnosticGovernanceReadiness(req.params.assessmentId));
  } catch (error: unknown) { next(error); }
});

// Intercepts DIAGNOSTIC assessment status changes only. Non-diagnostic
// assessments fall through untouched to the established Learning Studio route.
router.patch('/assessments/:assessmentId/status', validate(statusSchema), async (
  req: Request<{ assessmentId: UUID }, unknown, { status: string }>,
  res: Response,
  next: NextFunction,
): Promise<Response | void> => {
  try {
    if (!(await isDiagnostic(req.params.assessmentId))) return next();
    if (!req.user) return R.unauthorized(res);
    if (['APPROVED','PUBLISHED'].includes(req.body.status)) {
      await assertDiagnosticGovernanceReady(req.params.assessmentId);
    }
    return R.ok(res, await practiceService.updateAssessmentStatus(
      req.params.assessmentId,
      req.body.status,
      req.user.userId,
    ));
  } catch (error: unknown) { next(error); }
});

export = router;
