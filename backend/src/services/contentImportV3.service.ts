import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query, transaction } from '../config/db';
import * as authoring from './contentAuthoringV3.service';

export type ImportFormat = 'CSV' | 'JSON';
type RecordType = 'RESOURCE' | 'QUESTION';

interface NormalizedRow {
  recordType: RecordType;
  importKey: string;
  gradeCodes: string[];
  boardCodes: string[];
  conceptCodes: string[];
  journeyStage: 'SEE' | 'UNDERSTAND' | 'DO' | 'PRACTISE' | 'APPLY' | 'REVISE';
  sourceCode: string;
  sourceUrl: string | null;
  licence: string;
  attributionText: string | null;
  visibility: 'PUBLIC' | 'REGISTERED' | 'CLASS_ONLY' | 'SCHOOL_ONLY';
  title: string | null;
  titleHi: string | null;
  summary: string | null;
  summaryHi: string | null;
  bodyMarkdown: string | null;
  bodyMarkdownHi: string | null;
  resourceType: string | null;
  category: string | null;
  externalUrl: string | null;
  publicCode: string | null;
  prompt: string | null;
  promptHi: string | null;
  questionType: string | null;
  difficulty: string | null;
  correctAnswer: unknown;
  explanation: string | null;
  explanationHi: string | null;
  options: Array<{ key: string; text: string; textHi: string }>;
  marks: number;
  negativeMarks: number;
  skillCode: string | null;
  misconceptionCode: string | null;
  misconceptionText: string | null;
  misconceptionTextHi: string | null;
}

interface ValidatedRow {
  rowNumber: number;
  raw: Record<string, unknown>;
  normalized: NormalizedRow;
  errors: string[];
  warnings: string[];
}

const RESOURCE_TYPES = new Set(['ARTICLE','VIDEO','AUDIO','PDF','WORKSHEET','QUIZ','QUESTION_PAPER','INTERACTIVE','EXTERNAL_LINK','STORY','ACTIVITY','FLASHCARD','GAME','SIMULATION','PRACTICAL']);
const CATEGORIES = new Set(['ACADEMIC','MOTIVATION','STUDY_SKILLS','WORK_ETHIC','SOCIAL_RESPONSIBILITY','LIFE_SKILLS','WELLBEING','CAREER_AWARENESS','DIGITAL_CITIZENSHIP']);
const QUESTION_TYPES = new Set(['MCQ_SINGLE','MCQ_MULTIPLE','TRUE_FALSE','SHORT_ANSWER','NUMERIC']);
const DIFFICULTIES = new Set(['FOUNDATION','EASY','MEDIUM','HARD','CHALLENGE']);
const VISIBILITIES = new Set(['PUBLIC','REGISTERED','CLASS_ONLY','SCHOOL_ONLY']);
const JOURNEY_STAGES = new Set(['SEE','UNDERSTAND','DO','PRACTISE','APPLY','REVISE']);

function appError(message: string, statusCode = 400): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}
function text(value: unknown): string { return value == null ? '' : String(value).trim(); }
function nullable(value: unknown): string | null { const valueText = text(value); return valueText || null; }
function upper(value: unknown): string { return text(value).toUpperCase(); }
function split(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => text(item)).filter(Boolean);
  return text(value).split(/[;,|]/).map((item) => item.trim()).filter(Boolean);
}
function boolValue(value: unknown): boolean { return ['1','true','yes','y'].includes(text(value).toLowerCase()); }
function numberValue(value: unknown, fallback: number): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function slugify(value: string): string { return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,140); }
function normalizeKeys(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key,value]) => [key.trim().toLowerCase().replace(/[\s-]+/g,'_'), value]));
}

