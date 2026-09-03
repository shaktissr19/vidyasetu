import 'dotenv/config';
import fs = require('fs');
import path = require('path');
import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { pool, query } from '../config/db';
import {
  FORCE_PRESSURE_PACK_ROOT,
  getForcePressurePackConfig,
  listForcePressurePackConfigs,
  type ContentPackConfig,
} from '../config/contentPackRegistry';
import { class8LearningConceptCodeSet } from '../config/learningConceptRegistry';
import { createLearningResource } from '../services/adminLearning.service';
import { createAssessment, createQuestion } from '../services/adminLearningPractice.service';

const REQUIRED_STAGES = ['SEE', 'UNDERSTAND', 'DO', 'PRACTISE', 'APPLY', 'REVISE'] as const;
const ALLOWED_DIFFICULTIES = new Set(['FOUNDATION', 'EASY', 'MEDIUM', 'HARD', 'CHALLENGE']);

interface PackSequenceItem {
  order?: number;
  stage: string;
  assetId: string;
  type: string;
  titleEn: string;
  titleHi: string;
  durationSecs?: number;
  questionIds?: string[];
}

interface PackManifest {
  packId: string;
  version?: string;
  status: string;
  sourceCode: string;
  licence: string;
  gradeCodes: string[];
  boardCodes: string[];
  subject: string;
  theme?: string;
  concept: string;
  topicLabel?: string;
  languages: string[];
  contentIdentity?: string[];
  learningOutcomes?: Array<{ id?: string; en: string; hi: string }>;
  sequence: PackSequenceItem[];
  publicationPolicy?: { autoPublish?: boolean; requiredReviews?: string[] };
}

interface PackQuestionOption {
  key: string;
  text: string;
  textHi: string;
}

interface PackQuestion {
  publicCode: string;
  type: string;
  difficulty: string;
  prompt: string;
  promptHi: string;
  options?: PackQuestionOption[];
  correctAnswer: unknown;
  explanation: string;
  explanationHi: string;
  marks: number;
  negativeMarks: number;
}

interface QuestionBank {
  packId: string;
  status: string;
  sourceCode: string;
  licence: string;
  questions: PackQuestion[];
}

interface UserRoleRow extends QueryResultRow {
  id: UUID;
  role: string;
}

interface SubjectRow extends QueryResultRow {
  id: UUID;
}

interface IdStatusRow extends QueryResultRow {
  id: UUID;
  review_status: string;
}

interface ConceptIdRow extends QueryResultRow {
  id: UUID;
  code: string;
}

interface TableRow extends QueryResultRow {
  concept_table: string | null;
}

interface LoadedPack {
  config: ContentPackConfig;
  packDir: string;
  manifest: PackManifest;
  bank: QuestionBank;
  bodyEn: string;
  bodyHi: string;
  lessonAsset: PackSequenceItem;
  practiceAsset: PackSequenceItem;
  masteryAsset: PackSequenceItem;
}

function argumentValue(name: string): string | null {
  const args = process.argv.slice(2);
  const prefixed = args.find((arg) => arg.startsWith(`--${name}=`));
  if (prefixed) return prefixed.slice(name.length + 3).trim() || null;
  const index = args.indexOf(`--${name}`);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')) {
    return args[index + 1].trim();
  }
  return null;
}

