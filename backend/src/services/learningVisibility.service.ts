import type { QueryResultRow } from 'pg';
import type { UserRole, UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';
import { getStudentConceptMastery, type StudentConceptMastery } from './studentConceptMastery.service';
import { getAdaptiveLearningPlan } from './studentAdaptiveLearning.service';

interface ClassRow extends QueryResultRow {
  id: UUID;
  class_name: string;
  section: string | null;
}
interface SubjectRow extends QueryResultRow {
  id: UUID;
  code: string;
  name: string;
}
interface TargetRow extends QueryResultRow {
  class_id: UUID;
  class_name: string;
  section: string | null;
  subject_code: string;
  subject_name: string;
}
interface StudentRow extends QueryResultRow {
  id: UUID;
  user_id: UUID;
  student_code: string;
  roll_number: string | null;
  name: string;
}
interface ConceptRow extends QueryResultRow {
  concept_id: UUID;
  code: string;
  name: string;
  name_hi: string | null;
  chapter_code: string | null;
  chapter_title: string | null;
  sequence: number;
  mapped_resource_count: number | string;
  published_resource_count: number | string;
  mapped_assessment_count: number | string;
  published_assessment_count: number | string;
}
interface ParentChildRow extends QueryResultRow {
  id: UUID;
  user_id: UUID;
  student_code: string;
  name: string;
  class_name: string | null;
  section: string | null;
  school_name: string | null;
}
interface IdRow extends QueryResultRow { id: UUID; }

type MasteryState = 'NOT_STARTED' | 'LEARNING' | 'PRACTISING' | 'NEEDS_REVIEW' | 'MASTERED';

function appError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

function normalizeState(value: string | null | undefined): MasteryState {
  if (value === 'LEARNING' || value === 'PRACTISING' || value === 'NEEDS_REVIEW' || value === 'MASTERED') return value;
  return 'NOT_STARTED';
}

function stateSummary(items: Array<{ state: MasteryState }>) {
  return {
    notStarted: items.filter((item) => item.state === 'NOT_STARTED').length,
    learning: items.filter((item) => item.state === 'LEARNING').length,
    practising: items.filter((item) => item.state === 'PRACTISING').length,
    needsReview: items.filter((item) => item.state === 'NEEDS_REVIEW').length,
    mastered: items.filter((item) => item.state === 'MASTERED').length,
  };
}

async function teacherIdForUser(userId: UUID, schoolId: UUID): Promise<UUID> {
  const { rows: [row] } = await query<IdRow>(
    `SELECT id FROM teachers WHERE user_id=$1 AND school_id=$2 AND status='ACTIVE' LIMIT 1`,
    [userId, schoolId],
  );
  if (!row) throw appError('Active Teacher profile not found for this School', 403);
  return row.id;
}

export async function getSchoolLearningTargets(
  schoolId: UUID,
  userId: UUID,
  role: UserRole,
  teacherIdInput?: UUID | null,
) {
  if (role === 'TEACHER') {
    const teacherId = teacherIdInput || await teacherIdForUser(userId, schoolId);
    const { rows } = await query<TargetRow>(
      `SELECT DISTINCT sc.id AS class_id,sc.class_name,sc.section,
              ta.subject_code,COALESCE(sub.name,ta.subject_code) AS subject_name
       FROM teacher_assignments ta
       JOIN school_classes sc ON sc.id=ta.class_id AND sc.school_id=ta.school_id AND sc.is_active=TRUE
       LEFT JOIN subjects sub ON sub.code=ta.subject_code
       WHERE ta.teacher_id=$1 AND ta.school_id=$2
       ORDER BY sc.class_name,sc.section,ta.subject_code`,
      [teacherId, schoolId],
    );
    return rows;
  }

  const { rows } = await query<TargetRow>(
    `SELECT sc.id AS class_id,sc.class_name,sc.section,
            sub.code AS subject_code,sub.name AS subject_name
     FROM school_classes sc
     CROSS JOIN subjects sub
     WHERE sc.school_id=$1 AND sc.is_active=TRUE AND sub.is_active=TRUE
     ORDER BY sc.class_name,sc.section,sub.sort_order,sub.name`,
    [schoolId],
  );
  return rows;
}

async function assertSchoolTarget(
  schoolId: UUID,
  userId: UUID,
  role: UserRole,
  classId: UUID,
  subjectCode: string,
  teacherIdInput?: UUID | null,
): Promise<{ classRow: ClassRow; subject: SubjectRow }> {
  const { rows: [classRow] } = await query<ClassRow>(
    `SELECT id,class_name,section FROM school_classes
     WHERE id=$1 AND school_id=$2 AND is_active=TRUE`,
    [classId, schoolId],
  );
  if (!classRow) throw appError('Class is not active in this School', 404);

  const { rows: [subject] } = await query<SubjectRow>(
    'SELECT id,code,name FROM subjects WHERE code=$1 AND is_active=TRUE',
    [subjectCode],
  );
  if (!subject) throw appError('Subject is not available', 404);

  if (role === 'TEACHER') {
    const teacherId = teacherIdInput || await teacherIdForUser(userId, schoolId);
    const { rows: [assignment] } = await query<IdRow>(
      `SELECT id FROM teacher_assignments
       WHERE teacher_id=$1 AND school_id=$2 AND class_id=$3 AND subject_code=$4
       ORDER BY academic_year DESC LIMIT 1`,
      [teacherId, schoolId, classId, subjectCode],
    );
    if (!assignment) throw appError('Teachers can view learning insights only for their assigned class and subject', 403);
  }
  return { classRow, subject };
}

async function mappedConcepts(className: string, subjectId: UUID): Promise<ConceptRow[]> {
  const numericClass = Number.parseInt(className, 10);
  if (!Number.isFinite(numericClass) || numericClass < 1 || numericClass > 12) return [];
  const gradeCode = `CLASS_${numericClass}`;
  const { rows } = await query<ConceptRow>(
    `SELECT lc.id AS concept_id,lc.code,lc.name,lc.name_hi,lc.chapter_code,lc.chapter_title,lc.sequence,
            COUNT(DISTINCT lrc.resource_id)::int AS mapped_resource_count,
            COUNT(DISTINCT lrc.resource_id) FILTER (WHERE lr.review_status='PUBLISHED')::int AS published_resource_count,
            COUNT(DISTINCT lac.assessment_id)::int AS mapped_assessment_count,
            COUNT(DISTINCT lac.assessment_id) FILTER (WHERE la.review_status='PUBLISHED')::int AS published_assessment_count
     FROM learning_concepts lc
     JOIN education_grade_levels egl ON egl.id=lc.grade_id AND egl.code=$1
     LEFT JOIN learning_resource_concepts lrc ON lrc.concept_id=lc.id
     LEFT JOIN learning_resources lr ON lr.id=lrc.resource_id
     LEFT JOIN learning_assessment_concepts lac ON lac.concept_id=lc.id
     LEFT JOIN learning_assessments la ON la.id=lac.assessment_id
     WHERE lc.is_active=TRUE AND lc.subject_id=$2
       AND (lrc.resource_id IS NOT NULL OR lac.assessment_id IS NOT NULL)
     GROUP BY lc.id
     ORDER BY lc.sequence,lc.code`,
    [gradeCode, subjectId],
  );
  return rows;
}

function masteryByConcept(items: StudentConceptMastery[]): Map<UUID, StudentConceptMastery> {
  return new Map(items.map((item) => [item.conceptId, item]));
}

export async function getSchoolLearningOverview(
  schoolId: UUID,
  userId: UUID,
  role: UserRole,
  classId: UUID,
  subjectCode: string,
  teacherIdInput?: UUID | null,
) {
  const normalizedSubject = subjectCode.trim().toUpperCase();
  const { classRow, subject } = await assertSchoolTarget(
    schoolId,
    userId,
    role,
    classId,
    normalizedSubject,
    teacherIdInput,
  );
  const concepts = await mappedConcepts(classRow.class_name, subject.id);
  const conceptIds = new Set(concepts.map((concept) => concept.concept_id));
  const { rows: students } = await query<StudentRow>(
    `SELECT s.id,s.user_id,s.student_code,s.roll_number,u.name
     FROM students s
     JOIN users u ON u.id=s.user_id
     WHERE s.school_id=$1 AND s.class_id=$2
       AND s.school_link_status='APPROVED' AND s.status='ACTIVE'
     ORDER BY COALESCE(NULLIF(s.roll_number,''),'999999'),u.name`,
    [schoolId, classId],
  );

  const masteryRows = await Promise.all(students.map(async (student) => {
    const mastery = await getStudentConceptMastery(student.user_id);
    return { student, map: masteryByConcept(mastery.filter((item) => conceptIds.has(item.conceptId))) };
  }));

  const studentInsights = masteryRows.map(({ student, map }) => {
    const conceptStates = concepts.map((concept) => {
      const evidence = map.get(concept.concept_id);
      return {
        conceptId: concept.concept_id,
        code: concept.code,
        state: normalizeState(evidence?.state),
        resourceCompletionPct: Number(evidence?.resourceCompletionPct || 0),
        practiceBestPct: evidence?.practiceBestPct ?? null,
        masteryPct: evidence?.masteryPct ?? null,
        needsReview: Boolean(evidence?.needsReview),
      };
    });
    const summary = stateSummary(conceptStates);
    return {
      studentId: student.id,
      studentCode: student.student_code,
      rollNumber: student.roll_number,
      name: student.name,
      summary,
      attentionRequired: summary.needsReview > 0,
      concepts: conceptStates,
    };
  }).sort((a, b) => Number(b.attentionRequired) - Number(a.attentionRequired) || b.summary.needsReview - a.summary.needsReview || a.name.localeCompare(b.name));

  const conceptInsights = concepts.map((concept) => {
    const states = masteryRows.map(({ map }) => normalizeState(map.get(concept.concept_id)?.state));
    const evidence = masteryRows.map(({ map }) => map.get(concept.concept_id)).filter(Boolean) as StudentConceptMastery[];
    const summary = stateSummary(states.map((state) => ({ state })));
    const masteryValues = evidence.map((item) => item.masteryPct).filter((value): value is number => value !== null);
    return {
      conceptId: concept.concept_id,
      code: concept.code,
      name: concept.name,
      nameHi: concept.name_hi,
      chapterCode: concept.chapter_code,
      chapterTitle: concept.chapter_title,
      summary,
      averageMasteryPct: masteryValues.length ? Math.round((masteryValues.reduce((a, b) => a + b, 0) / masteryValues.length) * 10) / 10 : null,
      mappedResourceCount: Number(concept.mapped_resource_count || 0),
      publishedResourceCount: Number(concept.published_resource_count || 0),
      mappedAssessmentCount: Number(concept.mapped_assessment_count || 0),
      publishedAssessmentCount: Number(concept.published_assessment_count || 0),
      learnerReady: Number(concept.published_resource_count || 0) + Number(concept.published_assessment_count || 0) > 0,
    };
  });

  const overallStates = studentInsights.flatMap((item) => item.concepts.map((concept) => ({ state: concept.state })));
  return {
    scope: {
      classId,
      className: classRow.class_name,
      section: classRow.section,
      subjectCode: normalizedSubject,
      subjectName: subject.name,
      studentCount: students.length,
      conceptCount: concepts.length,
    },
    summary: {
      ...stateSummary(overallStates),
      studentsNeedingReview: studentInsights.filter((item) => item.attentionRequired).length,
      learnerReadyConcepts: conceptInsights.filter((item) => item.learnerReady).length,
    },
    concepts: conceptInsights,
    students: studentInsights,
  };
}

async function assertParentChild(parentUserId: UUID, studentId: UUID): Promise<ParentChildRow> {
  const { rows: [student] } = await query<ParentChildRow>(
    `SELECT s.id,s.user_id,s.student_code,u.name,
            COALESCE(sc.class_name,s.grade_level) AS class_name,sc.section,sch.name AS school_name
     FROM parent_student_links psl
     JOIN students s ON s.id=psl.student_id
     JOIN users u ON u.id=s.user_id
     LEFT JOIN school_classes sc ON sc.id=s.class_id
     LEFT JOIN schools sch ON sch.id=s.school_id
     WHERE psl.parent_user_id=$1 AND s.id=$2 AND s.status='ACTIVE'`,
    [parentUserId, studentId],
  );
  if (!student) throw appError('Access denied to this student', 403);
  return student;
}

export async function getParentLearningInsight(parentUserId: UUID, studentId: UUID) {
  const student = await assertParentChild(parentUserId, studentId);
  const mastery = await getStudentConceptMastery(student.user_id);
  const plan = await getAdaptiveLearningPlan(student.user_id, mastery);
  const normalized = mastery.map((item) => ({ ...item, state: normalizeState(item.state) }));
  const summary = stateSummary(normalized);
  const focus = normalized
    .filter((item) => item.state !== 'NOT_STARTED')
    .sort((a, b) => {
      const weight = (state: MasteryState) => state === 'NEEDS_REVIEW' ? 0 : state === 'PRACTISING' ? 1 : state === 'LEARNING' ? 2 : 3;
      return weight(a.state) - weight(b.state) || Number(a.masteryPct ?? a.practiceBestPct ?? a.resourceCompletionPct ?? 0) - Number(b.masteryPct ?? b.practiceBestPct ?? b.resourceCompletionPct ?? 0);
    })
    .slice(0, 8);

  return {
    student: {
      id: student.id,
      studentCode: student.student_code,
      name: student.name,
      className: student.class_name,
      section: student.section,
      schoolName: student.school_name,
    },
    summary,
    focusConcepts: focus,
    nextActions: plan.actions.slice(0, 3).map((action) => ({
      rank: action.rank,
      urgency: action.urgency,
      actionType: action.actionType,
      conceptCode: action.conceptCode,
      conceptName: action.conceptName,
      subjectCode: action.subjectCode,
      subjectName: action.subjectName,
      title: action.title,
      reason: action.reason,
      estimatedMinutes: action.estimatedMinutes,
    })),
    headline: plan.headline,
  };
}
