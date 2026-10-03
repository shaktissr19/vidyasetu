import { createHash, randomUUID } from 'crypto';
import type { PoolClient, QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';
import * as practiceService from './adminLearningPractice.service';

export type PipelineMediaKind =
  | 'ARTICLE'
  | 'VIDEO'
  | 'AUDIO'
  | 'IMAGE'
  | 'INTERACTIVE'
  | 'PDF'
  | 'WORKSHEET'
  | 'QUESTION_PAPER'
  | 'EXTERNAL_LINK';

export type PipelineDeliveryMode = 'EXTERNAL_LINK' | 'OFFICIAL_EMBED' | 'LICENSED_REHOST' | 'VIDYASETU_ORIGINAL';

export type PipelineLicence =
  | 'VIDYASETU_ORIGINAL'
  | 'CC_BY'
  | 'CC_BY_SA'
  | 'CC_BY_NC'
  | 'CC_BY_NC_SA'
  | 'CC_BY_ND'
  | 'CC_BY_NC_ND'
  | 'PUBLIC_DOMAIN'
  | 'EXTERNAL_LINK_ONLY'
  | 'OTHER';

export type PipelineCategory =
  | 'ACADEMIC'
  | 'MOTIVATION'
  | 'STUDY_SKILLS'
  | 'WORK_ETHIC'
  | 'SOCIAL_RESPONSIBILITY'
  | 'LIFE_SKILLS'
  | 'WELLBEING'
  | 'CAREER_AWARENESS'
  | 'DIGITAL_CITIZENSHIP';

export type PipelineVisibility = 'PUBLIC' | 'REGISTERED' | 'CLASS_ONLY' | 'SCHOOL_ONLY';
export type PipelineAccess = 'PUBLIC' | 'REGISTERED' | 'SUBSCRIBER';

export interface StagePipelineInput {
  sourceCode: string;
  title: string;
  mediaKind: PipelineMediaKind;
  deliveryMode: PipelineDeliveryMode;
  sourceUrl?: string | null;
  sourceItemId?: string | null;
  embedUrl?: string | null;
  storageKey?: string | null;
  mimeType?: string | null;
  byteSize?: number | null;
  checksumSha256?: string | null;
  licenceCandidate?: PipelineLicence | null;
  licenceUrl?: string | null;
  attributionText?: string | null;
  rightsEvidenceUrl?: string | null;
  category: PipelineCategory;
  gradeCodes: string[];
  boardCodes: string[];
  subjectId?: UUID | null;
  subjectLabel?: string | null;
  chapterLabel?: string | null;
  topicLabel?: string | null;
  language?: string | null;
  visibility: PipelineVisibility;
  accessRequirement: PipelineAccess;
  bodyMarkdown?: string | null;
  bodyMarkdownHi?: string | null;
  summary?: string | null;
  summaryHi?: string | null;
  thumbnailUrl?: string | null;
  durationSecs?: number | null;
}

export interface VerifyPipelineRightsInput {
  licenceCandidate: PipelineLicence;
  licenceUrl?: string | null;
  attributionText: string;
  rightsEvidenceUrl?: string | null;
  reviewerNote?: string | null;
}

interface SourceRow extends QueryResultRow {
  id: UUID;
  code: string;
  source_kind: string;
  attribution_required: boolean;
  requires_item_license_check: boolean;
}

interface IntakeRow extends QueryResultRow {
  id: UUID;
  status: string;
  source_id: UUID;
  source_code: string;
  source_name: string;
  source_item_id: string | null;
  title: string;
  source_url: string;
  media_kind: PipelineMediaKind;
  delivery_mode: PipelineDeliveryMode;
  rights_status: string;
  licence_candidate: PipelineLicence | null;
  attribution_text: string | null;
  licence_url: string | null;
  rights_evidence_url: string | null;
  category: PipelineCategory;
  asset_id: UUID | null;
  embed_url: string | null;
}

const LICENCES = new Set<PipelineLicence>([
  'VIDYASETU_ORIGINAL', 'CC_BY', 'CC_BY_SA', 'CC_BY_NC', 'CC_BY_NC_SA',
  'CC_BY_ND', 'CC_BY_NC_ND', 'PUBLIC_DOMAIN', 'EXTERNAL_LINK_ONLY', 'OTHER',
]);

const CATEGORIES = [
  'ACADEMIC', 'MOTIVATION', 'STUDY_SKILLS', 'WORK_ETHIC', 'SOCIAL_RESPONSIBILITY',
  'LIFE_SKILLS', 'WELLBEING', 'CAREER_AWARENESS', 'DIGITAL_CITIZENSHIP',
] as const satisfies readonly PipelineCategory[];
const CATEGORY_LABELS: Record<PipelineCategory, string> = {
  ACADEMIC: 'Academic',
  MOTIVATION: 'Motivation',
  STUDY_SKILLS: 'Study skills',
  WORK_ETHIC: 'Work ethic',
  SOCIAL_RESPONSIBILITY: 'Social responsibility',
  LIFE_SKILLS: 'Life skills',
  WELLBEING: 'Well-being',
  CAREER_AWARENESS: 'Career awareness',
  DIGITAL_CITIZENSHIP: 'Digital citizenship',
};

const BINARY_MEDIA = new Set<PipelineMediaKind>([
  'VIDEO', 'AUDIO', 'IMAGE', 'PDF', 'WORKSHEET', 'QUESTION_PAPER',
]);

function appError(message: string, statusCode = 400): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function nullable(value: unknown): string | null {
  const valueText = text(value);
  return valueText || null;
}

function normalizeHttpsUrl(raw: string | null | undefined, label: string): string | null {
  if (!raw?.trim()) return null;
  let parsed: URL;
  try { parsed = new URL(raw.trim()); } catch { throw appError(`${label} must be a valid URL`); }
  if (parsed.protocol !== 'https:') throw appError(`${label} must use HTTPS`);
  if (parsed.username || parsed.password) throw appError(`${label} must not contain embedded credentials`);
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const blocked = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);
  if (blocked.has(host) || host.endsWith('.local') || host.endsWith('.internal')) {
    throw appError(`${label} cannot target a private or local network`);
  }
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    const [a, b] = octets;
    const privateRange = a === 10 || a === 127 || a === 0 || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
    if (privateRange || octets.some((item) => item < 0 || item > 255)) {
      throw appError(`${label} cannot target a private or invalid IP address`);
    }
  }
  parsed.hash = '';
  return parsed.toString();
}

