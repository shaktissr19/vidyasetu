import 'dotenv/config';
import fs = require('fs');
import path = require('path');
import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { pool, query, transaction } from '../config/db';
import { FORCE_PRESSURE_PACK_ROOT, getForcePressurePackConfig } from '../config/contentPackRegistry';

interface UserRoleRow extends QueryResultRow { id: UUID; role: string; }
interface EntityRow extends QueryResultRow { id: UUID; review_status: string; }
interface ConceptRow extends QueryResultRow { id: UUID; code: string; }
interface MappingRow extends QueryResultRow { concept_code: string; }
interface QuestionBank { questions: Array<{ publicCode: string }> }

type PackKey = 'pressure' | 'force';

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

function requestedPacks(): PackKey[] {
  const raw = argumentValue('packs') || 'pressure,force';
  const values = raw.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  const allowed = new Set<PackKey>(['pressure', 'force']);
  const invalid = values.filter((item) => !allowed.has(item as PackKey));
  if (invalid.length) throw new Error(`Only staged pilot packs pressure,force are supported; received ${invalid.join(',')}`);
  const unique = [...new Set(values)] as PackKey[];
  if (!unique.length) throw new Error('At least one pack is required');
  return unique;
}

async function requireSuperAdmin(userId: UUID): Promise<void> {
  const { rows: [user] } = await query<UserRoleRow>('SELECT id,role FROM users WHERE id=$1::uuid', [userId]);
  if (!user) throw new Error('Admin user does not exist');
  if (user.role !== 'SUPER_ADMIN') throw new Error(`Concept-link backfill requires SUPER_ADMIN; received ${user.role}`);
}

function questionCodes(folder: string): string[] {
  const bankPath = path.join(FORCE_PRESSURE_PACK_ROOT, folder, 'question-bank.json');
  const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8')) as QuestionBank;
  const codes = bank.questions.map((item) => item.publicCode);
  if (codes.length !== 12 || new Set(codes).size !== 12 || codes.some((code) => !code)) {
    throw new Error(`${folder}: expected exactly 12 unique question public codes`);
  }
  return codes;
}

async function exactEntity(sql: string, params: unknown[], label: string): Promise<EntityRow> {
  const { rows } = await query<EntityRow>(sql, params);
  if (rows.length !== 1) throw new Error(`${label}: expected exactly one staged entity, found ${rows.length}`);
  const row = rows[0];
  if (row.review_status !== 'DRAFT') {
    throw new Error(`${label}: expected review_status DRAFT, found ${row.review_status}; refusing governed backfill`);
  }
  return row;
}

async function resolvePack(packKey: PackKey) {
  const config = getForcePressurePackConfig(packKey);
  if (config.conceptCodes.length !== 1) throw new Error(`${packKey}: pilot backfill supports single-concept packs only`);
  const conceptCode = config.conceptCodes[0];
  const codes = questionCodes(config.folder);

  const resource = await exactEntity(
    'SELECT id,review_status FROM learning_resources WHERE public_slug=$1',
    [config.resourceSlug],
    `${packKey} resource ${config.resourceSlug}`,
  );

  const { rows: questions } = await query<EntityRow>(
    `SELECT id,review_status FROM learning_questions WHERE public_code = ANY($1::text[]) ORDER BY public_code`,
    [codes],
  );
  if (questions.length !== 12) throw new Error(`${packKey}: expected 12 staged questions, found ${questions.length}`);
  const nonDraftQuestion = questions.find((row) => row.review_status !== 'DRAFT');
  if (nonDraftQuestion) throw new Error(`${packKey}: every staged question must still be DRAFT`);

  const practice = await exactEntity(
    'SELECT id,review_status FROM learning_assessments WHERE public_slug=$1',
    [config.assessmentSlugs[0]],
    `${packKey} practice assessment`,
  );
  const mastery = await exactEntity(
    'SELECT id,review_status FROM learning_assessments WHERE public_slug=$1',
    [config.assessmentSlugs[1]],
    `${packKey} mastery assessment`,
  );

  const { rows: concepts } = await query<ConceptRow>(
    'SELECT id,code FROM learning_concepts WHERE code=$1 AND is_active=TRUE',
    [conceptCode],
  );
  if (concepts.length !== 1) throw new Error(`${packKey}: canonical concept ${conceptCode} was not resolved exactly once`);

  const concept = concepts[0];
  return { config, concept, resource, questions, practice, mastery };
}

