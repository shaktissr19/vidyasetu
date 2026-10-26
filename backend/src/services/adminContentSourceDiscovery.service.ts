import axios from 'axios';
import { acquireContent, deliveryCapability, importableAssetUrl } from './learningSourceAcquisition.service';
import * as pipeline from './learningContentPipeline.service';
import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';
import * as practiceService from './adminLearningPractice.service';
import { requirePublishedSyllabusTopic } from './syllabusContentLink.service';

export type DiscoveryProvider =
  | 'LOCAL'
  | 'DIKSHA'
  | 'YOUTUBE'
  | 'NROER'
  | 'CBSE'
  | 'NCERT_EPATHSHALA'
  | 'NIOS'
  | 'SWAYAM'
  | 'PHET'
  | 'OER_COMMONS';

export type DiscoveryMediaKind = 'ARTICLE' | 'VIDEO' | 'AUDIO' | 'IMAGE' | 'INTERACTIVE' | 'PDF' | 'COURSE' | 'LINK';

export interface DiscoverSourcesInput {
  conceptIds?:string[]; academicYear?:string|null; curriculumMedium?:'en'|'hi'|null;
  curriculumTopicId?:string|null;
  provider?: DiscoveryProvider;
  providers?: DiscoveryProvider[];
  query: string;
  classNumber?: number | null;
  gradeCode?: string | null;
  boardCode?: string | null;
  subjectId?:string | null; chapterLabel?:string | null; topicLabel?:string | null;
  subject?: string | null;
  language?: string | null;
  publisher?: string | null;
  mediaKinds?: DiscoveryMediaKind[];
  maxDurationMinutes?: number | null;
  onlyCommercialSafe?: boolean;
  limit?: number;
}

export interface StageExternalItemInput {
  provider: Exclude<DiscoveryProvider, 'LOCAL'>;
  title: string;
  sourceUrl: string;
  licenceCandidate?: string | null;
  attributionText?: string | null;
  classHint?: string | null;
  subjectHint?: string | null;
}

export interface AddDiscoveredContentToLibraryInput {
  title?: string;
  visibility: 'PUBLIC' | 'REGISTERED' | 'CLASS_ONLY';
  accessRequirement: 'PUBLIC' | 'REGISTERED' | 'SUBSCRIBER';
  licenceCandidate: string;
  licenceUrl?: string | null;
  attributionText: string;
  rightsEvidenceUrl?: string | null;
  permissionConfirmed: boolean;
}

interface DiscoveryRunRow extends QueryResultRow {
  id: UUID;
  provider: DiscoveryProvider;
}

interface CandidateRow extends QueryResultRow {
  id: UUID;
  run_id: UUID;
  provider: DiscoveryProvider;
  source_code: string;
  source_item_id: string;
  resource_id: UUID | null;
  title: string;
  description: string | null;
  source_url: string | null;
  primary_category: string | null;
  resource_type: string | null;
  licence_candidate: string | null;
  licence_raw: string | null;
  attribution_text: string | null;
  author_text: string | null;
  publisher_text: string | null;
  grade_levels: string[];
  subjects: string[];
  languages: string[];
  can_adapt: boolean;
  can_use_commercially: boolean;
  licence_verified: boolean;
  intake_id: UUID | null;
  media_kind: DiscoveryMediaKind | null;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  embed_url: string | null;
  reference_only: boolean;
}

interface ConnectorRow extends QueryResultRow {
  code: string;
  provider: DiscoveryProvider;
  source_id: UUID | null;
  source_code: string | null;
  label: string;
  connector_mode: 'LOCAL_CATALOGUE' | 'LIVE_API' | 'REFERENCE_SEARCH';
  homepage_url: string;
  search_url_template: string | null;
  enabled: boolean;
  supports_search: boolean;
  supports_media_kinds: DiscoveryMediaKind[];
  requires_api_key: boolean;
  requires_item_review: boolean;
  commercial_policy: 'ALLOWED' | 'ITEM_LEVEL_REVIEW' | 'NON_COMMERCIAL_ONLY' | 'LINK_ONLY';
  licence_policy: string;
  status_note: string | null;
  default_license: string | null;
}

interface DikshaSearchResponse {
  responseCode?: string;
  result?: {
    count?: number;
    content?: unknown[];
  };
}

interface NormalizedCandidate {
  provider: DiscoveryProvider;
  sourceCode: string;
  sourceItemId: string;
  resourceId?: UUID | null;
  title: string;
  description?: string | null;
  sourceUrl?: string | null;
  primaryCategory?: string | null;
  resourceType?: string | null;
  licenceCandidate?: string | null;
  licenceRaw?: string | null;
  attributionText?: string | null;
  authorText?: string | null;
  publisherText?: string | null;
  gradeLevels: string[];
  subjects: string[];
  languages: string[];
  canAdapt: boolean;
  canUseCommercially: boolean;
  licenceVerified: boolean;
  mediaKind: DiscoveryMediaKind;
  durationSeconds?: number | null;
  thumbnailUrl?: string | null;
  embedUrl?: string | null;
  referenceOnly?: boolean;
  metadata: Record<string, unknown>;
}

const PROVIDERS: DiscoveryProvider[] = [
  'LOCAL','DIKSHA','YOUTUBE','NROER','CBSE','NCERT_EPATHSHALA','NIOS','SWAYAM','PHET','OER_COMMONS',
];

function appError(message: string, statusCode = 400): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

async function assertDiscoverySchema(): Promise<void> {
  const { rows: [row] } = await query<{ ready: boolean } & QueryResultRow>(
    `SELECT to_regclass('public.learning_source_discovery_runs') IS NOT NULL
         AND to_regclass('public.learning_source_discovery_candidates') IS NOT NULL
         AND to_regclass('public.learning_source_connectors') IS NOT NULL AS ready`,
  );
  if (!row?.ready) throw appError('Source Discovery requires database migrations 046 and 047', 503);
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return String(value);
  return null;
}

function asStrings(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(asString).filter((item): item is string => Boolean(item));
  const single = asString(value);
  return single ? [single] : [];
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    const strings = asStrings(value);
    if (strings.length) return strings.join(', ');
  }
  return null;
}

function asPositiveNumber(value: unknown): number | null {
  const numberValue = typeof value === 'number' ? value : Number(asString(value));
  return Number.isFinite(numberValue) && numberValue >= 0 ? Math.round(numberValue) : null;
}

