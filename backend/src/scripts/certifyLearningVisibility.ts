import 'dotenv/config';
import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { pool, query } from '../config/db';
import {
  getParentLearningInsight,
  getSchoolLearningOverview,
  getSchoolLearningTargets,
} from '../services/learningVisibility.service';

interface LinkRow extends QueryResultRow {
  parent_user_id: UUID;
  student_id: UUID;
  student_user_id: UUID;
  class_id: UUID;
  school_id: UUID;
}
interface TeacherFixtureRow extends QueryResultRow {
  teacher_id: UUID;
  teacher_user_id: UUID;
  school_id: UUID;
  class_id: UUID;
  subject_code: string;
}
interface AdminRow extends QueryResultRow { user_id: UUID; }
interface IdCodeRow extends QueryResultRow { id: UUID; code: string; }
interface CountRow extends QueryResultRow { count: number | string; }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectForbidden(work: () => Promise<unknown>, label: string): Promise<void> {
  try {
    await work();
  } catch (error: unknown) {
    const statusCode = (error as { statusCode?: number })?.statusCode;
    if (statusCode === 403) return;
    throw error;
  }
  throw new Error(`${label}: expected 403 access denial`);
}

async function schoolAdminUserId(schoolId: UUID): Promise<UUID> {
  const { rows: [admin] } = await query<AdminRow>(
    `SELECT admin_user_id AS user_id FROM schools WHERE id=$1 AND admin_user_id IS NOT NULL`,
    [schoolId],
  );
  if (!admin) throw new Error(`School Admin fixture missing for ${schoolId}`);
  return admin.user_id;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Learning visibility certification is test-only and requires NODE_ENV=test');
  }

  const { rows: [link] } = await query<LinkRow>(
    `SELECT psl.parent_user_id,psl.student_id,s.user_id AS student_user_id,s.class_id,s.school_id
     FROM parent_student_links psl
     JOIN students s ON s.id=psl.student_id
     JOIN school_classes sc ON sc.id=s.class_id
     WHERE s.status='ACTIVE' AND s.class_id IS NOT NULL AND s.school_id IS NOT NULL
       AND sc.class_name='8'
     ORDER BY psl.created_at NULLS LAST,psl.id
     LIMIT 1`,
  );
  assert(link, 'No linked Class 8 Parent/Student fixture available');
  const parentSchoolAdminUserId = await schoolAdminUserId(link.school_id);

  // Teacher authorization is an independent contract. A Parent-linked child is
  // not required to be in the same School as an arbitrary seeded Teacher.
  const { rows: [teacher] } = await query<TeacherFixtureRow>(
    `SELECT t.id AS teacher_id,t.user_id AS teacher_user_id,ta.school_id,ta.class_id,ta.subject_code
     FROM teacher_assignments ta
     JOIN teachers t ON t.id=ta.teacher_id AND t.status='ACTIVE'
     JOIN school_classes sc ON sc.id=ta.class_id AND sc.school_id=ta.school_id AND sc.is_active=TRUE
     ORDER BY ta.created_at NULLS LAST,ta.id
     LIMIT 1`,
  );
  assert(teacher, 'Teacher assignment fixture missing');
  const teacherSchoolAdminUserId = await schoolAdminUserId(teacher.school_id);

  const { rows: [forceConcept] } = await query<IdCodeRow>(
    `SELECT lc.id,sub.code
     FROM learning_concepts lc
     JOIN subjects sub ON sub.id=lc.subject_id
     WHERE lc.code='C8-SCI-05-C01'`,
  );
  assert(forceConcept, 'Canonical Force concept or operational Science subject missing');

  const { rows: [resourceLinks] } = await query<CountRow>(
    `SELECT COUNT(*)::int AS count
     FROM learning_resource_concepts lrc
     JOIN learning_resources lr ON lr.id=lrc.resource_id
     WHERE lr.public_slug IN ('class-8-science-pressure-v1','class-8-science-force-v1')`,
  );
  const { rows: [questionLinks] } = await query<CountRow>(
    `SELECT COUNT(*)::int AS count
     FROM learning_question_concepts lqc
     JOIN learning_questions lq ON lq.id=lqc.question_id
     WHERE lq.public_code LIKE 'VS8S-PRES-%' OR lq.public_code LIKE 'VS8S-FORC-%'`,
  );
  const { rows: [assessmentLinks] } = await query<CountRow>(
    `SELECT COUNT(*)::int AS count
     FROM learning_assessment_concepts lac
     JOIN learning_assessments la ON la.id=lac.assessment_id
     WHERE la.public_slug IN (
       'class-8-science-pressure-practice-v1','class-8-science-pressure-mastery-v1',
       'class-8-science-force-practice-v1','class-8-science-force-mastery-v1'
     )`,
  );
  assert(Number(resourceLinks.count) === 2, `Expected 2 resource-concept links, found ${resourceLinks.count}`);
  assert(Number(questionLinks.count) === 24, `Expected 24 question-concept links, found ${questionLinks.count}`);
  assert(Number(assessmentLinks.count) === 4, `Expected 4 assessment-concept links, found ${assessmentLinks.count}`);

  await query(
    `INSERT INTO student_concept_progress
       (student_id,concept_id,state,practice_best_pct,practice_attempts,needs_review,last_activity_at)
     VALUES ($1,$2,'NEEDS_REVIEW',45,1,TRUE,NOW())
     ON CONFLICT (student_id,concept_id) DO UPDATE SET
       state='NEEDS_REVIEW',practice_best_pct=45,practice_attempts=1,needs_review=TRUE,last_activity_at=NOW()`,
    [link.student_id, forceConcept.id],
  );

  const parentInsight = await getParentLearningInsight(link.parent_user_id, link.student_id);
  assert(parentInsight.summary.needsReview >= 1, 'Parent insight did not expose the linked child review need');
  assert(
    parentInsight.focusConcepts.some((item) => item.code === 'C8-SCI-05-C01' && item.state === 'NEEDS_REVIEW'),
    'Parent focus list did not include Force as NEEDS_REVIEW',
  );

  const { rows: [otherStudent] } = await query<{ id: UUID } & QueryResultRow>(
    `SELECT id FROM students
     WHERE id<>$1 AND NOT EXISTS (
       SELECT 1 FROM parent_student_links psl WHERE psl.parent_user_id=$2 AND psl.student_id=students.id
     )
     ORDER BY id LIMIT 1`,
    [link.student_id, link.parent_user_id],
  );
  assert(otherStudent, 'No unlinked Student fixture available');
  await expectForbidden(
    () => getParentLearningInsight(link.parent_user_id, otherStudent.id),
    'Parent isolation',
  );

  const schoolOverview = await getSchoolLearningOverview(
    link.school_id,
    parentSchoolAdminUserId,
    'SCHOOL_ADMIN',
    link.class_id,
    forceConcept.code,
  );
  assert(schoolOverview.scope.conceptCount >= 2, 'School insight did not expose Force/Pressure mapped concepts');
  assert(schoolOverview.summary.studentsNeedingReview >= 1, 'School insight did not expose a review intervention');
  assert(
    schoolOverview.students.some((item) => item.studentId === link.student_id && item.attentionRequired),
    'Linked child was not surfaced in the School intervention view',
  );

  const teacherTargets = await getSchoolLearningTargets(
    teacher.school_id,
    teacher.teacher_user_id,
    'TEACHER',
    teacher.teacher_id,
  );
  assert(teacherTargets.length >= 1, 'Teacher has no assigned learning target');
  await getSchoolLearningOverview(
    teacher.school_id,
    teacher.teacher_user_id,
    'TEACHER',
    teacher.class_id,
    teacher.subject_code,
    teacher.teacher_id,
  );

  const teacherSchoolTargets = await getSchoolLearningTargets(
    teacher.school_id,
    teacherSchoolAdminUserId,
    'SCHOOL_ADMIN',
  );
  const assignedKeys = new Set(teacherTargets.map((item) => `${item.class_id}|${item.subject_code}`));
  const unassigned = teacherSchoolTargets.find((item) => !assignedKeys.has(`${item.class_id}|${item.subject_code}`));
  if (unassigned) {
    await expectForbidden(
      () => getSchoolLearningOverview(
        teacher.school_id,
        teacher.teacher_user_id,
        'TEACHER',
        unassigned.class_id,
        unassigned.subject_code,
        teacher.teacher_id,
      ),
      'Teacher assignment isolation',
    );
  }

  console.log('LEARNING VISIBILITY CERTIFIED');
  console.log(`Parent linked child: ${link.student_id}`);
  console.log(`School concept count: ${schoolOverview.scope.conceptCount}`);
  console.log(`Teacher assigned targets: ${teacherTargets.length}`);
}

main()
  .catch((error: unknown) => {
    console.error(`LEARNING VISIBILITY CERTIFICATION FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => pool.end());
