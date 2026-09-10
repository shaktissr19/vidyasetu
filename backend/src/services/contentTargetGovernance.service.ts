import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';
import { getConceptReadiness } from './learningQuality.service';
import { updateContentTarget, type UpdateContentTargetInput } from './contentFactory.service';

interface TargetRow extends QueryResultRow {
  id: UUID;
  grade_id: UUID;
  subject_code: string;
  expected_concepts: number | null;
}

interface ConceptRow extends QueryResultRow { id: UUID; }

function appError(message: string, statusCode = 400): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

export async function updateGovernedContentTarget(targetId: UUID, input: UpdateContentTargetInput) {
  if (input.targetStatus === 'LEARNER_READY') {
    const { rows: [target] } = await query<TargetRow>(
      `SELECT id,grade_id,subject_code,expected_concepts FROM learning_content_targets WHERE id=$1::uuid`,
      [targetId],
    );
    if (!target) throw appError('Content target not found', 404);
    if (target.expected_concepts == null || target.expected_concepts <= 0) {
      throw appError('Expected concept count must be set before a content target can become LEARNER_READY');
    }
    const { rows: concepts } = await query<ConceptRow>(
      `SELECT id FROM learning_concepts
       WHERE grade_id=$1::uuid AND subject_code=$2 AND is_active=TRUE
       ORDER BY sequence,code`,
      [target.grade_id,target.subject_code],
    );
    if (concepts.length < target.expected_concepts) {
      throw appError(`Target cannot become LEARNER_READY: ${concepts.length}/${target.expected_concepts} expected concepts are registered`);
    }
    const incomplete: Array<{ id: UUID; score: number; blocker?: string }> = [];
    for (const concept of concepts) {
      const readiness = await getConceptReadiness(concept.id);
      if (!readiness.readyForPublication || readiness.score < 90) {
        incomplete.push({ id: concept.id, score: readiness.score, blocker: readiness.blockers[0] });
      }
    }
    if (incomplete.length) {
      const first = incomplete[0];
      throw appError(`Target cannot become LEARNER_READY: ${incomplete.length} concept(s) are not learner-ready. First incomplete concept is ${first.id} at ${first.score}%${first.blocker ? ` — ${first.blocker}` : ''}`);
    }
  }
  return updateContentTarget(targetId,input);
}