function mapLicence(rawValue: unknown): string {
  const raw = String(asString(rawValue) || '').toUpperCase().replace(/[–—]/g, '-').replace(/_/g, ' ');
  if (!raw) return 'OTHER';
  // YouTube's licence is permission to use its official player, not to copy or
  // re-host the underlying video. Preserve it as a separately reviewed grant.
  if (raw.includes('YOUTUBE')) return 'PERMISSION_GRANTED';
  if (raw.includes('PUBLIC DOMAIN') || raw === 'CC0' || raw.includes('CC ZERO')) return 'PUBLIC_DOMAIN';
  if (raw.includes('CC BY-NC-ND') || raw.includes('CC BY NC ND')) return 'CC_BY_NC_ND';
  if (raw.includes('CC BY-NC-SA') || raw.includes('CC BY NC SA')) return 'CC_BY_NC_SA';
  if (raw.includes('CC BY-ND') || raw.includes('CC BY ND')) return 'CC_BY_ND';
  if (raw.includes('CC BY-NC') || raw.includes('CC BY NC')) return 'CC_BY_NC';
  if (raw.includes('CC BY-SA') || raw.includes('CC BY SA')) return 'CC_BY_SA';
  if (raw.includes('CC BY')) return 'CC_BY';
  return 'OTHER';
}

function candidateRights(licence: string): { canAdapt: boolean; commercial: boolean } {
  return {
    canAdapt: ['CC_BY','CC_BY_SA','CC_BY_NC','CC_BY_NC_SA','PUBLIC_DOMAIN','VIDYASETU_ORIGINAL'].includes(licence),
    commercial: ['CC_BY','CC_BY_SA','CC_BY_ND','PUBLIC_DOMAIN','VIDYASETU_ORIGINAL'].includes(licence),
  };
}

function normalizeMediaKind(...rawValues: unknown[]): DiscoveryMediaKind {
  const raw = rawValues.flatMap(asStrings).join(' ').toUpperCase();
  if (/VIDEO|MP4|WEBM|YOUTUBE/.test(raw)) return 'VIDEO';
  if (/AUDIO|MP3|WAV|M4A/.test(raw)) return 'AUDIO';
  if (/IMAGE|PHOTO|PICTURE|PNG|JPEG|JPG|WEBP|ILLUSTRATION|POSTER/.test(raw)) return 'IMAGE';
  if (/SIMULATION|INTERACTIVE|HTML5|H5P|GAME|ACTIVITY/.test(raw)) return 'INTERACTIVE';
  if (/PDF|EPUB|E-BOOK|EBOOK|DOCUMENT|WORKSHEET|QUESTION PAPER/.test(raw)) return 'PDF';
  if (/COURSE|COLLECTION|TEXTBOOK/.test(raw)) return 'COURSE';
  if (/EXTERNAL LINK|LINK|URL/.test(raw)) return 'LINK';
  return 'ARTICLE';
}

function safeMetadata(value: Record<string, unknown>): Record<string, unknown> {
  const fields = [
    'identifier','name','description','primaryCategory','resourceType','contentType','mimeType','gradeLevel','subject','medium','language',
    'license','licence','creator','author','organisation','publisher','attributions','copyright','channel','publishedOn','framework',
    'duration','appIcon','posterImage','artifactUrl','artifactURL','downloadUrl','downloadURL','contentUrl','contentURL','streamingUrl','previewUrl','mediaType','embedUrl','embedURL','url',
  ];
  return Object.fromEntries(fields.filter((key) => value[key] !== undefined).map((key) => [key, value[key]]));
}

/** Convert an explicit YouTube video URL to its official privacy-enhanced player. */
function approvedYouTubeEmbedUrl(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== 'string' || !value.trim()) continue;
    try {
      const url = new URL(value.trim());
      if (url.protocol !== 'https:' || url.username || url.password || url.port) continue;
      const host = url.hostname.toLowerCase();
      let videoId: string | null = null;
      if (host === 'youtu.be' || host === 'www.youtu.be') {
        videoId = url.pathname.split('/').filter(Boolean)[0] || null;
      } else if (['youtube.com','www.youtube.com','m.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'].includes(host)) {
        if (url.pathname === '/watch') videoId = url.searchParams.get('v');
        else videoId = url.pathname.match(/^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})\/?$/)?.[1] || null;
      }
      if (videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId)) return `https://www.youtube-nocookie.com/embed/${videoId}`;
    } catch { /* Ignore malformed and non-YouTube metadata URLs. */ }
  }
  return null;
}

function applyCandidateFilters(input: DiscoverSourcesInput, candidates: NormalizedCandidate[]): NormalizedCandidate[] {
  const requestedMedia = new Set(input.mediaKinds || []);
  const publisher = input.publisher?.trim().toLowerCase();
  const maxDurationSeconds = input.maxDurationMinutes ? input.maxDurationMinutes * 60 : null;
  return candidates.filter((item) => {
    if (requestedMedia.size && !requestedMedia.has(item.mediaKind)) return false;
    if (publisher) {
      const evidence = `${item.publisherText || ''} ${item.authorText || ''} ${String(item.metadata.channel || '')} ${String(item.metadata.organisation || '')}`.toLowerCase();
      if (!evidence.includes(publisher)) return false;
    }
    if (maxDurationSeconds && item.durationSeconds != null && item.durationSeconds > maxDurationSeconds) return false;
    if (input.onlyCommercialSafe && !item.canUseCommercially) return false;
    return true;
  });
}

function dikshaCandidate(rawUnknown: unknown): NormalizedCandidate | null {
  if (!rawUnknown || typeof rawUnknown !== 'object' || Array.isArray(rawUnknown)) return null;
  const envelope = rawUnknown as Record<string, unknown>;
  // Search API deployments differ on whether the media metadata is flattened
  // onto the search hit or returned under contentData/metadata. Normalise both
  // shapes so an actual public artifact is not downgraded to a source-page hit.
  const nested = [envelope.contentData,envelope.metadata,envelope.data]
    .find((value): value is Record<string,unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)) || {};
  const raw = { ...nested,...envelope };
  const identifier = asString(raw.identifier);
  const title = asString(raw.name);
  if (!identifier || !title) return null;
  const licenceRaw = firstText(raw.license, raw.licence);
  const licence = mapLicence(licenceRaw);
  const rights = candidateRights(licence);
  const author = firstText(raw.author, raw.creator);
  const publisher = firstText(raw.publisher, raw.organisation, raw.channel);
  const attributions = firstText(raw.attributions, raw.copyright);
  const attribution = [author, publisher, attributions].filter(Boolean).join(' · ') || null;
  const mediaKind = normalizeMediaKind(raw.primaryCategory, raw.resourceType, raw.contentType, raw.mimeType, raw.mediaType, raw.artifactUrl, raw.artifactURL, raw.embedUrl, raw.embedURL, raw.streamingUrl, raw.previewUrl, raw.contentUrl, raw.contentURL, raw.url);
  const metadata = safeMetadata(raw);
  // Persist a canonical, policy-approved direct asset URL for the Library
  // review preview. Never expose a portal URL or a signed/query URL as media.
  metadata.artifactUrl = importableAssetUrl(metadata) || undefined;
  return {
    provider: 'DIKSHA',
    sourceCode: 'DIKSHA',
    sourceItemId: identifier,
    resourceId: null,
    title,
    description: asString(raw.description),
    sourceUrl: `https://diksha.gov.in/resources/play/content/${encodeURIComponent(identifier)}`,
    primaryCategory: asString(raw.primaryCategory),
    resourceType: firstText(raw.resourceType, raw.contentType, raw.mimeType),
    licenceCandidate: licence,
    licenceRaw,
    attributionText: attribution,
    authorText: author,
    publisherText: publisher,
    gradeLevels: asStrings(raw.gradeLevel),
    subjects: asStrings(raw.subject),
    languages: [...new Set([...asStrings(raw.language), ...asStrings(raw.medium)])],
    canAdapt: rights.canAdapt,
    canUseCommercially: rights.commercial,
    licenceVerified: false,
    mediaKind,
    durationSeconds: asPositiveNumber(raw.duration),
    thumbnailUrl: firstText(raw.appIcon, raw.posterImage),
    // Some DIKSHA items wrap a public YouTube video. Render only an explicit
    // YouTube video URL through the official player; never frame a DIKSHA page
    // or raw media/protected stream URL.
    embedUrl: mediaKind === 'VIDEO' ? approvedYouTubeEmbedUrl(
      raw.embedUrl,raw.embedURL,raw.streamingUrl,raw.previewUrl,raw.contentUrl,raw.contentURL,raw.artifactUrl,raw.artifactURL,raw.downloadUrl,raw.downloadURL,raw.url,
    ) : null,
    referenceOnly: false,
    metadata,
  };
}

