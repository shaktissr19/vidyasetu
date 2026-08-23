import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';

export interface SaveLearningResourceInput {
  title: string;
  titleHi?: string | null;
  summary?: string | null;
  summaryHi?: string | null;
  bodyMarkdown?: string | null;
  bodyMarkdownHi?: string | null;
  resourceType: string;
  category: string;
  visibility: string;
  reviewStatus?: string;
  language?: string;
  classMin?: number | null;
  classMax?: number | null;
  sourceCode: string;
  sourceUrl?: string | null;
  sourceItemId?: string | null;
  licence: string;
  licenceUrl?: string | null;
  attributionText?: string | null;
  externalUrl?: string | null;
  fileKey?: string | null;
  thumbnailUrl?: string | null;
  durationSecs?: number | null;
  isOfflineReady?: boolean;
  isFeaturedPublic?: boolean;
  boardCodes?: string[];
  publicSlug?: string | null;
}

interface SourceRow extends QueryResultRow {
  id: UUID;
  code: string;
  source_kind: string;
  requires_item_license_check: boolean;
}

interface ResourceIdRow extends QueryResultRow { id: UUID; }

function badRequest(message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160) || `learning-${Date.now()}`;
}

function assertSourcePolicy(input: SaveLearningResourceInput, source: SourceRow): void {
  if (source.code === 'NROER') {
    if (!input.sourceUrl?.trim()) throw badRequest('NROER resources require the original source URL.');
    if (!input.attributionText?.trim()) throw badRequest('NROER resources require attribution text.');
    if (!['CC_BY', 'CC_BY_SA', 'PUBLIC_DOMAIN', 'EXTERNAL_LINK_ONLY'].includes(input.licence)) {
      throw badRequest('NROER resources must use a verified open licence or EXTERNAL_LINK_ONLY.');
    }
    if (input.fileKey && input.licence === 'EXTERNAL_LINK_ONLY') {
      throw badRequest('EXTERNAL_LINK_ONLY resources cannot be copied to VidyaSetu storage.');
    }
  }

  if (source.source_kind === 'EXTERNAL_OFFICIAL' && input.fileKey) {
    throw badRequest('Official external-link resources must not be copied into VidyaSetu storage.');
  }

  if (input.resourceType === 'EXTERNAL_LINK' && !input.externalUrl?.trim() && !input.sourceUrl?.trim()) {
    throw badRequest('External-link resources require an external URL.');
  }

  if (input.resourceType === 'ARTICLE' && !input.bodyMarkdown?.trim() && !input.bodyMarkdownHi?.trim()) {
    throw badRequest('Article resources require article body content.');
  }

  if (input.classMin && input.classMax && input.classMin > input.classMax) {
    throw badRequest('classMin cannot be greater than classMax.');
  }
}

export async function getLearningStudioOptions() {
  const [boards, sources] = await Promise.all([
    query(
      `SELECT code, name, short_name, board_type, state
       FROM education_boards
       WHERE is_active=TRUE
       ORDER BY sort_order, name`,
    ),
    query(
      `SELECT code, name, source_kind, homepage_url, default_license,
              attribution_required, allow_rehosting_default, allow_adaptation_default,
              requires_item_license_check, notes
       FROM learning_content_sources
       WHERE is_active=TRUE
       ORDER BY CASE code WHEN 'VIDYASETU_ORIGINAL' THEN 1 WHEN 'NROER' THEN 2 ELSE 9 END, name`,
    ),
  ]);

  return { boards: boards.rows, sources: sources.rows };
}

export async function listLearningResources() {
  const { rows } = await query(
    `SELECT lr.id, lr.public_slug, lr.title, lr.title_hi, lr.summary,
            lr.resource_type, lr.category, lr.visibility, lr.review_status,
            lr.language, lr.class_min, lr.class_max, lr.licence,
            lr.source_url, lr.external_url, lr.attribution_text,
            lr.is_featured_public, lr.published_at, lr.created_at,
            lcs.code AS source_code, lcs.name AS source_name,
            COALESCE(
              ARRAY_AGG(DISTINCT eb.code) FILTER (WHERE eb.code IS NOT NULL),
              ARRAY[]::varchar[]
            ) AS board_codes
     FROM learning_resources lr
     JOIN learning_content_sources lcs ON lcs.id=lr.source_id
     LEFT JOIN learning_resource_boards lrb ON lrb.resource_id=lr.id
     LEFT JOIN education_boards eb ON eb.id=lrb.board_id
     GROUP BY lr.id, lcs.id
     ORDER BY lr.updated_at DESC
     LIMIT 250`,
  );
  return rows;
}