function assertStorageKey(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const key = raw.trim();
  if (!key.startsWith('learning/') || key.includes('..') || key.includes('\\') || /^https?:\/\//i.test(key)) {
    throw appError('Uploaded content must use a VidyaSetu learning storage key');
  }
  return key;
}

function slugify(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 140) || 'learning-resource';
}

function assertAccessPolicy(visibility: PipelineVisibility, accessRequirement: PipelineAccess): void {
  if (visibility === 'PUBLIC' && accessRequirement !== 'PUBLIC') {
    throw appError('PUBLIC visibility requires PUBLIC access');
  }
  if (visibility !== 'PUBLIC' && accessRequirement === 'PUBLIC') {
    throw appError('PUBLIC access requires PUBLIC visibility');
  }
}

function licenceAllowsCommercialUse(licence: PipelineLicence): boolean {
  return ['VIDYASETU_ORIGINAL', 'CC_BY', 'CC_BY_SA', 'CC_BY_ND', 'PUBLIC_DOMAIN'].includes(licence);
}

function licenceAllowsAdaptation(licence: PipelineLicence): boolean {
  return ['VIDYASETU_ORIGINAL', 'CC_BY', 'CC_BY_SA', 'CC_BY_NC', 'CC_BY_NC_SA', 'PUBLIC_DOMAIN'].includes(licence);
}

function pipelineSourceUrl(sourceCode: string, sourceUrl: string | null): string {
  if (sourceUrl) return sourceUrl;
  return `https://vidyasetu.sbs/content-pipeline/original/${randomUUID()}`;
}

async function assertPipelineSchema(): Promise<void> {
  const { rows: [row] } = await query<{ ready: boolean } & QueryResultRow>(
    `SELECT to_regclass('public.learning_content_assets') IS NOT NULL
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='learning_source_intake' AND column_name='delivery_mode')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='learning_resources' AND column_name='asset_id') AS ready`,
  );
  if (!row?.ready) throw appError('Content Pipeline requires database migration 051', 503);
}

async function getSource(client: Pick<PoolClient, 'query'>, sourceCode: string): Promise<SourceRow> {
  const { rows: [source] } = await client.query<SourceRow>(
    `SELECT id,code,source_kind,attribution_required,requires_item_license_check
     FROM learning_content_sources WHERE code=$1 AND is_active=TRUE`,
    [sourceCode.toUpperCase()],
  );
  if (!source) throw appError('Unknown or inactive content source');
  return source;
}

