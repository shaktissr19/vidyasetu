import type { QueryResultRow } from 'pg';
import { query } from '../config/db';

export interface PublicLearningFilters {
  className?: number | null;
  gradeCode?: string | null;
  category?: string | null;
  board?: string | null;
  limit?: number;
  featuredOnly?: boolean;
}

interface CountRow extends QueryResultRow { count: string; }

const PUBLIC_WHERE = `lr.visibility='PUBLIC' AND lr.review_status='PUBLISHED'`;

export async function getPublicLearningOverview() {
  const [total, originals, openResources, featured, boards, categories, classCoverage, gradeCoverage] = await Promise.all([
    query<CountRow>(`SELECT COUNT(*)::text AS count FROM learning_resources lr WHERE ${PUBLIC_WHERE}`),
    query<CountRow>(
      `SELECT COUNT(*)::text AS count
       FROM learning_resources lr
       JOIN learning_content_sources lcs ON lcs.id=lr.source_id
       WHERE ${PUBLIC_WHERE} AND lcs.source_kind='VIDYASETU_ORIGINAL'`,
    ),
    query<CountRow>(
      `SELECT COUNT(*)::text AS count
       FROM learning_resources lr
       JOIN learning_content_sources lcs ON lcs.id=lr.source_id
       WHERE ${PUBLIC_WHERE} AND lcs.source_kind IN ('NROER','OTHER_OER')`,
    ),
    query<CountRow>(`SELECT COUNT(*)::text AS count FROM learning_resources lr WHERE ${PUBLIC_WHERE} AND lr.is_featured_public=TRUE`),
    query(
      `SELECT eb.code, eb.name, eb.short_name, eb.board_type, eb.state
       FROM education_boards eb
       WHERE eb.is_active=TRUE
       ORDER BY eb.sort_order, eb.name`,
    ),
    query(
      `SELECT lr.category, COUNT(*)::int AS count
       FROM learning_resources lr
       WHERE ${PUBLIC_WHERE}
       GROUP BY lr.category
       ORDER BY COUNT(*) DESC, lr.category`,
    ),
    query(
      `SELECT gs.class_name,
              COUNT(lr.id)::int AS resource_count
       FROM generate_series(1,12) AS gs(class_name)
       LEFT JOIN learning_resources lr
         ON ${PUBLIC_WHERE}
        AND (lr.class_min IS NULL OR lr.class_min <= gs.class_name)
        AND (lr.class_max IS NULL OR lr.class_max >= gs.class_name)
       GROUP BY gs.class_name
       ORDER BY gs.class_name`,
    ),
    query(
      `SELECT egl.code,egl.name,egl.short_name,egl.stage,egl.class_number,egl.sort_order,
              COUNT(DISTINCT lr.id)::int AS resource_count
       FROM education_grade_levels egl
       LEFT JOIN learning_resource_grades lrg ON lrg.grade_id=egl.id
       LEFT JOIN learning_resources lr ON lr.id=lrg.resource_id AND ${PUBLIC_WHERE}
       WHERE egl.is_active=TRUE
       GROUP BY egl.id
       ORDER BY egl.sort_order`,
    ),
  ]);

  return {
    totalResources: Number(total.rows[0]?.count || 0),
    originalResources: Number(originals.rows[0]?.count || 0),
    openResources: Number(openResources.rows[0]?.count || 0),
    featuredResources: Number(featured.rows[0]?.count || 0),
    boards: boards.rows,
    categories: categories.rows,
    classes: classCoverage.rows.map((row) => ({
      className: Number(row.class_name),
      resourceCount: Number(row.resource_count || 0),
    })),
    grades: gradeCoverage.rows.map((row) => ({
      code: row.code,
      name: row.name,
      shortName: row.short_name,
      stage: row.stage,
      classNumber: row.class_number == null ? null : Number(row.class_number),
      sortOrder: Number(row.sort_order),
      resourceCount: Number(row.resource_count || 0),
    })),
  };
}

