import type { PoolClient, QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';

export type ImportFormat = 'CSV' | 'JSON';
type RecordType = 'RESOURCE' | 'QUESTION';

interface GradeRow extends QueryResultRow {
  id: UUID;
  code: string;
  name: string;
  short_name: string;
  stage: string;
  class_number: number | null;
  sort_order: number;
}

interface CodeRow extends QueryResultRow { id: UUID; code: string; }
interface SourceRow extends QueryResultRow { id: UUID; code: string; source_kind: string; }

export interface StageImportInput {
  fileName: string;
  format: ImportFormat;
  content: string;
}

interface NormalizedRow {
  recordType: RecordType;
  importKey: string;
  gradeCodes: string[];
  boardCodes: string[];
  subjectLabel: string | null;
  topicLabel: string | null;
  sourceCode: string;
  sourceUrl: string | null;
  sourceItemId: string | null;
  licence: string;
  attributionText: string | null;
  visibility: string;
  reviewStatus: string;
  language: string;
  title: string | null;
  publicSlug: string | null;
  summary: string | null;
  bodyMarkdown: string | null;
  resourceType: string | null;
  category: string | null;
  externalUrl: string | null;
  thumbnailUrl: string | null;
  durationSecs: number | null;
  isOfflineReady: boolean;
  isFeaturedPublic: boolean;
  publicCode: string | null;
  prompt: string | null;
  questionType: string | null;
  difficulty: string | null;
  explanation: string | null;
  correctAnswer: unknown;
  marks: number;
  negativeMarks: number;
  options: Array<{ key: string; text: string }>;
}

interface ValidatedRow {
  rowNumber: number;
  recordType: RecordType;
  raw: Record<string, unknown>;
  normalized: NormalizedRow;
  errors: string[];
  warnings: string[];
}

const RESOURCE_TYPES = new Set(['ARTICLE','VIDEO','AUDIO','PDF','WORKSHEET','QUIZ','QUESTION_PAPER','INTERACTIVE','EXTERNAL_LINK']);
const CATEGORIES = new Set(['ACADEMIC','MOTIVATION','STUDY_SKILLS','WORK_ETHIC','SOCIAL_RESPONSIBILITY','LIFE_SKILLS','WELLBEING','CAREER_AWARENESS','DIGITAL_CITIZENSHIP']);
const VISIBILITIES = new Set(['PUBLIC','REGISTERED','CLASS_ONLY','SCHOOL_ONLY']);
const REVIEW_STATUSES = new Set(['DRAFT','SUBMITTED','ACADEMIC_REVIEW','APPROVED','PUBLISHED','ARCHIVED']);
const LICENSES = new Set(['VIDYASETU_ORIGINAL','CC_BY','CC_BY_SA','CC_BY_NC_SA','CC_BY_NC_ND','PUBLIC_DOMAIN','EXTERNAL_LINK_ONLY','OTHER']);
const QUESTION_TYPES = new Set(['MCQ_SINGLE','MCQ_MULTIPLE','TRUE_FALSE','SHORT_ANSWER','NUMERIC']);
const DIFFICULTIES = new Set(['FOUNDATION','EASY','MEDIUM','HARD','CHALLENGE']);
const NROER_OPEN_LICENSES = new Set(['CC_BY','CC_BY_SA','PUBLIC_DOMAIN','EXTERNAL_LINK_ONLY']);

function appError(message: string, statusCode = 400): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function text(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function upper(value: unknown): string {
  return text(value).toUpperCase();
}

function nullable(value: unknown): string | null {
  const result = text(value);
  return result ? result : null;
}

function boolValue(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  const normalized = text(value).toLowerCase();
  if (['true','1','yes','y'].includes(normalized)) return true;
  if (['false','0','no','n'].includes(normalized)) return false;
  return fallback;
}

function numberValue(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(text(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function slugify(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 160);
}

function splitCodes(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => upper(item)).filter(Boolean);
  return text(value).split(/[;|,]/).map((item) => item.trim().toUpperCase()).filter(Boolean);
}

function canonicalGradeCode(value: string): string {
  const cleaned = value.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (['PN','PRENURSERY','PRE_NURSERY'].includes(cleaned)) return 'PRE_NURSERY';
  if (cleaned === 'NURSERY') return 'NURSERY';
  if (['LKG','LOWER_KG','LOWER_KINDergarten'.toUpperCase()].includes(cleaned)) return 'LKG';
  if (['UKG','UPPER_KG','UPPER_KINDergarten'.toUpperCase()].includes(cleaned)) return 'UKG';
  const numeric = cleaned.match(/^(?:CLASS_|CLASS|C)?(\d{1,2})$/);
  if (numeric) {
    const n = Number(numeric[1]);
    if (n >= 1 && n <= 12) return `CLASS_${n}`;
  }
  return cleaned;
}

function normalizeGradeCodes(value: unknown, allGrades: string[]): string[] {
  const raw = splitCodes(value);
  if (raw.some((code) => code === 'ALL' || code === 'ALL_GRADES')) return [...allGrades];
  return Array.from(new Set(raw.map(canonicalGradeCode)));
}

function isNroerUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/\.$/, '');
    return hostname === 'nroer.gov.in' || hostname.endsWith('.nroer.gov.in');
  } catch {
    return false;
  }
}