export async function createLearningResource(input: SaveLearningResourceInput, createdBy: UUID) {
  const sourceCode = input.sourceCode.toUpperCase();
  const { rows: [source] } = await query<SourceRow>(
    `SELECT id, code, source_kind, requires_item_license_check
     FROM learning_content_sources
     WHERE code=$1 AND is_active=TRUE`,
    [sourceCode],
  );
  if (!source) throw badRequest('Unknown or inactive learning content source.');
  assertSourcePolicy(input, source);

  const boardCodes = (input.boardCodes?.length ? input.boardCodes : ['COMMON'])
    .map((code) => code.toUpperCase());
  const requestedStatus = input.reviewStatus || 'DRAFT';
  const slug = input.publicSlug?.trim() || slugify(input.title);

  return transaction(async (client) => {
    const { rows: boards } = await client.query<{ id: UUID; code: string }>(
      `SELECT id, code FROM education_boards WHERE code=ANY($1::varchar[]) AND is_active=TRUE`,
      [boardCodes],
    );
    if (boards.length !== new Set(boardCodes).size) throw badRequest('One or more selected board codes are invalid.');

    const { rows: [resource] } = await client.query<ResourceIdRow & QueryResultRow>(
      `INSERT INTO learning_resources
         (public_slug, title, title_hi, summary, summary_hi, body_markdown, body_markdown_hi,
          resource_type, category, visibility, review_status, language, class_min, class_max,
          source_id, source_url, source_item_id, licence, licence_url, attribution_text,
          external_url, file_key, thumbnail_url, duration_secs, is_offline_ready,
          is_featured_public, created_by, reviewed_by, reviewed_at, published_at)
       VALUES
         ($1,$2,$3,$4,$5,$6,$7,$8::learning_resource_type,$9::learning_category,
          $10::learning_visibility,$11::learning_review_status,$12,$13,$14,$15,$16,$17,
          $18::learning_license_code,$19,$20,$21,$22,$23,$24,$25,$26,$27,
          CASE WHEN $11 IN ('APPROVED','PUBLISHED') THEN $27 ELSE NULL END,
          CASE WHEN $11 IN ('APPROVED','PUBLISHED') THEN NOW() ELSE NULL END,
          CASE WHEN $11='PUBLISHED' THEN NOW() ELSE NULL END)
       RETURNING id`,
      [
        slug, input.title.trim(), input.titleHi?.trim() || null, input.summary?.trim() || null,
        input.summaryHi?.trim() || null, input.bodyMarkdown?.trim() || null,
        input.bodyMarkdownHi?.trim() || null, input.resourceType, input.category,
        input.visibility, requestedStatus, input.language || 'en', input.classMin || null,
        input.classMax || null, source.id, input.sourceUrl?.trim() || null,
        input.sourceItemId?.trim() || null, input.licence, input.licenceUrl?.trim() || null,
        input.attributionText?.trim() || null, input.externalUrl?.trim() || null,
        input.fileKey?.trim() || null, input.thumbnailUrl?.trim() || null,
        input.durationSecs || null, Boolean(input.isOfflineReady), Boolean(input.isFeaturedPublic),
        createdBy,
      ],
    );

    for (const board of boards) {
      await client.query(
        `INSERT INTO learning_resource_boards (resource_id, board_id)
         VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [resource.id, board.id],
      );
    }

    await client.query(
      `INSERT INTO learning_resource_reviews (resource_id, reviewer_id, from_status, to_status, review_note)
       VALUES ($1,$2,NULL,$3::learning_review_status,$4)`,
      [resource.id, createdBy, requestedStatus, 'Resource created in Learning Studio'],
    );

    return resource;
  });
}

export async function updateLearningResourceStatus(
  resourceId: UUID,
  nextStatus: string,
  reviewerId: UUID,
  note?: string | null,
) {
  return transaction(async (client) => {
    const { rows: [existing] } = await client.query<{ review_status: string; visibility: string; public_slug: string | null }>(
      `SELECT review_status, visibility, public_slug FROM learning_resources WHERE id=$1 FOR UPDATE`,
      [resourceId],
    );
    if (!existing) throw Object.assign(new Error('Learning resource not found'), { statusCode: 404 });
    if (nextStatus === 'PUBLISHED' && !existing.public_slug) throw badRequest('Published resources require a public slug.');

    const { rows: [updated] } = await client.query(
      `UPDATE learning_resources
       SET review_status=$2::learning_review_status,
           reviewed_by=CASE WHEN $2 IN ('APPROVED','PUBLISHED') THEN $3 ELSE reviewed_by END,
           reviewed_at=CASE WHEN $2 IN ('APPROVED','PUBLISHED') THEN NOW() ELSE reviewed_at END,
           published_at=CASE WHEN $2='PUBLISHED' THEN COALESCE(published_at,NOW()) ELSE published_at END
       WHERE id=$1
       RETURNING id, public_slug, title, review_status, visibility, published_at`,
      [resourceId, nextStatus, reviewerId],
    );

    await client.query(
      `INSERT INTO learning_resource_reviews (resource_id, reviewer_id, from_status, to_status, review_note)
       VALUES ($1,$2,$3::learning_review_status,$4::learning_review_status,$5)`,
      [resourceId, reviewerId, existing.review_status, nextStatus, note?.trim() || null],
    );

    return updated;
  });
}