function parseCsv(content: string): Record<string, unknown>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (quoted) {
      if (char === '"' && content[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n') { row.push(cell.replace(/\r$/,'')); rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  if (cell.length || row.length) { row.push(cell.replace(/\r$/,'')); rows.push(row); }
  const nonEmpty = rows.filter((item) => item.some((value) => value.trim()));
  if (nonEmpty.length < 2) throw appError('CSV requires a header and at least one data row');
  const headers = nonEmpty[0].map((value) => value.trim().toLowerCase().replace(/[\s-]+/g,'_'));
  return nonEmpty.slice(1).map((values) => Object.fromEntries(headers.map((header,index) => [header, values[index] ?? ''])));
}

function parseInput(format: ImportFormat, content: string): Record<string, unknown>[] {
  if (Buffer.byteLength(content,'utf8') > 5 * 1024 * 1024) throw appError('Import exceeds 5 MB');
  if (format === 'CSV') return parseCsv(content);
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw appError('JSON file is invalid'); }
  const rows = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' && Array.isArray((parsed as { rows?: unknown[] }).rows) ? (parsed as { rows: unknown[] }).rows : null;
  if (!rows?.length) throw appError('JSON must contain a non-empty rows array');
  return rows.map((row,index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw appError(`JSON row ${index + 1} must be an object`);
    return row as Record<string, unknown>;
  });
}

function parseOptions(value: unknown, raw: Record<string, unknown>): Array<{ key: string; text: string; textHi: string }> {
  let parsed: unknown = value;
  if (typeof parsed === 'string' && parsed.trim()) {
    try { parsed = JSON.parse(parsed); } catch { parsed = null; }
  }
  if (Array.isArray(parsed)) {
    return parsed.map((item,index) => {
      if (!item || typeof item !== 'object') return { key: String.fromCharCode(65 + index), text: text(item), textHi: '' };
      const option = item as Record<string, unknown>;
      return { key: upper(option.key || String.fromCharCode(65 + index)), text: text(option.text), textHi: text(option.text_hi ?? option.textHi) };
    });
  }
  return ['A','B','C','D','E','F'].map((key) => ({
    key,
    text: text(raw[`option_${key.toLowerCase()}`]),
    textHi: text(raw[`option_${key.toLowerCase()}_hi`]),
  })).filter((option) => option.text || option.textHi);
}

function correctAnswer(raw: Record<string, unknown>, questionType: string | null): unknown {
  const value = raw.correct_answer ?? raw.answer;
  if (typeof value === 'string' && value.trim().startsWith('{')) {
    try { return JSON.parse(value); } catch { /* fall through */ }
  }
  if (questionType === 'MCQ_SINGLE' || questionType === 'TRUE_FALSE') return { option: upper(value) };
  if (questionType === 'MCQ_MULTIPLE') return { options: split(value).map((item) => item.toUpperCase()) };
  if (questionType === 'NUMERIC') return { value: Number(value) };
  return { text: text(value) };
}

function normalize(rawInput: Record<string, unknown>, rowNumber: number): NormalizedRow {
  const raw = normalizeKeys(rawInput);
  const recordType = upper(raw.record_type || raw.type || 'RESOURCE') === 'QUESTION' ? 'QUESTION' : 'RESOURCE';
  const sourceCode = upper(raw.source_code || 'VIDYASETU_ORIGINAL');
  const title = nullable(raw.title);
  const prompt = nullable(raw.prompt || raw.question);
  const seed = text(raw.import_key || raw.public_code || title || prompt || `row-${rowNumber}`);
  const questionType = nullable(raw.question_type) ? upper(raw.question_type) : null;
  return {
    recordType,
    importKey: text(raw.import_key) || `${sourceCode}:${recordType}:${slugify(seed)}`.slice(0,180),
    gradeCodes: split(raw.grade_codes || raw.grades || raw.grade).map((item) => upper(item.replace(/[\s-]+/g,'_'))),
    boardCodes: split(raw.board_codes || raw.boards || 'COMMON').map((item) => upper(item)),
    conceptCodes: split(raw.concept_codes || raw.concepts || raw.concept).map((item) => text(item)),
    journeyStage: (upper(raw.journey_stage || 'UNDERSTAND') || 'UNDERSTAND') as NormalizedRow['journeyStage'],
    sourceCode,
    sourceUrl: nullable(raw.source_url),
    licence: upper(raw.licence || raw.license || (sourceCode === 'VIDYASETU_ORIGINAL' ? 'VIDYASETU_ORIGINAL' : 'OTHER')),
    attributionText: nullable(raw.attribution_text || raw.attribution),
    visibility: (upper(raw.visibility || 'REGISTERED') || 'REGISTERED') as NormalizedRow['visibility'],
    title,
    titleHi: nullable(raw.title_hi),
    summary: nullable(raw.summary),
    summaryHi: nullable(raw.summary_hi),
    bodyMarkdown: nullable(raw.body_markdown || raw.body),
    bodyMarkdownHi: nullable(raw.body_markdown_hi || raw.body_hi),
    resourceType: nullable(raw.resource_type) ? upper(raw.resource_type) : null,
    category: nullable(raw.category) ? upper(raw.category) : null,
    externalUrl: nullable(raw.external_url),
    publicCode: nullable(raw.public_code),
    prompt,
    promptHi: nullable(raw.prompt_hi || raw.question_hi),
    questionType,
    difficulty: nullable(raw.difficulty) ? upper(raw.difficulty) : null,
    correctAnswer: correctAnswer(raw, questionType),
    explanation: nullable(raw.explanation),
    explanationHi: nullable(raw.explanation_hi),
    options: parseOptions(raw.options, raw),
    marks: Math.max(0.01, numberValue(raw.marks,1)),
    negativeMarks: Math.max(0, numberValue(raw.negative_marks,0)),
    skillCode: nullable(raw.skill_code),
    misconceptionCode: nullable(raw.misconception_code),
    misconceptionText: nullable(raw.misconception_text),
    misconceptionTextHi: nullable(raw.misconception_text_hi),
  };
}

async function referenceSets() {
  const [grades,boards,sources,concepts] = await Promise.all([
    query<{ code: string } & QueryResultRow>(`SELECT code FROM education_grade_levels WHERE is_active=TRUE`),
    query<{ code: string } & QueryResultRow>(`SELECT code FROM education_boards WHERE is_active=TRUE`),
    query<{ code: string } & QueryResultRow>(`SELECT code FROM learning_content_sources WHERE is_active=TRUE`),
    query<{ id: UUID; code: string } & QueryResultRow>(`SELECT id,code FROM learning_concepts WHERE is_active=TRUE`),
  ]);
  return {
    grades: new Set(grades.rows.map((row) => row.code)),
    boards: new Set(boards.rows.map((row) => row.code)),
    sources: new Set(sources.rows.map((row) => row.code)),
    concepts: new Map(concepts.rows.map((row) => [row.code,row.id])),
  };
}

function validate(row: NormalizedRow, refs: Awaited<ReturnType<typeof referenceSets>>): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!row.importKey) errors.push('import_key is required');
  if (!row.gradeCodes.length) errors.push('grade_codes is required');
  const badGrades = row.gradeCodes.filter((code) => !refs.grades.has(code));
  if (badGrades.length) errors.push(`Unknown grade_codes: ${badGrades.join(', ')}`);
  const badBoards = row.boardCodes.filter((code) => !refs.boards.has(code));
  if (badBoards.length) errors.push(`Unknown board_codes: ${badBoards.join(', ')}`);
  if (!refs.sources.has(row.sourceCode)) errors.push(`Unknown source_code: ${row.sourceCode}`);
  const badConcepts = row.conceptCodes.filter((code) => !refs.concepts.has(code));
  if (badConcepts.length) errors.push(`Unknown concept_codes: ${badConcepts.join(', ')}`);
  if (!VISIBILITIES.has(row.visibility)) errors.push(`Invalid visibility: ${row.visibility}`);
  if (!JOURNEY_STAGES.has(row.journeyStage)) errors.push(`Invalid journey_stage: ${row.journeyStage}`);
  if (row.sourceCode !== 'VIDYASETU_ORIGINAL' && !row.sourceUrl) errors.push('External content requires source_url');
  if (row.sourceCode !== 'VIDYASETU_ORIGINAL' && !row.attributionText) errors.push('External content requires attribution_text');

  if (row.recordType === 'RESOURCE') {
    if (!row.title || !row.titleHi) errors.push('RESOURCE requires English title and title_hi');
    if (!row.summary || !row.summaryHi) errors.push('RESOURCE requires English summary and summary_hi');
    if (!row.resourceType || !RESOURCE_TYPES.has(row.resourceType)) errors.push(`Invalid resource_type: ${row.resourceType || '(blank)'}`);
    if (!row.category || !CATEGORIES.has(row.category)) errors.push(`Invalid category: ${row.category || '(blank)'}`);
    if (row.resourceType === 'ARTICLE' && (!row.bodyMarkdown || !row.bodyMarkdownHi)) errors.push('ARTICLE requires body_markdown and body_markdown_hi');
    if (row.resourceType === 'EXTERNAL_LINK' && !row.externalUrl && !row.sourceUrl) errors.push('EXTERNAL_LINK requires external_url or source_url');
    if (row.category === 'ACADEMIC' && !row.conceptCodes.length) warnings.push('Academic resource has no concept_codes; publication readiness will be blocked');
  } else {
    if (!row.prompt || !row.promptHi) errors.push('QUESTION requires prompt and prompt_hi');
    if (!row.explanation || !row.explanationHi) errors.push('QUESTION requires explanation and explanation_hi');
    if (!row.questionType || !QUESTION_TYPES.has(row.questionType)) errors.push(`Invalid question_type: ${row.questionType || '(blank)'}`);
    if (!row.difficulty || !DIFFICULTIES.has(row.difficulty)) errors.push(`Invalid difficulty: ${row.difficulty || '(blank)'}`);
    if (['MCQ_SINGLE','MCQ_MULTIPLE','TRUE_FALSE'].includes(row.questionType || '') && (row.options.length < 2 || row.options.some((option) => !option.text || !option.textHi))) errors.push('Objective QUESTION requires bilingual options');
    if (!row.conceptCodes.length) warnings.push('Question has no concept_codes; publication readiness will be blocked');
    if (!row.skillCode) warnings.push('Question has no skill_code; publication readiness will be blocked');
  }
  return { errors,warnings };
}