function parseJsonMaybe(value: unknown): unknown {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch { return trimmed; }
}

function normalizeCorrectAnswer(value: unknown, questionType: string | null): unknown {
  const parsed = parseJsonMaybe(value);
  if (parsed && typeof parsed === 'object') return parsed;
  if (questionType === 'MCQ_SINGLE' || questionType === 'TRUE_FALSE') return { option: upper(parsed) };
  if (questionType === 'MCQ_MULTIPLE') {
    const options = splitCodes(parsed);
    return { options };
  }
  if (questionType === 'NUMERIC') return { value: numberValue(parsed, Number.NaN) };
  return { text: text(parsed) };
}

function normalizeOptions(value: unknown, raw: Record<string, unknown>): Array<{ key: string; text: string }> {
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        return { key: upper(obj.key || String.fromCharCode(65 + index)), text: text(obj.text) };
      }
      return { key: String.fromCharCode(65 + index), text: text(item) };
    }).filter((item) => item.text);
  }
  const parsed = parseJsonMaybe(value);
  if (Array.isArray(parsed)) return normalizeOptions(parsed, raw);
  const result: Array<{ key: string; text: string }> = [];
  for (const key of ['A','B','C','D','E','F']) {
    const optionText = text(raw[`option_${key.toLowerCase()}`] ?? raw[`option${key}`] ?? raw[key]);
    if (optionText) result.push({ key, text: optionText });
  }
  return result;
}

function normalizeKeys(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    out[key.trim().toLowerCase().replace(/[\s-]+/g, '_')] = value;
  }
  return out;
}

function parseCsv(content: string): Record<string, unknown>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    if (quoted) {
      if (ch === '"' && content[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim()));
  if (nonEmpty.length < 2) throw appError('CSV must contain a header and at least one data row');
  const headers = nonEmpty[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  if (headers.some((h) => !h)) throw appError('CSV contains an empty header');
  return nonEmpty.slice(1).map((r) => Object.fromEntries(headers.map((h, index) => [h, r[index] ?? ''])));
}

function parseInput(format: ImportFormat, content: string): Record<string, unknown>[] {
  if (Buffer.byteLength(content, 'utf8') > 5 * 1024 * 1024) throw appError('Import file exceeds 5 MB');
  if (format === 'CSV') return parseCsv(content);
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw appError('JSON file is not valid JSON'); }
  const rows = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' && Array.isArray((parsed as { rows?: unknown[] }).rows) ? (parsed as { rows: unknown[] }).rows : null);
  if (!rows?.length) throw appError('JSON must be an array of rows or an object with a non-empty rows array');
  return rows.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw appError(`JSON row ${index + 1} must be an object`);
    return row as Record<string, unknown>;
  });
}

function deriveClassRange(gradeCodes: string[], gradeMap: Map<string, GradeRow>): { classMin: number | null; classMax: number | null } {
  const nums = gradeCodes.map((code) => gradeMap.get(code)?.class_number ?? null);
  if (nums.some((n) => n == null)) return { classMin: null, classMax: null };
  const sorted = Array.from(new Set(nums as number[])).sort((a, b) => a - b);
  if (!sorted.length) return { classMin: null, classMax: null };
  const contiguous = sorted.every((n, index) => index === 0 || n === sorted[index - 1] + 1);
  return contiguous ? { classMin: sorted[0], classMax: sorted[sorted.length - 1] } : { classMin: null, classMax: null };
}

