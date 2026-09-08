import type { QueryResultRow } from 'pg';
import { query } from '../config/db';

type ResourceIdentity = { id: string };

type LearningHomeWithResources = {
  recommendedResources: ResourceIdentity[];
};

interface BilingualResourceRow extends QueryResultRow {
  id: string;
  title_hi: string | null;
  summary_hi: string | null;
}

/**
 * Adds bilingual presentation fields to the existing canonical learner home.
 * Identity and progress remain keyed by the original learning resource id;
 * language is presentation only and never creates a second learning record.
 */
export async function enrichHomeResourcesBilingual<T extends LearningHomeWithResources>(home: T): Promise<T> {
  const resourceIds = Array.from(new Set((home.recommendedResources || []).map((item) => item.id).filter(Boolean)));
  if (!resourceIds.length) return home;

  const { rows } = await query<BilingualResourceRow>(
    `SELECT id,title_hi,summary_hi
     FROM learning_resources
     WHERE id = ANY($1::uuid[])`,
    [resourceIds],
  );
  const bilingualById = new Map(rows.map((row) => [row.id, row]));

  return {
    ...home,
    recommendedResources: home.recommendedResources.map((item) => ({
      ...item,
      ...(bilingualById.get(item.id) || {}),
    })),
  };
}