async function getConnectors(): Promise<ConnectorRow[]> {
  const { rows } = await query<ConnectorRow>(
    `SELECT c.*,s.code AS source_code,s.default_license::text
     FROM learning_source_connectors c
     LEFT JOIN learning_content_sources s ON s.id=c.source_id
     ORDER BY CASE c.provider
       WHEN 'LOCAL' THEN 1 WHEN 'DIKSHA' THEN 2 WHEN 'NROER' THEN 3 WHEN 'CBSE' THEN 4
       WHEN 'NCERT_EPATHSHALA' THEN 5 WHEN 'NIOS' THEN 6 WHEN 'SWAYAM' THEN 7
       WHEN 'PHET' THEN 8 WHEN 'OER_COMMONS' THEN 9 ELSE 99 END`,
  );
  return rows;
}

async function getConnector(provider: DiscoveryProvider): Promise<ConnectorRow> {
  const { rows: [row] } = await query<ConnectorRow>(
    `SELECT c.*,s.code AS source_code,s.default_license::text
     FROM learning_source_connectors c
     LEFT JOIN learning_content_sources s ON s.id=c.source_id
     WHERE c.provider=$1::learning_discovery_provider`,
    [provider],
  );
  if (!row || !row.enabled) throw appError(`${provider} source connector is disabled`, 503);
  return row;
}

async function createRun(input: DiscoverSourcesInput, provider: DiscoveryProvider, adminId: UUID): Promise<DiscoveryRunRow> {
  const { rows: [run] } = await query<DiscoveryRunRow>(
    `INSERT INTO learning_source_discovery_runs(provider,query_text,class_number,subject,language,filters,created_by)
     VALUES($1::learning_discovery_provider,$2,$3,$4,$5,$6::jsonb,$7::uuid)
     RETURNING id,provider`,
    [
      provider,
      input.query.trim(),
      input.classNumber || null,
      input.subject?.trim() || null,
      input.language?.trim() || null,
      JSON.stringify({
        query: input.query.trim(),
        limit: Math.min(30, Math.max(1, input.limit || 12)),
        mediaKinds: input.mediaKinds || [],
        gradeCode: input.gradeCode || (input.classNumber ? `CLASS_${input.classNumber}` : null),
        boardCode: input.boardCode || null,
        conceptIds:input.conceptIds || [],academicYear:input.academicYear || null,curriculumMedium:input.curriculumMedium||null,curriculumTopicId:input.curriculumTopicId || null,subjectId:input.subjectId || null,chapterLabel:input.chapterLabel || null,topicLabel:input.topicLabel || null,
        publisher: input.publisher?.trim() || null,
        maxDurationMinutes: input.maxDurationMinutes || null,
        onlyCommercialSafe: Boolean(input.onlyCommercialSafe),
      }),
      adminId,
    ],
  );
  return run;
}

async function persistCandidates(runId: UUID, candidates: NormalizedCandidate[]): Promise<CandidateRow[]> {
  return transaction(async (client) => {
    for (const item of candidates) {
      await client.query(
        `INSERT INTO learning_source_discovery_candidates
         (run_id,provider,source_code,source_item_id,resource_id,title,description,source_url,primary_category,resource_type,
          licence_candidate,licence_raw,attribution_text,author_text,publisher_text,grade_levels,subjects,languages,
          can_adapt,can_use_commercially,licence_verified,media_kind,duration_seconds,thumbnail_url,embed_url,reference_only,metadata)
         VALUES($1::uuid,$2::learning_discovery_provider,$3,$4,$5::uuid,$6,$7,$8,$9,$10,$11::learning_license_code,$12,$13,$14,$15,
                $16::text[],$17::text[],$18::text[],$19,$20,$21,$22,$23,$24,$25,$26,$27::jsonb)
         ON CONFLICT(run_id,provider,source_item_id) DO NOTHING`,
        [
          runId,item.provider,item.sourceCode,item.sourceItemId,item.resourceId || null,item.title,item.description || null,item.sourceUrl || null,
          item.primaryCategory || null,item.resourceType || null,item.licenceCandidate || null,item.licenceRaw || null,item.attributionText || null,
          item.authorText || null,item.publisherText || null,item.gradeLevels,item.subjects,item.languages,item.canAdapt,item.canUseCommercially,
          item.licenceVerified,item.mediaKind,item.durationSeconds ?? null,item.thumbnailUrl || null,item.embedUrl || null,Boolean(item.referenceOnly),
          JSON.stringify(item.metadata),
        ],
      );
    }
    await client.query(
      `UPDATE learning_source_discovery_runs SET status='COMPLETED',result_count=$2,completed_at=NOW() WHERE id=$1`,
      [runId,candidates.length],
    );
    const { rows } = await client.query<CandidateRow>(
      `SELECT * FROM learning_source_discovery_candidates WHERE run_id=$1 ORDER BY reference_only,created_at,id`, [runId],
    );
    return rows.map((item) => ({ ...item,delivery_capability: deliveryCapability(item) }));
  });
}

function localMediaKind(resourceType: string): DiscoveryMediaKind {
  switch (resourceType) {
    case 'VIDEO': return 'VIDEO';
    case 'AUDIO': return 'AUDIO';
    case 'IMAGE': return 'IMAGE';
    case 'PDF':
    case 'WORKSHEET':
    case 'QUESTION_PAPER': return 'PDF';
    case 'INTERACTIVE':
    case 'QUIZ': return 'INTERACTIVE';
    case 'EXTERNAL_LINK': return 'LINK';
    default: return 'ARTICLE';
  }
}

