import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';
import * as learningVisibility from './learningVisibility.service';

interface StudentDiagnosticRow extends QueryResultRow {
  student_id: UUID;
  concept_id: UUID;
  proficiency_score: number | string;
  confidence_score: number | string;
  confidence_level: string;
  evidence_count: number;
  retention_status: string;
  next_review_at: string | Date | null;
  dominant_misconception_code: string | null;
}

interface MisconceptionClusterRow extends QueryResultRow {
  concept_id: UUID;
  misconception_code: string;
  affected_students: number;
  active_students: number;
  suspected_students: number;
}

export async function getSchoolDiagnosticOverview(
  schoolId: UUID,
  userId: UUID,
  role: string,
  classId: UUID,
  subjectCode: string,
  teacherId: UUID | null,
) {
  // Reuse the established Teacher/School authorization boundary. If the user
  // cannot see this class + subject in Learning Insights, diagnostics cannot
  // widen that scope.
  const base = await learningVisibility.getSchoolLearningOverview(
    schoolId, userId, role, classId, subjectCode, teacherId,
  );
  const studentIds = base.students.map((item) => item.studentId as UUID);
  const conceptIds = base.concepts.map((item) => item.conceptId as UUID);
  if (!studentIds.length || !conceptIds.length) {
    return {
      scope: base.scope,
      summary: { studentsWithEvidence: 0, lowConfidenceStudents: 0, reviewDueStudents: 0, activeMisconceptionStudents: 0 },
      concepts: [], students: [], misconceptionClusters: [],
    };
  }

  const [intelligence, clusters] = await Promise.all([
    query<StudentDiagnosticRow>(
      `SELECT student_id,concept_id,proficiency_score::float,confidence_score::float,
              confidence_level,evidence_count,retention_status,next_review_at,dominant_misconception_code
       FROM student_concept_intelligence
       WHERE student_id=ANY($1::uuid[]) AND concept_id=ANY($2::uuid[])`,
      [studentIds, conceptIds],
    ),
    query<MisconceptionClusterRow>(
      `SELECT concept_id,misconception_code,
              COUNT(DISTINCT student_id)::int AS affected_students,
              COUNT(DISTINCT student_id) FILTER(WHERE state='ACTIVE')::int AS active_students,
              COUNT(DISTINCT student_id) FILTER(WHERE state='SUSPECTED')::int AS suspected_students
       FROM student_concept_misconceptions
       WHERE student_id=ANY($1::uuid[]) AND concept_id=ANY($2::uuid[]) AND state IN ('ACTIVE','SUSPECTED')
       GROUP BY concept_id,misconception_code
       ORDER BY active_students DESC,affected_students DESC,misconception_code`,
      [studentIds, conceptIds],
    ),
  ]);

  const rowsByStudent = new Map<string, StudentDiagnosticRow[]>();
  const rowsByConcept = new Map<string, StudentDiagnosticRow[]>();
  for (const row of intelligence.rows) {
    const studentList = rowsByStudent.get(row.student_id) || [];
    studentList.push(row); rowsByStudent.set(row.student_id, studentList);
    const conceptList = rowsByConcept.get(row.concept_id) || [];
    conceptList.push(row); rowsByConcept.set(row.concept_id, conceptList);
  }
  const activeStudentIds = new Set(
    intelligence.rows.filter((row) => Boolean(row.dominant_misconception_code)).map((row) => row.student_id),
  );

  return {
    scope: base.scope,
    summary: {
      studentsWithEvidence: rowsByStudent.size,
      lowConfidenceStudents: [...rowsByStudent.values()].filter((rows) => rows.some((row) => row.confidence_level === 'LOW')).length,
      reviewDueStudents: [...rowsByStudent.values()].filter((rows) => rows.some((row) => row.retention_status === 'REVIEW_DUE')).length,
      activeMisconceptionStudents: activeStudentIds.size,
    },
    concepts: base.concepts.map((concept) => {
      const rows = rowsByConcept.get(concept.conceptId) || [];
      const withEvidence = rows.filter((row) => Number(row.evidence_count) > 0);
      return {
        conceptId: concept.conceptId,
        code: concept.code,
        name: concept.name,
        nameHi: concept.nameHi,
        averageProficiency: withEvidence.length
          ? Math.round(withEvidence.reduce((sum, row) => sum + Number(row.proficiency_score || 0), 0) / withEvidence.length)
          : null,
        averageConfidence: withEvidence.length
          ? Math.round(withEvidence.reduce((sum, row) => sum + Number(row.confidence_score || 0), 0) / withEvidence.length)
          : null,
        studentsWithEvidence: withEvidence.length,
        lowConfidence: rows.filter((row) => row.confidence_level === 'LOW').length,
        reviewDue: rows.filter((row) => row.retention_status === 'REVIEW_DUE').length,
        misconceptionSignals: rows.filter((row) => Boolean(row.dominant_misconception_code)).length,
      };
    }),
    students: base.students.map((student) => {
      const rows = rowsByStudent.get(student.studentId) || [];
      return {
        studentId: student.studentId,
        studentCode: student.studentCode,
        name: student.name,
        evidenceConcepts: rows.filter((row) => Number(row.evidence_count) > 0).length,
        averageProficiency: rows.length
          ? Math.round(rows.reduce((sum, row) => sum + Number(row.proficiency_score || 0), 0) / rows.length)
          : null,
        lowConfidenceConcepts: rows.filter((row) => row.confidence_level === 'LOW').length,
        reviewDueConcepts: rows.filter((row) => row.retention_status === 'REVIEW_DUE').length,
        misconceptionConcepts: rows.filter((row) => Boolean(row.dominant_misconception_code)).length,
      };
    }),
    misconceptionClusters: clusters.rows.map((row) => ({
      conceptId: row.concept_id,
      misconceptionCode: row.misconception_code,
      affectedStudents: Number(row.affected_students || 0),
      activeStudents: Number(row.active_students || 0),
      suspectedStudents: Number(row.suspected_students || 0),
    })),
  };
}

