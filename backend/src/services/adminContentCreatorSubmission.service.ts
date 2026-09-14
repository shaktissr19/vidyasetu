import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';

export type CreatorLearningTarget = 'PUBLIC_LEARNING' | 'PRIVATE_LEARNING';

interface CreatorSubmissionJob extends QueryResultRow {
  id: UUID;
  status: string;
  visibility: string;
  access_requirement: string;
  submitted_to_learning_at: string | Date | null;
}

interface CreatorOutputRow extends QueryResultRow {
  output_type: 'RESOURCE' | 'QUESTION' | 'ASSESSMENT';
  resource_id: UUID | null;
  question_id: UUID | null;
  assessment_id: UUID | null;
}

function appError(message: string, statusCode = 400): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

async function assertSubmissionSchema(): Promise<void> {
  const { rows: [row] } = await query<{ ready: boolean } & QueryResultRow>(
    `SELECT EXISTS(
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='learning_creator_jobs'
         AND column_name='submitted_to_learning_at'
     ) AS ready`,
  );
  if (!row?.ready) throw appError('Creator Learning submission requires database migration 046', 503);
}

export function learningTargetFromVisibility(visibility: string): CreatorLearningTarget {
  return visibility === 'PUBLIC' ? 'PUBLIC_LEARNING' : 'PRIVATE_LEARNING';
}