async function discoverLocal(input: DiscoverSourcesInput): Promise<NormalizedCandidate[]> {
  const search = `%${input.query.trim()}%`;
  const classNumber = input.classNumber || null;
  const subject = input.subject?.trim() || null;
  const limit = Math.min(30, Math.max(1, input.limit || 12));
  const { rows } = await query<{
    id: UUID; title: string; summary: string | null; source_url: string | null; external_url: string | null;
    licence: string; attribution_text: string | null; resource_type: string; class_min: number | null; class_max: number | null;
    subject_name: string | null; source_code: string; duration_secs: number | null; thumbnail_url: string | null;
  } & QueryResultRow>(
    `SELECT lr.id,lr.title,lr.summary,lr.source_url,lr.external_url,lr.licence::text,lr.attribution_text,lr.resource_type::text,
            lr.class_min,lr.class_max,COALESCE(s.name,lr.subject_label) AS subject_name,lcs.code AS source_code,lr.duration_secs,lr.thumbnail_url
     FROM learning_resources lr
     JOIN learning_content_sources lcs ON lcs.id=lr.source_id
     LEFT JOIN subjects s ON s.id=lr.subject_id
     WHERE lr.review_status IN ('APPROVED','PUBLISHED')
       AND (lr.title ILIKE $1 OR COALESCE(lr.summary,'') ILIKE $1 OR COALESCE(lr.body_markdown,'') ILIKE $1)
       AND ($5::text IS NULL OR EXISTS (SELECT 1 FROM learning_resource_grades rg JOIN education_grade_levels g ON g.id=rg.grade_id WHERE rg.resource_id=lr.id AND g.code=$5) OR (NOT EXISTS (SELECT 1 FROM learning_resource_grades rg WHERE rg.resource_id=lr.id) AND $2::smallint IS NOT NULL AND COALESCE(lr.class_min,$2) <= $2 AND COALESCE(lr.class_max,$2) >= $2))
       AND ($3::text IS NULL OR COALESCE(s.name,lr.subject_label) ILIKE '%' || $3 || '%')
       AND ($6::text IS NULL OR EXISTS (SELECT 1 FROM learning_resource_boards rb JOIN education_boards b ON b.id=rb.board_id WHERE rb.resource_id=lr.id AND b.code IN ($6,'COMMON')))
     ORDER BY CASE WHEN lr.title ILIKE $1 THEN 0 ELSE 1 END,lr.updated_at DESC
     LIMIT $4`,
    [search,classNumber,subject,Math.min(100,limit * 4),input.gradeCode || (classNumber ? `CLASS_${classNumber}` : null),input.boardCode || null],
  );
  const mapped = rows.map((row): NormalizedCandidate => {
    const rights = candidateRights(row.licence);
    return {
      provider: 'LOCAL',sourceCode: row.source_code,sourceItemId: String(row.id),resourceId: row.id,title: row.title,
      description: row.summary,sourceUrl: row.source_url || row.external_url,primaryCategory: 'VidyaSetu governed resource',
      resourceType: row.resource_type,licenceCandidate: row.licence,licenceRaw: row.licence,attributionText: row.attribution_text,
      authorText: null,publisherText: 'VidyaSetu governed catalogue',
      gradeLevels: row.class_min && row.class_max ? (row.class_min === row.class_max ? [`Class ${row.class_min}`] : [`Class ${row.class_min}-${row.class_max}`]) : [],
      subjects: row.subject_name ? [row.subject_name] : [],languages: [],canAdapt: rights.canAdapt,canUseCommercially: rights.commercial,
      licenceVerified: true,mediaKind: localMediaKind(row.resource_type),durationSeconds: row.duration_secs,thumbnailUrl: row.thumbnail_url,
      embedUrl: null,referenceOnly: false,metadata: { resourceId: row.id,reviewStatus: 'APPROVED_OR_PUBLISHED' },
    };
  });
  return applyCandidateFilters(input,mapped).slice(0,limit);
}

function dikshaEnabled(): boolean {
  return String(process.env.DIKSHA_DISCOVERY_ENABLED || 'true').trim().toLowerCase() !== 'false';
}

function dikshaEndpoint(): string {
  return process.env.DIKSHA_DISCOVERY_ENDPOINT || 'https://diksha.gov.in/api/content/v1/search';
}

function dikshaReadEndpoint(): string {
  return process.env.DIKSHA_CONTENT_READ_ENDPOINT || dikshaEndpoint().replace(/\/search\/?$/,'/read');
}

function dikshaReadContent(response: unknown): Record<string,unknown> | null {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return null;
  const result=(response as Record<string,unknown>).result;
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
  const resultRow=result as Record<string,unknown>;
  const content=resultRow.content || resultRow.contentData || resultRow;
  return content && typeof content === 'object' && !Array.isArray(content) ? content as Record<string,unknown> : null;
}

async function hydrateDikshaMediaMetadata(candidate: NormalizedCandidate): Promise<NormalizedCandidate> {
  if (importableAssetUrl(candidate.metadata)) return candidate;
  try {
    // Search hits can omit both media type and delivery metadata even when the
    // public content-read record has them. Hydrate item results without a
    // direct asset; if DIKSHA does not return one, retain the safe source-only
    // classification and do not pretend its portal page is playable.
    const response=await axios.get(dikshaReadEndpoint().replace(/\/$/,'')+'/'+encodeURIComponent(candidate.sourceItemId),{
      headers:{Accept:'application/json'},timeout:3500,
    });
    const detail=dikshaReadContent(response.data);
    if (!detail) return candidate;
    const metadata={...candidate.metadata,...safeMetadata(detail)};
    const assetUrl=importableAssetUrl(metadata);
    if (assetUrl) metadata.artifactUrl=assetUrl;
    const merged={...candidate.metadata,...detail};
    const hydrated=dikshaCandidate({...merged,...(merged.contentData && typeof merged.contentData==='object' ? {contentData:{...(candidate.metadata||{}),...(merged.contentData as Record<string,unknown>)}} : {})});
    return hydrated ? {...hydrated,metadata:{...hydrated.metadata,...metadata}} : candidate;
  } catch {
    // Public content-read is best-effort. Search still returns the original
    // result, whose playback capability remains conservative.
    return candidate;
  }
}

