import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';
import {
  canAccessLearningRequirement,
  getLearningAccessContext,
  learningAccessLockReason,
  type LearningAccessContext,
} from './learningEntitlement.service';

interface StudentContextRow extends QueryResultRow {
  student_id: UUID;
  grade_level: string;
  grade_code: string | null;
  class_name: string | null;
  school_id: UUID | null;
  school_name: string | null;
  board_code: string | null;
  board_name: string | null;
}

interface ResourceAccessRow extends QueryResultRow {
  id: UUID;
  access_requirement: string;
}

function appError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function canonicalGradeCode(ctx: StudentContextRow): string {
  if (ctx.grade_code) return ctx.grade_code;
  const raw = String(ctx.class_name || ctx.grade_level || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (['PN', 'PRENURSERY', 'PRE_NURSERY'].includes(raw)) return 'PRE_NURSERY';
  if (raw === 'NURSERY') return 'NURSERY';
  if (['LKG', 'LOWER_KG', 'LOWER_KINDERGARTEN'].includes(raw)) return 'LKG';
  if (['UKG', 'UPPER_KG', 'UPPER_KINDERGARTEN'].includes(raw)) return 'UKG';
  const numeric = raw.match(/^(?:CLASS_)?(\d{1,2})$/);
  if (numeric) {
    const value = Number.parseInt(numeric[1], 10);
    if (value >= 1 && value <= 12) return `CLASS_${value}`;
  }
  throw appError('Student grade is not supported by the Learning catalogue', 409);
}

function gradeNumber(gradeCode: string): number | null {
  const match = gradeCode.match(/^CLASS_(\d{1,2})$/);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return value >= 1 && value <= 12 ? value : null;
}

function gradeLabel(gradeCode: string): string {
  if (gradeCode === 'PRE_NURSERY') return 'Pre-Nursery';
  if (gradeCode === 'NURSERY') return 'Nursery';
  if (gradeCode === 'LKG') return 'LKG';
  if (gradeCode === 'UKG') return 'UKG';
  const numeric = gradeNumber(gradeCode);
  return numeric ? `Class ${numeric}` : gradeCode.replaceAll('_', ' ');
}

async function getStudentContext(userId: UUID): Promise<StudentContextRow> {
  const { rows: [student] } = await query<StudentContextRow>(
    `SELECT s.id AS student_id, s.grade_level, s.grade_code, sc.class_name,
            s.school_id, sch.name AS school_name,
            eb.code AS board_code, eb.name AS board_name
     FROM students s
     LEFT JOIN school_classes sc ON sc.id=s.class_id
     LEFT JOIN schools sch ON sch.id=s.school_id
     LEFT JOIN education_boards eb ON eb.id=sch.board_id
     WHERE s.user_id=$1::uuid AND s.status='ACTIVE'`,
    [userId],
  );
  if (!student) throw appError('Student profile not found', 404);
  return student;
}

function resourceScopeSql(boardParam: number, gradeCodeParam: number, classParam: number): string {
  return `
    (
      EXISTS (
        SELECT 1
        FROM learning_resource_grades lrg_scope
        JOIN education_grade_levels egl_scope ON egl_scope.id=lrg_scope.grade_id
        WHERE lrg_scope.resource_id=lr.id AND egl_scope.code=$${gradeCodeParam}
      )
      OR (
        NOT EXISTS (SELECT 1 FROM learning_resource_grades lrg_none WHERE lrg_none.resource_id=lr.id)
        AND (
          ($${classParam}::int IS NULL AND lr.class_min IS NULL AND lr.class_max IS NULL)
          OR (
            $${classParam}::int IS NOT NULL
            AND (lr.class_min IS NULL OR lr.class_min <= $${classParam})
            AND (lr.class_max IS NULL OR lr.class_max >= $${classParam})
          )
        )
      )
    )
    AND EXISTS (
      SELECT 1
      FROM learning_resource_boards lrb_scope
      JOIN education_boards eb_scope ON eb_scope.id=lrb_scope.board_id
      WHERE lrb_scope.resource_id=lr.id
        AND (eb_scope.code='COMMON' OR eb_scope.code=$${boardParam})
    )`;
}

function accessSummary(access: LearningAccessContext) {
  return {
    tier: access.tier,
    individualSubscriber: access.individualSubscriber,
    schoolLicensed: access.schoolLicensed,
    subscriberAccess: access.subscriberAccess,
  };
}

export async function getCanonicalLearningCatalogue(userId: UUID) {
  const [student, access] = await Promise.all([
    getStudentContext(userId),
    getLearningAccessContext(userId),
  ]);
  const gradeCode = canonicalGradeCode(student);
  const grade = gradeNumber(gradeCode);
  const board = student.board_code || 'COMMON';

  const { rows } = await query(
    `SELECT sub.id,
            sub.code,
            sub.name,
            sub.name_hi,
            COUNT(DISTINCT lr.id)::int AS resource_count,
            COUNT(DISTINCT lr.id) FILTER (
              WHERE lr.access_requirement IN ('PUBLIC','REGISTERED')
                 OR (lr.access_requirement='SUBSCRIBER' AND $4::boolean)
            )::int AS accessible_resource_count,
            COUNT(DISTINCT lr.id) FILTER (
              WHERE slrp.is_completed=TRUE
                AND (lr.access_requirement IN ('PUBLIC','REGISTERED')
                     OR (lr.access_requirement='SUBSCRIBER' AND $4::boolean))
            )::int AS completed_resource_count,
            COALESCE(AVG(slrp.progress_pct) FILTER (
              WHERE lr.access_requirement IN ('PUBLIC','REGISTERED')
                 OR (lr.access_requirement='SUBSCRIBER' AND $4::boolean)
            ),0)::float AS progress_pct
     FROM learning_resources lr
     JOIN subjects sub ON sub.id=lr.subject_id
     LEFT JOIN student_learning_resource_progress slrp
       ON slrp.resource_id=lr.id AND slrp.student_id=$1::uuid
     WHERE lr.review_status='PUBLISHED'
       AND lr.category='ACADEMIC'
       AND lr.visibility IN ('PUBLIC','REGISTERED','CLASS_ONLY')
       AND ${resourceScopeSql(2, 3, 5)}
     GROUP BY sub.id
     ORDER BY sub.name`,
    [student.student_id, board, gradeCode, access.subscriberAccess, grade],
  );

  return {
    learner: {
      studentId: student.student_id,
      gradeCode,
      gradeLabel: gradeLabel(gradeCode),
      className: grade ?? student.grade_level,
      schoolName: student.school_name,
      boardCode: board,
      boardName: student.board_name || 'Cross-board / Common Learning',
    },
    access: accessSummary(access),
    subjects: rows,
  };
}

export async function getCanonicalSubjectResources(userId: UUID, subjectId: UUID) {
  const [student, access] = await Promise.all([
    getStudentContext(userId),
    getLearningAccessContext(userId),
  ]);
  const gradeCode = canonicalGradeCode(student);
  const grade = gradeNumber(gradeCode);
  const board = student.board_code || 'COMMON';

  const { rows: [subject] } = await query(
    `SELECT id, code, name, name_hi FROM subjects WHERE id=$1::uuid`,
    [subjectId],
  );
  if (!subject) throw appError('Subject not found', 404);

  const { rows } = await query(
    `SELECT lr.id, lr.public_slug, lr.title, lr.title_hi, lr.summary, lr.summary_hi,
            lr.resource_type, lr.category, lr.visibility, lr.access_requirement,
            lr.thumbnail_url, lr.duration_secs, lr.is_offline_ready, lr.is_featured_public,
            lcs.code AS source_code, lcs.name AS source_name,
            COALESCE(slrp.progress_pct,0)::float AS progress_pct,
            COALESCE(slrp.is_completed,FALSE) AS is_completed,
            EXISTS (
              SELECT 1 FROM student_learning_bookmarks b
              WHERE b.student_id=$1::uuid AND b.resource_id=lr.id
            ) AS bookmarked,
            COALESCE(
              ARRAY_AGG(DISTINCT lc.name) FILTER (WHERE lc.name IS NOT NULL),
              ARRAY[]::varchar[]
            ) AS concept_names,
            CASE
              WHEN lr.access_requirement IN ('PUBLIC','REGISTERED') THEN TRUE
              WHEN lr.access_requirement='SUBSCRIBER' AND $4::boolean THEN TRUE
              ELSE FALSE
            END AS is_accessible
     FROM learning_resources lr
     JOIN learning_content_sources lcs ON lcs.id=lr.source_id
     LEFT JOIN student_learning_resource_progress slrp
       ON slrp.resource_id=lr.id AND slrp.student_id=$1::uuid
     LEFT JOIN learning_resource_concepts lrc ON lrc.resource_id=lr.id
     LEFT JOIN learning_concepts lc ON lc.id=lrc.concept_id
     WHERE lr.review_status='PUBLISHED'
       AND lr.category='ACADEMIC'
       AND lr.subject_id=$6::uuid
       AND lr.visibility IN ('PUBLIC','REGISTERED','CLASS_ONLY')
       AND ${resourceScopeSql(2, 3, 5)}
     GROUP BY lr.id, lcs.id, slrp.student_id, slrp.resource_id
     ORDER BY
       CASE WHEN COALESCE(slrp.is_completed,FALSE) THEN 2
            WHEN COALESCE(slrp.progress_pct,0) > 0 THEN 0 ELSE 1 END,
       lr.is_featured_public DESC,
       lr.sort_order,
       lr.published_at DESC NULLS LAST`,
    [student.student_id, board, gradeCode, access.subscriberAccess, grade, subjectId],
  );

  return {
    subject,
    access: accessSummary(access),
    resources: rows.map((row: Record<string, unknown>) => ({
      ...row,
      lock_reason: Boolean(row.is_accessible)
        ? null
        : learningAccessLockReason(String(row.access_requirement || 'REGISTERED'), access),
    })),
  };
}

async function assertResourceForLearner(userId: UUID, resourceId: UUID) {
  const [student, access] = await Promise.all([
    getStudentContext(userId),
    getLearningAccessContext(userId),
  ]);
  const gradeCode = canonicalGradeCode(student);
  const grade = gradeNumber(gradeCode);
  const board = student.board_code || 'COMMON';

  // Existing certified Learning regression environments intentionally stop
  // before migration 044. Preserve their legacy access contract until the
  // entitlement schema is explicitly installed; after 044, enforce the new
  // commercial access requirement at this same boundary.
  const selectAccess = access.schemaReady
    ? 'lr.access_requirement::text AS access_requirement'
    : "'REGISTERED'::text AS access_requirement";

  const { rows: [resource] } = await query<ResourceAccessRow>(
    `SELECT lr.id, ${selectAccess}
     FROM learning_resources lr
     WHERE lr.id=$1::uuid
       AND lr.review_status='PUBLISHED'
       AND lr.visibility IN ('PUBLIC','REGISTERED','CLASS_ONLY')
       AND ${resourceScopeSql(2, 3, 4)}`,
    [resourceId, board, gradeCode, grade],
  );
  if (!resource) throw appError('Learning resource not found for this learner', 404);
  if (!canAccessLearningRequirement(resource.access_requirement, access)) {
    throw appError(learningAccessLockReason(resource.access_requirement, access) || 'Learning access required', 403);
  }
  return { student, access, resource };
}

export async function getCanonicalLearningResource(userId: UUID, resourceId: UUID) {
  const { student, access } = await assertResourceForLearner(userId, resourceId);
  const { rows: [resource] } = await query(
    `SELECT lr.id, lr.public_slug, lr.title, lr.title_hi, lr.summary, lr.summary_hi,
            lr.body_markdown, lr.body_markdown_hi, lr.resource_type, lr.category,
            lr.visibility, lr.access_requirement, lr.language,
            lr.class_min, lr.class_max, lr.thumbnail_url, lr.duration_secs,
            lr.external_url, lr.source_url, lr.file_key, lr.licence, lr.licence_url,
            lr.attribution_text, lr.is_offline_ready, lr.published_at,
            sub.id AS subject_id, sub.code AS subject_code, sub.name AS subject_name,
            lcs.code AS source_code, lcs.name AS source_name, lcs.source_kind,
            COALESCE(slrp.progress_pct,0)::float AS progress_pct,
            COALESCE(slrp.is_completed,FALSE) AS is_completed,
            EXISTS (
              SELECT 1 FROM student_learning_bookmarks b
              WHERE b.student_id=$2::uuid AND b.resource_id=lr.id
            ) AS bookmarked,
            COALESCE(
              jsonb_agg(DISTINCT jsonb_build_object(
                'id',lc.id,'code',lc.code,'name',lc.name,'nameHi',lc.name_hi,
                'journeyStage',lrc.journey_stage
              )) FILTER (WHERE lc.id IS NOT NULL),
              '[]'::jsonb
            ) AS concepts
     FROM learning_resources lr
     JOIN learning_content_sources lcs ON lcs.id=lr.source_id
     LEFT JOIN subjects sub ON sub.id=lr.subject_id
     LEFT JOIN student_learning_resource_progress slrp
       ON slrp.resource_id=lr.id AND slrp.student_id=$2::uuid
     LEFT JOIN learning_resource_concepts lrc ON lrc.resource_id=lr.id
     LEFT JOIN learning_concepts lc ON lc.id=lrc.concept_id
     WHERE lr.id=$1::uuid
     GROUP BY lr.id, sub.id, lcs.id, slrp.student_id, slrp.resource_id`,
    [resourceId, student.student_id],
  );
  if (!resource) throw appError('Learning resource not found', 404);
  return { ...resource, access: accessSummary(access) };
}

export async function updateCanonicalResourceProgress(userId: UUID, resourceId: UUID, progressPct: number) {
  const { student } = await assertResourceForLearner(userId, resourceId);
  const progress = Math.min(Math.max(progressPct, 0), 100);
  const { rows: [row] } = await query(
    `INSERT INTO student_learning_resource_progress
       (student_id,resource_id,progress_pct,is_completed,last_accessed,completed_at)
     VALUES($1::uuid,$2::uuid,$3::numeric,($3::numeric>=100::numeric),NOW(),
            CASE WHEN $3::numeric>=100::numeric THEN NOW() ELSE NULL END)
     ON CONFLICT(student_id,resource_id) DO UPDATE SET
       progress_pct=GREATEST(student_learning_resource_progress.progress_pct,EXCLUDED.progress_pct),
       is_completed=student_learning_resource_progress.is_completed OR EXCLUDED.is_completed,
       last_accessed=NOW(),
       completed_at=CASE
         WHEN student_learning_resource_progress.completed_at IS NOT NULL THEN student_learning_resource_progress.completed_at
         WHEN EXCLUDED.is_completed THEN NOW() ELSE NULL END,
       updated_at=NOW()
     RETURNING resource_id,progress_pct::float,is_completed,last_accessed,completed_at`,
    [student.student_id, resourceId, progress],
  );
  return row;
}

export async function addCanonicalBookmark(userId: UUID, resourceId: UUID) {
  const { student } = await assertResourceForLearner(userId, resourceId);
  await query(
    `INSERT INTO student_learning_bookmarks(student_id,resource_id)
     VALUES($1::uuid,$2::uuid) ON CONFLICT DO NOTHING`,
    [student.student_id, resourceId],
  );
  return { bookmarked: true };
}

export async function removeCanonicalBookmark(userId: UUID, resourceId: UUID) {
  const { student } = await assertResourceForLearner(userId, resourceId);
  await query(
    `DELETE FROM student_learning_bookmarks WHERE student_id=$1::uuid AND resource_id=$2::uuid`,
    [student.student_id, resourceId],
  );
  return { bookmarked: false };
}