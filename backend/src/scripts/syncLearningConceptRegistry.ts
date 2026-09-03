import 'dotenv/config';
import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { pool, query, transaction } from '../config/db';
import { loadClass8LearningConceptRegistry } from '../config/learningConceptRegistry';

interface UserRoleRow extends QueryResultRow {
  id: UUID;
  role: string;
}

interface GradeRow extends QueryResultRow {
  id: UUID;
  code: string;
}

interface SubjectRow extends QueryResultRow {
  id: UUID;
  code: string | null;
  name: string;
}

interface TableRow extends QueryResultRow {
  concept_table: string | null;
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

async function requireSuperAdmin(userId: UUID): Promise<void> {
  const { rows: [user] } = await query<UserRoleRow>('SELECT id,role FROM users WHERE id=$1::uuid', [userId]);
  if (!user) throw new Error('Admin user does not exist');
  if (user.role !== 'SUPER_ADMIN') {
    throw new Error(`Concept registry synchronization requires SUPER_ADMIN; received ${user.role}`);
  }
}

function normalizedSubjectKeys(row: SubjectRow): string[] {
  const keys = new Set<string>();
  const code = String(row.code || '').trim().toUpperCase();
  const name = String(row.name || '').trim().toUpperCase();
  if (code) keys.add(code);
  if (name) keys.add(name);

  if (code === 'SCI' || name === 'SCIENCE') keys.add('SCIENCE');
  if (['MATH', 'MATHS', 'MATHEMATICS'].includes(code) || ['MATH', 'MATHS', 'MATHEMATICS'].includes(name)) {
    keys.add('MATHEMATICS');
  }
  if (code === 'ENG' || name === 'ENGLISH') keys.add('ENGLISH');
  if (code === 'HIN' || name === 'HINDI') keys.add('HINDI');
  return [...keys];
}

async function main(): Promise<void> {
  const concepts = loadClass8LearningConceptRegistry();
  const subjectCount = new Set(concepts.map((concept) => concept.subjectCode)).size;
  const chapterCount = new Set(concepts.map((concept) => concept.chapterCode)).size;

  console.log(`Canonical concept registry validated: ${concepts.length} concepts`);
  console.log(`Scope: CLASS_8 / ${subjectCount} subjects / ${chapterCount} chapters / ${concepts[0]?.academicYear || 'unknown session'}`);

  if (!isCommitRequested()) {
    console.log('DRY RUN ONLY — no database writes were made.');
    console.log('To synchronize canonical concept rows, apply migration 026 first and rerun with --commit --admin-user-id <SUPER_ADMIN_UUID>.');
    return;
  }

  const adminArg = argumentValue('admin-user-id');
  if (!adminArg || !isUuid(adminArg)) throw new Error('--commit requires a valid --admin-user-id UUID');
  const adminUserId = adminArg as UUID;
  await requireSuperAdmin(adminUserId);

  const { rows: [tableCheck] } = await query<TableRow>(
    "SELECT to_regclass('public.learning_concepts')::text AS concept_table",
  );
  if (!tableCheck?.concept_table) {
    throw new Error('learning_concepts does not exist. Apply database/migrations/026_learning_concepts_mastery.sql before synchronization.');
  }

  const { rows: [grade] } = await query<GradeRow>(
    "SELECT id,code FROM education_grade_levels WHERE code='CLASS_8' AND is_active=TRUE LIMIT 1",
  );
  if (!grade) throw new Error('CLASS_8 grade registry row was not found. Migration 023 must be present before concept synchronization.');

  const { rows: subjects } = await query<SubjectRow>('SELECT id,code,name FROM subjects');
  const subjectIds = new Map<string, UUID>();
  for (const subject of subjects) {
    for (const key of normalizedSubjectKeys(subject)) {
      if (!subjectIds.has(key)) subjectIds.set(key, subject.id);
    }
  }

  await transaction(async (client) => {
    for (const concept of concepts) {
      const subjectId = subjectIds.get(concept.subjectCode.toUpperCase()) || null;
      await client.query(
        `INSERT INTO learning_concepts
          (code,name,academic_year,grade_id,subject_id,subject_code,chapter_code,chapter_title,
           registry_status,registry_source,sequence,is_active)
         VALUES ($1,$2,$3,$4::uuid,$5::uuid,$6,$7,$8,$9,$10,$11,TRUE)
         ON CONFLICT (code) DO UPDATE SET
           name=EXCLUDED.name,
           academic_year=EXCLUDED.academic_year,
           grade_id=EXCLUDED.grade_id,
           subject_id=EXCLUDED.subject_id,
           subject_code=EXCLUDED.subject_code,
           chapter_code=EXCLUDED.chapter_code,
           chapter_title=EXCLUDED.chapter_title,
           registry_status=EXCLUDED.registry_status,
           registry_source=EXCLUDED.registry_source,
           sequence=EXCLUDED.sequence,
           is_active=TRUE`,
        [
          concept.code,
          concept.name,
          concept.academicYear,
          grade.id,
          subjectId,
          concept.subjectCode,
          concept.chapterCode,
          concept.chapterTitle,
          concept.registryStatus,
          concept.registrySource,
          concept.sequence,
        ],
      );
    }
  });

  console.log(`CANONICAL CONCEPT REGISTRY SYNCHRONIZED — ${concepts.length} active concept identities`);
  console.log('No learning resource, question or assessment publication state was changed.');
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`CONCEPT REGISTRY SYNC FAILED: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