function normalizeRow(rawInput: Record<string, unknown>, rowNumber: number, allGrades: string[]): NormalizedRow {
  const raw = normalizeKeys(rawInput);
  const recordType = (upper(raw.record_type || raw.type || 'RESOURCE') === 'QUESTION' ? 'QUESTION' : 'RESOURCE') as RecordType;
  const gradeCodes = normalizeGradeCodes(raw.grade_codes || raw.grades || raw.grade || raw.class, allGrades);
  const boardCodes = splitCodes(raw.board_codes || raw.boards || raw.board || 'COMMON');
  const sourceCode = upper(raw.source_code || raw.source || 'VIDYASETU_ORIGINAL');
  const title = nullable(raw.title);
  const prompt = nullable(raw.prompt || raw.question);
  const seed = text(raw.import_key || raw.source_item_id || title || prompt || `row-${rowNumber}`);
  const importKey = text(raw.import_key) || `${sourceCode}:${slugify(seed)}:${recordType}`.slice(0, 180);
  const questionType = nullable(raw.question_type) ? upper(raw.question_type) : null;
  return {
    recordType,
    importKey,
    gradeCodes,
    boardCodes: boardCodes.length ? Array.from(new Set(boardCodes)) : ['COMMON'],
    subjectLabel: nullable(raw.subject || raw.subject_label),
    topicLabel: nullable(raw.topic || raw.topic_label),
    sourceCode,
    sourceUrl: nullable(raw.source_url),
    sourceItemId: nullable(raw.source_item_id),
    licence: upper(raw.licence || raw.license || (sourceCode === 'VIDYASETU_ORIGINAL' ? 'VIDYASETU_ORIGINAL' : 'OTHER')),
    attributionText: nullable(raw.attribution_text || raw.attribution),
    visibility: upper(raw.visibility || 'REGISTERED'),
    reviewStatus: upper(raw.review_status || raw.status || 'DRAFT'),
    language: text(raw.language || 'en').toLowerCase(),
    title,
    publicSlug: nullable(raw.public_slug),
    summary: nullable(raw.summary),
    bodyMarkdown: nullable(raw.body_markdown || raw.body),
    resourceType: nullable(raw.resource_type) ? upper(raw.resource_type) : null,
    category: nullable(raw.category) ? upper(raw.category) : null,
    externalUrl: nullable(raw.external_url),
    thumbnailUrl: nullable(raw.thumbnail_url),
    durationSecs: raw.duration_secs == null || text(raw.duration_secs) === '' ? null : Math.max(1, Math.round(numberValue(raw.duration_secs, 0))),
    isOfflineReady: boolValue(raw.is_offline_ready),
    isFeaturedPublic: boolValue(raw.is_featured_public),
    publicCode: nullable(raw.public_code),
    prompt,
    questionType,
    difficulty: nullable(raw.difficulty) ? upper(raw.difficulty) : null,
    explanation: nullable(raw.explanation),
    correctAnswer: normalizeCorrectAnswer(raw.correct_answer ?? raw.answer, questionType),
    marks: Math.max(0.01, numberValue(raw.marks, 1)),
    negativeMarks: Math.max(0, numberValue(raw.negative_marks, 0)),
    options: normalizeOptions(raw.options, raw),
  };
}

async function loadReferenceData() {
  const [grades, boards, sources] = await Promise.all([
    query<GradeRow>(`SELECT id,code,name,short_name,stage,class_number,sort_order FROM education_grade_levels WHERE is_active=TRUE ORDER BY sort_order`),
    query<CodeRow>(`SELECT id,code FROM education_boards WHERE is_active=TRUE`),
    query<SourceRow>(`SELECT id,code,source_kind FROM learning_content_sources WHERE is_active=TRUE`),
  ]);
  return {
    grades: grades.rows,
    gradeMap: new Map(grades.rows.map((row) => [row.code, row])),
    boardMap: new Map(boards.rows.map((row) => [row.code, row])),
    sourceMap: new Map(sources.rows.map((row) => [row.code, row])),
  };
}

