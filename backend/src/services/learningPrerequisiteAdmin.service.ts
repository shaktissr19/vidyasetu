import type { PoolClient, QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';

export type PrerequisiteStrength = 'HELPFUL' | 'REQUIRED';

export interface SavePrerequisite {
  conceptId: UUID;
  strength: PrerequisiteStrength;
  rationale?: string | null;
}

interface ConceptRow extends QueryResultRow {
  id: UUID;
  code: string;
  name: string;
  name_hi: string | null;
  grade_id: UUID;
  grade_code: string;
  class_number: number | null;
  subject_code: string;
  subject_name: string | null;
  chapter_title: string | null;
}

interface PrerequisiteRow extends QueryResultRow {
  prerequisite_concept_id: UUID;
  strength: PrerequisiteStrength;
  rationale: string | null;
  code: string;
  name: string;
  name_hi: string | null;
  subject_code: string;
  subject_name: string | null;
  chapter_title: string | null;
  grade_code: string;
  class_number: number | null;
}

function appError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

async function conceptForUpdate(client: PoolClient, conceptId: UUID): Promise<ConceptRow> {
  const { rows: [row] } = await client.query<ConceptRow>(
    `SELECT lc.id,lc.code,lc.name,lc.name_hi,lc.grade_id,egl.code AS grade_code,egl.class_number,
            lc.subject_code,sub.name AS subject_name,lc.chapter_title
     FROM learning_concepts lc
     JOIN education_grade_levels egl ON egl.id=lc.grade_id
     LEFT JOIN subjects sub ON sub.id=lc.subject_id
     WHERE lc.id=$1 AND lc.is_active=TRUE
     FOR UPDATE OF lc`,
    [conceptId],
  );
  if (!row) throw appError('Learning concept not found', 404);
  return row;
}

async function wouldCreateCycle(client: PoolClient, conceptId: UUID, prerequisiteId: UUID): Promise<boolean> {
  const { rows: [row] } = await client.query<{ cycle: boolean } & QueryResultRow>(
    `WITH RECURSIVE prerequisite_chain AS (
       SELECT prerequisite_concept_id AS id
       FROM learning_concept_prerequisites
       WHERE concept_id=$2
       UNION
       SELECT lcp.prerequisite_concept_id
       FROM learning_concept_prerequisites lcp
       JOIN prerequisite_chain pc ON pc.id=lcp.concept_id
     )
     SELECT EXISTS(SELECT 1 FROM prerequisite_chain WHERE id=$1) AS cycle`,
    [conceptId, prerequisiteId],
  );
  return Boolean(row?.cycle);
}

export async function listConceptPrerequisites(conceptId: UUID) {
  const { rows: [concept] } = await query<ConceptRow>(
    `SELECT lc.id,lc.code,lc.name,lc.name_hi,lc.grade_id,egl.code AS grade_code,egl.class_number,
            lc.subject_code,sub.name AS subject_name,lc.chapter_title
     FROM learning_concepts lc
     JOIN education_grade_levels egl ON egl.id=lc.grade_id
     LEFT JOIN subjects sub ON sub.id=lc.subject_id
     WHERE lc.id=$1 AND lc.is_active=TRUE`,
    [conceptId],
  );
  if (!concept) throw appError('Learning concept not found', 404);

  const { rows } = await query<PrerequisiteRow>(
    `SELECT lcp.prerequisite_concept_id,lcp.strength,lcp.rationale,
            pre.code,pre.name,pre.name_hi,pre.subject_code,sub.name AS subject_name,
            pre.chapter_title,egl.code AS grade_code,egl.class_number
     FROM learning_concept_prerequisites lcp
     JOIN learning_concepts pre ON pre.id=lcp.prerequisite_concept_id AND pre.is_active=TRUE
     JOIN education_grade_levels egl ON egl.id=pre.grade_id
     LEFT JOIN subjects sub ON sub.id=pre.subject_id
     WHERE lcp.concept_id=$1
     ORDER BY CASE lcp.strength WHEN 'REQUIRED' THEN 0 ELSE 1 END,pre.sequence,pre.code`,
    [conceptId],
  );

  return {
    concept: {
      id: concept.id,
      code: concept.code,
      name: concept.name,
      nameHi: concept.name_hi,
      gradeCode: concept.grade_code,
      classNumber: concept.class_number,
      subjectCode: concept.subject_code,
      subjectName: concept.subject_name,
      chapterTitle: concept.chapter_title,
    },
    prerequisites: rows.map((row) => ({
      conceptId: row.prerequisite_concept_id,
      code: row.code,
      name: row.name,
      nameHi: row.name_hi,
      strength: row.strength,
      rationale: row.rationale,
      gradeCode: row.grade_code,
      classNumber: row.class_number,
      subjectCode: row.subject_code,
      subjectName: row.subject_name,
      chapterTitle: row.chapter_title,
    })),
  };
}

/**
 * Replace one concept's prerequisite set as a single governed transaction.
 * Initial Diagnostic 2.0 scope intentionally keeps prerequisite links within
 * the same canonical grade. This avoids accidental cross-grade curriculum
 * jumps until explicit cross-grade review governance is introduced.
 */
export async function replaceConceptPrerequisites(conceptId: UUID, prerequisites: SavePrerequisite[]) {
  const unique = new Map<string, SavePrerequisite>();
  for (const prerequisite of prerequisites) unique.set(prerequisite.conceptId, prerequisite);
  if (unique.size !== prerequisites.length) throw appError('Duplicate prerequisite concepts are not allowed', 400);

  await transaction(async (client) => {
    const concept = await conceptForUpdate(client, conceptId);
    if (prerequisites.some((item) => item.conceptId === conceptId)) {
      throw appError('A concept cannot be its own prerequisite', 400);
    }

    const ids = prerequisites.map((item) => item.conceptId);
    if (ids.length) {
      const { rows: candidates } = await client.query<ConceptRow>(
        `SELECT lc.id,lc.code,lc.name,lc.name_hi,lc.grade_id,egl.code AS grade_code,egl.class_number,
                lc.subject_code,sub.name AS subject_name,lc.chapter_title
         FROM learning_concepts lc
         JOIN education_grade_levels egl ON egl.id=lc.grade_id
         LEFT JOIN subjects sub ON sub.id=lc.subject_id
         WHERE lc.id=ANY($1::uuid[]) AND lc.is_active=TRUE
         FOR UPDATE OF lc`,
        [ids],
      );
      if (candidates.length !== ids.length) throw appError('One or more prerequisite concepts are invalid or inactive', 400);
      const crossGrade = candidates.find((candidate) => candidate.grade_id !== concept.grade_id);
      if (crossGrade) {
        throw appError(`Prerequisite ${crossGrade.code} is outside ${concept.grade_code}. Diagnostic 2.0 allows same-grade prerequisite links only.`, 400);
      }
    }

    // Remove only this concept's outgoing prerequisite set. Incoming links
    // from other concepts remain untouched.
    await client.query(`DELETE FROM learning_concept_prerequisites WHERE concept_id=$1`, [conceptId]);

    for (const prerequisite of prerequisites) {
      if (await wouldCreateCycle(client, conceptId, prerequisite.conceptId)) {
        throw appError('This prerequisite would create a circular concept dependency', 409);
      }
      await client.query(
        `INSERT INTO learning_concept_prerequisites
           (concept_id,prerequisite_concept_id,strength,rationale)
         VALUES($1,$2,$3,$4)`,
        [conceptId, prerequisite.conceptId, prerequisite.strength, prerequisite.rationale || null],
      );
    }
  });

  return listConceptPrerequisites(conceptId);
}