async function validateScope(client: Pick<PoolClient, 'query'>, gradeCodes: string[], boardCodes: string[]): Promise<{ grades: string[]; boards: { id: UUID; code: string }[] }> {
  const grades = [...new Set(gradeCodes.map((item) => text(item).toUpperCase()).filter(Boolean))];
  const boards = [...new Set(boardCodes.map((item) => text(item).toUpperCase()).filter(Boolean))];
  if (!grades.length) throw appError('Select at least one grade, including UKG/LKG where applicable');
  if (!boards.length) throw appError('Select at least one education board');
  const { rows: gradeRows } = await client.query<{ code: string }>(
    `SELECT code FROM education_grade_levels WHERE code=ANY($1::varchar[]) AND is_active=TRUE`, [grades],
  );
  if (gradeRows.length !== grades.length) throw appError('One or more selected grade codes are invalid');
  const { rows: boardRows } = await client.query<{ id: UUID; code: string }>(
    `SELECT id,code FROM education_boards WHERE code=ANY($1::varchar[]) AND is_active=TRUE`, [boards],
  );
  if (boardRows.length !== boards.length) throw appError('One or more selected board codes are invalid');
  return { grades, boards: boardRows };
}

function validateStage(input: StagePipelineInput, source: SourceRow): {
  sourceUrl: string;
  embedUrl: string | null;
  storageKey: string | null;
  licence: PipelineLicence;
  category: PipelineCategory;
  rightsStatus: 'UNVERIFIED' | 'PENDING_REVIEW' | 'VERIFIED';
} {
  const title = text(input.title);
  if (title.length < 2) throw appError('Content title is required');
  if (!LICENCES.has(input.licenceCandidate || 'OTHER')) throw appError('Unsupported licence');
  if (!CATEGORIES.includes(input.category)) throw appError('Unsupported learning category');
  assertAccessPolicy(input.visibility, input.accessRequirement);

  const sourceUrl = normalizeHttpsUrl(input.sourceUrl, 'Original source URL');
  const embedUrl = normalizeHttpsUrl(input.embedUrl, 'Embed URL');
  const storageKey = assertStorageKey(input.storageKey);
  const licence = (input.licenceCandidate || (input.deliveryMode === 'VIDYASETU_ORIGINAL' ? 'VIDYASETU_ORIGINAL' : 'EXTERNAL_LINK_ONLY')) as PipelineLicence;

  if (input.deliveryMode === 'VIDYASETU_ORIGINAL') {
    if (source.code !== 'VIDYASETU_ORIGINAL') throw appError('Original VidyaSetu content must use the VIDYASETU_ORIGINAL source');
    if (BINARY_MEDIA.has(input.mediaKind) && !storageKey) throw appError('Upload the original media file before staging it');
    if (input.mediaKind === 'ARTICLE' && !text(input.bodyMarkdown) && !text(input.bodyMarkdownHi)) {
      throw appError('Original article content requires English or Hindi text');
    }
  } else if (!sourceUrl) {
    throw appError('External content requires its original source URL');
  }

  if (input.deliveryMode === 'OFFICIAL_EMBED' && !embedUrl) {
    throw appError('Official embed mode requires the provider-approved embed URL');
  }
  if (input.deliveryMode === 'LICENSED_REHOST') {
    if (!storageKey) throw appError('Licensed rehost mode requires an explicitly uploaded media file');
    if (licence === 'OTHER' || licence === 'EXTERNAL_LINK_ONLY') {
      throw appError('Licensed rehost mode requires a verified reusable licence, not link-only or unknown rights');
    }
  }
  if (input.deliveryMode !== 'VIDYASETU_ORIGINAL' && input.accessRequirement === 'SUBSCRIBER'
      && input.deliveryMode === 'LICENSED_REHOST' && !licenceAllowsCommercialUse(licence)) {
    throw appError('Non-commercial content cannot be placed behind subscriber access');
  }

  return {
    sourceUrl: pipelineSourceUrl(source.code, sourceUrl),
    embedUrl,
    storageKey,
    licence,
    category: input.category,
    rightsStatus: input.deliveryMode === 'VIDYASETU_ORIGINAL' ? 'VERIFIED' : 'PENDING_REVIEW',
  };
}