async function discoverDiksha(input: DiscoverSourcesInput): Promise<NormalizedCandidate[]> {
  if (!dikshaEnabled()) throw appError('DIKSHA discovery is disabled by server configuration', 503);
  const limit = Math.min(30, Math.max(1, input.limit || 12));
  const filters: Record<string, unknown> = { objectType: ['Content'], status: ['Live'] };
  if (input.classNumber) filters.gradeLevel = [`Class ${input.classNumber}`, `Grade ${input.classNumber}`];
  if (input.gradeCode && !input.classNumber) filters.gradeLevel = [{PRE_NURSERY:'Pre-Nursery',NURSERY:'Nursery',LKG:'LKG',UKG:'UKG'}[input.gradeCode] || input.gradeCode];
  if (input.boardCode && input.boardCode !== 'COMMON') filters.board = [input.boardCode];
  if (input.subject?.trim()) filters.subject = [input.subject.trim()];
  if (input.language?.trim()) filters.language = [input.language.trim()];
  const fields = [
    'identifier','name','description','primaryCategory','resourceType','contentType','mimeType','gradeLevel','subject','medium','language',
    'license','licence','creator','author','organisation','publisher','attributions','copyright','channel','publishedOn','framework',
    'duration','appIcon','posterImage','artifactUrl','downloadUrl','contentUrl','streamingUrl','previewUrl','mediaType',
  ];
  const response = await axios.post<DikshaSearchResponse>(dikshaEndpoint(), {
    request: { query: input.query.trim(), filters, fields, limit: Math.min(100,limit * 4), offset: 0 },
  }, { headers: { 'Content-Type': 'application/json' }, timeout: 20000 });
  const content = Array.isArray(response.data?.result?.content) ? response.data.result!.content! : [];
  const candidates = applyCandidateFilters(input,content.map(dikshaCandidate).filter((item): item is NormalizedCandidate => Boolean(item))).slice(0,limit);
  const hydrated:NormalizedCandidate[]=[];
  for(let offset=0;offset<candidates.length;offset+=8){
    hydrated.push(...await Promise.all(candidates.slice(offset,offset+8).map(hydrateDikshaMediaMetadata)));
  }
  return hydrated;
}

function youtubeEnabled(): boolean {
  return Boolean(process.env.YOUTUBE_DATA_API_KEY?.trim());
}

async function discoverYouTube(input: DiscoverSourcesInput): Promise<NormalizedCandidate[]> {
  const apiKey = process.env.YOUTUBE_DATA_API_KEY?.trim();
  if (!apiKey) throw appError('YouTube discovery needs YOUTUBE_DATA_API_KEY configured on the server', 503);
  if (input.mediaKinds?.length && !input.mediaKinds.includes('VIDEO')) return [];

  const queryText = [input.query.trim(), input.classNumber ? `Class ${input.classNumber}` : '', input.subject?.trim() || '', input.boardCode && input.boardCode !== 'COMMON' ? input.boardCode : '']
    .filter(Boolean).join(' ');
  const limit = Math.min(25, Math.max(1, input.limit || 12));
  const search = await axios.get('https://www.googleapis.com/youtube/v3/search', {
    params: {
      key: apiKey, part: 'snippet', type: 'video', q: queryText, maxResults: limit,
      videoEmbeddable: 'true', videoSyndicated: 'true', safeSearch: 'strict',
      ...(input.language ? { relevanceLanguage: input.language.slice(0, 2) } : {}),
    }, timeout: 12000,
  });
  const ids = (Array.isArray(search.data?.items) ? search.data.items : [])
    .map((item: any) => typeof item?.id?.videoId === 'string' ? item.id.videoId : null)
    .filter((id: string | null): id is string => Boolean(id && /^[A-Za-z0-9_-]{11}$/.test(id)));
  if (!ids.length) return [];

  // Recheck eligibility with the video resource; search filters alone do not
  // guarantee an item remains embeddable when it is selected for review.
  const details = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
    params: { key: apiKey, part: 'snippet,status,contentDetails', id: ids.join(',') }, timeout: 12000,
  });
  const detailById = new Map<string, any>((Array.isArray(details.data?.items) ? details.data.items : [])
    .filter((item: any) => item?.id && item?.status?.embeddable === true)
    .map((item: any) => [String(item.id), item]));
  const secondsFromIsoDuration = (duration: unknown): number | null => {
    if (typeof duration !== 'string') return null;
    const match = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
    if (!match) return null;
    const seconds = Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
    return seconds > 0 ? seconds : null;
  };
  const searchItems = new Map<string, any>((search.data.items || []).map((item: any) => [String(item?.id?.videoId || ''), item]));
  return applyCandidateFilters(input,ids.flatMap((id: string): NormalizedCandidate[] => {
    const item = detailById.get(id);
    if (!item) return [];
    const snippet = item.snippet || searchItems.get(id)?.snippet || {};
    const title = asString(snippet.title);
    if (!title) return [];
    const license = snippet.license === 'creativeCommon' ? 'CC BY' : 'YouTube Standard License (official player only)';
    const embedUrl = `https://www.youtube-nocookie.com/embed/${id}`;
    return [{
      provider: 'YOUTUBE', sourceCode: 'YOUTUBE', sourceItemId: id, title,
      description: asString(snippet.description), sourceUrl: `https://www.youtube.com/watch?v=${id}`,
      primaryCategory: 'YouTube video', resourceType: 'VIDEO',
      licenceCandidate: snippet.license === 'creativeCommon' ? 'CC_BY' : 'PERMISSION_GRANTED',
      licenceRaw: license, attributionText: asString(snippet.channelTitle) || 'YouTube creator',
      authorText: asString(snippet.channelTitle), publisherText: 'YouTube',
      gradeLevels: input.classNumber ? [`Class ${input.classNumber}`] : [],
      subjects: input.subject?.trim() ? [input.subject.trim()] : [],
      languages: input.language ? [input.language] : [], canAdapt: snippet.license === 'creativeCommon',
      canUseCommercially: snippet.license === 'creativeCommon', licenceVerified: false,
      mediaKind: 'VIDEO', durationSeconds: secondsFromIsoDuration(item.contentDetails?.duration),
      thumbnailUrl: asString(snippet.thumbnails?.high?.url) || asString(snippet.thumbnails?.medium?.url),
      embedUrl, referenceOnly: false,
      metadata: { youtubeVideoId: id, youtubeLicense: snippet.license || 'standard', embedOnly: true, channelId: snippet.channelId || null },
    }];
  }));
}

function templateUrl(template: string | null, connector: ConnectorRow, input: DiscoverSourcesInput): string {
  const raw = template || connector.homepage_url;
  return raw
    .replaceAll('{query}',encodeURIComponent(input.query.trim()))
    .replaceAll('{class}',encodeURIComponent(input.classNumber ? String(input.classNumber) : ''))
    .replaceAll('{subject}',encodeURIComponent(input.subject?.trim() || ''))
    .replaceAll('{language}',encodeURIComponent(input.language?.trim() || ''));
}