function validateRow(normalized: NormalizedRow, refs: Awaited<ReturnType<typeof loadReferenceData>>): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!normalized.importKey || normalized.importKey.length < 3) errors.push('import_key could not be generated');
  if (!normalized.gradeCodes.length) errors.push('grade_codes is required; use PRE_NURSERY, NURSERY, LKG, UKG, CLASS_1 ... CLASS_12, or ALL');
  const badGrades = normalized.gradeCodes.filter((code) => !refs.gradeMap.has(code));
  if (badGrades.length) errors.push(`Unknown grade_codes: ${badGrades.join(', ')}`);
  const badBoards = normalized.boardCodes.filter((code) => !refs.boardMap.has(code));
  if (badBoards.length) errors.push(`Unknown board_codes: ${badBoards.join(', ')}`);
  if (!refs.sourceMap.has(normalized.sourceCode)) errors.push(`Unknown source_code: ${normalized.sourceCode}`);
  if (!LICENSES.has(normalized.licence)) errors.push(`Invalid licence: ${normalized.licence}`);
  if (!VISIBILITIES.has(normalized.visibility)) errors.push(`Invalid visibility: ${normalized.visibility}`);
  if (!REVIEW_STATUSES.has(normalized.reviewStatus)) errors.push(`Invalid review_status: ${normalized.reviewStatus}`);
  if (normalized.sourceCode === 'NROER') {
    if (!normalized.sourceUrl || !isNroerUrl(normalized.sourceUrl)) errors.push('NROER rows require a genuine nroer.gov.in source_url');
    if (!normalized.attributionText) errors.push('NROER rows require attribution_text');
    if (!NROER_OPEN_LICENSES.has(normalized.licence)) errors.push('NROER rows require a verified open or EXTERNAL_LINK_ONLY licence');
  }
  if (normalized.sourceCode !== 'VIDYASETU_ORIGINAL' && !normalized.sourceUrl) warnings.push('External source has no source_url');

  if (normalized.recordType === 'RESOURCE') {
    if (!normalized.title || normalized.title.length < 3) errors.push('RESOURCE title is required');
    if (!normalized.resourceType || !RESOURCE_TYPES.has(normalized.resourceType)) errors.push(`Invalid resource_type: ${normalized.resourceType || '(blank)'}`);
    if (!normalized.category || !CATEGORIES.has(normalized.category)) errors.push(`Invalid category: ${normalized.category || '(blank)'}`);
    if (normalized.resourceType === 'ARTICLE' && !normalized.bodyMarkdown) errors.push('ARTICLE rows require body_markdown');
    if (normalized.resourceType === 'EXTERNAL_LINK' && !normalized.externalUrl && !normalized.sourceUrl) errors.push('EXTERNAL_LINK rows require external_url or source_url');
    if (normalized.visibility === 'PUBLIC' && normalized.reviewStatus !== 'PUBLISHED') warnings.push('PUBLIC resource is not PUBLISHED and will not appear publicly yet');
  } else {
    if (!normalized.prompt || normalized.prompt.length < 3) errors.push('QUESTION prompt is required');
    if (!normalized.questionType || !QUESTION_TYPES.has(normalized.questionType)) errors.push(`Invalid question_type: ${normalized.questionType || '(blank)'}`);
    if (!normalized.difficulty || !DIFFICULTIES.has(normalized.difficulty)) errors.push(`Invalid difficulty: ${normalized.difficulty || '(blank)'}`);
    if (['MCQ_SINGLE','MCQ_MULTIPLE','TRUE_FALSE'].includes(normalized.questionType || '') && normalized.options.length < 2) errors.push('Objective QUESTION rows require at least two options');
    if (normalized.questionType === 'NUMERIC' && Number.isNaN((normalized.correctAnswer as { value?: number })?.value)) errors.push('NUMERIC question requires a numeric correct_answer');
  }
  return { errors, warnings };
}

export async function getImportOptions() {
  const refs = await loadReferenceData();
  const { rows: sources } = await query(`SELECT code,name,source_kind,default_license,requires_item_license_check FROM learning_content_sources WHERE is_active=TRUE ORDER BY code`);
  const { rows: boards } = await query(`SELECT code,name,short_name,board_type,state FROM education_boards WHERE is_active=TRUE ORDER BY sort_order,name`);
  return { grades: refs.grades, boards, sources };
}