export async function getPipelineOptions() {
  await assertPipelineSchema();
  const [grades, boards, sources] = await Promise.all([
    query(`SELECT code,name,short_name,stage,class_number,sort_order FROM education_grade_levels WHERE is_active=TRUE ORDER BY sort_order`),
    query(`SELECT code,name,short_name,board_type,state FROM education_boards WHERE is_active=TRUE ORDER BY sort_order,name`),
    query(`SELECT code,name,source_kind,homepage_url,default_license::text,attribution_required,allow_rehosting_default,allow_adaptation_default,requires_item_license_check,notes
           FROM learning_content_sources WHERE is_active=TRUE ORDER BY name`),
  ]);
  return {
    grades: grades.rows,
    boards: boards.rows,
    sources: sources.rows,
    categories: CATEGORIES.map((code) => ({ code, label: CATEGORY_LABELS[code] })),
    mediaKinds: ['ARTICLE','VIDEO','AUDIO','IMAGE','INTERACTIVE','PDF','WORKSHEET','QUESTION_PAPER','EXTERNAL_LINK'] as PipelineMediaKind[],
    deliveryModes: [
      { code: 'VIDYASETU_ORIGINAL', label: 'VidyaSetu original/upload', description: 'Your own authored or commissioned asset.' },
      { code: 'LICENSED_REHOST', label: 'Licensed rehost', description: 'Copy only after item-level rights verification.' },
      { code: 'OFFICIAL_EMBED', label: 'Official embed', description: 'Provider-approved player; provider may still require login.' },
      { code: 'EXTERNAL_LINK', label: 'External link', description: 'Keep playback on the source platform.' },
    ],
    policy: 'Discovery and upload are staged. Nothing is downloaded from a provider, approved, or published automatically.',
  };
}

export async function listPipelineQueue() {
  await assertPipelineSchema();
  const { rows } = await query(
    `SELECT lsi.id,lsi.title,lsi.source_url,lsi.source_item_id,lsi.media_kind,lsi.delivery_mode,lsi.rights_status,
            lsi.licence_candidate,lsi.licence_url,lsi.attribution_text,lsi.rights_evidence_url,lsi.grade_code,
            lsi.category,
            lsi.status,lsi.created_at,lsi.reviewed_at,lsi.imported_resource_id,
            lcs.code AS source_code,lcs.name AS source_name,
            a.id AS asset_id,a.storage_key,a.mime_type,a.byte_size,a.processing_status,a.resource_id,
            a.verified_at AS asset_verified_at
     FROM learning_source_intake lsi
     JOIN learning_content_sources lcs ON lcs.id=lsi.source_id
     LEFT JOIN learning_content_assets a ON a.id=lsi.asset_id
     ORDER BY CASE lsi.status WHEN 'DISCOVERED' THEN 1 WHEN 'LICENCE_REVIEW' THEN 2 WHEN 'CONTENT_REVIEW' THEN 3
                              WHEN 'APPROVED' THEN 4 WHEN 'IMPORTED' THEN 8 ELSE 9 END,lsi.created_at DESC
     LIMIT 500`,
  );
  return rows;
}