function referenceCandidate(connector: ConnectorRow, input: DiscoverSourcesInput): NormalizedCandidate {
  const requestedMedia = input.mediaKinds?.[0] || 'LINK';
  const mediaKind = connector.supports_media_kinds.includes(requestedMedia) ? requestedMedia : 'LINK';
  const queryKey = input.query.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,100) || 'search';
  const classLabel = input.classNumber ? `Class ${input.classNumber}` : 'all classes';
  const subjectLabel = input.subject?.trim() || 'all subjects';
  const mediaLabel = mediaKind === 'LINK' ? 'resources' : mediaKind.toLowerCase();
  return {
    provider: connector.provider,
    sourceCode: connector.source_code || connector.code,
    sourceItemId: `reference-${connector.code.toLowerCase()}-${queryKey}`.slice(0,220),
    title: `${connector.label}: ${input.query.trim()}`,
    description: `Open the official ${connector.label} source to select a specific ${mediaLabel} item for ${classLabel} · ${subjectLabel}. VidyaSetu does not pretend an undocumented structured API exists for this connector.`,
    sourceUrl: templateUrl(connector.search_url_template,connector,input),
    primaryCategory: 'Official source search / reference',
    resourceType: mediaKind === 'LINK' ? 'EXTERNAL_LINK' : mediaKind,
    licenceCandidate: 'EXTERNAL_LINK_ONLY',
    licenceRaw: connector.default_license || 'Item-level review required',
    attributionText: connector.label,
    authorText: null,
    publisherText: connector.label,
    gradeLevels: input.classNumber ? [`Class ${input.classNumber}`] : [],
    subjects: input.subject?.trim() ? [input.subject.trim()] : [],
    languages: input.language?.trim() ? [input.language.trim()] : [],
    canAdapt: false,
    canUseCommercially: connector.commercial_policy === 'ALLOWED',
    licenceVerified: true,
    mediaKind,
    durationSeconds: null,
    thumbnailUrl: null,
    embedUrl: null,
    referenceOnly: true,
    metadata: {
      connectorMode: connector.connector_mode,
      commercialPolicy: connector.commercial_policy,
      licencePolicy: connector.licence_policy,
      referenceOnly: true,
    },
  };
}

async function discoverReference(input: DiscoverSourcesInput, provider: DiscoveryProvider): Promise<NormalizedCandidate[]> {
  const connector = await getConnector(provider);
  if (input.onlyCommercialSafe && connector.commercial_policy !== 'ALLOWED') return [];
  if (input.mediaKinds?.length && !input.mediaKinds.some((item) => connector.supports_media_kinds.includes(item))) return [];
  return [referenceCandidate(connector,input)];
}

async function discoverByProvider(input: DiscoverSourcesInput, provider: DiscoveryProvider): Promise<NormalizedCandidate[]> {
  if (provider === 'LOCAL') return discoverLocal(input);
  if (provider === 'DIKSHA') return discoverDiksha(input);
  if (provider === 'YOUTUBE') return discoverYouTube(input);
  return discoverReference(input,provider);
}

function requestedProviders(input: DiscoverSourcesInput): DiscoveryProvider[] {
  const raw: DiscoveryProvider[] = input.providers?.length
    ? input.providers
    : input.provider
      ? [input.provider]
      : ['LOCAL','DIKSHA'];
  const unique = [...new Set(raw)].filter((item): item is DiscoveryProvider => PROVIDERS.includes(item));
  if (!unique.length) throw appError('Select at least one source provider');
  if (unique.length > PROVIDERS.length) throw appError('Too many source providers selected');
  return unique;
}