export async function stageImport(input: StageImportInput, createdBy: UUID) {
  const rawRows = parseInput(input.format, input.content);
  if (rawRows.length > 1000) throw appError('One import batch can contain at most 1000 rows');
  const refs = await loadReferenceData();
  const allGrades = refs.grades.map((row) => row.code);
  const validated: ValidatedRow[] = rawRows.map((raw, index) => {
    const normalized = normalizeRow(raw, index + 1, allGrades);
    const result = validateRow(normalized, refs);
    return { rowNumber: index + 1, recordType: normalized.recordType, raw, normalized, ...result };
  });
  const duplicateKeys = new Set<string>();
  const seen = new Set<string>();
  for (const row of validated) {
    if (seen.has(row.normalized.importKey)) duplicateKeys.add(row.normalized.importKey);
    seen.add(row.normalized.importKey);
  }
  for (const row of validated) {
    if (duplicateKeys.has(row.normalized.importKey)) row.errors.push(`Duplicate import_key inside file: ${row.normalized.importKey}`);
  }
  const keys = validated.map((row) => row.normalized.importKey);
  const existing = keys.length ? await query<{ import_key: string } & QueryResultRow>(
    `SELECT import_key FROM learning_resources WHERE import_key=ANY($1::varchar[])
     UNION SELECT import_key FROM learning_questions WHERE import_key=ANY($1::varchar[])`, [keys],
  ) : { rows: [] as Array<{ import_key: string }> };
  const existingKeys = new Set(existing.rows.map((row) => row.import_key));
  for (const row of validated) {
    if (existingKeys.has(row.normalized.importKey)) row.errors.push(`import_key already exists: ${row.normalized.importKey}`);
  }
  const validRows = validated.filter((row) => row.errors.length === 0).length;
  const errorRows = validated.length - validRows;
  return transaction(async (client) => {
    const { rows: [batch] } = await client.query<{ id: UUID }>(
      `INSERT INTO learning_import_batches(source_filename,import_format,status,total_rows,valid_rows,error_rows,summary,created_by,validated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::uuid,NOW()) RETURNING id`,
      [input.fileName.slice(0,255), input.format, errorRows === 0 ? 'VALIDATED' : 'STAGED', validated.length, validRows, errorRows,
       JSON.stringify({ recordTypes: { resources: validated.filter((r) => r.recordType === 'RESOURCE').length, questions: validated.filter((r) => r.recordType === 'QUESTION').length } }), createdBy],
    );
    for (const row of validated) {
      await client.query(
        `INSERT INTO learning_import_rows(batch_id,row_number,record_type,raw_payload,normalized_payload,validation_status,errors,warnings)
         VALUES($1::uuid,$2,$3,$4::jsonb,$5::jsonb,$6,$7::jsonb,$8::jsonb)`,
        [batch.id,row.rowNumber,row.recordType,JSON.stringify(row.raw),JSON.stringify(row.normalized),row.errors.length ? 'INVALID' : 'VALID',JSON.stringify(row.errors),JSON.stringify(row.warnings)],
      );
    }
    return getBatchWithClient(client, batch.id);
  });
}

async function getBatchWithClient(client: PoolClient, batchId: UUID) {
  const { rows: [batch] } = await client.query(
    `SELECT lib.id,lib.source_filename,lib.import_format,lib.status,lib.total_rows,lib.valid_rows,lib.error_rows,lib.imported_rows,
            lib.summary,lib.created_at,lib.validated_at,lib.completed_at,u.name AS created_by_name
     FROM learning_import_batches lib LEFT JOIN users u ON u.id=lib.created_by WHERE lib.id=$1::uuid`, [batchId],
  );
  if (!batch) throw appError('Import batch not found', 404);
  const { rows } = await client.query(
    `SELECT id,row_number,record_type,normalized_payload,validation_status,errors,warnings,imported_resource_id,imported_question_id
     FROM learning_import_rows WHERE batch_id=$1::uuid ORDER BY row_number`, [batchId],
  );
  return { ...batch, rows };
}

export async function getImportBatch(batchId: UUID) {
  return transaction((client) => getBatchWithClient(client, batchId));
}

export async function listImportBatches() {
  const { rows } = await query(
    `SELECT lib.id,lib.source_filename,lib.import_format,lib.status,lib.total_rows,lib.valid_rows,lib.error_rows,lib.imported_rows,
            lib.created_at,lib.validated_at,lib.completed_at,u.name AS created_by_name
     FROM learning_import_batches lib LEFT JOIN users u ON u.id=lib.created_by
     ORDER BY lib.created_at DESC LIMIT 100`,
  );
  return rows;
}