export async function stageContent(input: StagePipelineInput, adminId: UUID) {
  await assertPipelineSchema();
  return transaction(async (client) => {
    const source = await getSource(client, input.sourceCode);
    const policy = validateStage(input, source);
    const scope = await validateScope(client, input.gradeCodes, input.boardCodes);
    const licenceUrl = normalizeHttpsUrl(input.licenceUrl, 'Licence URL');
    const rightsEvidenceUrl = normalizeHttpsUrl(input.rightsEvidenceUrl, 'Rights evidence URL');
    const attributionText = nullable(input.attributionText)
      || (policy.licence === 'VIDYASETU_ORIGINAL' ? 'VidyaSetu Original' : null);
    const sourceItemId = text(input.sourceItemId) || `${source.code.toLowerCase()}-${createHash('sha256').update(policy.sourceUrl).digest('hex').slice(0, 40)}`;
    const metadata = {
      gradeCodes: scope.grades,
      boardCodes: scope.boards.map((item) => item.code),
      subjectId: input.subjectId || null,
      subjectLabel: nullable(input.subjectLabel),
      chapterLabel: nullable(input.chapterLabel),
      topicLabel: nullable(input.topicLabel),
      language: nullable(input.language) || 'en',
      category: policy.category,
      visibility: input.visibility,
      accessRequirement: input.accessRequirement,
      bodyMarkdown: nullable(input.bodyMarkdown),
      bodyMarkdownHi: nullable(input.bodyMarkdownHi),
      summary: nullable(input.summary),
      summaryHi: nullable(input.summaryHi),
      thumbnailUrl: normalizeHttpsUrl(input.thumbnailUrl, 'Thumbnail URL'),
      durationSecs: input.durationSecs || null,
    };

    const { rows: [intake] } = await client.query<{ id: UUID; status: string; title: string; source_url: string }>(
      `INSERT INTO learning_source_intake
        (source_id,source_item_id,title,source_url,licence_candidate,attribution_text,class_hint,board_hint,subject_hint,
         category,delivery_mode,rights_status,licence_url,rights_evidence_url,grade_code,media_kind,embed_url,created_by)
       VALUES($1::uuid,$2,$3,$4,$5::learning_license_code,$6,$7,$8,$9,$10::learning_category,$11::learning_delivery_mode,$12::learning_rights_status,
              $13,$14,$15,$16,$17,$18::uuid)
       ON CONFLICT(source_id,source_url) DO UPDATE SET
       title=EXCLUDED.title,
       source_item_id=COALESCE(EXCLUDED.source_item_id,learning_source_intake.source_item_id),
       media_kind=EXCLUDED.media_kind,
       delivery_mode=EXCLUDED.delivery_mode,
       licence_candidate=EXCLUDED.licence_candidate,
       attribution_text=EXCLUDED.attribution_text,
       category=EXCLUDED.category,
       rights_status=EXCLUDED.rights_status,
       licence_url=EXCLUDED.licence_url,
       rights_evidence_url=EXCLUDED.rights_evidence_url,
       grade_code=EXCLUDED.grade_code,
       embed_url=EXCLUDED.embed_url,
       updated_at=NOW()
       RETURNING id,status,title,source_url`,
      [source.id,sourceItemId,text(input.title),policy.sourceUrl,policy.licence,attributionText,scope.grades.join(','),scope.boards.map((item) => item.code).join(','),nullable(input.subjectLabel),policy.category,input.deliveryMode,policy.rightsStatus,licenceUrl,rightsEvidenceUrl,scope.grades[0],input.mediaKind,policy.embedUrl,adminId],
    );

    const { rows: [asset] } = await client.query<{ id: UUID }>(
      `INSERT INTO learning_content_assets
        (intake_id,asset_kind,delivery_mode,provider_code,source_url,embed_url,storage_key,mime_type,byte_size,checksum_sha256,
         processing_status,rights_status,licence,licence_url,attribution_text,rights_evidence_url,adaptation_allowed,commercial_use_allowed,
         verified_by,verified_at,metadata,created_by)
       VALUES($1::uuid,$2,$3::learning_delivery_mode,$4,$5,$6,$7,$8,$9,$10,
              $11::learning_asset_status,$12::learning_rights_status,$13::learning_license_code,$14,$15,$16,$17,$18,$19::uuid,$20,$21::jsonb,$22::uuid)
       ON CONFLICT (intake_id) WHERE intake_id IS NOT NULL DO UPDATE SET
         asset_kind=EXCLUDED.asset_kind,delivery_mode=EXCLUDED.delivery_mode,provider_code=EXCLUDED.provider_code,
         source_url=EXCLUDED.source_url,embed_url=EXCLUDED.embed_url,storage_key=EXCLUDED.storage_key,mime_type=EXCLUDED.mime_type,
         byte_size=EXCLUDED.byte_size,checksum_sha256=EXCLUDED.checksum_sha256,processing_status=EXCLUDED.processing_status,
         rights_status=EXCLUDED.rights_status,licence=EXCLUDED.licence,licence_url=EXCLUDED.licence_url,
         attribution_text=EXCLUDED.attribution_text,rights_evidence_url=EXCLUDED.rights_evidence_url,
         adaptation_allowed=EXCLUDED.adaptation_allowed,commercial_use_allowed=EXCLUDED.commercial_use_allowed,
         verified_by=EXCLUDED.verified_by,verified_at=EXCLUDED.verified_at,metadata=EXCLUDED.metadata,updated_at=NOW()
       RETURNING id`,
      [intake.id,input.mediaKind,input.deliveryMode,source.code,policy.sourceUrl,policy.embedUrl,policy.storageKey,nullable(input.mimeType),input.byteSize || null,nullable(input.checksumSha256),policy.storageKey ? 'READY' : 'METADATA_ONLY',policy.rightsStatus,policy.licence,licenceUrl,attributionText,rightsEvidenceUrl,licenceAllowsAdaptation(policy.licence),licenceAllowsCommercialUse(policy.licence),policy.rightsStatus === 'VERIFIED' ? adminId : null,policy.rightsStatus === 'VERIFIED' ? new Date() : null,JSON.stringify(metadata),adminId],
    );
    if (!asset) throw appError('Could not register the pipeline asset', 409);

    await client.query(`UPDATE learning_source_intake SET asset_id=$2::uuid,updated_at=NOW() WHERE id=$1::uuid`, [intake.id,asset.id]);
    await client.query(
      `INSERT INTO learning_content_pipeline_events(intake_id,asset_id,actor_id,event_code,from_state,to_state,details)
       VALUES($1::uuid,$2::uuid,$3::uuid,'STAGED',NULL,$4,$5::jsonb)`,
      [intake.id,asset.id,adminId,input.deliveryMode,JSON.stringify({ sourceCode: source.code, mediaKind: input.mediaKind, gradeCodes: scope.grades })],
    );
    return { intakeId: intake.id, assetId: asset.id, status: intake.status, deliveryMode: input.deliveryMode, rightsStatus: policy.rightsStatus, message: 'Content staged. Verify rights and approve it before creating a Learning draft.' };
  });
}