export async function getImportOptions() {
  const [grades,boards,sources] = await Promise.all([
    query(`SELECT id,code,name,name_hi,short_name,stage,class_number,sort_order FROM education_grade_levels WHERE is_active=TRUE ORDER BY sort_order`),
    query(`SELECT code,name,short_name,board_type,state FROM education_boards WHERE is_active=TRUE ORDER BY sort_order,name`),
    query(`SELECT code,name,source_kind,default_license,requires_item_license_check FROM learning_content_sources WHERE is_active=TRUE ORDER BY code`),
  ]);
  return { grades: grades.rows, boards: boards.rows, sources: sources.rows, contract: { draftOnly: true, languages: ['en','hi'], canonicalGradesRequired: true } };
}

export async function stageImport(input: { fileName: string; format: ImportFormat; content: string }, createdBy: UUID) {
  const rawRows = parseInput(input.format,input.content);
  if (rawRows.length > 1000) throw appError('One batch can contain at most 1000 rows');
  const refs = await referenceSets();
  const validated: ValidatedRow[] = rawRows.map((raw,index) => {
    const normalized = normalize(raw,index + 1);
    const result = validate(normalized,refs);
    return { rowNumber: index + 1, raw, normalized, ...result };
  });
  const seen = new Set<string>();
  for (const row of validated) {
    if (seen.has(row.normalized.importKey)) row.errors.push(`Duplicate import_key in file: ${row.normalized.importKey}`);
    seen.add(row.normalized.importKey);
  }
  const keys = validated.map((row) => row.normalized.importKey);
  if (keys.length) {
    const existing = await query<{ import_key: string } & QueryResultRow>(
      `SELECT import_key FROM learning_resources WHERE import_key=ANY($1::varchar[]) UNION SELECT import_key FROM learning_questions WHERE import_key=ANY($1::varchar[])`, [keys],
    );
    const existingKeys = new Set(existing.rows.map((row) => row.import_key));
    for (const row of validated) if (existingKeys.has(row.normalized.importKey)) row.errors.push(`import_key already exists: ${row.normalized.importKey}`);
  }
  const validRows = validated.filter((row) => row.errors.length === 0).length;
  const errorRows = validated.length - validRows;
  return transaction(async (client) => {
    const { rows: [batch] } = await client.query<{ id: UUID }>(
      `INSERT INTO learning_import_batches(source_filename,import_format,status,total_rows,valid_rows,error_rows,summary,created_by,validated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::uuid,NOW()) RETURNING id`,
      [input.fileName.slice(0,255),input.format,errorRows ? 'STAGED' : 'VALIDATED',validated.length,validRows,errorRows,JSON.stringify({ contentPlatformVersion: '3.0', draftOnly: true, bilingual: true }),createdBy],
    );
    for (const row of validated) {
      await client.query(
        `INSERT INTO learning_import_rows(batch_id,row_number,record_type,raw_payload,normalized_payload,validation_status,errors,warnings)
         VALUES($1::uuid,$2,$3,$4::jsonb,$5::jsonb,$6,$7::jsonb,$8::jsonb)`,
        [batch.id,row.rowNumber,row.normalized.recordType,JSON.stringify(row.raw),JSON.stringify(row.normalized),row.errors.length ? 'INVALID' : 'VALID',JSON.stringify(row.errors),JSON.stringify(row.warnings)],
      );
    }
    return getBatchWithClient(client,batch.id);
  });
}