async function insertGrades(client: PoolClient, table: 'learning_resource_grades' | 'learning_question_grades', idColumn: 'resource_id' | 'question_id', targetId: UUID, gradeCodes: string[]) {
  const { rows } = await client.query<{ id: UUID }>(`SELECT id FROM education_grade_levels WHERE code=ANY($1::varchar[]) AND is_active=TRUE`, [gradeCodes]);
  for (const grade of rows) await client.query(`INSERT INTO ${table}(${idColumn},grade_id) VALUES($1::uuid,$2::uuid) ON CONFLICT DO NOTHING`, [targetId, grade.id]);
}

async function insertBoards(client: PoolClient, table: 'learning_resource_boards' | 'learning_question_boards', idColumn: 'resource_id' | 'question_id', targetId: UUID, boardCodes: string[]) {
  const { rows } = await client.query<{ id: UUID }>(`SELECT id FROM education_boards WHERE code=ANY($1::varchar[]) AND is_active=TRUE`, [boardCodes]);
  for (const board of rows) await client.query(`INSERT INTO ${table}(${idColumn},board_id) VALUES($1::uuid,$2::uuid) ON CONFLICT DO NOTHING`, [targetId, board.id]);
}

async function commitResource(client: PoolClient, row: NormalizedRow, batchId: UUID, userId: UUID, gradeMap: Map<string, GradeRow>): Promise<UUID> {
  const { rows: [source] } = await client.query<{ id: UUID }>(`SELECT id FROM learning_content_sources WHERE code=$1 AND is_active=TRUE`, [row.sourceCode]);
  if (!source) throw appError(`Source disappeared before commit: ${row.sourceCode}`);
  const range = deriveClassRange(row.gradeCodes, gradeMap);
  const slug = row.publicSlug || (row.title ? `${slugify(row.title)}-${row.importKey.replace(/[^a-zA-Z0-9]+/g,'-').toLowerCase().slice(-28)}`.slice(0,180) : null);
  const { rows: [created] } = await client.query<{ id: UUID }>(
    `INSERT INTO learning_resources
     (import_key,import_batch_id,public_slug,title,summary,body_markdown,resource_type,category,visibility,review_status,language,
      class_min,class_max,subject_label,topic_label,source_id,source_url,source_item_id,licence,attribution_text,external_url,
      thumbnail_url,duration_secs,is_offline_ready,is_featured_public,created_by,reviewed_by,reviewed_at,published_at)
     VALUES($1,$2::uuid,$3,$4,$5,$6,$7::learning_resource_type,$8::learning_category,$9::learning_visibility,$10::learning_review_status,$11,
            $12,$13,$14,$15,$16::uuid,$17,$18,$19::learning_license_code,$20,$21,$22,$23,$24,$25,$26::uuid,
            CASE WHEN $10::learning_review_status IN ('APPROVED','PUBLISHED') THEN $26::uuid ELSE NULL::uuid END,
            CASE WHEN $10::learning_review_status IN ('APPROVED','PUBLISHED') THEN NOW() ELSE NULL::timestamptz END,
            CASE WHEN $10::learning_review_status='PUBLISHED' THEN NOW() ELSE NULL::timestamptz END)
     RETURNING id`,
    [row.importKey,batchId,slug,row.title,row.summary,row.bodyMarkdown,row.resourceType,row.category,row.visibility,row.reviewStatus,row.language,
     range.classMin,range.classMax,row.subjectLabel,row.topicLabel,source.id,row.sourceUrl,row.sourceItemId,row.licence,row.attributionText,row.externalUrl,
     row.thumbnailUrl,row.durationSecs,row.isOfflineReady,row.isFeaturedPublic,userId],
  );
  await insertGrades(client,'learning_resource_grades','resource_id',created.id,row.gradeCodes);
  await insertBoards(client,'learning_resource_boards','resource_id',created.id,row.boardCodes);
  await client.query(`INSERT INTO learning_resource_reviews(resource_id,reviewer_id,from_status,to_status,review_note) VALUES($1::uuid,$2::uuid,NULL,$3::learning_review_status,$4)`, [created.id,userId,row.reviewStatus,'Created through Global Learning Bulk Importer']);
  return created.id;
}

