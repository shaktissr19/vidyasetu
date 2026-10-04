import { createHash } from 'crypto';
import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';
import * as pipeline from './learningContentPipeline.service';
import { assertLearningRightsPolicy } from './learningDeliveryPolicy';
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
  rightsEvidenceUrl?: string | null;
  licenceUrl?: string | null;
  category?: pipeline.PipelineCategory;
  difficulty?: 'EASY' | 'MODERATE' | 'ADVANCED' | null;
  titleHi?: string | null;
  conceptIds?: UUID[];
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

function mapExternalResourceType(mediaKind: string | null): 'VIDEO' | 'AUDIO' | 'IMAGE' | 'PDF' | 'INTERACTIVE' | 'EXTERNAL_LINK' {
  if (mediaKind === 'VIDEO') return 'VIDEO';
  if (mediaKind === 'AUDIO') return 'AUDIO';
  if (mediaKind === 'IMAGE') return 'IMAGE';
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
  const [boards,subjects,curriculumSubjects,units,topics,concepts,conceptCoverage,grades] = await Promise.all([
    query(`SELECT id,code,name,short_name,board_type,state,sort_order FROM education_boards WHERE is_active=TRUE ORDER BY sort_order,name`),
    query(`SELECT id,code,name FROM subjects ORDER BY name`),
    query(`SELECT cs.id,cs.curriculum_version_id,cv.academic_year,cv.board_id,eb.code AS board_code,eb.name AS board_name,
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
           WHERE cs.is_active=TRUE AND cv.status='ACTIVE' AND COALESCE((to_jsonb(ct)->>'is_retired')::boolean,FALSE)=FALSE
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
    query(`SELECT code,name,class_number FROM education_grade_levels WHERE is_active=TRUE ORDER BY sort_order`),
  ]);

  const coverageMap = new Map<number,{ conceptCount: number; subjectCount: number }>();
  for (const raw of conceptCoverage.rows as Array<QueryResultRow & { class_number: number; concept_count: number; subject_count: number }>) {
    coverageMap.set(Number(raw.class_number), { conceptCount: Number(raw.concept_count), subjectCount: Number(raw.subject_count) });
  }

  return {
    grades: grades.rows,
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

/** Compatibility adapter: every import now uses Pipeline's asset/rights/materialisation boundary. */
export async function addApprovedIntakeToLibrary(intakeId: UUID, input: AddApprovedIntakeToLibraryInput, adminId: UUID) {
  await assertHandoffSchema();
  assertAccessPolicy(input);
  const { rows: [item] } = await query(`SELECT lsi.*,lcs.code AS source_code,dc.media_kind AS discovered_media_kind,
    dc.thumbnail_url,dc.duration_seconds,a.metadata,a.resource_id
    FROM learning_source_intake lsi JOIN learning_content_sources lcs ON lcs.id=lsi.source_id
    LEFT JOIN learning_content_assets a ON a.id=lsi.asset_id
    LEFT JOIN LATERAL (SELECT media_kind,thumbnail_url,duration_seconds FROM learning_source_discovery_candidates
      WHERE intake_id=lsi.id ORDER BY created_at DESC LIMIT 1) dc ON TRUE WHERE lsi.id=$1::uuid`,[intakeId]);
  if (!item) throw appError('Source review item not found',404);
  if (item.imported_resource_id || item.resource_id) {
    const id = item.imported_resource_id || item.resource_id;
    const { rows: [resource] } = await query(`SELECT * FROM learning_resources WHERE id=$1::uuid`,[id]);
    return { ...resource,alreadyImported: true,intakeId };
  }
  if (item.asset_id) {
    const result = await pipeline.materialiseIntake(intakeId,adminId);
    const { rows: [resource] } = await query(`SELECT * FROM learning_resources WHERE id=$1::uuid`,[result.resourceId]);
    return { ...resource,...result,intakeId };
  }
  if (item.status !== 'APPROVED') throw appError('Approve the source before adding it to Library');
  const evidence = input.rightsEvidenceUrl || item.rights_evidence_url;
  try { assertLearningRightsPolicy({ deliveryMode: 'EXTERNAL_LINK',licence: item.licence_candidate,
    attribution: item.attribution_text,evidenceUrl: evidence,accessRequirement: input.accessRequirement,sourceCode: item.source_code }); }
  catch (error) { throw appError(`${(error as Error).message}. Complete this item in Content Pipeline first`); }
  const { rows: [subject] } = await query(`SELECT id,name FROM subjects WHERE id=$1::uuid OR LOWER(name)=LOWER($2) LIMIT 1`,[input.subjectId || null,input.subjectName || null]);
  if ((input.category || 'ACADEMIC') === 'ACADEMIC' && !subject) throw appError('Choose a valid academic subject');
  const kind = mapExternalResourceType(item.discovered_media_kind || null);
  await pipeline.stageContent({ intakeId,sourceCode: item.source_code,title: item.title,titleHi: input.titleHi,
    sourceUrl: item.source_url,sourceItemId: item.source_item_id,mediaKind: kind,deliveryMode: 'EXTERNAL_LINK',
    licenceCandidate: item.licence_candidate,attributionText: item.attribution_text,rightsEvidenceUrl: evidence,licenceUrl: input.licenceUrl || item.licence_url,
    category: input.category || 'ACADEMIC',gradeCodes: [`CLASS_${input.classNumber}`],boardCodes: [input.boardCode],
    subjectId: subject?.id,subjectLabel: subject?.name,chapterLabel: input.chapter,topicLabel: input.topic,
    language: input.language,visibility: input.visibility,accessRequirement: input.accessRequirement,
    difficulty: input.difficulty,conceptIds: input.conceptIds,thumbnailUrl: item.thumbnail_url,durationSecs: item.duration_seconds,
    summary: 'Reviewed external learning resource.',
  },adminId);
  await pipeline.verifyRights(intakeId,{ licenceCandidate: item.licence_candidate,attributionText: item.attribution_text,
    licenceUrl: input.licenceUrl || item.licence_url,rightsEvidenceUrl: evidence },adminId);
  await pipeline.approveIntake(intakeId,adminId);
  const result = await pipeline.materialiseIntake(intakeId,adminId);
  const { rows: [resource] } = await query(`SELECT * FROM learning_resources WHERE id=$1::uuid`,[result.resourceId]);
  return { ...resource,...result,intakeId };
}