async function getBatchWithClient(client: { query: Function }, batchId: UUID) {
  const { rows: [batch] } = await client.query(
    `SELECT lib.id,lib.source_filename,lib.import_format,lib.status,lib.total_rows,lib.valid_rows,lib.error_rows,lib.imported_rows,lib.summary,lib.created_at,lib.validated_at,lib.completed_at,u.name AS created_by_name
     FROM learning_import_batches lib LEFT JOIN users u ON u.id=lib.created_by WHERE lib.id=$1::uuid`, [batchId],
  );
  if (!batch) throw appError('Import batch not found',404);
  const { rows } = await client.query(`SELECT id,row_number,record_type,normalized_payload,validation_status,errors,warnings,imported_resource_id,imported_question_id FROM learning_import_rows WHERE batch_id=$1::uuid ORDER BY row_number`, [batchId]);
  return { ...batch, rows };
}

export async function getImportBatch(batchId: UUID) { return transaction((client) => getBatchWithClient(client,batchId)); }
export async function listImportBatches() {
  const { rows } = await query(`SELECT lib.id,lib.source_filename,lib.import_format,lib.status,lib.total_rows,lib.valid_rows,lib.error_rows,lib.imported_rows,lib.summary,lib.created_at,lib.validated_at,lib.completed_at,u.name AS created_by_name FROM learning_import_batches lib LEFT JOIN users u ON u.id=lib.created_by ORDER BY lib.created_at DESC LIMIT 100`);
  return rows;
}