async function commitQuestion(client: PoolClient, row: NormalizedRow, batchId: UUID, userId: UUID, gradeMap: Map<string, GradeRow>): Promise<UUID> {
  const { rows: [source] } = await client.query<{ id: UUID }>(`SELECT id FROM learning_content_sources WHERE code=$1 AND is_active=TRUE`, [row.sourceCode]);
  if (!source) throw appError(`Source disappeared before commit: ${row.sourceCode}`);
  const range = deriveClassRange(row.gradeCodes, gradeMap);
  const publicCode = row.publicCode || `VSI-${row.importKey.replace(/[^A-Za-z0-9]/g,'').toUpperCase().slice(-32)}`;
  const { rows: [created] } = await client.query<{ id: UUID }>(
    `INSERT INTO learning_questions
     (import_key,import_batch_id,public_code,prompt,question_type,difficulty,explanation,correct_answer,marks,negative_marks,
      class_min,class_max,subject_label,topic_label,source_id,source_url,licence,attribution_text,visibility,review_status,created_by,reviewed_by,published_at)
     VALUES($1,$2::uuid,$3,$4,$5::learning_question_type,$6::learning_difficulty,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15::uuid,$16,
            $17::learning_license_code,$18,$19::learning_visibility,$20::learning_review_status,$21::uuid,
            CASE WHEN $20::learning_review_status IN ('APPROVED','PUBLISHED') THEN $21::uuid ELSE NULL::uuid END,
            CASE WHEN $20::learning_review_status='PUBLISHED' THEN NOW() ELSE NULL::timestamptz END)
     RETURNING id`,
    [row.importKey,batchId,publicCode,row.prompt,row.questionType,row.difficulty,row.explanation,JSON.stringify(row.correctAnswer),row.marks,row.negativeMarks,
     range.classMin,range.classMax,row.subjectLabel,row.topicLabel,source.id,row.sourceUrl,row.licence,row.attributionText,row.visibility,row.reviewStatus,userId],
  );
  for (let index = 0; index < row.options.length; index += 1) {
    const option = row.options[index];
    await client.query(`INSERT INTO learning_question_options(question_id,option_key,option_text,sort_order) VALUES($1::uuid,$2,$3,$4)`, [created.id,option.key,option.text,index+1]);
  }
  await insertGrades(client,'learning_question_grades','question_id',created.id,row.gradeCodes);
  await insertBoards(client,'learning_question_boards','question_id',created.id,row.boardCodes);
  return created.id;
}

export async function commitImportBatch(batchId: UUID, userId: UUID) {
  return transaction(async (client) => {
    const { rows: [batch] } = await client.query<{ status: string; total_rows: number; valid_rows: number; error_rows: number }>(
      `SELECT status,total_rows,valid_rows,error_rows FROM learning_import_batches WHERE id=$1::uuid FOR UPDATE`, [batchId],
    );
    if (!batch) throw appError('Import batch not found',404);
    if (batch.status === 'COMPLETED') return getBatchWithClient(client,batchId);
    if (batch.error_rows > 0 || batch.valid_rows !== batch.total_rows) throw appError('Fix all invalid rows before committing this batch');
    if (!['VALIDATED','STAGED'].includes(batch.status)) throw appError(`Batch cannot be committed from status ${batch.status}`);
    await client.query(`UPDATE learning_import_batches SET status='IMPORTING',committed_by=$2::uuid WHERE id=$1::uuid`, [batchId,userId]);
    const { rows } = await client.query<{ id: UUID; row_number: number; record_type: RecordType; normalized_payload: NormalizedRow }>(
      `SELECT id,row_number,record_type,normalized_payload FROM learning_import_rows WHERE batch_id=$1::uuid AND validation_status='VALID' ORDER BY row_number FOR UPDATE`, [batchId],
    );
    const refs = await loadReferenceData();
    let imported = 0;
    for (const staged of rows) {
      const payload = staged.normalized_payload;
      if (staged.record_type === 'RESOURCE') {
        const id = await commitResource(client,payload,batchId,userId,refs.gradeMap);
        await client.query(`UPDATE learning_import_rows SET imported_resource_id=$2::uuid WHERE id=$1::uuid`, [staged.id,id]);
      } else {
        const id = await commitQuestion(client,payload,batchId,userId,refs.gradeMap);
        await client.query(`UPDATE learning_import_rows SET imported_question_id=$2::uuid WHERE id=$1::uuid`, [staged.id,id]);
      }
      imported += 1;
    }
    await client.query(`UPDATE learning_import_batches SET status='COMPLETED',imported_rows=$2,completed_at=NOW() WHERE id=$1::uuid`, [batchId,imported]);
    return getBatchWithClient(client,batchId);
  });
}

