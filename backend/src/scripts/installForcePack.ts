import 'dotenv/config';
import fs = require('fs');
import path = require('path');
import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { pool, query } from '../config/db';
import { createLearningResource } from '../services/adminLearning.service';
import { createAssessment, createQuestion } from '../services/adminLearningPractice.service';

const PACK_DIR = path.resolve(
  __dirname,
  '../../../content/class-8/science/force-and-pressure/force',
);

const RESOURCE_SLUG = 'class-8-science-force-v1';
const PACK_ID = 'VS-C8-SCI-FP-FORCE-V1';

interface PackSequenceItem {
  stage: string;
  assetId: string;
  type: string;
  titleEn: string;
  titleHi: string;
  questionIds?: string[];
}

interface PackManifest {
  packId: string;
  version: string;
  status: string;
  sourceCode: string;
  licence: string;
  gradeCodes: string[];
  boardCodes: string[];
  subject: string;
  theme: string;
  concept: string;
  topicLabel: string;
  languages: string[];
  sequence: PackSequenceItem[];
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

interface IdStatusRow extends QueryResultRow {
  id: UUID;
  review_status: string;
}

interface UserRoleRow extends QueryResultRow {
  id: UUID;
  role: string;
}

interface SubjectRow extends QueryResultRow { id: UUID; }

function readJson<T>(fileName: string): T {
  return JSON.parse(fs.readFileSync(path.join(PACK_DIR, fileName), 'utf8')) as T;
}

function argumentValue(name: string): string | null {
  const args = process.argv.slice(2);
  const prefixed = args.find((arg) => arg.startsWith(`--${name}=`));
  if (prefixed) return prefixed.slice(name.length + 3).trim() || null;
  const index = args.indexOf(`--${name}`);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')) return args[index + 1].trim();
  return null;
}

function isCommitRequested(): boolean {
  return process.argv.slice(2).includes('--commit');
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function splitLesson(): { bodyEn: string; bodyHi: string } {
  const lesson = fs.readFileSync(path.join(PACK_DIR, 'lesson-content.md'), 'utf8');
  const englishMarker = '# English lesson';
  const hindiMarker = '# हिंदी पाठ';
  const englishStart = lesson.indexOf(englishMarker);
  const hindiStart = lesson.indexOf(hindiMarker);
  if (englishStart < 0 || hindiStart < 0 || hindiStart <= englishStart) {
    throw new Error('lesson-content.md must contain both # English lesson and # हिंदी पाठ sections');
  }
  return {
    bodyEn: lesson.slice(englishStart + englishMarker.length, hindiStart).trim(),
    bodyHi: lesson.slice(hindiStart + hindiMarker.length).trim(),
  };
}

function validatePack(manifest: PackManifest, bank: QuestionBank): void {
  if (manifest.packId !== PACK_ID) throw new Error(`Unexpected Force packId: ${manifest.packId}`);
  if (manifest.status !== 'DRAFT' || bank.status !== 'DRAFT') throw new Error('Installer only accepts DRAFT content packs');
  if (manifest.sourceCode !== 'VIDYASETU_ORIGINAL' || bank.sourceCode !== 'VIDYASETU_ORIGINAL') {
    throw new Error('Force installer only accepts VIDYASETU_ORIGINAL content');
  }
  if (manifest.licence !== 'VIDYASETU_ORIGINAL' || bank.licence !== 'VIDYASETU_ORIGINAL') {
    throw new Error('Force installer only accepts VIDYASETU_ORIGINAL licence');
  }
  if (bank.packId !== manifest.packId) throw new Error('Question bank packId does not match manifest');
  if (!manifest.languages.includes('en') || !manifest.languages.includes('hi')) throw new Error('Force pack must declare English and Hindi');
  if (manifest.gradeCodes.length !== 1 || manifest.gradeCodes[0] !== 'CLASS_8') throw new Error('Force v1 is locked to CLASS_8');
  if (manifest.boardCodes.length !== 1 || manifest.boardCodes[0] !== 'COMMON') throw new Error('Force v1 is locked to COMMON cross-board scope');
  if (bank.questions.length !== 12) throw new Error(`Force v1 requires exactly 12 questions; found ${bank.questions.length}`);

  const seen = new Set<string>();
  for (const question of bank.questions) {
    if (!question.publicCode || seen.has(question.publicCode)) throw new Error(`Invalid or duplicate question code: ${question.publicCode}`);
    seen.add(question.publicCode);
    if (!question.prompt.trim() || !question.promptHi.trim()) throw new Error(`${question.publicCode}: bilingual prompt is required`);
    if (!question.explanation.trim() || !question.explanationHi.trim()) throw new Error(`${question.publicCode}: bilingual explanation is required`);
    if (question.negativeMarks !== 0) throw new Error(`${question.publicCode}: learning questions must not use negative marking`);

    if (['MCQ_SINGLE', 'MCQ_MULTIPLE', 'TRUE_FALSE'].includes(question.type)) {
      if (!question.options || question.options.length < 2) throw new Error(`${question.publicCode}: objective question needs options`);
      const keys = new Set(question.options.map((option) => option.key));
      for (const option of question.options) {
        if (!option.text.trim() || !option.textHi.trim()) throw new Error(`${question.publicCode}: bilingual option text is required`);
      }
      if (question.type === 'MCQ_SINGLE' || question.type === 'TRUE_FALSE') {
        const correct = (question.correctAnswer as { option?: string })?.option;
        if (!correct || !keys.has(correct)) throw new Error(`${question.publicCode}: correct option is not present`);
      }
    }
  }

  for (const item of manifest.sequence.filter((entry) => entry.type === 'QUIZ')) {
    if (!item.questionIds?.length) throw new Error(`${item.assetId}: quiz sequence item has no questionIds`);
    for (const publicCode of item.questionIds) {
      if (!seen.has(publicCode)) throw new Error(`${item.assetId}: unknown question ${publicCode}`);
    }
  }
}

async function requireSuperAdmin(userId: UUID): Promise<void> {
  const { rows: [user] } = await query<UserRoleRow>('SELECT id, role FROM users WHERE id=$1::uuid', [userId]);
  if (!user) throw new Error('Admin user does not exist');
  if (user.role !== 'SUPER_ADMIN') throw new Error(`Force installation requires SUPER_ADMIN; received ${user.role}`);
}

async function findScienceSubject(): Promise<UUID | null> {
  const { rows: [subject] } = await query<SubjectRow>(
    `SELECT id
     FROM subjects
     WHERE UPPER(COALESCE(code,'')) IN ('SCI','SCIENCE') OR LOWER(name)='science'
     ORDER BY CASE WHEN UPPER(COALESCE(code,''))='SCIENCE' THEN 0 ELSE 1 END, id
     LIMIT 1`,
  );
  return subject?.id || null;
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

async function ensureDraftResource(
  manifest: PackManifest,
  bodyEn: string,
  bodyHi: string,
  adminUserId: UUID,
  subjectId: UUID | null,
): Promise<UUID> {
  const { rows: [existing] } = await query<IdStatusRow>(
    'SELECT id,review_status FROM learning_resources WHERE public_slug=$1',
    [RESOURCE_SLUG],
  );

  let resourceId: UUID;
  if (existing) {
    if (existing.review_status !== 'DRAFT') throw new Error(`Existing ${RESOURCE_SLUG} is ${existing.review_status}; installer will not overwrite reviewed/published content`);
    resourceId = existing.id;
  } else {
    const created = await createLearningResource(
      {
        title: 'Force: push, pull and interaction',
        titleHi: 'बल: धक्का, खिंचाव और परस्पर क्रिया',
        summary: 'Understand force through familiar pushes and pulls, identify who applies and receives a force, explore direction, and observe motion with a safe toy-car activity.',
        summaryHi: 'रोज़मर्रा के धक्का और खिंचाव से बल समझें, बल लगाने और प्राप्त करने वाली वस्तु पहचानें, दिशा समझें और सुरक्षित खिलौना-गाड़ी गतिविधि से गति का अवलोकन करें।',
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
        attributionText: 'VidyaSetu Original — Class 8 Science Force learning pack',
        isOfflineReady: true,
        isFeaturedPublic: false,
        boardCodes: manifest.boardCodes,
        publicSlug: RESOURCE_SLUG,
      },
      adminUserId,
    );
    resourceId = created.id;
  }

  await query(
    `UPDATE learning_resources
     SET subject_id=$2::uuid, subject_label=$3, topic_label=$4
     WHERE id=$1::uuid AND review_status='DRAFT'`,
    [resourceId, subjectId, manifest.subject, manifest.topicLabel],
  );
  await ensureResourceGrade(resourceId);
  return resourceId;
}

async function ensureDraftQuestions(
  manifest: PackManifest,
  bank: QuestionBank,
  adminUserId: UUID,
  subjectId: UUID | null,
): Promise<Map<string, UUID>> {
  const ids = new Map<string, UUID>();

  for (const question of bank.questions) {
    const { rows: [existing] } = await query<IdStatusRow>(
      'SELECT id,review_status FROM learning_questions WHERE public_code=$1',
      [question.publicCode],
    );

    let questionId: UUID;
    if (existing) {
      if (existing.review_status !== 'DRAFT') throw new Error(`Existing ${question.publicCode} is ${existing.review_status}; installer will not overwrite reviewed/published content`);
      questionId = existing.id;
    } else {
      const created = await createQuestion(
        {
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
          attributionText: 'VidyaSetu Original — Class 8 Science Force learning pack',
          visibility: 'REGISTERED',
          reviewStatus: 'DRAFT',
          boardCodes: manifest.boardCodes,
          options: (question.options || []).map((option) => ({ key: option.key, text: option.text, textHi: option.textHi })),
        },
        adminUserId,
      );
      questionId = created.id;
    }

    await query(
      `UPDATE learning_questions
       SET subject_label=$2, topic_label=$3
       WHERE id=$1::uuid AND review_status='DRAFT'`,
      [questionId, manifest.subject, manifest.topicLabel],
    );
    await ensureQuestionGrade(questionId);
    ids.set(question.publicCode, questionId);
  }

  return ids;
}

function assessmentSlug(assetId: string): string {
  if (assetId === 'VS-FORCE-PRACTICE-01') return 'class-8-science-force-practice-v1';
  if (assetId === 'VS-FORCE-MASTERY-01') return 'class-8-science-force-mastery-v1';
  return `class-8-science-force-${assetId.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

async function ensureDraftAssessments(
  manifest: PackManifest,
  adminUserId: UUID,
  subjectId: UUID | null,
  questionIds: Map<string, UUID>,
): Promise<Array<{ assetId: string; id: UUID; slug: string }>> {
  const installed: Array<{ assetId: string; id: UUID; slug: string }> = [];

  for (const item of manifest.sequence.filter((entry) => entry.type === 'QUIZ')) {
    const slug = assessmentSlug(item.assetId);
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
      if (existing.review_status !== 'DRAFT') throw new Error(`Existing ${slug} is ${existing.review_status}; installer will not overwrite reviewed/published content`);
      assessmentId = existing.id;
    } else {
      const isMastery = item.assetId === 'VS-FORCE-MASTERY-01';
      const created = await createAssessment(
        {
          publicSlug: slug,
          title: item.titleEn,
          titleHi: item.titleHi,
          summary: isMastery
            ? 'A concept-level mastery check covering force interactions, direction, multiple-force reasoning and experimental thinking.'
            : 'Low-stakes practice to check push, pull, interaction and force direction before application.',
          assessmentType: 'PRACTICE',
          visibility: 'REGISTERED',
          reviewStatus: 'DRAFT',
          classMin: 8,
          classMax: 8,
          subjectId,
          timeLimitMins: isMastery ? 15 : 12,
          passingPct: isMastery ? 70 : 60,
          maxAttempts: isMastery ? 3 : null,
          shuffleQuestions: false,
          isFeaturedPublic: false,
          boardCodes: manifest.boardCodes,
          questionIds: ids,
        },
        adminUserId,
      );
      assessmentId = created.id;
    }

    await query(
      `UPDATE learning_assessments SET summary_hi=$2 WHERE id=$1::uuid AND review_status='DRAFT'`,
      [
        assessmentId,
        item.assetId === 'VS-FORCE-MASTERY-01'
          ? 'बल की परस्पर क्रिया, दिशा, अनेक बलों पर तर्क और प्रयोगात्मक सोच की अवधारणा-स्तर की महारत जाँच।'
          : 'अनुप्रयोग से पहले धक्का, खिंचाव, परस्पर क्रिया और बल की दिशा की कम-दबाव वाली अभ्यास जाँच।',
      ],
    );
    installed.push({ assetId: item.assetId, id: assessmentId, slug });
  }

  return installed;
}

async function main(): Promise<void> {
  const manifest = readJson<PackManifest>('pack-manifest.json');
  const bank = readJson<QuestionBank>('question-bank.json');
  const { bodyEn, bodyHi } = splitLesson();
  validatePack(manifest, bank);

  console.log(`Force pack validated: ${manifest.packId} (${manifest.version})`);
  console.log(`Learner lesson: English ${bodyEn.length} chars; Hindi ${bodyHi.length} chars`);
  console.log(`Question bank: ${bank.questions.length} bilingual questions`);
  console.log(`Quiz assets: ${manifest.sequence.filter((item) => item.type === 'QUIZ').length}`);

  if (!isCommitRequested()) {
    console.log('DRY RUN ONLY — no database writes were made.');
    console.log('To stage the pack in Learning Studio as DRAFT, rerun with --commit --admin-user-id <SUPER_ADMIN_UUID>.');
    return;
  }

  const adminArg = argumentValue('admin-user-id');
  if (!adminArg || !isUuid(adminArg)) throw new Error('--commit requires a valid --admin-user-id UUID');
  const adminUserId = adminArg as UUID;
  await requireSuperAdmin(adminUserId);

  const subjectId = await findScienceSubject();
  if (!subjectId) console.warn('Science subject row was not found; subject_label will still be stored for the pack.');

  const resourceId = await ensureDraftResource(manifest, bodyEn, bodyHi, adminUserId, subjectId);
  const questionIds = await ensureDraftQuestions(manifest, bank, adminUserId, subjectId);
  const assessments = await ensureDraftAssessments(manifest, adminUserId, subjectId, questionIds);

  console.log('FORCE PACK STAGED SUCCESSFULLY — DRAFT ONLY');
  console.log(`Resource: ${RESOURCE_SLUG} (${resourceId})`);
  console.log(`Questions: ${questionIds.size}`);
  for (const assessment of assessments) console.log(`Assessment: ${assessment.slug} (${assessment.id})`);
  console.log('No resource, question or assessment was published. Academic review remains mandatory.');
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FORCE PACK INSTALL FAILED: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
