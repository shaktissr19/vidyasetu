import type { QueryResultRow } from 'pg';
import type { UUID } from '@vidyasetu/contracts';
import { query } from '../config/db';

interface LinkedChildRow extends QueryResultRow {
  id: UUID;
  school_id: UUID | null;
  class_id: UUID | null;
  class_name: string | null;
  section: string | null;
  school_link_status: string | null;
}

function appError(message: string, statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

async function linkedChild(parentUserId: UUID, studentId: UUID): Promise<LinkedChildRow> {
  const { rows: [student] } = await query<LinkedChildRow>(
    `SELECT s.id,s.school_id,s.class_id,s.school_link_status,
            COALESCE(sc.class_name,s.grade_level) AS class_name,sc.section
     FROM parent_student_links psl
     JOIN students s ON s.id=psl.student_id AND s.status='ACTIVE'
     LEFT JOIN school_classes sc ON sc.id=s.class_id
     WHERE psl.parent_user_id=$1 AND psl.student_id=$2
     LIMIT 1`,
    [parentUserId, studentId],
  );
  if (!student) throw appError('This child is not linked to your Parent account', 403);
  return student;
}

export async function listChildHomework(parentUserId: UUID, studentId: UUID, filter?: string | null) {
  const student = await linkedChild(parentUserId, studentId);
  if (student.school_link_status !== 'APPROVED' || !student.school_id || !student.class_id) return [];

  const conditions = ['ha.school_id=$1', 'ha.class_id=$2', "ha.status IN ('PUBLISHED','CLOSED')"];
  const params: unknown[] = [student.school_id, student.class_id, student.id];
  const normalized = String(filter || '').trim().toUpperCase();
  if (normalized === 'PENDING') conditions.push('hs.id IS NULL');
  if (normalized === 'SUBMITTED') conditions.push("hs.status IN ('SUBMITTED','LATE')");
  if (normalized === 'REVIEWED') conditions.push("hs.status IN ('REVIEWED','RETURNED')");

  const { rows } = await query(
    `SELECT ha.id,ha.title,ha.description,ha.instructions,ha.attachment_url,
            ha.subject_code,sub.name AS subject_name,sub.name_hi AS subject_name_hi,
            ha.due_at,ha.max_marks,ha.status,ha.published_at,sc.class_name,sc.section,
            hs.id AS submission_id,hs.status AS submission_status,hs.submitted_at,
            hs.marks_awarded,hs.feedback,hs.reviewed_at,
            CASE WHEN hs.id IS NULL THEN 'PENDING'
                 WHEN hs.status IN ('REVIEWED','RETURNED') THEN 'REVIEWED'
                 ELSE 'SUBMITTED' END AS learner_status
     FROM homework_assignments ha
     JOIN school_classes sc ON sc.id=ha.class_id
     LEFT JOIN subjects sub ON sub.code=ha.subject_code
     LEFT JOIN homework_submissions hs ON hs.homework_id=ha.id AND hs.student_id=$3
     WHERE ${conditions.join(' AND ')}
     ORDER BY CASE WHEN hs.id IS NULL AND ha.status='PUBLISHED' THEN 0 ELSE 1 END,
              ha.due_at ASC,ha.created_at DESC`,
    params,
  );
  return rows;
}

export async function listChildAchievements(parentUserId: UUID, studentId: UUID) {
  await linkedChild(parentUserId, studentId);
  const { rows } = await query(
    `SELECT e.id AS exam_id,e.title,e.title_hi,e.type,e.status,e.subject_codes,
            e.start_time,e.end_time,e.results_at,e.total_questions,e.marks_per_question,
            (e.total_questions * e.marks_per_question) AS max_marks,
            er.registered_at,
            ea.id AS attempt_id,ea.status AS attempt_status,ea.started_at,ea.submitted_at,
            ea.total_marks,ea.correct_count,ea.wrong_count,ea.skipped_count,
            ea.percentile,ea.rank_school,ea.rank_overall,
            CASE
              WHEN ea.total_marks IS NOT NULL AND (e.total_questions * e.marks_per_question) > 0
              THEN ROUND((ea.total_marks::numeric / (e.total_questions * e.marks_per_question)::numeric) * 100, 2)
              ELSE NULL
            END AS percentage
     FROM exams e
     LEFT JOIN exam_registrations er ON er.exam_id=e.id AND er.student_id=$1
     LEFT JOIN exam_attempts ea ON ea.exam_id=e.id AND ea.student_id=$1
     WHERE er.id IS NOT NULL OR ea.id IS NOT NULL
     ORDER BY COALESCE(ea.submitted_at,er.registered_at,e.start_time) DESC`,
    [studentId],
  );
  return rows;
}