export async function getParentDiagnosticInsight(parentUserId: UUID, studentId: UUID) {
  const base = await learningVisibility.getParentLearningInsight(parentUserId, studentId);
  const [intelligence, misconceptions] = await Promise.all([
    query<StudentDiagnosticRow & QueryResultRow>(
      `SELECT sci.student_id,sci.concept_id,sci.proficiency_score::float,sci.confidence_score::float,
              sci.confidence_level,sci.evidence_count,sci.retention_status,sci.next_review_at,
              sci.dominant_misconception_code
       FROM student_concept_intelligence sci
       JOIN learning_concepts lc ON lc.id=sci.concept_id AND lc.is_active=TRUE
       WHERE sci.student_id=$1
       ORDER BY CASE sci.retention_status WHEN 'REVIEW_DUE' THEN 0 WHEN 'REVIEW_SOON' THEN 1 ELSE 2 END,
                sci.proficiency_score ASC,sci.confidence_score ASC
       LIMIT 24`,
      [studentId],
    ),
    query<QueryResultRow>(
      `SELECT scm.concept_id,scm.misconception_code,scm.state,lc.code,lc.name,lc.name_hi
       FROM student_concept_misconceptions scm
       JOIN learning_concepts lc ON lc.id=scm.concept_id
       WHERE scm.student_id=$1 AND scm.state IN ('ACTIVE','SUSPECTED')
       ORDER BY CASE scm.state WHEN 'ACTIVE' THEN 0 ELSE 1 END,scm.last_seen_at DESC
       LIMIT 8`,
      [studentId],
    ),
  ]);

  const weak = intelligence.rows.filter((row) => Number(row.proficiency_score) < 60 || row.confidence_level === 'LOW');
  const reviewDue = intelligence.rows.filter((row) => row.retention_status === 'REVIEW_DUE');
  const strong = intelligence.rows.filter((row) => Number(row.proficiency_score) >= 80 && ['MEDIUM','HIGH'].includes(row.confidence_level));
  let headline = 'Learning evidence is still building. Short practice will make the picture clearer.';
  if (reviewDue.length) headline = `${reviewDue.length} previously learned concept${reviewDue.length === 1 ? '' : 's'} need a short revision this week.`;
  else if (weak.length) headline = `${weak.length} concept${weak.length === 1 ? '' : 's'} need extra practice or clearer evidence right now.`;
  else if (strong.length) headline = `Current evidence is strong in ${strong.length} concept${strong.length === 1 ? '' : 's'}.`;

  return {
    student: base.student,
    headline,
    summary: {
      conceptsAssessed: intelligence.rows.length,
      strongConcepts: strong.length,
      needsSupport: weak.length,
      reviewDue: reviewDue.length,
      misconceptionSignals: misconceptions.rows.length,
    },
    guidance: [
      ...(reviewDue.length ? ['Encourage the short revision shown in VidyaSetu; mastery is not being removed.'] : []),
      ...(weak.length ? ['Support regular short practice instead of adding pressure for a single score.'] : []),
      ...(misconceptions.rows.length ? ['A repeated misunderstanding has been detected; the recommended lesson/practice is more useful than simply repeating the same test.'] : []),
      ...(!intelligence.rows.length ? ['Complete a few learning/practice activities so VidyaSetu can build reliable concept evidence.'] : []),
    ],
    concepts: intelligence.rows.map((row) => ({
      conceptId: row.concept_id,
      proficiencyScore: Number(row.proficiency_score || 0),
      confidenceScore: Number(row.confidence_score || 0),
      confidenceLevel: row.confidence_level,
      evidenceCount: Number(row.evidence_count || 0),
      retentionStatus: row.retention_status,
      nextReviewAt: row.next_review_at,
      hasMisconceptionSignal: Boolean(row.dominant_misconception_code),
    })),
    misconceptionSignals: misconceptions.rows.map((row: any) => ({
      conceptId: row.concept_id,
      conceptCode: row.code,
      conceptName: row.name,
      conceptNameHi: row.name_hi,
      misconceptionCode: row.misconception_code,
      state: row.state,
    })),
  };
}