async function existingConceptCodes(
  table: 'learning_resource_concepts' | 'learning_question_concepts' | 'learning_assessment_concepts',
  idColumn: 'resource_id' | 'question_id' | 'assessment_id',
  ids: UUID[],
): Promise<string[]> {
  const { rows } = await query<MappingRow>(
    `SELECT DISTINCT lc.code AS concept_code
     FROM ${table} map
     JOIN learning_concepts lc ON lc.id=map.concept_id
     WHERE map.${idColumn}=ANY($1::uuid[])
     ORDER BY lc.code`,
    [ids],
  );
  return rows.map((row) => row.concept_code);
}

async function validateNoUnexpectedMappings(pack: Awaited<ReturnType<typeof resolvePack>>): Promise<void> {
  const expected = pack.concept.code;
  const checks = await Promise.all([
    existingConceptCodes('learning_resource_concepts', 'resource_id', [pack.resource.id]),
    existingConceptCodes('learning_question_concepts', 'question_id', pack.questions.map((row) => row.id)),
    existingConceptCodes('learning_assessment_concepts', 'assessment_id', [pack.practice.id, pack.mastery.id]),
  ]);
  const unexpected = checks.flat().filter((code) => code !== expected);
  if (unexpected.length) {
    throw new Error(`${pack.config.key}: unexpected existing concept mappings detected: ${[...new Set(unexpected)].join(', ')}`);
  }
}

async function applyPack(pack: Awaited<ReturnType<typeof resolvePack>>): Promise<void> {
  await transaction(async (client) => {
    await client.query(
      `INSERT INTO learning_resource_concepts (resource_id,concept_id,is_primary,sort_order)
       VALUES ($1,$2,TRUE,0)
       ON CONFLICT (resource_id,concept_id) DO UPDATE SET is_primary=TRUE,sort_order=0`,
      [pack.resource.id, pack.concept.id],
    );

    for (const question of pack.questions) {
      await client.query(
        `INSERT INTO learning_question_concepts (question_id,concept_id,is_primary,sort_order)
         VALUES ($1,$2,TRUE,0)
         ON CONFLICT (question_id,concept_id) DO UPDATE SET is_primary=TRUE,sort_order=0`,
        [question.id, pack.concept.id],
      );
    }

    await client.query(
      `INSERT INTO learning_assessment_concepts (assessment_id,concept_id,is_primary,sort_order,evidence_role)
       VALUES ($1,$2,TRUE,0,'PRACTICE')
       ON CONFLICT (assessment_id,concept_id) DO UPDATE SET
         is_primary=TRUE,sort_order=0,evidence_role='PRACTICE'`,
      [pack.practice.id, pack.concept.id],
    );
    await client.query(
      `INSERT INTO learning_assessment_concepts (assessment_id,concept_id,is_primary,sort_order,evidence_role)
       VALUES ($1,$2,TRUE,0,'MASTERY')
       ON CONFLICT (assessment_id,concept_id) DO UPDATE SET
         is_primary=TRUE,sort_order=0,evidence_role='MASTERY'`,
      [pack.mastery.id, pack.concept.id],
    );
  });
}

async function main(): Promise<void> {
  const packs = requestedPacks();
  const resolved = [] as Array<Awaited<ReturnType<typeof resolvePack>>>;
  for (const key of packs) {
    const pack = await resolvePack(key);
    await validateNoUnexpectedMappings(pack);
    resolved.push(pack);
    console.log(`${key}: ${pack.config.resourceSlug} + 12 questions + 2 assessments -> ${pack.concept.code}`);
  }

  if (!isCommitRequested()) {
    console.log('DRY RUN ONLY — exact staged entities and canonical concepts validated; no database writes were made.');
    console.log('Use --commit --admin-user-id <SUPER_ADMIN_UUID> only after reviewing this output.');
    return;
  }

  const adminArg = argumentValue('admin-user-id');
  if (!adminArg || !isUuid(adminArg)) throw new Error('--commit requires a valid --admin-user-id UUID');
  await requireSuperAdmin(adminArg as UUID);

  for (const pack of resolved) await applyPack(pack);

  console.log(`STAGED CONCEPT LINKS BACKFILLED — ${resolved.length} pack(s)`);
  console.log(`Resources linked: ${resolved.length}; questions linked: ${resolved.length * 12}; assessments linked: ${resolved.length * 2}`);
  console.log('No resource, question or assessment content/review/publication field was modified.');
}

main()
  .catch((error: unknown) => {
    console.error(`STAGED CONCEPT LINK BACKFILL FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => pool.end());
