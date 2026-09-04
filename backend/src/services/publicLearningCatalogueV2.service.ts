import { query } from '../config/db';

export interface PublicLearningCatalogueFilters {
  className?: number | null;
  gradeCode?: string | null;
  category?: string | null;
  board?: string | null;
  subject?: string | null;
  concept?: string | null;
  resourceType?: string | null;
  language?: string | null;
  journeyStage?: string | null;
  search?: string | null;
  limit?: number;
  featuredOnly?: boolean;
}

const PUBLIC_WHERE = `lr.visibility='PUBLIC' AND lr.review_status='PUBLISHED'`;

export async function listPublicLearningCatalogue(filters: PublicLearningCatalogueFilters = {}) {
  const values: unknown[] = [];
  const conditions: string[] = [PUBLIC_WHERE];
  const push = (value: unknown): number => { values.push(value); return values.length; };

  if (filters.gradeCode) {
    const p = push(filters.gradeCode.toUpperCase());
    conditions.push(`EXISTS (
      SELECT 1 FROM learning_resource_grades lrgf
      JOIN education_grade_levels eglf ON eglf.id=lrgf.grade_id
      WHERE lrgf.resource_id=lr.id AND eglf.code=$${p}
    )`);
  } else if (filters.className) {
    const p = push(filters.className);
    conditions.push(`(lr.class_min IS NULL OR lr.class_min <= $${p}) AND (lr.class_max IS NULL OR lr.class_max >= $${p})`);
  }

  if (filters.category) {
    const p = push(filters.category.toUpperCase());
    conditions.push(`lr.category::text=$${p}`);
  }

  if (filters.board) {
    const p = push(filters.board.toUpperCase());
    conditions.push(`EXISTS (
      SELECT 1 FROM learning_resource_boards lrbf
      JOIN education_boards ebf ON ebf.id=lrbf.board_id
      WHERE lrbf.resource_id=lr.id AND (ebf.code=$${p} OR ebf.code='COMMON')
    )`);
  }

  if (filters.subject) {
    const p = push(filters.subject.trim());
    conditions.push(`(
      UPPER(COALESCE(sub.code,''))=UPPER($${p})
      OR COALESCE(sub.name,'') ILIKE $${p}
      OR COALESCE(lr.subject_label,'') ILIKE $${p}
      OR EXISTS (
        SELECT 1 FROM learning_resource_concepts lrcsub
        JOIN learning_concepts lcsub ON lcsub.id=lrcsub.concept_id
        WHERE lrcsub.resource_id=lr.id
          AND (UPPER(lcsub.subject_code)=UPPER($${p}) OR lcsub.subject_code ILIKE $${p})
      )
    )`);
  }

  if (filters.concept) {
    const p = push(filters.concept.trim());
    conditions.push(`EXISTS (
      SELECT 1 FROM learning_resource_concepts lrcf
      JOIN learning_concepts lcf ON lcf.id=lrcf.concept_id
      WHERE lrcf.resource_id=lr.id
        AND (UPPER(lcf.code)=UPPER($${p}) OR lcf.name ILIKE $${p} OR COALESCE(lcf.name_hi,'') ILIKE $${p})
    )`);
  }

  if (filters.resourceType) {
    const p = push(filters.resourceType.toUpperCase());
    conditions.push(`lr.resource_type::text=$${p}`);
  }

  if (filters.language) {
    const language = filters.language.toLowerCase();
    if (language === 'hi') conditions.push(`NULLIF(BTRIM(lr.title_hi),'') IS NOT NULL`);
    else if (language === 'en') conditions.push(`NULLIF(BTRIM(lr.title),'') IS NOT NULL`);
  }

  if (filters.journeyStage) {
    const p = push(filters.journeyStage.toUpperCase());
    conditions.push(`EXISTS (
      SELECT 1 FROM learning_resource_concepts lrcj
      WHERE lrcj.resource_id=lr.id AND lrcj.journey_stage::text=$${p}
    )`);
  }

  if (filters.search) {
    const p = push(`%${filters.search.trim()}%`);
    conditions.push(`(
      lr.title ILIKE $${p} OR COALESCE(lr.title_hi,'') ILIKE $${p}
      OR COALESCE(lr.summary,'') ILIKE $${p} OR COALESCE(lr.summary_hi,'') ILIKE $${p}
      OR COALESCE(sub.name,'') ILIKE $${p} OR COALESCE(lr.subject_label,'') ILIKE $${p}
      OR COALESCE(lr.topic_label,'') ILIKE $${p}
      OR EXISTS (
        SELECT 1 FROM learning_resource_concepts lrcs
        JOIN learning_concepts lcsrch ON lcsrch.id=lrcs.concept_id
        WHERE lrcs.resource_id=lr.id
          AND (lcsrch.name ILIKE $${p} OR COALESCE(lcsrch.name_hi,'') ILIKE $${p} OR lcsrch.code ILIKE $${p} OR lcsrch.subject_code ILIKE $${p})
      )
    )`);
  }

  if (filters.featuredOnly) conditions.push('lr.is_featured_public=TRUE');

  const safeLimit = Math.min(Math.max(filters.limit || 100, 1), 200);
  const limitParam = push(safeLimit);

  const { rows } = await query(
    `SELECT lr.id,lr.public_slug,lr.title,lr.title_hi,lr.summary,lr.summary_hi,
            lr.resource_type,lr.category,lr.language,lr.class_min,lr.class_max,
            lr.subject_label,lr.topic_label,lr.thumbnail_url,lr.duration_secs,
            lr.is_featured_public,lr.published_at,lr.external_url,lr.source_url,
            lr.licence,lr.attribution_text,lr.is_offline_ready,
            COALESCE(sub.name,lr.subject_label,MIN(lc.subject_code)) AS subject_name,
            COALESCE(sub.code,MIN(lc.subject_code)) AS subject_code,
            lcs.code AS source_code,lcs.name AS source_name,lcs.source_kind,
            COALESCE(ARRAY_AGG(DISTINCT eb.code) FILTER(WHERE eb.code IS NOT NULL),ARRAY[]::varchar[]) AS board_codes,
            COALESCE(ARRAY_AGG(DISTINCT egl.code) FILTER(WHERE egl.code IS NOT NULL),ARRAY[]::varchar[]) AS grade_codes,
            COALESCE(ARRAY_AGG(DISTINCT lc.code) FILTER(WHERE lc.code IS NOT NULL),ARRAY[]::varchar[]) AS concept_codes,
            COALESCE(ARRAY_AGG(DISTINCT lc.name) FILTER(WHERE lc.name IS NOT NULL),ARRAY[]::varchar[]) AS concept_names,
            COALESCE(ARRAY_AGG(DISTINCT lrc.journey_stage::text) FILTER(WHERE lrc.journey_stage IS NOT NULL),ARRAY[]::varchar[]) AS journey_stages
     FROM learning_resources lr
     JOIN learning_content_sources lcs ON lcs.id=lr.source_id
     LEFT JOIN subjects sub ON sub.id=lr.subject_id
     LEFT JOIN learning_resource_boards lrb ON lrb.resource_id=lr.id
     LEFT JOIN education_boards eb ON eb.id=lrb.board_id
     LEFT JOIN learning_resource_grades lrg ON lrg.resource_id=lr.id
     LEFT JOIN education_grade_levels egl ON egl.id=lrg.grade_id
     LEFT JOIN learning_resource_concepts lrc ON lrc.resource_id=lr.id
     LEFT JOIN learning_concepts lc ON lc.id=lrc.concept_id
     WHERE ${conditions.join(' AND ')}
     GROUP BY lr.id,sub.id,lcs.id
     ORDER BY CASE WHEN lr.category='ACADEMIC' THEN 0 ELSE 1 END,
              lr.is_featured_public DESC,lr.sort_order,lr.published_at DESC NULLS LAST,lr.created_at DESC
     LIMIT $${limitParam}`,
    values,
  );
  return rows;
}
