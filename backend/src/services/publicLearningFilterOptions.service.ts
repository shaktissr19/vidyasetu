import { query } from '../config/db';

export async function getPublicLearningFilterOptions() {
  const { rows: [row] } = await query(
    `SELECT
      COALESCE((
        SELECT jsonb_agg(x ORDER BY x->>'name') FROM (
          SELECT DISTINCT jsonb_build_object(
            'code', COALESCE(sub.code, lr.subject_label),
            'name', COALESCE(sub.name, lr.subject_label)
          ) AS x
          FROM learning_resources lr
          LEFT JOIN subjects sub ON sub.id=lr.subject_id
          WHERE lr.visibility='PUBLIC' AND lr.review_status='PUBLISHED'
            AND COALESCE(sub.name, lr.subject_label) IS NOT NULL
        ) s
      ), '[]'::jsonb) AS subjects,
      COALESCE((
        SELECT jsonb_agg(x ORDER BY x->>'name') FROM (
          SELECT DISTINCT jsonb_build_object(
            'code', lc.code,
            'name', lc.name,
            'nameHi', lc.name_hi,
            'subjectCode', lc.subject_code,
            'chapterTitle', lc.chapter_title
          ) AS x
          FROM learning_resources lr
          JOIN learning_resource_concepts lrc ON lrc.resource_id=lr.id
          JOIN learning_concepts lc ON lc.id=lrc.concept_id
          WHERE lr.visibility='PUBLIC' AND lr.review_status='PUBLISHED' AND lc.is_active=TRUE
        ) c
      ), '[]'::jsonb) AS concepts,
      COALESCE((
        SELECT jsonb_agg(DISTINCT lr.resource_type::text ORDER BY lr.resource_type::text)
        FROM learning_resources lr
        WHERE lr.visibility='PUBLIC' AND lr.review_status='PUBLISHED'
      ), '[]'::jsonb) AS resource_types,
      COALESCE((
        SELECT jsonb_agg(DISTINCT lrc.journey_stage::text ORDER BY lrc.journey_stage::text)
        FROM learning_resources lr
        JOIN learning_resource_concepts lrc ON lrc.resource_id=lr.id
        WHERE lr.visibility='PUBLIC' AND lr.review_status='PUBLISHED' AND lrc.journey_stage IS NOT NULL
      ), '[]'::jsonb) AS journey_stages,
      jsonb_build_array(
        jsonb_build_object('code','en','name','English'),
        jsonb_build_object('code','hi','name','हिन्दी')
      ) AS languages`,
  );
  return {
    subjects: Array.isArray(row?.subjects) ? row.subjects : [],
    concepts: Array.isArray(row?.concepts) ? row.concepts : [],
    resourceTypes: Array.isArray(row?.resource_types) ? row.resource_types : [],
    journeyStages: Array.isArray(row?.journey_stages) ? row.journey_stages : [],
    languages: Array.isArray(row?.languages) ? row.languages : [],
  };
}