export async function submitCreatorJobToLearning(jobId: UUID, adminId: UUID) {
  await assertSubmissionSchema();

  return transaction(async (client) => {
    const { rows: [job] } = await client.query<CreatorSubmissionJob>(
      `SELECT id,status,visibility,access_requirement,submitted_to_learning_at
       FROM learning_creator_jobs WHERE id=$1::uuid FOR UPDATE`,
      [jobId],
    );
    if (!job) throw appError('Content Creator job not found', 404);
    if (job.status !== 'MATERIALISED') {
      throw appError('Creator output must be materialised into Learning Studio DRAFTS before submission');
    }
    if (job.submitted_to_learning_at) {
      throw appError('Creator output has already been submitted to Learning Studio review');
    }

    const target = learningTargetFromVisibility(job.visibility);
    if (target === 'PUBLIC_LEARNING' && (job.visibility !== 'PUBLIC' || job.access_requirement !== 'PUBLIC')) {
      throw appError('Public Learning submission requires PUBLIC visibility and PUBLIC access');
    }
    if (target === 'PRIVATE_LEARNING' && (job.visibility === 'PUBLIC' || job.access_requirement === 'PUBLIC')) {
      throw appError('Private Learning submission cannot use PUBLIC visibility/access');
    }

    const { rows: outputs } = await client.query<CreatorOutputRow>(
      `SELECT output_type,resource_id,question_id,assessment_id
       FROM learning_creator_outputs WHERE job_id=$1::uuid ORDER BY created_at,id`,
      [jobId],
    );
    if (!outputs.length) throw appError('Creator job has no materialised Learning outputs');

    const resourceIds = outputs.map((row) => row.resource_id).filter((id): id is UUID => Boolean(id));
    const questionIds = outputs.map((row) => row.question_id).filter((id): id is UUID => Boolean(id));
    const assessmentIds = outputs.map((row) => row.assessment_id).filter((id): id is UUID => Boolean(id));

    if (resourceIds.length) {
      const { rows } = await client.query<{ id: UUID; review_status: string; visibility: string; access_requirement: string }>(
        `SELECT id,review_status,visibility,access_requirement
         FROM learning_resources WHERE id=ANY($1::uuid[]) FOR UPDATE`,
        [resourceIds],
      );
      if (rows.length !== resourceIds.length || rows.some((row) => row.review_status !== 'DRAFT')) {
        throw appError('All Creator Learning resources must still be DRAFT before submission');
      }
      if (target === 'PUBLIC_LEARNING' && rows.some((row) => row.visibility !== 'PUBLIC' || row.access_requirement !== 'PUBLIC')) {
        throw appError('Public Learning resource policy changed after Creator materialisation');
      }
      if (target === 'PRIVATE_LEARNING' && rows.some((row) => row.visibility === 'PUBLIC' || row.access_requirement === 'PUBLIC')) {
        throw appError('Private Learning resource policy changed after Creator materialisation');
      }
    }

    if (questionIds.length) {
      const { rows } = await client.query<{ id: UUID; review_status: string; visibility: string }>(
        `SELECT id,review_status,visibility FROM learning_questions
         WHERE id=ANY($1::uuid[]) FOR UPDATE`,
        [questionIds],
      );
      if (rows.length !== questionIds.length || rows.some((row) => row.review_status !== 'DRAFT')) {
        throw appError('All Creator questions must still be DRAFT before submission');
      }
      if (target === 'PUBLIC_LEARNING' && rows.some((row) => row.visibility !== 'PUBLIC')) {
        throw appError('Public Learning question policy changed after Creator materialisation');
      }
      if (target === 'PRIVATE_LEARNING' && rows.some((row) => row.visibility === 'PUBLIC')) {
        throw appError('Private Learning question policy changed after Creator materialisation');
      }
    }

    if (assessmentIds.length) {
      const { rows } = await client.query<{ id: UUID; review_status: string; visibility: string; access_requirement: string }>(
        `SELECT id,review_status,visibility,access_requirement FROM learning_assessments
         WHERE id=ANY($1::uuid[]) FOR UPDATE`,
        [assessmentIds],
      );
      if (rows.length !== assessmentIds.length || rows.some((row) => row.review_status !== 'DRAFT')) {
        throw appError('All Creator assessments must still be DRAFT before submission');
      }
      if (target === 'PUBLIC_LEARNING' && rows.some((row) => row.visibility !== 'PUBLIC' || row.access_requirement !== 'PUBLIC')) {
        throw appError('Public Learning assessment policy changed after Creator materialisation');
      }
      if (target === 'PRIVATE_LEARNING' && rows.some((row) => row.visibility === 'PUBLIC' || row.access_requirement === 'PUBLIC')) {
        throw appError('Private Learning assessment policy changed after Creator materialisation');
      }
    }

    if (resourceIds.length) {
      await client.query(
        `UPDATE learning_resources SET review_status='SUBMITTED'::learning_review_status
         WHERE id=ANY($1::uuid[])`,
        [resourceIds],
      );
      for (const resourceId of resourceIds) {
        await client.query(
          `INSERT INTO learning_resource_reviews(resource_id,reviewer_id,from_status,to_status,review_note)
           VALUES($1::uuid,$2::uuid,'DRAFT'::learning_review_status,'SUBMITTED'::learning_review_status,$3)`,
          [resourceId, adminId, `Submitted from AI Content Creator to ${target === 'PUBLIC_LEARNING' ? 'Public Learning' : 'Private Learning'} review`],
        );
      }
    }

    if (questionIds.length) {
      await client.query(
        `UPDATE learning_questions SET review_status='SUBMITTED'::learning_review_status
         WHERE id=ANY($1::uuid[])`,
        [questionIds],
      );
    }

    if (assessmentIds.length) {
      await client.query(
        `UPDATE learning_assessments SET review_status='SUBMITTED'::learning_review_status
         WHERE id=ANY($1::uuid[])`,
        [assessmentIds],
      );
    }

    const { rows: [updated] } = await client.query(
      `UPDATE learning_creator_jobs
       SET submitted_to_learning_at=NOW(),submitted_to_learning_by=$2::uuid
       WHERE id=$1::uuid
       RETURNING id,submitted_to_learning_at`,
      [jobId, adminId],
    );

    return {
      jobId,
      target,
      reviewStatus: 'SUBMITTED' as const,
      visibility: job.visibility,
      accessRequirement: job.access_requirement,
      resourceIds,
      questionIds,
      assessmentIds,
      submittedAt: updated.submitted_to_learning_at,
      message: target === 'PUBLIC_LEARNING'
        ? 'Submitted to Public Learning review. Nothing is public until the normal Learning Studio review reaches PUBLISHED.'
        : 'Submitted to Private Learning review. Nothing is learner-visible until the normal Learning Studio review reaches PUBLISHED.',
    };
  });
}
