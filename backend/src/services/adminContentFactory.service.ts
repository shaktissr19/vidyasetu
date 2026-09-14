import { createHash } from 'crypto';
import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';
import * as practiceService from './adminLearningPractice.service';

export interface StageExternalWebSourceInput {
  title: string;
  sourceUrl: string;
  licenceCandidate?: 'VIDYASETU_ORIGINAL' | 'CC_BY' | 'CC_BY_SA' | 'CC_BY_NC' | 'CC_BY_NC_SA' | 'CC_BY_NC_ND' | 'PUBLIC_DOMAIN' | 'EXTERNAL_LINK_ONLY' | 'OTHER' | null;
  attributionText?: string | null;
  classNumber?: number | null;
  subject?: string | null;
  boardCode?: string | null;
}

export interface AddApprovedIntakeToLibraryInput {
  classNumber: number;
  boardCode: string;
  subjectId?: UUID | null;
  subjectName?: string | null;
  chapter?: string | null;
  topic?: string | null;
  language?: 'en' | 'hi' | 'en-hi';
  visibility: 'PUBLIC' | 'REGISTERED' | 'CLASS_ONLY';
  accessRequirement: 'PUBLIC' | 'REGISTERED' | 'SUBSCRIBER';
}

interface IntakeHandoffRow extends QueryResultRow {
  id: UUID;
  status: string;
  source_id: UUID;
  source_code: string;
  source_name: string;
  source_item_id: string | null;
  title: string;
  source_url: string;
  licence_candidate: string | null;
  attribution_text: string | null;
  attribution_required: boolean;
  requires_item_license_check: boolean;
  licence_verified_at: string | Date | null;
  imported_resource_id: UUID | null;
}

interface DiscoveryMediaRow extends QueryResultRow {
  media_kind: string | null;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  embed_url: string | null;
}

function appError(message: string, statusCode = 400): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

async function assertFactorySchema(): Promise<void> {
  const { rows: [row] } = await query<{ ready: boolean } & QueryResultRow>(
    `SELECT to_regclass('public.learning_content_packs') IS NOT NULL
         AND EXISTS (SELECT 1 FROM learning_content_sources WHERE code='EXTERNAL_WEB' AND is_active=TRUE) AS ready`,
  );
  if (!row?.ready) throw appError('Content Factory requires database migration 048', 503);
}