export async function discoverSources(input: DiscoverSourcesInput, adminId: UUID) {
  await assertDiscoverySchema();
  if (!input.query?.trim() || input.query.trim().length < 2) throw appError('Source discovery query must contain at least 2 characters');
  const providers = requestedProviders(input);
  const allCandidates: CandidateRow[] = [];
  const runs: Array<{ runId: UUID; provider: DiscoveryProvider; count: number; status: 'COMPLETED' | 'FAILED'; error?: string }> = [];

  for (const provider of providers) {
    const connector = await getConnector(provider);
    if (!connector.supports_search) continue;
    const run = await createRun(input,provider,adminId);
    try {
      const candidates = await discoverByProvider(input,provider);
      const persisted = await persistCandidates(run.id,candidates);
      allCandidates.push(...persisted);
      runs.push({ runId: run.id,provider,count: persisted.length,status: 'COMPLETED' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      await query(`UPDATE learning_source_discovery_runs SET status='FAILED',error_message=$2,completed_at=NOW() WHERE id=$1`, [run.id,message.slice(0,3000)]);
      runs.push({ runId: run.id,provider,count: 0,status: 'FAILED',error: message });
    }
  }

  const first = runs[0];
  return {
    runId: first?.runId || null,
    runIds: runs.map((item) => item.runId),
    provider: first?.provider || providers[0],
    providers,
    count: allCandidates.length,
    candidates: allCandidates,
    runs,
    partial: runs.some((item) => item.status === 'FAILED'),
  };
}

export async function listDiscoveryRuns() {
  await assertDiscoverySchema();
  const { rows } = await query(
    `SELECT ldr.id,ldr.provider,ldr.query_text,ldr.class_number,ldr.subject,ldr.language,ldr.filters,ldr.status,ldr.result_count,
            ldr.error_message,ldr.created_at,ldr.completed_at,u.name AS created_by_name
     FROM learning_source_discovery_runs ldr
     LEFT JOIN users u ON u.id=ldr.created_by
     ORDER BY ldr.created_at DESC LIMIT 100`,
  );
  return rows;
}

export async function getDiscoveryRun(runId: UUID) {
  await assertDiscoverySchema();
  const { rows: [run] } = await query(`SELECT * FROM learning_source_discovery_runs WHERE id=$1`, [runId]);
  if (!run) throw appError('Source discovery run not found',404);
  const { rows: candidates } = await query(`SELECT * FROM learning_source_discovery_candidates WHERE run_id=$1 ORDER BY reference_only,created_at,id`, [runId]);
  return { ...run,candidates: candidates.map(item => ({ ...item,delivery_capability: deliveryCapability(item) })) };
}

export async function stageDiscoveryCandidate(candidateId: UUID, adminId: UUID) {
  await assertDiscoverySchema();
  const { rows: [candidate] } = await query<CandidateRow>(`SELECT * FROM learning_source_discovery_candidates WHERE id=$1`, [candidateId]);
  if (!candidate) throw appError('Source discovery candidate not found',404);
  const { rows: [run] } = await query(`SELECT filters,class_number FROM learning_source_discovery_runs WHERE id=$1::uuid`,[candidate.run_id]);
  const filters = (run?.filters || {}) as Record<string,unknown>;
  const curriculumTopicId = typeof filters.curriculumTopicId === 'string' ? filters.curriculumTopicId : null;
  if (curriculumTopicId) {
    await transaction(async (client) => {
      await requirePublishedSyllabusTopic(client,curriculumTopicId,{
        boardCodes:[String(filters.boardCode || '')],
        gradeCodes:[String(filters.gradeCode || (run?.class_number ? `CLASS_${run.class_number}` : ''))],
        subjectId:typeof filters.subjectId==='string'?filters.subjectId:null,
        academicYear:typeof filters.academicYear==='string'?filters.academicYear:null,
        medium:filters.curriculumMedium==='en'||filters.curriculumMedium==='hi'?filters.curriculumMedium:null,
        conceptId:Array.isArray(filters.conceptIds)&&filters.conceptIds.length===1?String(filters.conceptIds[0]):null,
      });
    });
  }
  if (candidate.reference_only) {
    throw appError('This is a source-search reference, not a specific Learning item.');
  }
  if (candidate.resource_id) {
    const { rows: [updated] } = await query(
      `UPDATE learning_source_discovery_candidates SET staged_by=$2,staged_at=COALESCE(staged_at,NOW()) WHERE id=$1
       RETURNING id,resource_id,staged_at`, [candidateId,adminId],
    );
    return { kind: 'GOVERNED_RESOURCE' as const,resourceId: candidate.resource_id,candidate: updated };
  }
  // Staging here only opens the established source governance intake. It does
  // not create Library content. The Content Factory UI offers the Library
  // handoff only for EMBED/IMPORT results, and addDiscoveredContentToLibrary
  // independently enforces that same playback gate before materialising.
  if (candidate.intake_id) {
    if (curriculumTopicId) {
      const { rows: [linked] } = await query(
        `UPDATE learning_source_intake SET curriculum_topic_id=$2::uuid
         WHERE id=$1::uuid AND (curriculum_topic_id IS NULL OR curriculum_topic_id=$2::uuid)
         RETURNING id`, [candidate.intake_id,curriculumTopicId],
      );
      if (!linked) throw appError('This source is already linked to a different syllabus topic. Stage a separate source item for the selected topic.',409);
    }
    return { kind: 'OER_INTAKE' as const,intakeId: candidate.intake_id,alreadyStaged: true };
  }
  if (!candidate.source_url) throw appError('External discovery candidate has no usable source URL');
  const selectedGrade = run?.filters?.gradeCode || (run?.class_number ? `CLASS_${run.class_number}` : null);
  const intake = await practiceService.createIntake({
    sourceCode: candidate.source_code,
    sourceItemId: candidate.source_item_id,
    title: candidate.title,
    sourceUrl: candidate.source_url,
    licenceCandidate: candidate.licence_candidate || 'OTHER',
    attributionText: candidate.attribution_text,
    classHint: selectedGrade || candidate.grade_levels.join(', ') || null,
    subjectHint: candidate.subjects.join(', ') || null,
    boardHint: run?.filters?.boardCode || null,
  },adminId);
  if (curriculumTopicId) await query(`UPDATE learning_source_intake SET curriculum_topic_id=$2::uuid WHERE id=$1::uuid`,[intake.id,curriculumTopicId]);
  await query(
    `UPDATE learning_source_discovery_candidates SET intake_id=$2,staged_by=$3,staged_at=NOW() WHERE id=$1`,
    [candidateId,intake.id,adminId],
  );
  return {
    kind: 'OER_INTAKE' as const,
    intakeId: intake.id,
    status: intake.status,
    message: 'Candidate staged for existing OER licence/attribution review. It is not grounding-ready yet.',
  };
}

/**
 * Complete the selected-source handoff from the Content Library review pane.
 * Search metadata supplies the learning context; the admin supplies the
 * publication audience and confirms the item-level rights/player check.
 */
export async function addDiscoveredContentToLibrary(candidateId: UUID, input: AddDiscoveredContentToLibraryInput, adminId: UUID) {
  await assertDiscoverySchema();
  if (input.visibility === 'PUBLIC' && input.accessRequirement !== 'PUBLIC') throw appError('Public learning must use public access');
  if (input.visibility !== 'PUBLIC' && input.accessRequirement === 'PUBLIC') throw appError('Private learning must require a learner account');
  if (!input.permissionConfirmed) throw appError('Confirm the item-level rights and in-platform playback review first');
  const { rows: [candidate] } = await query<CandidateRow & { metadata: Record<string,unknown> }>(`SELECT * FROM learning_source_discovery_candidates WHERE id=$1::uuid`,[candidateId]);
  if (!candidate) throw appError('Source discovery candidate not found',404);
  const capability = deliveryCapability(candidate);
  if (!['EMBED','IMPORT'].includes(capability.code)) throw appError('This result has no supported in-platform player or importable media file');
  if (!candidate.source_url) throw appError('The selected item has no original source record');
  const { rows: [run] } = await query(`SELECT class_number,filters FROM learning_source_discovery_runs WHERE id=$1::uuid`,[candidate.run_id]);
  const filters = (run?.filters || {}) as Record<string,unknown>;
  const gradeCode = typeof filters.gradeCode === 'string' ? filters.gradeCode : run?.class_number ? `CLASS_${run.class_number}` : '';
  if (!gradeCode) throw appError('Select a class before adding discovered content to the Library');
  const boardCode = typeof filters.boardCode === 'string' ? filters.boardCode : 'COMMON';
  const gradeCodes = [gradeCode];
  const boardCodes = [boardCode];
  let selectedSubjectId = typeof filters.subjectId === 'string' ? filters.subjectId : null;
  const selectedSubjectLabel = typeof filters.subject === 'string' ? filters.subject : candidate.subjects[0] || null;
  if (!selectedSubjectId && selectedSubjectLabel) {
    const { rows: [matchedSubject] } = await query<{ id: UUID }>(
      `SELECT id FROM subjects WHERE lower(name)=lower($1) OR lower(code)=lower($1)
       ORDER BY CASE WHEN lower(name)=lower($1) THEN 0 ELSE 1 END LIMIT 1`,
      [selectedSubjectLabel.trim()],
    );
    selectedSubjectId = matchedSubject?.id || null;
  }
  const mediaKind = candidate.media_kind && ['VIDEO','AUDIO','IMAGE','PDF','INTERACTIVE'].includes(candidate.media_kind)
    ? candidate.media_kind as pipeline.PipelineMediaKind : null;
  if (!mediaKind) throw appError('This result format is not playable in VidyaSetu');
  const mode: pipeline.PipelineDeliveryMode = capability.code === 'EMBED' ? 'OFFICIAL_EMBED' : 'LICENSED_REHOST';
  const evidenceUrl = input.rightsEvidenceUrl || candidate.source_url;
  const attributionText = input.attributionText.trim() || candidate.attribution_text || '';
  if (!attributionText) throw appError('Add the creator or publisher attribution shown by the source');
  const payload: pipeline.StagePipelineInput = {
    intakeId: candidate.intake_id || undefined,
    sourceCode: candidate.source_code,
    title: input.title?.trim() || candidate.title,
    sourceUrl: candidate.source_url,
    sourceItemId: candidate.source_item_id,
    mediaKind,
    deliveryMode: mode,
    embedUrl: mode === 'OFFICIAL_EMBED' ? candidate.embed_url : null,
    licenceCandidate: input.licenceCandidate as pipeline.PipelineLicence,
    licenceUrl: input.licenceUrl || null,
    attributionText,
    rightsEvidenceUrl: evidenceUrl,
    category: 'ACADEMIC',
    gradeCodes,
    boardCodes,
    subjectId: selectedSubjectId,
    subjectLabel: selectedSubjectLabel,
    chapterLabel: typeof filters.chapterLabel === 'string' ? filters.chapterLabel : null,
    topicLabel: typeof filters.topicLabel === 'string' ? filters.topicLabel : typeof filters.query === 'string' ? filters.query : null,
    language: candidate.languages[0] || 'en',
    visibility: input.visibility,
    accessRequirement: input.accessRequirement,
    summary: candidate.description,
    thumbnailUrl: candidate.thumbnail_url,
    durationSecs: candidate.duration_seconds,
    conceptIds: Array.isArray(filters.conceptIds) ? filters.conceptIds.map(String) : [],
    curriculumTopicId: typeof filters.curriculumTopicId === 'string' ? filters.curriculumTopicId : null,
    curriculumAcademicYear: typeof filters.academicYear === 'string' ? filters.academicYear : null,
    curriculumMedium: filters.curriculumMedium === 'en' || filters.curriculumMedium === 'hi' ? filters.curriculumMedium : null,
  };
  const staged = mode === 'LICENSED_REHOST'
    ? await acquireContent({ ...payload,assetUrl: importableAssetUrl(candidate.metadata) || '',permissionConfirmed: true },adminId)
    : await pipeline.stageContent(payload,adminId);
  const intakeId = staged.intakeId;
  if (!intakeId) throw appError('The selected source could not be staged for Library review',409);
  await pipeline.verifyRights(intakeId,{
    licenceCandidate: input.licenceCandidate as pipeline.PipelineLicence,
    attributionText,
    licenceUrl: input.licenceUrl || null,
    rightsEvidenceUrl: evidenceUrl,
    reviewerNote: 'Reviewed from Content Library: item-level rights and in-platform playback confirmed.',
  },adminId);
  await pipeline.approveIntake(intakeId,adminId,'Reviewed from Content Library');
  const materialised = await pipeline.materialiseIntake(intakeId,adminId);
  await query(`UPDATE learning_source_discovery_candidates SET staged_by=$2::uuid,staged_at=COALESCE(staged_at,NOW()) WHERE id=$1::uuid`,[candidateId,adminId]);
  return { ...materialised,intakeId,deliveryMode:mode };
}

function assertOfficialSourceUrl(connector: ConnectorRow, rawUrl: string): string {
  let selected: URL;
  let homepage: URL;
  try {
    selected = new URL(rawUrl);
    homepage = new URL(connector.homepage_url);
  } catch {
    throw appError('Selected source URL is invalid');
  }
  if (selected.protocol !== 'https:') throw appError('Selected source URL must use HTTPS');
  const selectedHost = selected.hostname.toLowerCase();
  const officialHost = homepage.hostname.toLowerCase();
  const sameFamily = selectedHost === officialHost || selectedHost.endsWith(`.${officialHost}`) || officialHost.endsWith(`.${selectedHost}`);
  if (!sameFamily) throw appError(`Selected URL must belong to the official ${connector.label} domain`);
  return selected.toString();
}

export async function stageExternalSourceItem(input: StageExternalItemInput, adminId: UUID) {
  await assertDiscoverySchema();
  const connector = await getConnector(input.provider);
  if (!connector.source_code) throw appError(`${connector.label} has no governed Learning source registry record`,503);
  const sourceUrl = assertOfficialSourceUrl(connector,input.sourceUrl);
  const defaultLicence = connector.commercial_policy === 'LINK_ONLY' ? 'EXTERNAL_LINK_ONLY' : 'OTHER';
  const sourceItemId = `selected-${input.provider.toLowerCase()}-${Buffer.from(sourceUrl).toString('hex').slice(0,120)}`.slice(0,220);
  const intake = await practiceService.createIntake({
    sourceCode: connector.source_code,
    sourceItemId,
    title: input.title.trim(),
    sourceUrl,
    licenceCandidate: input.licenceCandidate || defaultLicence,
    attributionText: input.attributionText?.trim() || null,
    classHint: input.classHint?.trim() || null,
    subjectHint: input.subjectHint?.trim() || null,
    boardHint: null,
  },adminId);
  return {
    kind: 'OER_INTAKE' as const,
    intakeId: intake.id,
    status: intake.status,
    provider: input.provider,
    sourceCode: connector.source_code,
    message: 'Selected official-source item staged to OER Intake. Licence/attribution review remains mandatory before grounding or adaptation.',
  };
}

export async function sourceDiscoveryCapabilities() {
  await assertDiscoverySchema();
  const connectors = await getConnectors();
  return {
    providers: connectors.map((item) => ({
      code: item.provider,
      label: item.label,
      enabled: item.enabled && (item.provider !== 'DIKSHA' || dikshaEnabled()) && (item.provider !== 'YOUTUBE' || youtubeEnabled()),
      requiresReview: item.requires_item_review,
      connectorMode: item.connector_mode,
      homepageUrl: item.homepage_url,
      supportsMediaKinds: item.supports_media_kinds,
      requiresApiKey: item.requires_api_key,
      commercialPolicy: item.commercial_policy,
      licencePolicy: item.licence_policy,
      statusNote: item.provider === 'DIKSHA' && !dikshaEnabled() ? 'Disabled by server configuration' : item.provider === 'YOUTUBE' && !youtubeEnabled() ? 'Set YOUTUBE_DATA_API_KEY on the backend to enable verified in-platform video search' : item.status_note,
    })),
    mediaKinds: [
      { code: 'ARTICLE' as const,label: 'Learn / Article' },
      { code: 'VIDEO' as const,label: 'Watch / Video' },
      { code: 'AUDIO' as const,label: 'Listen / Audio' },
      { code: 'IMAGE' as const,label: 'See / Image' },
      { code: 'INTERACTIVE' as const,label: 'Explore / Interactive' },
      { code: 'PDF' as const,label: 'PDF / Worksheet' },
      { code: 'COURSE' as const,label: 'Course' },
      { code: 'LINK' as const,label: 'External Link' },
    ],
    publisherPresets: ['NCERT','CBSE','NIOS','PM eVIDYA'],
    dikshaEndpoint: dikshaEnabled() ? 'configured' as const : 'disabled' as const,
    policy: 'VidyaSetu searches live structured sources where a stable connector exists and exposes official reference-search sources otherwise. External items must pass licence/attribution review before grounding/adaptation; reference-only entries are never treated as reusable content.',
  };
}
