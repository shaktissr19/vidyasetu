import { createHash } from 'crypto';
import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';
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

export async function getFactoryOptions() {
  const [boards,subjects,curriculumSubjects,units,topics,concepts,conceptCoverage] = await Promise.all([
    query(`SELECT id,code,name,short_name,board_type,state,sort_order FROM education_boards WHERE is_active=TRUE ORDER BY sort_order,name`),
    query(`SELECT id,name FROM subjects ORDER BY name`),
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
      discovery: 'Find governed/local and external source material',
      validation: 'External items enter Source & Licence Review before grounding/adaptation',
      generation: 'AI Creator produces governed draft output; mock output cannot be academically approved',
      packaging: 'Content packs group Learn, Watch, Listen, Explore, Practice, Revise, Assess and Worksheet assets',
      publication: 'Existing audited Learning review states remain authoritative',
    },
  };
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
    message: 'External web item staged to Source & Licence Review. It remains reference-only until licence, attribution and adaptation rights are explicitly verified.',
  };
}