async function assertHandoffSchema(): Promise<void> {
  const { rows: [row] } = await query<{ ready: boolean } & QueryResultRow>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='learning_source_intake' AND column_name='imported_resource_id'
     ) AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='learning_source_intake' AND column_name='licence_verified_at'
     ) AS ready`,
  );
  if (!row?.ready) throw appError('Source-to-Learning handoff requires database migration 049', 503);
}

function normalizeHttpsUrl(raw: string): URL {
  let parsed: URL;
  try { parsed = new URL(raw); }
  catch { throw appError('External source URL is invalid'); }
  if (parsed.protocol !== 'https:') throw appError('External source URL must use HTTPS');
  if (parsed.username || parsed.password) throw appError('External source URL must not contain embedded credentials');

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const blockedExact = new Set(['localhost','0.0.0.0','127.0.0.1','::1']);
  if (blockedExact.has(host) || host.endsWith('.local') || host.endsWith('.internal')) {
    throw appError('Private or local network URLs are not allowed');
  }
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    const [a,b] = octets;
    const privateRange = a === 10 || a === 127 || a === 0 || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
    if (privateRange || octets.some((n) => n < 0 || n > 255)) throw appError('Private or invalid IP URLs are not allowed');
  }
  parsed.hash = '';
  return parsed;
}

function slugify(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,135) || 'learning-resource';
}

function mapExternalResourceType(mediaKind: string | null): 'VIDEO' | 'AUDIO' | 'PDF' | 'INTERACTIVE' | 'EXTERNAL_LINK' {
  if (mediaKind === 'VIDEO') return 'VIDEO';
  if (mediaKind === 'AUDIO') return 'AUDIO';
  if (mediaKind === 'PDF') return 'PDF';
  if (mediaKind === 'INTERACTIVE') return 'INTERACTIVE';
  // External articles/courses are link-first unless VidyaSetu has an authored
  // body. This handoff never silently copies remote page text.
  return 'EXTERNAL_LINK';
}

function assertAccessPolicy(input: AddApprovedIntakeToLibraryInput): void {
  if (input.visibility === 'PUBLIC' && input.accessRequirement !== 'PUBLIC') {
    throw appError('Public Learning must use PUBLIC access');
  }
  if (input.visibility !== 'PUBLIC' && input.accessRequirement === 'PUBLIC') {
    throw appError('PUBLIC access is only valid for Public Learning');
  }
}

export async function getFactoryOptions() {
  const [boards,subjects,curriculumSubjects,units,topics,concepts,conceptCoverage] = await Promise.all([
    query(`SELECT id,code,name,short_name,board_type,state,sort_order FROM education_boards WHERE is_active=TRUE ORDER BY sort_order,name`),
    query(`SELECT id,code,name FROM subjects ORDER BY name`),
    query(`SELECT cs.id,cs.curriculum_version_id,cv.board_id,eb.code AS board_code,eb.name AS board_name,
                  cs.subject_id,cs.class_name,cs.display_name,cs.display_name_hi,cs.subject_code,cs.sort_order
           FROM curriculum_subjects cs
           JOIN curriculum_versions cv ON cv.id=cs.curriculum_version_id
           JOIN education_boards eb ON eb.id=cv.board_id
           WHERE cs.is_active=TRUE AND cv.status='ACTIVE' AND eb.is_active=TRUE
           ORDER BY eb.sort_order,cs.class_name,cs.sort_order,cs.display_name`),
    query(`SELECT cu.id,cu.curriculum_subject_id,cu.unit_number,cu.title,cu.title_hi,cu.description,cu.sort_order
           FROM curriculum_units cu
           JOIN curriculum_subjects cs ON cs.id=cu.curriculum_subject_id
           JOIN curriculum_versions cv ON cv.id=cs.curriculum_version_id
           WHERE cs.is_active=TRUE AND cv.status='ACTIVE'
           ORDER BY cu.curriculum_subject_id,cu.sort_order,cu.title`),
    query(`SELECT ct.id,ct.curriculum_unit_id,ct.topic_number,ct.title,ct.title_hi,ct.learning_outcome,ct.competency_tags,ct.sort_order
           FROM curriculum_topics ct
           JOIN curriculum_units cu ON cu.id=ct.curriculum_unit_id
           JOIN curriculum_subjects cs ON cs.id=cu.curriculum_subject_id
           JOIN curriculum_versions cv ON cv.id=cs.curriculum_version_id
           WHERE cs.is_active=TRUE AND cv.status='ACTIVE'
           ORDER BY ct.curriculum_unit_id,ct.sort_order,ct.title`),
    query(`SELECT lc.id,lc.code,lc.name,lc.name_hi,lc.chapter_title,lc.subject_code,lc.subject_id,
                  sub.name AS subject_name,egl.code AS grade_code,egl.class_number
           FROM learning_concepts lc
           JOIN education_grade_levels egl ON egl.id=lc.grade_id
           LEFT JOIN subjects sub ON sub.id=lc.subject_id
           WHERE lc.is_active=TRUE
           ORDER BY egl.sort_order,lc.subject_code,lc.sequence
           LIMIT 5000`),
    query(`SELECT egl.class_number,COUNT(lc.id)::int AS concept_count,
                  COUNT(DISTINCT lc.subject_id)::int AS subject_count
           FROM education_grade_levels egl
           LEFT JOIN learning_concepts lc ON lc.grade_id=egl.id AND lc.is_active=TRUE
           WHERE egl.class_number BETWEEN 1 AND 12
           GROUP BY egl.class_number
           ORDER BY egl.class_number`),
  ]);

  const coverageMap = new Map<number,{ conceptCount: number; subjectCount: number }>();
  for (const raw of conceptCoverage.rows as Array<QueryResultRow & { class_number: number; concept_count: number; subject_count: number }>) {
    coverageMap.set(Number(raw.class_number), { conceptCount: Number(raw.concept_count), subjectCount: Number(raw.subject_count) });
  }

  return {
    boards: boards.rows,
    subjects: subjects.rows,
    curriculumSubjects: curriculumSubjects.rows,
    units: units.rows,
    topics: topics.rows,
    concepts: concepts.rows,
    readinessByClass: Array.from({ length: 12 }, (_, index) => {
      const classNumber = index + 1;
      const coverage = coverageMap.get(classNumber) || { conceptCount: 0,subjectCount: 0 };
      return {
        classNumber,
        conceptCount: coverage.conceptCount,
        subjectCount: coverage.subjectCount,
        curriculumReady: coverage.conceptCount > 0,
      };
    }),
    workflow: {
      discovery: 'Search VidyaSetu and governed external learning sources by class, subject, chapter or topic',
      validation: 'Selected external items enter Source & Licence Review and require explicit item-level evidence',
      handoff: 'Approved sources can be added directly to the canonical Content Library as DRAFT resources',
      generation: 'Approved governed sources may also ground the AI text/question creator; mock output cannot be approved',
      packaging: 'Content packs group Learn, Watch, Listen, Explore, Practice, Revise, Assess and Worksheet assets',
      publication: 'Content Library review is authoritative; only PUBLISHED content reaches learners or Public Learn',
    },
  };
}

export async function getQueueCounts() {
  await assertHandoffSchema();
  const { rows: [row] } = await query<{
    source_review_pending: number;
    approved_sources_ready: number;
    content_library_pending: number;
    source_imported_pending_review: number;
  } & QueryResultRow>(
    `SELECT
       (SELECT COUNT(*)::int FROM learning_source_intake WHERE status IN ('DISCOVERED','LICENCE_REVIEW','CONTENT_REVIEW')) AS source_review_pending,
       (SELECT COUNT(*)::int FROM learning_source_intake WHERE status='APPROVED' AND imported_resource_id IS NULL) AS approved_sources_ready,
       (SELECT COUNT(*)::int FROM learning_resources WHERE review_status IN ('DRAFT','SUBMITTED','ACADEMIC_REVIEW')) AS content_library_pending,
       (SELECT COUNT(*)::int
          FROM learning_source_intake lsi
          JOIN learning_resources lr ON lr.id=lsi.imported_resource_id
         WHERE lr.review_status IN ('DRAFT','SUBMITTED','ACADEMIC_REVIEW')) AS source_imported_pending_review`,
  );
  return {
    sourceReviewPending: Number(row?.source_review_pending || 0),
    approvedSourcesReady: Number(row?.approved_sources_ready || 0),
    contentLibraryPending: Number(row?.content_library_pending || 0),
    sourceImportedPendingReview: Number(row?.source_imported_pending_review || 0),
  };
}

export async function getSourceReviewQueue() {
  await assertHandoffSchema();
  const { rows } = await query(
    `SELECT lsi.id,lsi.source_item_id,lsi.title,lsi.source_url,lsi.licence_candidate,lsi.attribution_text,
            lsi.class_hint,lsi.board_hint,lsi.subject_hint,lsi.status,lsi.reviewer_note,lsi.created_at,lsi.reviewed_at,
            lsi.licence_verified_at,lsi.licence_verified_by,lsi.imported_resource_id,lsi.imported_at,lsi.imported_by,
            lcs.code AS source_code,lcs.name AS source_name,lcs.attribution_required,lcs.requires_item_license_check,
            dc.media_kind,dc.duration_seconds,dc.thumbnail_url,dc.embed_url,
            ((NOT lcs.requires_item_license_check OR (
                 lsi.licence_candidate IS NOT NULL AND lsi.licence_candidate::text <> 'OTHER' AND lsi.licence_verified_at IS NOT NULL
              ))
              AND (NOT lcs.attribution_required OR NULLIF(BTRIM(COALESCE(lsi.attribution_text,'')),'') IS NOT NULL)
            ) AS evidence_ready
     FROM learning_source_intake lsi
     JOIN learning_content_sources lcs ON lcs.id=lsi.source_id
     LEFT JOIN LATERAL (
       SELECT c.media_kind,c.duration_seconds,c.thumbnail_url,c.embed_url
       FROM learning_source_discovery_candidates c
       WHERE c.intake_id=lsi.id
       ORDER BY c.staged_at DESC NULLS LAST,c.created_at DESC
       LIMIT 1
     ) dc ON TRUE
     ORDER BY CASE lsi.status
       WHEN 'DISCOVERED' THEN 1 WHEN 'LICENCE_REVIEW' THEN 2 WHEN 'CONTENT_REVIEW' THEN 3
       WHEN 'APPROVED' THEN 4 WHEN 'IMPORTED' THEN 8 ELSE 9 END, lsi.created_at DESC
     LIMIT 300`,
  );
  return rows;
}

export async function stageExternalWebSource(input: StageExternalWebSourceInput, adminId: UUID) {
  await assertFactorySchema();
  const parsed = normalizeHttpsUrl(input.sourceUrl);
  const title = input.title.trim();
  if (title.length < 2) throw appError('External source title is required');
  const hostname = parsed.hostname.toLowerCase();
  const sourceItemId = `web-${createHash('sha256').update(parsed.toString()).digest('hex').slice(0,40)}`;
  const licenceCandidate = input.licenceCandidate || 'EXTERNAL_LINK_ONLY';
  const attributionText = input.attributionText?.trim() || hostname;

  const intake = await practiceService.createIntake({
    sourceCode: 'EXTERNAL_WEB',
    sourceItemId,
    title,
    sourceUrl: parsed.toString(),
    licenceCandidate,
    attributionText,
    classHint: input.classNumber ? `Class ${input.classNumber}` : null,
    subjectHint: input.subject?.trim() || null,
    boardHint: input.boardCode?.trim() || null,
  },adminId);

  return {
    kind: 'OER_INTAKE' as const,
    intakeId: intake.id,
    status: intake.status,
    sourceCode: 'EXTERNAL_WEB',
    sourceUrl: parsed.toString(),
    hostname,
    licenceCandidate,
    message: 'External web item staged to Source & Licence Review. It remains reference-only until a Platform Admin explicitly verifies item-level licence and attribution.',
  };
}

export async function addApprovedIntakeToLibrary(intakeId: UUID, input: AddApprovedIntakeToLibraryInput, adminId: UUID) {
  await assertHandoffSchema();
  if (!Number.isInteger(input.classNumber) || input.classNumber < 1 || input.classNumber > 12) {
    throw appError('Choose a valid class from 1 to 12');
  }
  assertAccessPolicy(input);

  return transaction(async (client) => {
    const { rows: [intake] } = await client.query<IntakeHandoffRow>(
      `SELECT lsi.id,lsi.status,lsi.source_id,lsi.source_item_id,lsi.title,lsi.source_url,
              lsi.licence_candidate,lsi.attribution_text,lsi.licence_verified_at,lsi.imported_resource_id,
              lcs.code AS source_code,lcs.name AS source_name,lcs.attribution_required,lcs.requires_item_license_check
       FROM learning_source_intake lsi
       JOIN learning_content_sources lcs ON lcs.id=lsi.source_id
       WHERE lsi.id=$1::uuid
       FOR UPDATE OF lsi`,
      [intakeId],
    );
    if (!intake) throw appError('Source review item not found', 404);

    if (intake.imported_resource_id) {
      const { rows: [existing] } = await client.query(
        `SELECT id,title,review_status,visibility,access_requirement,class_min,class_max,subject_id,subject_label,topic_label,chapter_label
         FROM learning_resources WHERE id=$1::uuid`,
        [intake.imported_resource_id],
      );
      if (!existing) throw appError('Imported Learning resource reference is missing', 409);
      return { ...existing, alreadyImported: true, intakeId };
    }
    if (intake.status !== 'APPROVED') {
      throw appError('Source must be APPROVED in Source & Licence Review before it can be added to Content Library');
    }
    if (intake.requires_item_license_check && (!intake.licence_candidate || intake.licence_candidate === 'OTHER' || !intake.licence_verified_at)) {
      throw appError(`Save verified item-level licence evidence for ${intake.source_code} before adding it to Content Library`);
    }
    if (intake.attribution_required && !intake.attribution_text?.trim()) {
      throw appError(`Attribution evidence is required for ${intake.source_code}`);
    }

    const boardCode = input.boardCode.trim().toUpperCase();
    const { rows: [board] } = await client.query<{ id: UUID; code: string }>(
      `SELECT id,code FROM education_boards WHERE code=$1 AND is_active=TRUE`,
      [boardCode],
    );
    if (!board) throw appError('Selected education board is invalid');

    let subject: { id: UUID; name: string } | undefined;
    if (input.subjectId) {
      const result = await client.query<{ id: UUID; name: string }>(`SELECT id,name FROM subjects WHERE id=$1::uuid`, [input.subjectId]);
      subject = result.rows[0];
    } else if (input.subjectName?.trim()) {
      const result = await client.query<{ id: UUID; name: string }>(
        `SELECT id,name FROM subjects
         WHERE LOWER(name)=LOWER($1) OR UPPER(COALESCE(code,''))=UPPER($1)
         ORDER BY CASE WHEN LOWER(name)=LOWER($1) THEN 0 ELSE 1 END
         LIMIT 1`,
        [input.subjectName.trim()],
      );
      subject = result.rows[0];
    }
    if (!subject) throw appError('Choose a valid VidyaSetu subject before adding this source to Content Library');

    const { rows: [media] } = await client.query<DiscoveryMediaRow>(
      `SELECT media_kind,duration_seconds,thumbnail_url,embed_url
       FROM learning_source_discovery_candidates
       WHERE intake_id=$1::uuid
       ORDER BY staged_at DESC NULLS LAST,created_at DESC
       LIMIT 1`,
      [intakeId],
    );
    const resourceType = mapExternalResourceType(media?.media_kind || null);
    const chapter = input.chapter?.trim() || null;
    const topic = input.topic?.trim() || null;
    const subjectLabel = subject.name;
    const publicSlug = `${slugify(intake.title)}-${String(intake.id).slice(0,8)}`;
    const summary = `Governed external ${resourceType === 'EXTERNAL_LINK' ? 'learning reference' : resourceType.toLowerCase()} for Class ${input.classNumber} ${subjectLabel}${topic ? ` — ${topic}` : ''}. Open the original source to use this reviewed learning item.`;

    const { rows: [resource] } = await client.query<{
      id: UUID;
      title: string;
      review_status: string;
      visibility: string;
      access_requirement: string;
      class_min: number;
      class_max: number;
      subject_id: UUID;
      subject_label: string;
      topic_label: string | null;
      chapter_label: string | null;
    }>(
      `INSERT INTO learning_resources
       (public_slug,title,summary,resource_type,category,visibility,review_status,language,
        class_min,class_max,subject_id,subject_label,topic_label,chapter_label,
        source_id,source_url,source_item_id,licence,attribution_text,external_url,
        thumbnail_url,duration_secs,is_offline_ready,is_featured_public,access_requirement,created_by)
       VALUES($1,$2,$3,$4::learning_resource_type,'ACADEMIC'::learning_category,$5::learning_visibility,
              'DRAFT'::learning_review_status,$6,$7,$7,$8::uuid,$9,$10,$11,$12::uuid,$13,$14,
              $15::learning_license_code,$16,$13,$17,$18,FALSE,FALSE,$19::learning_access_requirement,$20::uuid)
       RETURNING id,title,review_status,visibility,access_requirement,class_min,class_max,subject_id,subject_label,topic_label,chapter_label`,
      [
        publicSlug,intake.title,summary,resourceType,input.visibility,input.language || 'en',input.classNumber,
        subject.id,subjectLabel,topic,chapter,intake.source_id,intake.source_url,intake.source_item_id,
        intake.licence_candidate || 'EXTERNAL_LINK_ONLY',intake.attribution_text,media?.thumbnail_url || null,
        media?.duration_seconds || null,input.accessRequirement,adminId,
      ],
    );

    await client.query(
      `INSERT INTO learning_resource_boards(resource_id,board_id) VALUES($1::uuid,$2::uuid) ON CONFLICT DO NOTHING`,
      [resource.id,board.id],
    );
    await client.query(
      `INSERT INTO learning_resource_grades(resource_id,grade_id)
       SELECT $1::uuid,id FROM education_grade_levels WHERE class_number=$2 AND is_active=TRUE
       ON CONFLICT DO NOTHING`,
      [resource.id,input.classNumber],
    );
    await client.query(
      `INSERT INTO learning_resource_reviews(resource_id,reviewer_id,from_status,to_status,review_note)
       VALUES($1::uuid,$2::uuid,NULL,'DRAFT'::learning_review_status,$3)`,
      [resource.id,adminId,`Imported from approved ${intake.source_code} Source & Licence Review item. Content Library review and publication still required.`],
    );
    await client.query(
      `UPDATE learning_source_intake
       SET status='IMPORTED'::learning_intake_status,imported_resource_id=$2::uuid,imported_at=NOW(),imported_by=$3::uuid,
           reviewed_by=$3::uuid,reviewed_at=NOW(),updated_at=NOW()
       WHERE id=$1::uuid`,
      [intakeId,resource.id,adminId],
    );

    return {
      ...resource,
      alreadyImported: false,
      intakeId,
      sourceCode: intake.source_code,
      resourceType,
      message: 'Added to Content Library as DRAFT. Review and publish it there before learners can access it.',
    };
  });
}
