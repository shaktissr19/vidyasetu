import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';

export interface UpdateLearningConceptInput {
  nameHi?: string | null;
  description?: string | null;
  descriptionHi?: string | null;
  learningOutcome?: string | null;
  learningOutcomeHi?: string | null;
}

function clean(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value?.trim() || '';
  return trimmed || null;
}

export async function updateLearningConceptMetadata(conceptId: UUID, input: UpdateLearningConceptInput) {
  const { rows: [existing] } = await query<QueryResultRow>(
    `SELECT id FROM learning_concepts WHERE id=$1::uuid AND is_active=TRUE`,
    [conceptId],
  );
  if (!existing) throw Object.assign(new Error('Learning concept not found'), { statusCode: 404 });

  const nameHi = clean(input.nameHi);
  const description = clean(input.description);
  const descriptionHi = clean(input.descriptionHi);
  const learningOutcome = clean(input.learningOutcome);
  const learningOutcomeHi = clean(input.learningOutcomeHi);

  const { rows: [updated] } = await query(
    `UPDATE learning_concepts
     SET name_hi=CASE WHEN $2::boolean THEN $3 ELSE name_hi END,
         description=CASE WHEN $4::boolean THEN $5 ELSE description END,
         description_hi=CASE WHEN $6::boolean THEN $7 ELSE description_hi END,
         learning_outcome=CASE WHEN $8::boolean THEN $9 ELSE learning_outcome END,
         learning_outcome_hi=CASE WHEN $10::boolean THEN $11 ELSE learning_outcome_hi END,
         updated_at=NOW()
     WHERE id=$1::uuid
     RETURNING id,code,name,name_hi,description,description_hi,learning_outcome,learning_outcome_hi,
               node_type,academic_year,subject_code,chapter_code,chapter_title,registry_status,sequence`,
    [
      conceptId,
      input.nameHi !== undefined, nameHi ?? null,
      input.description !== undefined, description ?? null,
      input.descriptionHi !== undefined, descriptionHi ?? null,
      input.learningOutcome !== undefined, learningOutcome ?? null,
      input.learningOutcomeHi !== undefined, learningOutcomeHi ?? null,
    ],
  );
  return updated;
}