export async function listPublicLearningResources(filters: PublicLearningFilters = {}) {
  const values: unknown[] = [];
  const conditions: string[] = [PUBLIC_WHERE];

  if (filters.gradeCode) {
    values.push(filters.gradeCode.toUpperCase());
    const p = values.length;
    conditions.push(`(
      EXISTS (
        SELECT 1 FROM learning_resource_grades lrgf
        JOIN education_grade_levels eglf ON eglf.id=lrgf.grade_id
        WHERE lrgf.resource_id=lr.id AND eglf.code=$${p}
      )
      OR (
        NOT EXISTS (SELECT 1 FROM learning_resource_grades lrg0 WHERE lrg0.resource_id=lr.id)
        AND lr.class_min IS NULL AND lr.class_max IS NULL
      )
    )`);
  } else if (filters.className) {
    values.push(filters.className);
    const p = values.length;
    conditions.push(`(lr.class_min IS NULL OR lr.class_min <= $${p}) AND (lr.class_max IS NULL OR lr.class_max >= $${p})`);
  }

  if (filters.category) {
    values.push(filters.category.toUpperCase());
    conditions.push(`lr.category::text = $${values.length}`);
  }

  if (filters.board) {
    values.push(filters.board.toUpperCase());
    conditions.push(
      `EXISTS (
        SELECT 1
        FROM learning_resource_boards lrbf
        JOIN education_boards ebf ON ebf.id=lrbf.board_id
        WHERE lrbf.resource_id=lr.id
          AND (ebf.code=$${values.length} OR ebf.code='COMMON')
      )`,
    );
  }

  if (filters.featuredOnly) conditions.push('lr.is_featured_public=TRUE');

  const safeLimit = Math.min(Math.max(filters.limit || 24, 1), 100);
  values.push(safeLimit);

  const { rows } = await query(
    `SELECT lr.id, lr.public_slug, lr.title, lr.title_hi, lr.summary, lr.summary_hi,
            lr.resource_type, lr.category, lr.language, lr.class_min, lr.class_max,
            lr.subject_label,lr.topic_label,
            lr.thumbnail_url, lr.duration_secs, lr.is_featured_public, lr.published_at,
            lr.external_url, lr.source_url, lr.licence, lr.attribution_text,
            COALESCE(sub.name,lr.subject_label) AS subject_name, sub.code AS subject_code,
            lcs.code AS source_code, lcs.name AS source_name, lcs.source_kind,
            COALESCE(
              ARRAY_AGG(DISTINCT eb.code) FILTER (WHERE eb.code IS NOT NULL),
              ARRAY[]::varchar[]
            ) AS board_codes,
            COALESCE(
              ARRAY_AGG(DISTINCT egl.code) FILTER (WHERE egl.code IS NOT NULL),
              ARRAY[]::varchar[]
            ) AS grade_codes
     FROM learning_resources lr
     JOIN learning_content_sources lcs ON lcs.id=lr.source_id
     LEFT JOIN subjects sub ON sub.id=lr.subject_id
     LEFT JOIN learning_resource_boards lrb ON lrb.resource_id=lr.id
     LEFT JOIN education_boards eb ON eb.id=lrb.board_id
     LEFT JOIN learning_resource_grades lrg ON lrg.resource_id=lr.id
     LEFT JOIN education_grade_levels egl ON egl.id=lrg.grade_id
     WHERE ${conditions.join(' AND ')}
     GROUP BY lr.id, sub.id, lcs.id
     ORDER BY lr.is_featured_public DESC, lr.sort_order, lr.published_at DESC NULLS LAST, lr.created_at DESC
     LIMIT $${values.length}`,
    values,
  );

  return rows;
}

export async function getPublicLearningResource(publicSlug: string) {
  const { rows: [resource] } = await query(
    `SELECT lr.id, lr.public_slug, lr.title, lr.title_hi, lr.summary, lr.summary_hi,
            lr.body_markdown, lr.body_markdown_hi, lr.resource_type, lr.category,
            lr.language, lr.class_min, lr.class_max, lr.subject_label,lr.topic_label,
            lr.thumbnail_url, lr.duration_secs,
            lr.external_url, lr.source_url, lr.licence, lr.licence_url,
            lr.attribution_text, lr.published_at, lr.is_offline_ready,
            COALESCE(sub.name,lr.subject_label) AS subject_name, sub.code AS subject_code,
            lcs.code AS source_code, lcs.name AS source_name, lcs.source_kind,
            lcs.homepage_url AS source_homepage,
            COALESCE(
              ARRAY_AGG(DISTINCT eb.code) FILTER (WHERE eb.code IS NOT NULL),
              ARRAY[]::varchar[]
            ) AS board_codes,
            COALESCE(
              ARRAY_AGG(DISTINCT egl.code) FILTER (WHERE egl.code IS NOT NULL),
              ARRAY[]::varchar[]
            ) AS grade_codes
     FROM learning_resources lr
     JOIN learning_content_sources lcs ON lcs.id=lr.source_id
     LEFT JOIN subjects sub ON sub.id=lr.subject_id
     LEFT JOIN learning_resource_boards lrb ON lrb.resource_id=lr.id
     LEFT JOIN education_boards eb ON eb.id=lrb.board_id
     LEFT JOIN learning_resource_grades lrg ON lrg.resource_id=lr.id
     LEFT JOIN education_grade_levels egl ON egl.id=lrg.grade_id
     WHERE ${PUBLIC_WHERE}
       AND lr.public_slug=$1
     GROUP BY lr.id, sub.id, lcs.id`,
    [publicSlug],
  );

  if (!resource) throw Object.assign(new Error('Learning resource not found'), { statusCode: 404 });
  return resource;
}

export async function listLearningSources() {
  const { rows } = await query(
    `SELECT code, name, source_kind, homepage_url, default_license,
            attribution_required, allow_rehosting_default, allow_adaptation_default,
            requires_item_license_check, notes
     FROM learning_content_sources
     WHERE is_active=TRUE
     ORDER BY CASE code WHEN 'VIDYASETU_ORIGINAL' THEN 1 WHEN 'NROER' THEN 2 ELSE 9 END, name`,
  );
  return rows;
}