function isCommitRequested(): boolean {
  return process.argv.slice(2).includes('--commit');
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function readJson<T>(packDir: string, fileName: string): T {
  return JSON.parse(fs.readFileSync(path.join(packDir, fileName), 'utf8')) as T;
}

function splitLesson(packDir: string): { bodyEn: string; bodyHi: string } {
  const lesson = fs.readFileSync(path.join(packDir, 'lesson-content.md'), 'utf8');
  const englishMarker = '# English lesson';
  const hindiMarker = '# हिंदी पाठ';
  const englishStart = lesson.indexOf(englishMarker);
  const hindiStart = lesson.indexOf(hindiMarker);

  if (englishStart < 0 || hindiStart < 0 || hindiStart <= englishStart) {
    throw new Error('lesson-content.md must contain both # English lesson and # हिंदी पाठ sections');
  }

  const bodyEn = lesson.slice(englishStart + englishMarker.length, hindiStart).trim();
  const bodyHi = lesson.slice(hindiStart + hindiMarker.length).trim();
  if (!bodyEn || !bodyHi) throw new Error('English and Hindi learner lesson bodies must both be non-empty');
  return { bodyEn, bodyHi };
}

function objectiveQuestion(type: string): boolean {
  return ['MCQ_SINGLE', 'MCQ_MULTIPLE', 'TRUE_FALSE'].includes(type);
}

function quizRole(item: PackSequenceItem): 'PRACTICE' | 'MASTERY' | null {
  const id = item.assetId.toUpperCase();
  const stage = item.stage.toUpperCase();
  if (stage === 'PRACTISE' || id.includes('PRACTICE')) return 'PRACTICE';
  if (id.includes('MASTERY') || stage === 'REVISE') return 'MASTERY';
  return null;
}

function validateQuestion(question: PackQuestion, packId: string): void {
  if (!question.publicCode?.trim()) throw new Error(`${packId}: every question requires publicCode`);
  if (!question.prompt?.trim() || !question.promptHi?.trim()) {
    throw new Error(`${question.publicCode}: bilingual prompt is required`);
  }
  if (!question.explanation?.trim() || !question.explanationHi?.trim()) {
    throw new Error(`${question.publicCode}: bilingual explanation is required`);
  }
  if (!ALLOWED_DIFFICULTIES.has(String(question.difficulty || '').toUpperCase())) {
    throw new Error(`${question.publicCode}: unsupported difficulty ${question.difficulty}`);
  }
  if (Number(question.negativeMarks || 0) !== 0) {
    throw new Error(`${question.publicCode}: learning questions must not use negative marking`);
  }
  if (!question.correctAnswer || typeof question.correctAnswer !== 'object') {
    throw new Error(`${question.publicCode}: correctAnswer is required`);
  }

  if (objectiveQuestion(question.type)) {
    if (!question.options || question.options.length < 2) {
      throw new Error(`${question.publicCode}: objective question requires at least two options`);
    }
    const keys = new Set<string>();
    for (const option of question.options) {
      const key = option.key?.trim();
      if (!key || keys.has(key)) throw new Error(`${question.publicCode}: option keys must be non-empty and unique`);
      if (!option.text?.trim() || !option.textHi?.trim()) {
        throw new Error(`${question.publicCode}: every option requires English and Hindi text`);
      }
      keys.add(key);
    }

    if (question.type === 'MCQ_MULTIPLE') {
      const correct = (question.correctAnswer as { options?: string[] }).options || [];
      if (!correct.length || correct.some((key) => !keys.has(key))) {
        throw new Error(`${question.publicCode}: one or more correct options are invalid`);
      }
    } else {
      const correct = (question.correctAnswer as { option?: string }).option;
      if (!correct || !keys.has(correct)) throw new Error(`${question.publicCode}: correct option is invalid`);
    }
  }
}

function validateConceptMappings(config: ContentPackConfig, questionCodes: Set<string>): void {
  const canonicalCodes = class8LearningConceptCodeSet();
  if (!config.conceptCodes?.length) throw new Error(`${config.key}: at least one canonical concept code is required`);

  for (const conceptCode of config.conceptCodes) {
    if (!canonicalCodes.has(conceptCode)) {
      throw new Error(`${config.key}: canonical concept ${conceptCode} is missing from the Class 8 syllabus registry`);
    }
  }

  if (config.conceptCodes.length > 1) {
    if (!config.questionConceptCodes) {
      throw new Error(`${config.key}: multi-concept packs require explicit questionConceptCodes mappings`);
    }
    for (const questionCode of questionCodes) {
      if (!config.questionConceptCodes[questionCode]?.length) {
        throw new Error(`${config.key}: ${questionCode} requires an explicit concept mapping`);
      }
    }
  }

  for (const [questionCode, mappedCodes] of Object.entries(config.questionConceptCodes || {})) {
    if (!questionCodes.has(questionCode)) throw new Error(`${config.key}: concept mapping references unknown question ${questionCode}`);
    if (!mappedCodes.length) throw new Error(`${config.key}: ${questionCode} concept mapping cannot be empty`);
    for (const conceptCode of mappedCodes) {
      if (!config.conceptCodes.includes(conceptCode)) {
        throw new Error(`${config.key}: ${questionCode} maps to ${conceptCode}, which is outside the pack concept scope`);
      }
      if (!canonicalCodes.has(conceptCode)) {
        throw new Error(`${config.key}: ${questionCode} maps to unknown canonical concept ${conceptCode}`);
      }
    }
  }
}

function loadAndValidatePack(packKey: string): LoadedPack {
  const config = getForcePressurePackConfig(packKey);
  const packDir = path.join(FORCE_PRESSURE_PACK_ROOT, config.folder);
  const manifest = readJson<PackManifest>(packDir, 'pack-manifest.json');
  const bank = readJson<QuestionBank>(packDir, 'question-bank.json');
  const { bodyEn, bodyHi } = splitLesson(packDir);

  if (!manifest.packId?.trim()) throw new Error(`${config.key}: packId is required`);
  if (manifest.status !== 'DRAFT' || bank.status !== 'DRAFT') {
    throw new Error(`${manifest.packId}: generic installer accepts DRAFT packs only`);
  }
  if (manifest.sourceCode !== 'VIDYASETU_ORIGINAL' || bank.sourceCode !== 'VIDYASETU_ORIGINAL') {
    throw new Error(`${manifest.packId}: generic installer accepts VIDYASETU_ORIGINAL only`);
  }
  if (manifest.licence !== 'VIDYASETU_ORIGINAL' || bank.licence !== 'VIDYASETU_ORIGINAL') {
    throw new Error(`${manifest.packId}: generic installer accepts VIDYASETU_ORIGINAL licence only`);
  }
  if (bank.packId !== manifest.packId) throw new Error(`${manifest.packId}: question bank packId mismatch`);
  if (!manifest.languages?.includes('en') || !manifest.languages?.includes('hi')) {
    throw new Error(`${manifest.packId}: English and Hindi must both be declared`);
  }
  if (manifest.gradeCodes?.length !== 1 || manifest.gradeCodes[0] !== 'CLASS_8') {
    throw new Error(`${manifest.packId}: pilot installer is locked to CLASS_8`);
  }
  if (manifest.boardCodes?.length !== 1 || manifest.boardCodes[0] !== 'COMMON') {
    throw new Error(`${manifest.packId}: pilot installer is locked to COMMON board scope`);
  }
  if (manifest.publicationPolicy?.autoPublish === true) {
    throw new Error(`${manifest.packId}: autoPublish must remain false`);
  }
  if (bank.questions.length !== 12) {
    throw new Error(`${manifest.packId}: pilot pack requires exactly 12 questions; found ${bank.questions.length}`);
  }

  const stages = new Set(manifest.sequence.map((item) => item.stage));
  for (const stage of REQUIRED_STAGES) {
    if (!stages.has(stage)) throw new Error(`${manifest.packId}: missing learning stage ${stage}`);
  }

  const codes = new Set<string>();
  for (const question of bank.questions) {
    validateQuestion(question, manifest.packId);
    if (codes.has(question.publicCode)) throw new Error(`${manifest.packId}: duplicate question ${question.publicCode}`);
    codes.add(question.publicCode);
  }
  validateConceptMappings(config, codes);

  const lessonAsset = manifest.sequence.find((item) => item.type === 'ARTICLE' && item.stage === 'UNDERSTAND')
    || manifest.sequence.find((item) => item.type === 'ARTICLE');
  if (!lessonAsset) throw new Error(`${manifest.packId}: no ARTICLE learner lesson asset found`);

  const quizAssets = manifest.sequence.filter((item) => item.type === 'QUIZ');
  const practiceAsset = quizAssets.find((item) => quizRole(item) === 'PRACTICE');
  const masteryAsset = quizAssets.find((item) => quizRole(item) === 'MASTERY');
  if (!practiceAsset || !masteryAsset || practiceAsset.assetId === masteryAsset.assetId) {
    throw new Error(`${manifest.packId}: one PRACTICE quiz and one MASTERY quiz are required`);
  }

  for (const item of [practiceAsset, masteryAsset]) {
    if (!item.questionIds?.length) throw new Error(`${item.assetId}: questionIds are required`);
    for (const code of item.questionIds) {
      if (!codes.has(code)) throw new Error(`${item.assetId}: unknown question ${code}`);
    }
  }

  return { config, packDir, manifest, bank, bodyEn, bodyHi, lessonAsset, practiceAsset, masteryAsset };
}

async function requireSuperAdmin(userId: UUID): Promise<void> {
  const { rows: [user] } = await query<UserRoleRow>('SELECT id,role FROM users WHERE id=$1::uuid', [userId]);
  if (!user) throw new Error('Admin user does not exist');
  if (user.role !== 'SUPER_ADMIN') throw new Error(`Content-pack installation requires SUPER_ADMIN; received ${user.role}`);
}

async function findScienceSubject(): Promise<UUID | null> {
  const { rows: [subject] } = await query<SubjectRow>(
    `SELECT id FROM subjects
     WHERE UPPER(COALESCE(code,'')) IN ('SCI','SCIENCE') OR LOWER(name)='science'
     ORDER BY CASE WHEN UPPER(COALESCE(code,''))='SCIENCE' THEN 0 ELSE 1 END,id
     LIMIT 1`,
  );
  return subject?.id || null;
}

async function resolveConceptIds(config: ContentPackConfig): Promise<Map<string, UUID>> {
  const { rows: [tableCheck] } = await query<TableRow>(
    "SELECT to_regclass('public.learning_concepts')::text AS concept_table",
  );
  if (!tableCheck?.concept_table) {
    throw new Error('Canonical concept schema is missing. Apply migration 026 and synchronize the syllabus concept registry before staging content.');
  }

  const { rows } = await query<ConceptIdRow>(
    'SELECT id,code FROM learning_concepts WHERE code=ANY($1::varchar[]) AND is_active=TRUE',
    [config.conceptCodes],
  );
  const ids = new Map(rows.map((row) => [row.code, row.id] as const));
  const missing = config.conceptCodes.filter((code) => !ids.has(code));
  if (missing.length) {
    throw new Error(`Canonical concepts are not synchronized in the database: ${missing.join(', ')}`);
  }
  return ids;
}

async function ensureResourceGrade(resourceId: UUID): Promise<void> {
  await query(
    `INSERT INTO learning_resource_grades(resource_id,grade_id)
     SELECT $1::uuid,id FROM education_grade_levels WHERE code='CLASS_8' AND is_active=TRUE
     ON CONFLICT DO NOTHING`,
    [resourceId],
  );
}

async function ensureQuestionGrade(questionId: UUID): Promise<void> {
  await query(
    `INSERT INTO learning_question_grades(question_id,grade_id)
     SELECT $1::uuid,id FROM education_grade_levels WHERE code='CLASS_8' AND is_active=TRUE
     ON CONFLICT DO NOTHING`,
    [questionId],
  );
}

function resourceSummary(manifest: PackManifest, lessonAsset: PackSequenceItem): { en: string; hi: string } {
  return {
    en: `A bilingual Class 8 Science learning journey for ${manifest.concept}, combining clear explanation, safe practical learning, low-stakes practice, real-life application and revision.`,
    hi: `कक्षा 8 विज्ञान में ${lessonAsset.titleHi} के लिए द्विभाषी सीखने की यात्रा—सरल व्याख्या, सुरक्षित गतिविधि, अभ्यास, जीवन से जुड़ा उपयोग और दोहराव।`,
  };
}

function assessmentSummary(manifest: PackManifest, item: PackSequenceItem, mastery: boolean): { en: string; hi: string } {
  if (mastery) {
    return {
      en: `Concept-level mastery check for ${manifest.concept}, covering understanding, application and misconception diagnosis with zero negative marking.`,
      hi: `${item.titleHi}: समझ, उपयोग और सामान्य गलत धारणाओं की अवधारणा-स्तर की जाँच; कोई नकारात्मक अंक नहीं।`,
    };
  }
  return {
    en: `Low-stakes bilingual practice for ${manifest.concept} with explanation-ready questions and zero negative marking.`,
    hi: `${item.titleHi}: द्विभाषी कम-दबाव वाला अभ्यास, व्याख्या-आधारित प्रश्न और कोई नकारात्मक अंक नहीं।`,
  };
}

async function ensureDraftResource(pack: LoadedPack, adminUserId: UUID, subjectId: UUID | null): Promise<UUID> {
  const { config, manifest, lessonAsset, bodyEn, bodyHi } = pack;
  const { rows: [existing] } = await query<IdStatusRow>(
    'SELECT id,review_status FROM learning_resources WHERE public_slug=$1',
    [config.resourceSlug],
  );

  let resourceId: UUID;
  if (existing) {
    if (existing.review_status !== 'DRAFT') {
      throw new Error(`Existing ${config.resourceSlug} is ${existing.review_status}; generic installer will not overwrite reviewed/published content`);
    }
    resourceId = existing.id;
  } else {
    const summary = resourceSummary(manifest, lessonAsset);
    const created = await createLearningResource({
      title: lessonAsset.titleEn,
      titleHi: lessonAsset.titleHi,
      summary: summary.en,
      summaryHi: summary.hi,
      bodyMarkdown: bodyEn,
      bodyMarkdownHi: bodyHi,
      resourceType: 'ARTICLE',
      category: 'ACADEMIC',
      visibility: 'PUBLIC',
      reviewStatus: 'DRAFT',
      language: 'en',
      classMin: 8,
      classMax: 8,
      sourceCode: manifest.sourceCode,
      sourceItemId: manifest.packId,
      licence: manifest.licence,
      attributionText: `VidyaSetu Original — Class 8 Science ${manifest.concept} learning pack`,
      isOfflineReady: true,
      isFeaturedPublic: false,
      boardCodes: manifest.boardCodes,
      publicSlug: config.resourceSlug,
    }, adminUserId);
    resourceId = created.id;
  }

  await query(
    `UPDATE learning_resources
     SET subject_id=$2::uuid,subject_label=$3,topic_label=$4
     WHERE id=$1::uuid AND review_status='DRAFT'`,
    [resourceId, subjectId, manifest.subject, manifest.topicLabel || manifest.concept],
  );
  await ensureResourceGrade(resourceId);
  return resourceId;
}

async function ensureDraftQuestions(pack: LoadedPack, adminUserId: UUID, subjectId: UUID | null): Promise<Map<string, UUID>> {
  const { manifest, bank } = pack;
  const ids = new Map<string, UUID>();

  for (const question of bank.questions) {
    const { rows: [existing] } = await query<IdStatusRow>(
      'SELECT id,review_status FROM learning_questions WHERE public_code=$1',
      [question.publicCode],
    );

    let questionId: UUID;
    if (existing) {
      if (existing.review_status !== 'DRAFT') {
        throw new Error(`Existing ${question.publicCode} is ${existing.review_status}; generic installer will not overwrite reviewed/published content`);
      }
      questionId = existing.id;
    } else {
      const created = await createQuestion({
        publicCode: question.publicCode,
        prompt: question.prompt,
        promptHi: question.promptHi,
        questionType: question.type,
        difficulty: question.difficulty,
        explanation: question.explanation,
        explanationHi: question.explanationHi,
        correctAnswer: question.correctAnswer,
        marks: question.marks,
        negativeMarks: question.negativeMarks,
        classMin: 8,
        classMax: 8,
        subjectId,
        sourceCode: manifest.sourceCode,
        licence: manifest.licence,
        attributionText: `VidyaSetu Original — Class 8 Science ${manifest.concept} learning pack`,
        visibility: 'REGISTERED',
        reviewStatus: 'DRAFT',
        boardCodes: manifest.boardCodes,
        options: (question.options || []).map((option) => ({ key: option.key, text: option.text, textHi: option.textHi })),
      }, adminUserId);
      questionId = created.id;
    }

    await query(
      `UPDATE learning_questions SET subject_label=$2,topic_label=$3
       WHERE id=$1::uuid AND review_status='DRAFT'`,
      [questionId, manifest.subject, manifest.topicLabel || manifest.concept],
    );
    await ensureQuestionGrade(questionId);
    ids.set(question.publicCode, questionId);
  }

  return ids;
}

async function ensureDraftAssessment(
  pack: LoadedPack,
  item: PackSequenceItem,
  slug: string,
  mastery: boolean,
  adminUserId: UUID,
  subjectId: UUID | null,
  questionIds: Map<string, UUID>,
): Promise<UUID> {
  const ids = (item.questionIds || []).map((code) => {
    const id = questionIds.get(code);
    if (!id) throw new Error(`${item.assetId}: question ${code} was not installed`);
    return id;
  });

  const { rows: [existing] } = await query<IdStatusRow>(
    'SELECT id,review_status FROM learning_assessments WHERE public_slug=$1',
    [slug],
  );

  let assessmentId: UUID;
  if (existing) {
    if (existing.review_status !== 'DRAFT') {
      throw new Error(`Existing ${slug} is ${existing.review_status}; generic installer will not overwrite reviewed/published content`);
    }
    assessmentId = existing.id;
  } else {
    const summary = assessmentSummary(pack.manifest, item, mastery);
    const created = await createAssessment({
      publicSlug: slug,
      title: item.titleEn,
      titleHi: item.titleHi,
      summary: summary.en,
      assessmentType: 'PRACTICE',
      visibility: 'REGISTERED',
      reviewStatus: 'DRAFT',
      classMin: 8,
      classMax: 8,
      subjectId,
      timeLimitMins: mastery ? 15 : 12,
      passingPct: mastery ? 70 : 60,
      maxAttempts: mastery ? 3 : null,
      shuffleQuestions: false,
      isFeaturedPublic: false,
      boardCodes: pack.manifest.boardCodes,
      questionIds: ids,
    }, adminUserId);
    assessmentId = created.id;
  }

  const summary = assessmentSummary(pack.manifest, item, mastery);
  await query(
    `UPDATE learning_assessments SET summary_hi=$2
     WHERE id=$1::uuid AND review_status='DRAFT'`,
    [assessmentId, summary.hi],
  );
  return assessmentId;
}

async function linkConcepts(
  table: 'learning_resource_concepts' | 'learning_question_concepts' | 'learning_assessment_concepts',
  idColumn: 'resource_id' | 'question_id' | 'assessment_id',
  entityId: UUID,
  conceptCodes: readonly string[],
  conceptIds: Map<string, UUID>,
): Promise<void> {
  for (let index = 0; index < conceptCodes.length; index += 1) {
    const code = conceptCodes[index];
    const conceptId = conceptIds.get(code);
    if (!conceptId) throw new Error(`Canonical concept ${code} was not resolved`);
    await query(
      `INSERT INTO ${table} (${idColumn},concept_id,is_primary,sort_order)
       VALUES ($1::uuid,$2::uuid,$3,$4)
       ON CONFLICT (${idColumn},concept_id) DO UPDATE SET
         is_primary=EXCLUDED.is_primary,
         sort_order=EXCLUDED.sort_order`,
      [entityId, conceptId, index === 0, index],
    );
  }
}

async function ensureConceptMappings(
  pack: LoadedPack,
  resourceId: UUID,
  questionIds: Map<string, UUID>,
  practiceId: UUID,
  masteryId: UUID,
  conceptIds: Map<string, UUID>,
): Promise<void> {
  const { config } = pack;
  await linkConcepts('learning_resource_concepts', 'resource_id', resourceId, config.conceptCodes, conceptIds);

  for (const [questionCode, questionId] of questionIds.entries()) {
    const codes = config.questionConceptCodes?.[questionCode] || config.conceptCodes;
    await linkConcepts('learning_question_concepts', 'question_id', questionId, codes, conceptIds);
  }

  await linkConcepts('learning_assessment_concepts', 'assessment_id', practiceId, config.conceptCodes, conceptIds);
  await linkConcepts('learning_assessment_concepts', 'assessment_id', masteryId, config.conceptCodes, conceptIds);
}

async function main(): Promise<void> {
  const packArg = argumentValue('pack');
  if (!packArg) {
    const keys = listForcePressurePackConfigs().map((pack) => pack.key).join(', ');
    throw new Error(`--pack is required. Supported packs: ${keys}`);
  }

  const pack = loadAndValidatePack(packArg);
  const { manifest, config, bank, bodyEn, bodyHi, practiceAsset, masteryAsset } = pack;

  console.log(`Content pack validated: ${manifest.packId} (${manifest.version || 'unversioned-draft'})`);
  console.log(`Pack key: ${config.key}`);
  console.log(`Canonical concepts: ${config.conceptCodes.join(', ')}`);
  console.log(`Learner lesson: English ${bodyEn.length} chars; Hindi ${bodyHi.length} chars`);
  console.log(`Question bank: ${bank.questions.length} bilingual questions`);
  console.log(`Practice questions: ${practiceAsset.questionIds?.length || 0}`);
  console.log(`Mastery questions: ${masteryAsset.questionIds?.length || 0}`);

  if (!isCommitRequested()) {
    console.log('DRY RUN ONLY — no database writes were made.');
    console.log('To stage as DRAFT, apply/sync the canonical concept registry, then rerun with --commit --admin-user-id <SUPER_ADMIN_UUID>.');
    return;
  }

  const adminArg = argumentValue('admin-user-id');
  if (!adminArg || !isUuid(adminArg)) throw new Error('--commit requires a valid --admin-user-id UUID');
  const adminUserId = adminArg as UUID;
  await requireSuperAdmin(adminUserId);

  // Resolve every concept before creating or updating any staged learning row.
  // This prevents a missing migration/sync from leaving a partially installed pack.
  const conceptIds = await resolveConceptIds(config);

  const subjectId = await findScienceSubject();
  if (!subjectId) console.warn('Science subject row was not found; subject_label will still be stored.');

  const resourceId = await ensureDraftResource(pack, adminUserId, subjectId);
  const questionIds = await ensureDraftQuestions(pack, adminUserId, subjectId);
  const practiceId = await ensureDraftAssessment(
    pack,
    practiceAsset,
    config.assessmentSlugs[0],
    false,
    adminUserId,
    subjectId,
    questionIds,
  );
  const masteryId = await ensureDraftAssessment(
    pack,
    masteryAsset,
    config.assessmentSlugs[1],
    true,
    adminUserId,
    subjectId,
    questionIds,
  );
  await ensureConceptMappings(pack, resourceId, questionIds, practiceId, masteryId, conceptIds);

  console.log('CONTENT PACK STAGED SUCCESSFULLY — DRAFT ONLY');
  console.log(`Resource: ${config.resourceSlug} (${resourceId})`);
  console.log(`Questions: ${questionIds.size}`);
  console.log(`Assessment: ${config.assessmentSlugs[0]} (${practiceId})`);
  console.log(`Assessment: ${config.assessmentSlugs[1]} (${masteryId})`);
  console.log(`Canonical concept mappings: ${config.conceptCodes.join(', ')}`);
  console.log('No resource, question or assessment was published. Academic review remains mandatory.');
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`CONTENT PACK INSTALL FAILED: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