export async function verifyRights(intakeId: UUID, input: VerifyPipelineRightsInput, adminId: UUID) {
  await assertPipelineSchema();
  const licence = input.licenceCandidate;
  if (!LICENCES.has(licence) || licence === 'OTHER') throw appError('Choose a concrete licence or EXTERNAL_LINK_ONLY');
  const attribution = text(input.attributionText);
  if (!attribution) throw appError('Attribution is required for rights verification');
  const licenceUrl = normalizeHttpsUrl(input.licenceUrl, 'Licence URL');
  const rightsEvidenceUrl = normalizeHttpsUrl(input.rightsEvidenceUrl, 'Rights evidence URL');

  return transaction(async (client) => {
    const { rows: [item] } = await client.query<IntakeRow>(
      `SELECT lsi.id,lsi.status,lsi.source_id,lcs.code AS source_code,lcs.name AS source_name,lsi.source_item_id,lsi.title,lsi.source_url,
              lsi.media_kind,lsi.category,lsi.delivery_mode,lsi.rights_status,lsi.licence_candidate,lsi.attribution_text,lsi.licence_url,
              lsi.rights_evidence_url,lsi.asset_id
       FROM learning_source_intake lsi JOIN learning_content_sources lcs ON lcs.id=lsi.source_id
       WHERE lsi.id=$1::uuid FOR UPDATE`, [intakeId],
    );
    if (!item) throw appError('Pipeline intake item not found',404);
    if (item.status === 'IMPORTED') throw appError('Imported intake evidence is immutable; create a new intake revision');
    if (item.delivery_mode === 'LICENSED_REHOST' && (licence === 'EXTERNAL_LINK_ONLY' || !input.rightsEvidenceUrl?.trim())) {
      throw appError('Licensed rehost requires a reusable licence and rights evidence URL');
    }
    const updated = await client.query(
      `UPDATE learning_source_intake
       SET licence_candidate=$2::learning_license_code,licence_url=$3,attribution_text=$4,rights_evidence_url=$5,
           rights_status='VERIFIED'::learning_rights_status,licence_verified_at=NOW(),licence_verified_by=$6::uuid,
           status=CASE WHEN status IN ('DISCOVERED','LICENCE_REVIEW') THEN 'CONTENT_REVIEW'::learning_intake_status ELSE status END,
           reviewed_by=$6::uuid,reviewed_at=NOW(),reviewer_note=COALESCE($7,reviewer_note),updated_at=NOW()
       WHERE id=$1::uuid
       RETURNING id,title,status,rights_status,licence_candidate,licence_verified_at`,
      [intakeId,licence,licenceUrl,attribution,rightsEvidenceUrl,adminId,nullable(input.reviewerNote)],
    );
    await client.query(
      `UPDATE learning_content_assets
       SET rights_status='VERIFIED'::learning_rights_status,licence=$2::learning_license_code,licence_url=$3,
           attribution_text=$4,rights_evidence_url=$5,adaptation_allowed=$6,commercial_use_allowed=$7,
           verified_by=$8::uuid,verified_at=NOW(),updated_at=NOW()
       WHERE id=(SELECT asset_id FROM learning_source_intake WHERE id=$1::uuid)`,
      [intakeId,licence,licenceUrl,attribution,rightsEvidenceUrl,licenceAllowsAdaptation(licence),licenceAllowsCommercialUse(licence),adminId],
    );
    await client.query(
      `INSERT INTO learning_content_pipeline_events(intake_id,asset_id,actor_id,event_code,from_state,to_state,details)
       SELECT lsi.id,lsi.asset_id,$2::uuid,'RIGHTS_VERIFIED',lsi.rights_status::text,'VERIFIED',$3::jsonb
       FROM learning_source_intake lsi WHERE lsi.id=$1::uuid`,
      [intakeId,adminId,JSON.stringify({ licence, evidenceUrl: rightsEvidenceUrl })],
    );
    return updated.rows[0];
  });
}