const TEMPLATE_COLUMNS = [
  'record_type','import_key','grade_codes','board_codes','subject','topic','title','public_slug','summary','body_markdown','resource_type','category',
  'language','visibility','review_status','source_code','source_url','source_item_id','licence','attribution_text','external_url','thumbnail_url','duration_secs',
  'is_offline_ready','is_featured_public','public_code','prompt','question_type','difficulty','correct_answer','options','explanation','marks','negative_marks',
];

function csvEscape(value: unknown): string {
  const str = value == null ? '' : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g,'""')}"` : str;
}

function sampleRows(sample: 'CLASS_5' | 'CLASS_8' | 'EARLY_YEARS' | 'BLANK') {
  if (sample === 'BLANK') return [];
  if (sample === 'EARLY_YEARS') return [
    { record_type:'RESOURCE',import_key:'VS-PN-COLORS-001',grade_codes:'PRE_NURSERY;NURSERY',board_codes:'COMMON',subject:'Early Learning',topic:'Colours',title:'Let us learn primary colours',summary:'A short VidyaSetu Original early-years colour activity.',body_markdown:'Red, yellow and blue are primary colours. Look around and find one object of each colour.',resource_type:'ARTICLE',category:'ACADEMIC',language:'en',visibility:'PUBLIC',review_status:'PUBLISHED',source_code:'VIDYASETU_ORIGINAL',licence:'VIDYASETU_ORIGINAL' },
  ];
  const classCode = sample;
  const cls = sample === 'CLASS_5' ? 5 : 8;
  return [
    { record_type:'RESOURCE',import_key:`VS-C${cls}-SCI-001`,grade_codes:classCode,board_codes:'COMMON',subject:'Science',topic:cls===5?'Plants and Animals':'Force and Pressure',title:`Class ${cls} Science Quick Guide`,summary:`VidyaSetu Original Class ${cls} Science starter lesson.`,body_markdown:`# Class ${cls} Science\n\nThis is a safe starter article for validating the global Learning importer.`,resource_type:'ARTICLE',category:'ACADEMIC',language:'en',visibility:'PUBLIC',review_status:'PUBLISHED',source_code:'VIDYASETU_ORIGINAL',licence:'VIDYASETU_ORIGINAL' },
    { record_type:'QUESTION',import_key:`VS-C${cls}-MATH-Q001`,grade_codes:classCode,board_codes:'COMMON',subject:'Mathematics',topic:cls===5?'Fractions':'Linear Equations',public_code:`VSC${cls}M-Q001`,prompt:cls===5?'Which fraction is equal to one half?':'Solve: 2x + 4 = 14. What is x?',question_type:'MCQ_SINGLE',difficulty:'EASY',correct_answer:'B',options:JSON.stringify(cls===5?[{key:'A',text:'1/3'},{key:'B',text:'2/4'},{key:'C',text:'3/8'},{key:'D',text:'4/10'}]:[{key:'A',text:'4'},{key:'B',text:'5'},{key:'C',text:'7'},{key:'D',text:'9'}]),explanation:cls===5?'2/4 simplifies to 1/2.':'Subtract 4, then divide by 2: x = 5.',visibility:'REGISTERED',review_status:'PUBLISHED',source_code:'VIDYASETU_ORIGINAL',licence:'VIDYASETU_ORIGINAL',marks:1,negative_marks:0 },
  ];
}

export function getCsvTemplate(sample: 'CLASS_5' | 'CLASS_8' | 'EARLY_YEARS' | 'BLANK' = 'BLANK'): string {
  const rows = sampleRows(sample);
  return [TEMPLATE_COLUMNS.join(','), ...rows.map((row) => TEMPLATE_COLUMNS.map((column) => csvEscape((row as Record<string, unknown>)[column])).join(','))].join('\n');
}

export function getJsonTemplate(sample: 'CLASS_5' | 'CLASS_8' | 'EARLY_YEARS' | 'BLANK' = 'BLANK'): string {
  return JSON.stringify({ rows: sampleRows(sample) }, null, 2);
}