async function conceptIds(codes: string[]): Promise<UUID[]> {
  if (!codes.length) return [];
  const { rows } = await query<{ id: UUID; code: string } & QueryResultRow>(`SELECT id,code FROM learning_concepts WHERE code=ANY($1::varchar[]) AND is_active=TRUE`, [codes]);
  return rows.map((row) => row.id);
}

export async function commitImportBatch(batchId: UUID, userId: UUID) {
  const { rows: [batch] } = await query<{ status: string; total_rows: number; valid_rows: number; error_rows: number } & QueryResultRow>(`SELECT status,total_rows,valid_rows,error_rows FROM learning_import_batches WHERE id=$1::uuid`, [batchId]);
  if (!batch) throw appError('Import batch not found',404);
  if (batch.status === 'COMPLETED') return getImportBatch(batchId);
  if (batch.error_rows > 0 || batch.valid_rows !== batch.total_rows) throw appError('Fix all invalid rows before committing this batch');
  if (!['VALIDATED','FAILED'].includes(batch.status)) throw appError(`Batch cannot be committed from ${batch.status}`);
  await query(`UPDATE learning_import_batches SET status='IMPORTING',committed_by=$2::uuid WHERE id=$1::uuid`, [batchId,userId]);
  try {
    const { rows } = await query<{ id: UUID; record_type: RecordType; normalized_payload: NormalizedRow; imported_resource_id: UUID | null; imported_question_id: UUID | null } & QueryResultRow>(`SELECT id,record_type,normalized_payload,imported_resource_id,imported_question_id FROM learning_import_rows WHERE batch_id=$1::uuid AND validation_status='VALID' ORDER BY row_number`, [batchId]);
    let imported = 0;
    for (const staged of rows) {
      if (staged.imported_resource_id || staged.imported_question_id) { imported += 1; continue; }
      const row = staged.normalized_payload;
      const concepts = await conceptIds(row.conceptCodes);
      if (row.recordType === 'RESOURCE') {
        const suffix = row.importKey.replace(/[^a-zA-Z0-9]+/g,'-').toLowerCase().slice(-28);
        const created = await authoring.createResource({
          title: row.title!,titleHi: row.titleHi!,summary: row.summary!,summaryHi: row.summaryHi!,bodyMarkdown: row.bodyMarkdown,bodyMarkdownHi: row.bodyMarkdownHi,
          resourceType: row.resourceType!,category: row.category!,visibility: row.visibility,reviewStatus: 'DRAFT',gradeCodes: row.gradeCodes,sourceCode: row.sourceCode,sourceUrl: row.sourceUrl,
          licence: row.licence,attributionText: row.attributionText,externalUrl: row.externalUrl,boardCodes: row.boardCodes,publicSlug: `${slugify(row.title!)}-${suffix}`.slice(0,180),
          conceptMappings: concepts.map((id,index) => ({ conceptId: id, journeyStage: row.journeyStage, isPrimary: index === 0, sortOrder: index + 1 })),
        },userId);
        await query(`UPDATE learning_resources SET import_key=$2,import_batch_id=$3::uuid WHERE id=$1::uuid`, [created.id,row.importKey,batchId]);
        await query(`UPDATE learning_import_rows SET imported_resource_id=$2::uuid WHERE id=$1::uuid`, [staged.id,created.id]);
      } else {
        const publicCode = row.publicCode || `VSC3-${row.importKey.replace(/[^A-Za-z0-9]/g,'').toUpperCase().slice(-36)}`;
        const created = await authoring.createQuestion({
          publicCode,prompt: row.prompt!,promptHi: row.promptHi!,questionType: row.questionType!,difficulty: row.difficulty!,explanation: row.explanation!,explanationHi: row.explanationHi!,
          correctAnswer: row.correctAnswer,marks: row.marks,negativeMarks: row.negativeMarks,gradeCodes: row.gradeCodes,sourceCode: row.sourceCode,sourceUrl: row.sourceUrl,licence: row.licence,
          attributionText: row.attributionText,visibility: row.visibility,boardCodes: row.boardCodes,options: row.options,conceptIds: concepts,skillCode: row.skillCode,
          misconceptionCode: row.misconceptionCode,misconceptionText: row.misconceptionText,misconceptionTextHi: row.misconceptionTextHi,
        },userId);
        await query(`UPDATE learning_questions SET import_key=$2,import_batch_id=$3::uuid WHERE id=$1::uuid`, [created.id,row.importKey,batchId]);
        await query(`UPDATE learning_import_rows SET imported_question_id=$2::uuid WHERE id=$1::uuid`, [staged.id,created.id]);
      }
      imported += 1;
    }
    await query(`UPDATE learning_import_batches SET status='COMPLETED',imported_rows=$2,completed_at=NOW() WHERE id=$1::uuid`, [batchId,imported]);
    return getImportBatch(batchId);
  } catch (error) {
    await query(`UPDATE learning_import_batches SET status='FAILED',summary=COALESCE(summary,'{}'::jsonb) || jsonb_build_object('lastError',$2) WHERE id=$1::uuid`, [batchId,error instanceof Error ? error.message : 'Unknown import error']);
    throw error;
  }
}