export async function approveIntake(intakeId: UUID, adminId: UUID, note?: string | null) {
  await assertPipelineSchema();
  return practiceService.updateIntakeStatus(intakeId,'APPROVED',adminId,note);
}

export async function materialiseIntake(intakeId: UUID, adminId: UUID) {
  await assertPipelineSchema();
  return transaction(async (client) => {
    const { rows: [item] } = await client.query<IntakeRow & { metadata: Record<string, unknown>; storage_key: string | null; thumbnail_url: string | null; duration_secs: number | null; resource_id: UUID | null; licence_verified_at: string | Date | null; source_kind: string }>(
      `SELECT lsi.id,lsi.status,lsi.source_id,lcs.code AS source_code,lcs.name AS source_name,lcs.source_kind,lsi.source_item_id,lsi.title,lsi.source_url,
              lsi.media_kind,lsi.category,lsi.delivery_mode,lsi.rights_status,lsi.licence_candidate,lsi.attribution_text,lsi.licence_url,
              lsi.rights_evidence_url,lsi.asset_id,lsi.licence_verified_at,
              lsi.embed_url,a.metadata,a.storage_key,a.resource_id
       FROM learning_source_intake lsi
       JOIN learning_content_sources lcs ON lcs.id=lsi.source_id
       LEFT JOIN learning_content_assets a ON a.id=lsi.asset_id
       WHERE lsi.id=$1::uuid FOR UPDATE OF lsi`, [intakeId],
    );
    if (!item) throw appError('Pipeline intake item not found',404);
    if (item.resource_id) return { resourceId: item.resource_id, intakeId, alreadyImported: true };
    if (item.status !== 'APPROVED') throw appError('Approve the rights-reviewed item before adding it to Content Library');
    if (item.rights_status !== 'VERIFIED' || !item.licence_candidate || !item.licence_verified_at) throw appError('Item-level rights verification is required before materialisation');
    if (!item.asset_id) throw appError('Pipeline asset is missing',409);
    if (BINARY_MEDIA.has(item.media_kind)
        && ['LICENSED_REHOST', 'VIDYASETU_ORIGINAL'].includes(item.delivery_mode)
        && !item.storage_key) {
      throw appError('This hosted media item has no uploaded asset');
    }

    const metadata = item.metadata || {};
    const visibility = String(metadata.visibility || 'REGISTERED') as PipelineVisibility;
    const accessRequirement = String(metadata.accessRequirement || 'REGISTERED') as PipelineAccess;
    assertAccessPolicy(visibility,accessRequirement);
    if (item.delivery_mode === 'LICENSED_REHOST' && accessRequirement === 'SUBSCRIBER' && !licenceAllowsCommercialUse(item.licence_candidate)) {
      throw appError('Non-commercial content cannot be subscriber-gated');
    }
    const boardCodes = Array.isArray(metadata.boardCodes) ? metadata.boardCodes.map((value) => String(value).toUpperCase()) : ['COMMON'];
    const gradeCodes = Array.isArray(metadata.gradeCodes) ? metadata.gradeCodes.map((value) => String(value).toUpperCase()) : [];
    const scope = await validateScope(client,gradeCodes,boardCodes);
    const subjectId = typeof metadata.subjectId === 'string' && metadata.subjectId ? metadata.subjectId : null;
    if (subjectId) {
      const subject = await client.query(`SELECT id FROM subjects WHERE id=$1::uuid`,[subjectId]);
      if (!subject.rows[0]) throw appError('Selected subject is invalid');
    }
    const sourceUrl = item.source_url;
    const externalUrl = item.delivery_mode === 'OFFICIAL_EMBED'
      ? (item.embed_url || sourceUrl)
      : item.delivery_mode === 'EXTERNAL_LINK' ? sourceUrl : null;
    const body = nullable(metadata.bodyMarkdown);
    const bodyHi = nullable(metadata.bodyMarkdownHi);
    if (item.media_kind === 'ARTICLE' && item.delivery_mode === 'VIDYASETU_ORIGINAL' && !body && !bodyHi) {
      throw appError('Original text content must include learner text');
    }
    const publicSlug = `${slugify(item.title)}-${String(item.id).slice(0,8)}`;
    const resourceResult = await client.query<{ id: UUID }>(
      `INSERT INTO learning_resources
       (public_slug,title,summary,summary_hi,body_markdown,body_markdown_hi,resource_type,category,visibility,review_status,language,
        class_min,class_max,subject_id,subject_label,topic_label,chapter_label,source_id,source_url,source_item_id,licence,licence_url,
        attribution_text,external_url,file_key,thumbnail_url,duration_secs,is_offline_ready,is_featured_public,access_requirement,created_by,
        delivery_mode,rights_status,rights_evidence_url,rights_verified_at,rights_verified_by,asset_id)
       VALUES($1,$2,$3,$4,$5,$6,$7::learning_resource_type,$8::learning_category,$9::learning_visibility,'DRAFT'::learning_review_status,
              $10,$11,$12,$13::uuid,$14,$15,$16,$17::uuid,$18,$19,$20::learning_license_code,$21,$22,$23,$24,$25,$26,FALSE,FALSE,
              $27::learning_access_requirement,$28::uuid,$29::learning_delivery_mode,'VERIFIED'::learning_rights_status,$30,$31,$32::uuid,$33::uuid)
       RETURNING id`,
      [publicSlug,item.title,nullable(metadata.summary),nullable(metadata.summaryHi),body,bodyHi,item.media_kind,item.category,visibility,String(metadata.language || 'en'),null,null,subjectId,nullable(metadata.subjectLabel),nullable(metadata.topicLabel),nullable(metadata.chapterLabel),item.source_id,sourceUrl,item.source_item_id,item.licence_candidate, item.licence_url,item.attribution_text,externalUrl,item.delivery_mode === 'LICENSED_REHOST' || item.delivery_mode === 'VIDYASETU_ORIGINAL' ? item.storage_key : null,nullable(metadata.thumbnailUrl),Number(metadata.durationSecs || 0) || null,accessRequirement,adminId,item.delivery_mode,item.rights_evidence_url,item.licence_verified_at,item.licence_verified_by,item.asset_id],
    );
    const resourceId = resourceResult.rows[0].id;
    for (const board of scope.boards) await client.query(`INSERT INTO learning_resource_boards(resource_id,board_id) VALUES($1::uuid,$2::uuid) ON CONFLICT DO NOTHING`,[resourceId,board.id]);
    await client.query(`INSERT INTO learning_resource_grades(resource_id,grade_id) SELECT $1::uuid,id FROM education_grade_levels WHERE code=ANY($2::varchar[]) ON CONFLICT DO NOTHING`,[resourceId,scope.grades]);
    await client.query(`INSERT INTO learning_resource_reviews(resource_id,reviewer_id,from_status,to_status,review_note) VALUES($1::uuid,$2::uuid,NULL,'DRAFT'::learning_review_status,$3)`,[resourceId,adminId,'Created by the rights-aware Content Pipeline. Academic, accessibility, safety and publication review remain required.']);
    await client.query(`UPDATE learning_content_assets SET resource_id=$2::uuid,updated_at=NOW() WHERE id=$1::uuid`,[item.asset_id,resourceId]);
    await client.query(`UPDATE learning_source_intake SET status='IMPORTED'::learning_intake_status,imported_resource_id=$2::uuid,imported_at=NOW(),imported_by=$3::uuid,updated_at=NOW() WHERE id=$1::uuid`,[intakeId,resourceId,adminId]);
    await client.query(`INSERT INTO learning_content_pipeline_events(intake_id,asset_id,resource_id,actor_id,event_code,from_state,to_state,details) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,'MATERIALISED','APPROVED','DRAFT',$5::jsonb)`,[intakeId,item.asset_id,resourceId,adminId,JSON.stringify({ deliveryMode: item.delivery_mode, mediaKind: item.media_kind })]);
    return { resourceId, intakeId, alreadyImported: false, reviewStatus: 'DRAFT', message: 'Added to Content Library as DRAFT. Publication still requires the normal Learning quality and review gates.' };
  });
}