const COLUMNS = ['record_type','import_key','grade_codes','board_codes','concept_codes','journey_stage','source_code','source_url','licence','attribution_text','visibility','title','title_hi','summary','summary_hi','body_markdown','body_markdown_hi','resource_type','category','external_url','public_code','prompt','prompt_hi','question_type','difficulty','correct_answer','options','explanation','explanation_hi','marks','negative_marks','skill_code','misconception_code','misconception_text','misconception_text_hi'];
function csvEscape(value: unknown): string { const str = value == null ? '' : String(value); return /[",\n]/.test(str) ? `"${str.replace(/"/g,'""')}"` : str; }
function sampleRows(sample: 'CLASS_5' | 'CLASS_8' | 'EARLY_YEARS' | 'BLANK') {
  if (sample === 'BLANK') return [];
  if (sample === 'EARLY_YEARS') return [{ record_type:'RESOURCE',import_key:'VS-NUR-COLORS-001',grade_codes:'NURSERY',board_codes:'COMMON',journey_stage:'SEE',source_code:'VIDYASETU_ORIGINAL',licence:'VIDYASETU_ORIGINAL',visibility:'REGISTERED',title:'Find the red object',title_hi:'लाल वस्तु खोजो',summary:'A playful colour-recognition activity.',summary_hi:'रंग पहचानने की खेल-आधारित गतिविधि।',body_markdown:'Find three red objects around you.',body_markdown_hi:'अपने आसपास तीन लाल वस्तुएँ खोजो।',resource_type:'ACTIVITY',category:'ACADEMIC' }];
  const cls = sample === 'CLASS_5' ? 5 : 8;
  return [{ record_type:'QUESTION',import_key:`VS-C${cls}-MATH-Q001`,grade_codes:`CLASS_${cls}`,board_codes:'COMMON',journey_stage:'PRACTISE',source_code:'VIDYASETU_ORIGINAL',licence:'VIDYASETU_ORIGINAL',visibility:'REGISTERED',public_code:`VSC${cls}M-Q001`,prompt:'Which option is correct?',prompt_hi:'कौन-सा विकल्प सही है?',question_type:'MCQ_SINGLE',difficulty:'EASY',correct_answer:'B',options:JSON.stringify([{key:'A',text:'Option A',text_hi:'विकल्प A'},{key:'B',text:'Option B',text_hi:'विकल्प B'}]),explanation:'B is correct.',explanation_hi:'B सही है।',marks:1,negative_marks:0,skill_code:'BASIC_REASONING' }];
}
export function getCsvTemplate(sample: 'CLASS_5' | 'CLASS_8' | 'EARLY_YEARS' | 'BLANK' = 'BLANK'): string { const rows = sampleRows(sample); return [COLUMNS.join(','),...rows.map((row) => COLUMNS.map((column) => csvEscape((row as Record<string,unknown>)[column])).join(','))].join('\n'); }
export function getJsonTemplate(sample: 'CLASS_5' | 'CLASS_8' | 'EARLY_YEARS' | 'BLANK' = 'BLANK'): string { return JSON.stringify({ rows: sampleRows(sample), contract: { reviewStatus: 'DRAFT', languages: ['en','hi'], gradeCodesRequired: true } },null,2); }
